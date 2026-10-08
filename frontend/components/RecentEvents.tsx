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
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <h2 className="text-sm font-semibold text-slate-200 tracking-wide uppercase">
            Recent Violence Events
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-400 bg-slate-800/80 px-2.5 py-0.5 rounded-full border border-slate-700">
          {events.length} Recorded
        </span>
      </div>

      <div className="divide-y divide-slate-800/60 max-h-[380px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
            <CheckCircle className="w-8 h-8 text-emerald-500/60" />
            <p className="text-xs font-medium text-slate-400">All cameras secure</p>
            <p className="text-[11px] text-slate-500">No violent incidents detected in current session.</p>
          </div>
        ) : (
          events.map((evt) => {
            const confPct = Math.round(evt.confidence * 100);
            return (
              <div
                key={evt.id}
                className="px-4 py-3 flex items-center justify-between hover:bg-slate-800/40 transition-colors gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                        {evt.camera_id}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.2 rounded bg-red-500/20 text-red-300 font-semibold border border-red-500/30">
                        {confPct}% Confidence
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mt-0.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>Detected at {evt.detection_timestamp}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-500 text-[10px]">{evt.id}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {evt.image_path && (
                    <button
                      onClick={() => onSelectEvent(evt, "image")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      title="View Evidence Image"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                      <span>Evidence</span>
                    </button>
                  )}
                  {evt.clip_path && (
                    <button
                      onClick={() => onSelectEvent(evt, "clip")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-950/60 hover:bg-red-900/60 text-red-200 border border-red-800/60 transition"
                      title="Play Evidence Clip"
                    >
                      <Film className="w-3.5 h-3.5 text-red-400" />
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
