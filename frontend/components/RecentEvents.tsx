"use client";

import React from "react";
import { AlertCircle, Film, Image as ImageIcon, ShieldAlert, Clock, CheckCircle } from "lucide-react";

export interface EventData {
  id: string;
  camera_id: string;
  start_timestamp: string;
  detection_timestamp: string;
  end_timestamp?: string | null;
  confidence: number;
  status: string;
  image_path?: string | null;
  clip_path?: string | null;
  created_at: string;
}

interface RecentEventsProps {
  events: EventData[];
  onSelectEvent: (event: EventData, defaultTab?: "image" | "clip") => void;
}

export const RecentEvents: React.FC<RecentEventsProps> = ({
  events,
  onSelectEvent,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <AlertCircle className="w-4 h-4" />
          </div>
          <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase">
            Recent Violence & Incident Evidence Log
          </h2>
        </div>
        <span className="text-xs font-mono font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
          {events.length} Logged
        </span>
      </div>

      <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <CheckCircle className="w-8 h-8 text-emerald-500/80" />
            <p className="text-xs font-semibold text-slate-700">All cameras secure</p>
            <p className="text-[11px] text-slate-400">
              No physical altercations or violent incidents detected in this session.
            </p>
          </div>
        ) : (
          events.map((evt) => {
            const confPct = Math.round(evt.confidence * 100);
            return (
              <div
                key={evt.id}
                className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/80 transition-colors gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        {evt.camera_id}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold border border-red-200">
                        {confPct}% Confidence
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-0.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Detected at {evt.detection_timestamp}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-400 text-[10px]">{evt.id}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {evt.image_path && (
                    <button
                      onClick={() => onSelectEvent(evt, "image")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#f0f6ff] hover:bg-[#e0edff] text-[#2563eb] border border-[#dbeafe] transition cursor-pointer shadow-2xs"
                      title="View Evidence Image"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Evidence</span>
                    </button>
                  )}
                  {evt.clip_path && (
                    <button
                      onClick={() => onSelectEvent(evt, "clip")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition cursor-pointer shadow-2xs"
                      title="Play Evidence Clip"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Play Clip</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
