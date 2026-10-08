"use client";

import React, { useState, useEffect } from "react";
import { X, Image as ImageIcon, Film, Download, ShieldAlert, Clock, Camera, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { EventData } from "./RecentEvents";

interface EvidenceModalProps {
  event: EventData | null;
  defaultTab?: "image" | "clip";
  backendUrl: string;
  onClose: () => void;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  event,
  defaultTab = "image",
  backendUrl,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"image" | "clip">(defaultTab);
  const [currentEvent, setCurrentEvent] = useState<EventData | null>(event);
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    setActiveTab(defaultTab);
    setCurrentEvent(event);
    setImgError(false);
    setVideoError(false);
  }, [defaultTab, event]);

  // If clip is not ready yet, poll for completed clip
  useEffect(() => {
    if (!currentEvent || currentEvent.clip_path) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/events?limit=20`);
        if (res.ok) {
          const events: EventData[] = await res.json();
          const updated = events.find((e) => e.id === currentEvent.id);
          if (updated && updated.clip_path) {
            setCurrentEvent(updated);
            clearInterval(interval);
          }
        }
      } catch {}
    }, 1500);

    return () => clearInterval(interval);
  }, [currentEvent, backendUrl]);

  if (!currentEvent) return null;

  // Resolve media URLs: use relative same-origin paths so Next.js proxies cleanly without CORS or IPv6/IPv4 mismatches
  const getMediaUrl = (path?: string | null) => {
    if (!path) return null;
    if (path.startsWith("http://") || path.startsWith("https://")) {
      // Strip any hardcoded backend host to force same-origin proxy
      try {
        const url = new URL(path);
        return url.pathname;
      } catch {
        return path;
      }
    }
    return path.startsWith("/") ? path : `/${path}`;
  };

  const imageUrl = getMediaUrl(currentEvent.image_path);
  const clipUrl = getMediaUrl(currentEvent.clip_path);
  const confPercent = Math.round(currentEvent.confidence * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-white tracking-wide uppercase">
                  Incident Evidence: {currentEvent.camera_id}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 font-mono text-xs font-bold border border-red-500/40">
                  {confPercent}% Violence Confirmed
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Event ID: {currentEvent.id} • Detected at {currentEvent.detection_timestamp}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Media Selector Tabs & Actions */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950/60 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("image")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition ${
                activeTab === "image"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Evidence Snapshot</span>
            </button>

            <button
              onClick={() => setActiveTab("clip")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition ${
                activeTab === "clip"
                  ? "bg-red-600 text-white shadow-sm shadow-red-500/20"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>
                {clipUrl ? "Recorded 10s Video Clip" : "Recorded Clip (Buffering...)"}
              </span>
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            {activeTab === "image" && imageUrl && (
              <>
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full JPG</span>
                </a>
                <a
                  href={imageUrl}
                  download={`evidence_${currentEvent.camera_id}_${currentEvent.id}.jpg`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download JPG</span>
                </a>
              </>
            )}

            {activeTab === "clip" && clipUrl && (
              <>
                <a
                  href={clipUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full MP4</span>
                </a>
                <a
                  href={clipUrl}
                  download={`clip_${currentEvent.camera_id}_${currentEvent.id}.mp4`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download MP4</span>
                </a>
              </>
            )}
          </div>
        </div>

        {/* Media Viewer Area */}
        <div className="p-6 bg-slate-950 flex flex-col items-center justify-center min-h-[420px] max-h-[62vh] overflow-y-auto">
          {activeTab === "image" && (
            <div className="relative w-full flex flex-col items-center justify-center">
              {imageUrl ? (
                imgError ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-red-400">
                    <AlertCircle className="w-8 h-8" />
                    <span className="text-sm font-medium">Failed to load evidence frame</span>
                    <a
                      href={imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-400 underline mt-1"
                    >
                      Open directly: {imageUrl}
                    </a>
                  </div>
                ) : (
                  <img
                    key={imageUrl}
                    src={imageUrl}
                    alt={`Evidence ${currentEvent.id}`}
                    onError={() => setImgError(true)}
                    className="max-h-[55vh] max-w-full rounded-xl object-contain border border-slate-800 shadow-2xl bg-black"
                  />
                )
              ) : (
                <div className="text-xs text-slate-500 py-16">No evidence snapshot captured for this event.</div>
              )}
            </div>
          )}

          {activeTab === "clip" && (
            <div className="w-full flex flex-col items-center justify-center">
              {clipUrl ? (
                videoError ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-red-400">
                    <AlertCircle className="w-8 h-8" />
                    <span className="text-sm font-medium">Browser could not render video</span>
                    <a
                      href={clipUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-400 underline mt-1"
                    >
                      Download or open MP4 directly
                    </a>
                  </div>
                ) : (
                  <video
                    key={clipUrl}
                    src={clipUrl}
                    controls
                    autoPlay
                    playsInline
                    preload="auto"
                    loop
                    onError={() => setVideoError(true)}
                    className="max-h-[55vh] max-w-full rounded-xl border border-slate-800 shadow-2xl bg-black"
                  />
                )
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center max-w-md">
                  <div className="p-3 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">Clip Buffering & Encoding</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Collecting rolling frames (~5s pre-event + ~5s post-event). Ready shortly.
                    </p>
                  </div>
                  {imageUrl && (
                    <div className="mt-2 w-full pt-4 border-t border-slate-800/80">
                      <p className="text-[11px] text-slate-500 mb-2">Evidence Keyframe Preview:</p>
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="max-h-[220px] mx-auto rounded-lg border border-slate-800"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer with Verification Proof */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-5 text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-slate-500" />
              {currentEvent.camera_id}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {currentEvent.detection_timestamp}
            </span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Pretrained MoViNet-A0 Verified
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
