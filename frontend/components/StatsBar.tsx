"use client";

import React from "react";
import { Cpu, HardDrive, Zap, Radio, AlertOctagon } from "lucide-react";

interface StatsBarProps {
  aggregateFps: number;
  cpuPercent: number;
  memoryPercent: number;
  activeCameras: number;
  totalEvents: number;
  isConnected: boolean;
}

export const StatsBar: React.FC<StatsBarProps> = ({
  aggregateFps,
  cpuPercent,
  memoryPercent,
  activeCameras,
  totalEvents,
  isConnected,
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* Concurrency Status */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Radio className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Cameras</div>
          <div className="text-sm font-bold text-white font-mono">{activeCameras} Active</div>
        </div>
      </div>

      {/* Aggregate Inference FPS */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Zap className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Throughput</div>
          <div className="text-sm font-bold text-white font-mono">{aggregateFps.toFixed(1)} FPS</div>
        </div>
      </div>

      {/* Total Events */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
          <AlertOctagon className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Incidents</div>
          <div className="text-sm font-bold text-white font-mono">{totalEvents} Logged</div>
        </div>
      </div>

      {/* CPU Usage */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
          <Cpu className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">CPU Load</div>
          <div className="text-sm font-bold text-white font-mono">{cpuPercent.toFixed(0)}%</div>
        </div>
      </div>

      {/* Memory Usage */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          <HardDrive className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">RAM Load</div>
          <div className="text-sm font-bold text-white font-mono">{memoryPercent.toFixed(0)}%</div>
        </div>
      </div>

      {/* Live Stream Status */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <div
          className={`p-2 rounded-lg border ${
            isConnected
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
          }`}
        >
          <span className="flex h-2 w-2 relative">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isConnected ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isConnected ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
          </span>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Telemetry</div>
          <div className="text-sm font-bold text-white font-mono">
            {isConnected ? "Connected" : "Syncing..."}
          </div>
        </div>
      </div>
    </div>
  );
};
