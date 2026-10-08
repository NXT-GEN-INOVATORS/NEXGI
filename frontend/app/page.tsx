"use client";

import React, { useState, useEffect, useRef } from "react";
import { Shield, ShieldAlert, Video, Trash2, Bell, BellOff, RefreshCw, Eye } from "lucide-react";
import { CameraFeed, CameraData } from "@/components/CameraFeed";
import { RecentEvents, EventData } from "@/components/RecentEvents";
import { EvidenceModal } from "@/components/EvidenceModal";
import { StatsBar } from "@/components/StatsBar";

const getBackendUrl = () => {
  if (typeof window !== "undefined") {
    const host =
      window.location.hostname === "localhost" || window.location.hostname === "::1"
        ? "127.0.0.1"
        : window.location.hostname;
    return `${window.location.protocol}//${host}:8001`;
  }
  return "http://127.0.0.1:8001";
};

const getWsUrl = () => {
  if (typeof window !== "undefined") {
    const host =
      window.location.hostname === "localhost" || window.location.hostname === "::1"
        ? "127.0.0.1"
        : window.location.hostname;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${host}:8001/ws/live`;
  }
  return "ws://127.0.0.1:8001/ws/live";
};

export default function Dashboard() {
  const [cameras, setCameras] = useState<CameraData[]>([]);

  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [modalDefaultTab, setModalDefaultTab] = useState<"image" | "clip">("image");
  const [isConnected, setIsConnected] = useState(false);
  const [audioAlerts, setAudioAlerts] = useState(true);
  const [stats, setStats] = useState({
    aggregateFps: 0,
    cpuPercent: 0,
    memoryPercent: 0,
    activeCameras: 4,
    totalEvents: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Play short subtle alert tone when violence is confirmed
  const playAlertTone = () => {
    if (!audioAlerts || typeof window === "undefined") return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 tone
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio autoplay policy fallback
    }
  };

  // Connect WebSocket for live push updates
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
              // Calculate aggregate FPS
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
        // Attempt reconnect after 2 seconds
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

  // Polling fallback & system stats fetch
  useEffect(() => {
    connectWebSocket();

    // Initial cameras fetch
    const fetchCameras = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/cameras`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setCameras(data);
          }
        }
      } catch {}
    };
    fetchCameras();

    const statsInterval = setInterval(async () => {
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
      } catch {
        // backend offline
      }
    }, 2000);

    const eventsInterval = setInterval(async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/events?limit=20`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch {
        // ignore
      }
    }, 3000);

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      clearInterval(statsInterval);
      clearInterval(eventsInterval);
    };
  }, []);

  const handleSelectEvent = (event: EventData, defaultTab: "image" | "clip" = "image") => {
    setSelectedEvent(event);
    setModalDefaultTab(defaultTab);
  };

  const activeAlertsCount = cameras.filter((c) => c.status === "VIOLENCE").length;

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col cctv-grid-bg">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-30 bg-[#090d18]/90 backdrop-blur border-b border-slate-800/80 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-600/10 border border-red-500/30 text-red-500 shadow-sm shadow-red-500/10">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                LIVE VIOLENCE MONITOR
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                MoViNet-A0 5-FPS
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Multi-Camera Local Edge CCTV Violence & Physical Altercation Detector ({cameras.length} Active Feeds)
            </p>
          </div>
        </div>

        {/* Global Alert & Control Buttons */}
        <div className="flex items-center gap-3">
          {activeAlertsCount > 0 ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 font-bold text-xs animate-pulse">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>{activeAlertsCount} ACTIVE ALERT{activeAlertsCount > 1 ? "S" : ""}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>ALL {cameras.length} FEEDS NORMAL</span>
            </div>
          )}

          <button
            onClick={() => setAudioAlerts(!audioAlerts)}
            className={`p-2 rounded-lg border text-xs font-medium transition ${
              audioAlerts
                ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                : "bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300"
            }`}
            title={audioAlerts ? "Sound alerts enabled" : "Sound alerts muted"}
          >
            {audioAlerts ? <Bell className="w-4 h-4 text-amber-400" /> : <BellOff className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-[1800px] w-full mx-auto flex flex-col gap-6">
        {/* Telemetry Status Bar */}
        <StatsBar
          aggregateFps={stats.aggregateFps}
          cpuPercent={stats.cpuPercent}
          memoryPercent={stats.memoryPercent}
          activeCameras={cameras.length || stats.activeCameras}
          totalEvents={stats.totalEvents}
          isConnected={isConnected}
        />

        {/* Multi-Camera CCTV Video Wall (Responsive grid) */}
        <div
          className={`grid gap-5 ${
            cameras.length <= 2
              ? "grid-cols-1 md:grid-cols-2"
              : cameras.length <= 4
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          }`}
        >
          {cameras.map((cam) => (
            <CameraFeed
              key={cam.camera_id}
              camera={cam}
              backendUrl={getBackendUrl()}
              onSelectEvidence={(camId) => {
                const found = events.find((e) => e.camera_id === camId);
                if (found) handleSelectEvent(found, "image");
              }}
            />
          ))}
        </div>

        {/* Incident History & Evidence Log */}
        <RecentEvents events={events} onSelectEvent={handleSelectEvent} />
      </main>

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
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-3 text-center text-xs text-slate-500 font-mono">
        Pretrained Model: <span className="text-slate-400">engares/MoViNet4Violence-Detection (MoViNet-A0)</span> • Local-first Architecture • Fully Autonomous
      </footer>
    </div>
  );
}
