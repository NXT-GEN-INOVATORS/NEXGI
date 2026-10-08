"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Maximize2,
  Video,
  ShieldAlert,
  Clock,
  Cpu,
  FileText,
  Play,
  Trash2,
} from "lucide-react";
import { CameraData } from "./CameraFeed";

interface ExpandCameraModalProps {
  camera: CameraData | null;
  isOpen: boolean;
  onClose: () => void;
  backendUrl: string;
  onSelectEvidence: (cameraId: string) => void;
  onPlayClip: (cameraId: string) => void;
  onDelete: (camera: CameraData) => void;
}

export const ExpandCameraModal: React.FC<ExpandCameraModalProps> = ({
  camera,
  isOpen,
  onClose,
  backendUrl,
  onSelectEvidence,
  onPlayClip,
  onDelete,
}) => {
  const [timecode, setTimecode] = useState("00:58:49");

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  if (!isOpen || !camera) return null;

  const streamUrl = `${backendUrl}/api/cameras/${camera.camera_id}/stream`;
  const probPercent = Math.round(camera.violence_probability * 100);
  const isViolent = camera.status === "VIOLENCE" || probPercent >= 60;
  const isSuspicious = !isViolent && (camera.status === "CANDIDATE" || probPercent >= 40);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isViolent
                  ? "bg-red-50 text-red-600 border border-red-100"
                  : isSuspicious
                  ? "bg-amber-50 text-amber-600 border border-amber-100"
                  : "bg-emerald-50 text-emerald-600 border border-emerald-100"
              }`}
            >
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  {camera.camera_id} - {camera.name}
                </h2>
                {isViolent ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-600">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Violence Detected
                  </span>
                ) : isSuspicious ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Suspicious Activity
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Normal & Safe
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                MoViNet-A0 Streaming Inference • Source FPS: {camera.source_fps.toFixed(0)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Area */}
        <div className="relative aspect-video w-full bg-slate-950 overflow-hidden flex items-center justify-center">
          <img
            src={streamUrl}
            alt={camera.name}
            className="w-full h-full object-contain"
          />

          <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/75 px-3 py-1 rounded-md text-xs font-mono text-white border border-white/10">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span>LIVE REC</span>
          </div>

          <div className="absolute top-4 right-4 bg-black/75 px-3 py-1 rounded-md text-xs font-mono text-white border border-white/10">
            <span>{timecode}</span>
          </div>
        </div>

        {/* Footer controls & telemetry */}
        <div className="p-5 bg-white border-t border-slate-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Violence Detection Probability:
            </span>
            <span
              className={`text-sm font-bold font-mono ${
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

          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
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

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Inference: {camera.inference_fps.toFixed(1)} FPS
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                Pretrained MoViNet-A0
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onClose();
                  onSelectEvidence(camera.camera_id);
                }}
                className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-semibold bg-[#f0f6ff] text-[#2563eb] border border-[#dbeafe] hover:bg-[#e0edff] transition cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>View Evidence</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onPlayClip(camera.camera_id);
                }}
                className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-semibold bg-[#f0f6ff] text-[#2563eb] border border-[#dbeafe] hover:bg-[#e0edff] transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Clip</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onDelete(camera);
                }}
                className="p-2 rounded-xl text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                title="Delete Video Feed"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
