"use client";

import React from "react";
import { Video, Zap, ShieldAlert, Cpu, HardDrive, Wifi } from "lucide-react";

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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
      {/* 1. Active Cameras */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-xs transition hover:shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
          <Video className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">Cameras</p>
          <p className="text-sm sm:text-base font-bold text-slate-900 truncate">
            {activeCameras} Active
          </p>
        </div>
      </div>

      {/* 2. Throughput FPS */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-xs transition hover:shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
          <Zap className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">Throughput</p>
          <p className="text-sm sm:text-base font-bold text-slate-900 truncate">
            {aggregateFps.toFixed(1)} FPS
          </p>
        </div>
      </div>

      {/* 3. Incidents Logged */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-xs transition hover:shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 shrink-0">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">Incidents</p>
          <p className="text-sm sm:text-base font-bold text-slate-900 truncate">
            {totalEvents} Logged
          </p>
        </div>
      </div>

      {/* 4. CPU Load */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-xs transition hover:shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
          <Cpu className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">CPU Load</p>
          <p className="text-sm sm:text-base font-bold text-slate-900 truncate">
            {Math.round(cpuPercent)}%
          </p>
        </div>
      </div>

      {/* 5. RAM Load */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-xs transition hover:shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
          <HardDrive className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">RAM Load</p>
          <p className="text-sm sm:text-base font-bold text-slate-900 truncate">
            {Math.round(memoryPercent)}%
          </p>
        </div>
      </div>

      {/* 6. Telemetry Connection */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-xs transition hover:shadow-sm">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isConnected
              ? "bg-emerald-50 border border-emerald-100 text-emerald-600"
              : "bg-amber-50 border border-amber-100 text-amber-600"
          }`}
        >
          <Wifi className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">Telemetry</p>
          <p
            className={`text-sm sm:text-base font-bold truncate ${
              isConnected ? "text-slate-900" : "text-amber-600"
            }`}
          >
            {isConnected ? "Connected" : "Reconnecting"}
          </p>
        </div>
      </div>
    </div>
  );
};
