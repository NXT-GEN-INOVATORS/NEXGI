"use client";

import React, { useState, useEffect } from "react";
import {
  Video,
  ShieldAlert,
  Clock,
  Cpu,
  FileText,
  Play,
  Trash2,
  Maximize2,
  AlertTriangle,
} from "lucide-react";

export interface CameraData {
  camera_id: string;
  name: string;
  violence_probability: number;
  status: "NORMAL" | "CANDIDATE" | "VIOLENCE" | "ERROR";
  last_inference_timestamp: string;
  source_fps: number;
  inference_fps: number;
  is_active: boolean;
  consecutive_positives: number;
}

interface CameraFeedProps {
  camera: CameraData;
  backendUrl: string;
  onSelectEvidence: (cameraId: string) => void;
  onPlayClip: (cameraId: string) => void;
  onDelete: (camera: CameraData) => void;
  onExpand?: (camera: CameraData) => void;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({
  camera,
  backendUrl,
  onSelectEvidence,
  onPlayClip,
  onDelete,
  onExpand,
}) => {
  const [streamError, setStreamError] = useState(false);
  const [timecode, setTimecode] = useState("00:58:49");

  // Keep a running surveillance timecode display
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, "0");
      const mins = String(now.getMinutes()).padStart(2, "0");
      const secs = String(now.getSeconds()).padStart(2, "0");
      setTimecode(`${hrs}:${mins}:${secs}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const streamUrl = `${backendUrl}/api/cameras/${camera.camera_id}/stream`;
  const probPercent = Math.round(camera.violence_probability * 100);
  const isViolent = camera.status === "VIOLENCE" || probPercent >= 60;
  const isSuspicious = !isViolent && (camera.status === "CANDIDATE" || probPercent >= 40);
  const isError = camera.status === "ERROR" || streamError;

  return (
    <div
      className={`rounded-2xl overflow-hidden flex flex-col transition duration-200 ${
        isViolent
          ? "bg-[#fff8f8] border border-red-300 shadow-sm ring-1 ring-red-400/30 animate-violence-alert"
          : isSuspicious
          ? "bg-white border border-amber-200/90 shadow-xs hover:shadow-sm"
          : "bg-white border border-slate-200/90 shadow-xs hover:shadow-sm"
      }`}
    >
      {/* Top Header of Card */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              isViolent
                ? "bg-red-50 text-red-600"
                : isSuspicious
                ? "bg-amber-50 text-amber-600"
                : "bg-emerald-50 text-emerald-600"
            }`}
          >
            <Video className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-800 leading-tight">
              {camera.camera_id}
            </h3>
            <p className="text-[11px] text-slate-500 truncate max-w-[150px]">
              {camera.name}
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div>
          {isViolent ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-600">
              <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
              <span>Violence Detected</span>
            </span>
          ) : isSuspicious ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>Suspicious</span>
            </span>
          ) : isError ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 border border-rose-200 text-rose-600">
              <AlertTriangle className="w-3 h-3 text-rose-500" />
              <span>Stream Error</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Normal</span>
            </span>
          )}
        </div>
      </div>

      {/* Video Viewport */}
      <div className="relative aspect-video w-full bg-slate-950 overflow-hidden flex items-center justify-center group">
        {!streamError ? (
          <img
            src={streamUrl}
            alt={camera.name}
            className="w-full h-full object-cover"
            onError={() => setStreamError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-slate-400 p-4 text-center">
            <Video className="w-8 h-8 text-slate-500" />
            <p className="text-xs font-medium">Connecting to stream...</p>
          </div>
        )}

        {/* HUD Overlay - Top Left REC badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/70 backdrop-blur-xs px-2 py-0.5 rounded text-[11px] font-mono text-white border border-white/10">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>REC</span>
        </div>

        {/* HUD Overlay - Top Right Timecode */}
        <div className="absolute top-2.5 right-2.5 bg-black/70 backdrop-blur-xs px-2 py-0.5 rounded text-[11px] font-mono text-white border border-white/10">
          <span>{timecode}</span>
        </div>

        {/* HUD Overlay - Bottom Right Expand Button */}
        <button
          onClick={() => onExpand?.(camera)}
          className="absolute bottom-2.5 right-2.5 bg-black/70 hover:bg-black/90 text-white p-1.5 rounded cursor-pointer transition border border-white/10 backdrop-blur-xs"
          title="Expand View"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body: Probability & Telemetry Info */}
      <div className="p-3.5 flex flex-col gap-2.5">
        {/* Violence Probability Bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700 font-medium">Violence Probability</span>
            <span
              className={`font-mono font-bold ${
                isViolent
                  ? "text-red-600"
                  : isSuspicious
                  ? "text-amber-600"
                  : "text-emerald-600"
              }`}
            >
              {probPercent}%
            </span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isViolent
                  ? "bg-red-500"
                  : isSuspicious
                  ? "bg-amber-400"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(3, probPercent))}%` }}
            />
          </div>
        </div>

        {/* Telemetry info row */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-0.5">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{Math.round(camera.inference_fps || 30)} FPS</span>
          </span>
          <span className="flex items-center gap-1 text-slate-600">
            <Cpu className="w-3 h-3 text-slate-400" />
            <span>MoViNet-A0</span>
          </span>
          <span>Source: {Math.round(camera.source_fps || 30)} FPS</span>
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <button
            onClick={() => onSelectEvidence(camera.camera_id)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold bg-[#f0f6ff] text-[#2563eb] border border-[#dbeafe] hover:bg-[#e0edff] cursor-pointer transition shadow-2xs"
          >
            <FileText className="w-3.5 h-3.5 text-[#2563eb]" />
            <span>View Evidence</span>
          </button>

          <button
            onClick={() => onPlayClip(camera.camera_id)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold bg-[#f0f6ff] text-[#2563eb] border border-[#dbeafe] hover:bg-[#e0edff] cursor-pointer transition shadow-2xs"
          >
            <Play className="w-3.5 h-3.5 text-[#2563eb] fill-current" />
            <span>Play Clip</span>
          </button>

          <button
            onClick={() => onDelete(camera)}
            className="p-1.5 rounded-lg text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 cursor-pointer transition shadow-2xs"
            title={`Delete ${camera.camera_id} Video`}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
          </button>
        </div>
      </div>
    </div>
  );
};
