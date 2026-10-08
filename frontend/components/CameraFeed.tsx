"use client";

import React, { useState } from "react";
import { AlertTriangle, ShieldCheck, ShieldAlert, Video, Activity } from "lucide-react";

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
  onSelectEvidence?: (cameraId: string) => void;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({
  camera,
  backendUrl,
}) => {
  const [streamError, setStreamError] = useState(false);
  const streamUrl = `${backendUrl}/api/cameras/${camera.camera_id}/stream`;
  
  const probPercent = Math.round(camera.violence_probability * 100);
  const isViolence = camera.status === "VIOLENCE";
  const isCandidate = camera.status === "CANDIDATE";
  const isError = camera.status === "ERROR" || streamError;

  return (
    <div
      className={`relative flex flex-col rounded-xl overflow-hidden bg-slate-900/80 border transition-all duration-300 ${
        isViolence
          ? "border-red-500 shadow-lg shadow-red-500/20 animate-violence-alert"
          : isCandidate
          ? "border-amber-500/70 shadow-md shadow-amber-500/10"
          : "border-slate-800 hover:border-slate-700"
      }`}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/80 border-b border-slate-800/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isViolence
                  ? "bg-red-400"
                  : isCandidate
                  ? "bg-amber-400"
                  : "bg-emerald-400"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isViolence
                  ? "bg-red-500"
                  : isCandidate
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
            />
          </span>
          <span className="font-semibold text-xs tracking-wider text-slate-200 uppercase">
            {camera.camera_id}
          </span>
          <span className="text-xs text-slate-400 font-medium truncate max-w-[150px]">
            {camera.name}
          </span>
        </div>

        {/* Status Badge */}
        <div>
          {isViolence ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40">
              <ShieldAlert className="w-3.5 h-3.5" />
              VIOLENCE DETECTED
            </span>
          ) : isCandidate ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Activity className="w-3.5 h-3.5" />
              ANALYZING
            </span>
          ) : isError ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <AlertTriangle className="w-3.5 h-3.5" />
              STREAM ERROR
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              No violence detected
            </span>
          )}
        </div>
      </div>

      {/* Video Viewport */}
      <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
        {!streamError ? (
          <img
            src={streamUrl}
            alt={camera.name}
            className="w-full h-full object-contain"
            onError={() => setStreamError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
            <Video className="w-10 h-10 stroke-[1.5]" />
            <p className="text-xs">Connecting to camera stream...</p>
          </div>
        )}

        {/* Live HUD Overlay */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-0.5 rounded text-[11px] font-mono text-slate-300 border border-white/10">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          REC
        </div>

        <div className="absolute top-2 right-2 flex items-center gap-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded text-[11px] font-mono text-slate-300 border border-white/10">
          <span>INF: {camera.inference_fps.toFixed(1)} FPS</span>
        </div>

        {isViolence && (
          <div className="absolute inset-0 bg-red-500/10 pointer-events-none border-2 border-red-500 animate-pulse" />
        )}
      </div>

      {/* Bottom Telemetry Footer */}
      <div className="p-3 bg-slate-950/60 border-t border-slate-800/80 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Violence Probability:</span>
          <span
            className={`font-mono font-bold ${
              probPercent >= 60
                ? "text-red-400"
                : probPercent >= 40
                ? "text-amber-400"
                : "text-emerald-400"
            }`}
          >
            {probPercent}%
          </span>
        </div>

        {/* Meter Bar */}
        <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              probPercent >= 60
                ? "bg-red-500 shadow-sm shadow-red-500"
                : probPercent >= 40
                ? "bg-amber-400"
                : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(2, probPercent))}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-0.5">
          <span>Last Checked: {camera.last_inference_timestamp || "--:--:--"}</span>
          <span>Source: {camera.source_fps.toFixed(0)} FPS</span>
        </div>
      </div>
    </div>
  );
};
