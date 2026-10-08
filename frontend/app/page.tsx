"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Video,
  Shield,
  ShieldAlert,
  Search,
  Bell,
  Eye,
  EyeOff,
  RefreshCw,
  BarChart2,
  BarChart3,
  LayoutGrid,
  List,
  Plus,
  ChevronDown,
  Check,
  AlertTriangle,
  X,
  Trash2,
} from "lucide-react";

import { CameraFeed, CameraData } from "@/components/CameraFeed";
import { RecentEvents, EventData } from "@/components/RecentEvents";
import { EvidenceModal } from "@/components/EvidenceModal";
import { StatsBar } from "@/components/StatsBar";
import { UploadVideoModal } from "@/components/UploadVideoModal";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { ExpandCameraModal } from "@/components/ExpandCameraModal";

const getBackendUrl = () => {
  if (typeof window !== "undefined") {
    const host =
      window.location.hostname === "localhost" || window.location.hostname === "::1"
        ? "127.0.0.1"
        : window.location.hostname;
    return `${window.location.protocol}//${host}:8002`;
  }
  return "http://127.0.0.1:8002";
};

const getWsUrl = () => {
  if (typeof window !== "undefined") {
    const host =
      window.location.hostname === "localhost" || window.location.hostname === "::1"
        ? "127.0.0.1"
        : window.location.hostname;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${host}:8002/ws/live`;
  }
  return "ws://127.0.0.1:8002/ws/live";
};

type FilterType = "all" | "violent" | "suspicious" | "safe";
type ViewMode = "grid" | "list";
type SortOption = "risk" | "id" | "name" | "fps";

export default function Dashboard() {
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [modalDefaultTab, setModalDefaultTab] = useState<"image" | "clip">("image");

  // Navigation tab state: 'cameras' | 'workspace' | 'incidents' | 'analytics'
  const [activeNavTab, setActiveNavTab] = useState<string>("cameras");

  // Filtering & Sorting
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortOption>("risk");
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [cameraToDelete, setCameraToDelete] = useState<CameraData | null>(null);
  const [cameraToExpand, setCameraToExpand] = useState<CameraData | null>(null);

  // Feature controls
  const [blurFaces, setBlurFaces] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Telemetry & WebSocket
  const [isConnected, setIsConnected] = useState(false);
  const [audioAlerts, setAudioAlerts] = useState(true);
  const [stats, setStats] = useState({
    aggregateFps: 0,
    cpuPercent: 0,
    memoryPercent: 0,
    activeCameras: 8,
    totalEvents: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Play subtle alert tone when violence is confirmed
  const playAlertTone = () => {
    if (!audioAlerts || typeof window === "undefined") return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  // Connect WebSocket for live telemetry push
  const connectWebSocket = () => {
    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "INIT") {
            if (msg.cameras) setCameras(msg.cameras);
            if (msg.events) setEvents(msg.events);
          } else if (msg.type === "STATUS_UPDATE") {
            if (msg.cameras) {
              setCameras(msg.cameras);
              const totalFps = msg.cameras.reduce(
                (acc: number, c: CameraData) => acc + (c.inference_fps || 0),
                0
              );
              setStats((prev) => ({ ...prev, aggregateFps: totalFps }));
            }
          } else if (msg.type === "EVENT") {
            const newEvt = msg.data;
            setEvents((prev) => {
              const existingIdx = prev.findIndex((e) => e.id === newEvt.id);
              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = newEvt;
                return updated;
              }
              return [newEvt, ...prev];
            });
            playAlertTone();
          }
        } catch (err) {
          console.error("WS Parse error:", err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = () => {
        setIsConnected(false);
        ws.close();
      };
    } catch {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000);
    }
  };

  const fetchCameras = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/cameras`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setCameras(data);
        }
      }
    } catch {}
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats((prev) => ({
          ...prev,
          cpuPercent: data.cpu_percent,
          memoryPercent: data.memory_percent,
          activeCameras: data.active_cameras,
          totalEvents: data.total_events,
          aggregateFps: data.aggregate_fps || prev.aggregateFps,
        }));
      }
    } catch {}
  };

  const fetchBlurStatus = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/cameras/blur-faces`);
      if (res.ok) {
        const data = await res.json();
        setBlurFaces(Boolean(data.blur_faces));
      }
    } catch {}
  };

  useEffect(() => {
    connectWebSocket();
    fetchCameras();
    fetchStats();
    fetchBlurStatus();

    const statsInterval = setInterval(fetchStats, 2000);
    const eventsInterval = setInterval(async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/events?limit=20`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch {}
    }, 3000);

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      clearInterval(statsInterval);
      clearInterval(eventsInterval);
    };
  }, []);

  // Blur faces toggle
  const handleToggleBlurFaces = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/cameras/blur-faces`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setBlurFaces(data.blur_faces);
        showToast(
          data.blur_faces ? "Face blurring enabled on all feeds" : "Face blurring disabled",
          "info"
        );
      }
    } catch {
      showToast("Could not communicate with backend for face blurring", "error");
    }
  };

  // Refresh Telemetry
  const handleRefreshTelemetry = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchCameras(), fetchStats()]);
    setTimeout(() => {
      setIsRefreshing(false);
      showToast("Telemetry metrics refreshed", "success");
    }, 500);
  };

  // Load Benchmark Feeds
  const handleResetBenchmark = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/cameras/reset-benchmark`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.cameras) {
          setCameras(data.cameras);
        }
        showToast("Benchmark feeds reset and reloaded successfully", "success");
      }
    } catch {
      showToast("Failed to reset benchmark feeds", "error");
    }
  };

  // Delete camera handler
  const handleDeleteCameraConfirm = async (cam: CameraData, deleteFile: boolean) => {
    try {
      const res = await fetch(
        `${getBackendUrl()}/api/cameras/${cam.camera_id}?delete_file=${deleteFile}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setCameras((prev) => prev.filter((c) => c.camera_id !== cam.camera_id));
        showToast(`Feed ${cam.camera_id} (${cam.name}) deleted successfully`, "success");
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Delete failed");
      }
    } catch (err: any) {
      showToast(`Error deleting camera: ${err.message}`, "error");
      throw err;
    }
  };

  // Upload camera success
  const handleUploadSuccess = (newCam: CameraData) => {
    setCameras((prev) => [...prev, newCam]);
    showToast(`New video feed ${newCam.camera_id} added and streaming`, "success");
  };

  // Select evidence
  const handleSelectEvidence = (camId: string, defaultTab: "image" | "clip" = "image") => {
    const found = events.find((e) => e.camera_id === camId);
    if (found) {
      setSelectedEvent(found);
      setModalDefaultTab(defaultTab);
    } else {
      // If no recorded event exists yet for this camera, create a snapshot event view
      setSelectedEvent({
        id: `LIVE-${camId}`,
        camera_id: camId,
        start_timestamp: new Date().toLocaleTimeString(),
        detection_timestamp: new Date().toLocaleTimeString(),
        confidence: 0.75,
        status: "ACTIVE",
        image_path: null,
        clip_path: null,
        created_at: new Date().toISOString(),
      });
      setModalDefaultTab(defaultTab);
    }
  };

  // Counts for filters
  const violentCameras = cameras.filter(
    (c) => c.status === "VIOLENCE" || c.violence_probability >= 0.60
  );
  const suspiciousCameras = cameras.filter(
    (c) =>
      c.status !== "VIOLENCE" &&
      c.violence_probability < 0.60 &&
      (c.status === "CANDIDATE" || c.violence_probability >= 0.40)
  );
  const safeCameras = cameras.filter(
    (c) =>
      c.status !== "VIOLENCE" &&
      c.status !== "CANDIDATE" &&
      c.violence_probability < 0.40
  );

  // Apply search and filter
  const filteredCameras = cameras
    .filter((cam) => {
      // Filter tab
      if (filterType === "violent") {
        return cam.status === "VIOLENCE" || cam.violence_probability >= 0.60;
      }
      if (filterType === "suspicious") {
        return (
          cam.status !== "VIOLENCE" &&
          cam.violence_probability < 0.60 &&
          (cam.status === "CANDIDATE" || cam.violence_probability >= 0.40)
        );
      }
      if (filterType === "safe") {
        return (
          cam.status !== "VIOLENCE" &&
          cam.status !== "CANDIDATE" &&
          cam.violence_probability < 0.40
        );
      }
      return true;
    })
    .filter((cam) => {
      // Search term
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        cam.camera_id.toLowerCase().includes(q) ||
        cam.name.toLowerCase().includes(q) ||
        cam.status.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "risk") {
        return b.violence_probability - a.violence_probability;
      }
      if (sortBy === "id") {
        return a.camera_id.localeCompare(b.camera_id);
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "fps") {
        return (b.inference_fps || 0) - (a.inference_fps || 0);
      }
      return 0;
    });

  const activeAlertsCount = violentCameras.length;

  return (
    <div className="min-h-screen bg-[#f4f7f9] text-slate-900 flex flex-col font-sans surveillance-bg">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold animate-in slide-in-from-top duration-200 ${
            toastMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : toastMessage.type === "error"
              ? "bg-rose-50 text-rose-800 border-rose-200"
              : "bg-teal-50 text-teal-800 border-teal-200"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current" />
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Application Header Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 px-6 py-2.5 flex items-center justify-between shadow-2xs">
        {/* Left: Brand & Navigation Tabs */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#005c53]">
              <Video className="w-5 h-5 text-[#005c53]" />
            </div>
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 uppercase">
              LIVE VIOLENCE MONITOR
            </span>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setActiveNavTab("cameras")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition border-b-2 cursor-pointer ${
                activeNavTab === "cameras"
                  ? "text-[#005c53] border-[#005c53]"
                  : "text-slate-500 border-transparent hover:text-slate-800"
              }`}
            >
              <Video className="w-4 h-4 text-[#005c53]" />
              <span>Cameras</span>
            </button>

            <button
              onClick={() => setActiveNavTab("workspace")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition border-b-2 cursor-pointer ${
                activeNavTab === "workspace"
                  ? "text-[#005c53] border-[#005c53]"
                  : "text-slate-500 border-transparent hover:text-slate-800"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Workspace</span>
            </button>

            <button
              onClick={() => setActiveNavTab("incidents")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition border-b-2 cursor-pointer ${
                activeNavTab === "incidents"
                  ? "text-[#005c53] border-[#005c53]"
                  : "text-slate-500 border-transparent hover:text-slate-800"
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Incidents</span>
            </button>

            <button
              onClick={() => setActiveNavTab("analytics")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition border-b-2 cursor-pointer ${
                activeNavTab === "analytics"
                  ? "text-[#005c53] border-[#005c53]"
                  : "text-slate-500 border-transparent hover:text-slate-800"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </button>
          </nav>
        </div>

        {/* Right: Search, Status Badges, Bell & Profile Avatar */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const el = document.getElementById("search-camera-input");
              el?.focus();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            title="Search cameras"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* AI Backend Connected Status */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span>AI Backend Connected</span>
          </div>

          {/* Database Connected Status */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Database Connected</span>
          </div>

          {/* Bell Icon with Red Alert Badge */}
          <div className="relative">
            <button
              onClick={() => setAudioAlerts(!audioAlerts)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer relative"
              title={audioAlerts ? "Mute audio alarms" : "Unmute audio alarms"}
            >
              <Bell className="w-4 h-4" />
              {activeAlertsCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {activeAlertsCount}
                </span>
              )}
            </button>
          </div>

          {/* User Profile Avatar */}
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
            VI
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 max-w-[1720px] w-full mx-auto flex flex-col gap-5">
        {/* Page Title & Action Buttons Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Cameras &amp; Violence Detection
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Multi-Camera Local Edge CCTV Violence &amp; Physical Altercation Detector (
              {cameras.length} Active Feeds)
            </p>
          </div>

          {/* Action Buttons: Blur Faces, Refresh Telemetry, Load Benchmark Feeds */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Blur Faces Button */}
            <button
              onClick={handleToggleBlurFaces}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer shadow-2xs ${
                blurFaces
                  ? "bg-teal-50 border-teal-300 text-teal-800"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {blurFaces ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-teal-700" />
                  <span>Blur Faces: ON</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  <span>Blur Faces</span>
                </>
              )}
            </button>

            {/* Refresh Telemetry Button */}
            <button
              onClick={handleRefreshTelemetry}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>Refresh Telemetry</span>
            </button>

            {/* Load Benchmark Feeds Button */}
            <button
              onClick={handleResetBenchmark}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
            >
              <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Load Benchmark Feeds</span>
            </button>
          </div>
        </div>

        {/* Telemetry Metric Cards */}
        <StatsBar
          aggregateFps={stats.aggregateFps}
          cpuPercent={stats.cpuPercent}
          memoryPercent={stats.memoryPercent}
          activeCameras={cameras.length || stats.activeCameras}
          totalEvents={events.length || stats.totalEvents}
          isConnected={isConnected}
        />

        {/* Filter and Search Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-transparent">
          {/* Left: Search input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="search-camera-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search camera name, ID, or location..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200/90 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Middle: Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs whitespace-nowrap ${
                filterType === "all"
                  ? "bg-[#005c53] text-white"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              All Cameras ({cameras.length})
            </button>

            <button
              onClick={() => setFilterType("violent")}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs whitespace-nowrap ${
                filterType === "violent"
                  ? "bg-red-600 text-white"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>Violent ({violentCameras.length})</span>
            </button>

            <button
              onClick={() => setFilterType("suspicious")}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs whitespace-nowrap ${
                filterType === "suspicious"
                  ? "bg-amber-500 text-white"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Suspicious ({suspiciousCameras.length})</span>
            </button>

            <button
              onClick={() => setFilterType("safe")}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs whitespace-nowrap ${
                filterType === "safe"
                  ? "bg-emerald-600 text-white"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Calm &amp; Safe ({safeCameras.length})</span>
            </button>
          </div>

          {/* Right: View Grid/List & Sort Dropdown */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* View layout toggles */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-400 hover:text-slate-700"
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === "list"
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-400 hover:text-slate-700"
                }`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
              >
                <span>
                  Sort by:{" "}
                  {sortBy === "risk"
                    ? "Risk Level"
                    : sortBy === "id"
                    ? "Camera ID"
                    : sortBy === "name"
                    ? "Camera Name"
                    : "FPS"}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isSortDropdownOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-20 animate-in fade-in duration-100">
                  <button
                    onClick={() => {
                      setSortBy("risk");
                      setIsSortDropdownOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <span>Risk Level</span>
                    {sortBy === "risk" && <Check className="w-3.5 h-3.5 text-teal-600" />}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy("id");
                      setIsSortDropdownOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <span>Camera ID</span>
                    {sortBy === "id" && <Check className="w-3.5 h-3.5 text-teal-600" />}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy("name");
                      setIsSortDropdownOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <span>Camera Name</span>
                    {sortBy === "name" && <Check className="w-3.5 h-3.5 text-teal-600" />}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy("fps");
                      setIsSortDropdownOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <span>Throughput (FPS)</span>
                    {sortBy === "fps" && <Check className="w-3.5 h-3.5 text-teal-600" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Camera Grid View */}
        {viewMode === "grid" ? (
          <div
            className={`grid gap-4.5 ${
              filteredCameras.length <= 2
                ? "grid-cols-1 md:grid-cols-2"
                : filteredCameras.length <= 4
                ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
                : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            }`}
          >
            {filteredCameras.map((cam) => (
              <CameraFeed
                key={cam.camera_id}
                camera={cam}
                backendUrl={getBackendUrl()}
                onSelectEvidence={(camId) => handleSelectEvidence(camId, "image")}
                onPlayClip={(camId) => handleSelectEvidence(camId, "clip")}
                onDelete={(cam) => setCameraToDelete(cam)}
                onExpand={(cam) => setCameraToExpand(cam)}
              />
            ))}
          </div>
        ) : (
          /* Camera List View */
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="divide-y divide-slate-100">
              {filteredCameras.map((cam) => {
                const prob = Math.round(cam.violence_probability * 100);
                const isViolent = cam.status === "VIOLENCE" || prob >= 60;
                const isSuspicious = !isViolent && (cam.status === "CANDIDATE" || prob >= 40);

                return (
                  <div
                    key={cam.camera_id}
                    className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition"
                  >
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isViolent
                            ? "bg-red-50 text-red-600"
                            : isSuspicious
                            ? "bg-amber-50 text-amber-600"
                            : "bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {cam.camera_id}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              isViolent
                                ? "bg-red-50 text-red-600 border border-red-200"
                                : isSuspicious
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}
                          >
                            {isViolent ? "Violent" : isSuspicious ? "Suspicious" : "Normal"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate max-w-[220px]">
                          {cam.name}
                        </p>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="flex-1 max-w-xs hidden sm:block">
                      <div className="flex justify-between text-xs mb-1 font-mono">
                        <span className="text-slate-500">Violence Risk:</span>
                        <span
                          className={`font-bold ${
                            isViolent
                              ? "text-red-600"
                              : isSuspicious
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {prob}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${
                            isViolent
                              ? "bg-red-500"
                              : isSuspicious
                              ? "bg-amber-400"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, Math.max(3, prob))}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 font-mono hidden md:block">
                      <span>{Math.round(cam.inference_fps || 30)} FPS</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSelectEvidence(cam.camera_id, "image")}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#f0f6ff] text-[#2563eb] border border-[#dbeafe] hover:bg-[#e0edff] transition cursor-pointer"
                      >
                        Evidence
                      </button>
                      <button
                        onClick={() => handleSelectEvidence(cam.camera_id, "clip")}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#f0f6ff] text-[#2563eb] border border-[#dbeafe] hover:bg-[#e0edff] transition cursor-pointer"
                      >
                        Play Clip
                      </button>
                      <button
                        onClick={() => setCameraToDelete(cam)}
                        className="p-1.5 rounded-lg text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                        title="Delete Video"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredCameras.length === 0 && (
          <div className="py-16 bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center text-center p-6 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">No cameras match current filter</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Try clearing search query or switching filter tabs.
              </p>
            </div>
            <button
              onClick={() => {
                setFilterType("all");
                setSearchQuery("");
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Floating / Centered Bottom Button: + Upload New Video / Feed */}
        <div className="flex justify-center my-4">
          <button
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-white border border-teal-200 shadow-md hover:shadow-lg hover:border-teal-300 text-[#005c53] font-bold text-xs sm:text-sm transition transform hover:-translate-y-0.5 cursor-pointer"
          >
            <span className="w-6 h-6 rounded-full bg-[#005c53] text-white flex items-center justify-center shadow-xs">
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span>Upload New Video / Feed</span>
          </button>
        </div>

        {/* Incident History & Evidence Log */}
        {(activeNavTab === "incidents" || events.length > 0) && (
          <div className="mt-2">
            <RecentEvents
              events={events}
              onSelectEvent={(evt, defaultTab) => {
                setSelectedEvent(evt);
                setModalDefaultTab(defaultTab || "image");
              }}
            />
          </div>
        )}
      </main>

      {/* Upload Video Modal */}
      <UploadVideoModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        backendUrl={getBackendUrl()}
      />

      {/* Delete Video Confirmation Modal */}
      <DeleteConfirmModal
        camera={cameraToDelete}
        isOpen={Boolean(cameraToDelete)}
        onClose={() => setCameraToDelete(null)}
        onConfirm={handleDeleteCameraConfirm}
      />

      {/* Expand Single Camera View Modal */}
      <ExpandCameraModal
        camera={cameraToExpand}
        isOpen={Boolean(cameraToExpand)}
        onClose={() => setCameraToExpand(null)}
        backendUrl={getBackendUrl()}
        onSelectEvidence={(camId) => handleSelectEvidence(camId, "image")}
        onPlayClip={(camId) => handleSelectEvidence(camId, "clip")}
        onDelete={(cam) => {
          setCameraToExpand(null);
          setCameraToDelete(cam);
        }}
      />

      {/* Evidence Viewer Modal */}
      {selectedEvent && (
        <EvidenceModal
          key={selectedEvent.id}
          event={selectedEvent}
          defaultTab={modalDefaultTab}
          backendUrl={getBackendUrl()}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-center text-xs text-slate-500 font-mono">
        Pretrained Model: <span className="text-slate-700 font-medium">engares/MoViNet4Violence-Detection (MoViNet-A0)</span> • Local-first Edge CCTV Architecture • Real-Time Multi-Feed
      </footer>
    </div>
  );
}
