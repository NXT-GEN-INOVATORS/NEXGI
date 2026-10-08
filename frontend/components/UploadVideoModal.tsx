"use client";

import React, { useState, useRef } from "react";
import {
  X,
  UploadCloud,
  Film,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileVideo,
} from "lucide-react";
import { CameraData } from "./CameraFeed";

interface UploadVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCamera: CameraData) => void;
  backendUrl: string;
}

export const UploadVideoModal: React.FC<UploadVideoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  backendUrl,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cameraName, setCameraName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setErrorMsg(null);
      if (!cameraName) {
        // Prepopulate clean name from file
        const base = file.name.replace(/\.[^/.]+$/, "");
        setCameraName(`Camera (${base})`);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (["mp4", "avi", "mov", "mkv", "webm", "m4v"].includes(ext || "")) {
        setSelectedFile(file);
        setErrorMsg(null);
        if (!cameraName) {
          const base = file.name.replace(/\.[^/.]+$/, "");
          setCameraName(`Camera (${base})`);
        }
      } else {
        setErrorMsg("Please upload a supported video format (.mp4, .avi, .mov, .mkv, .webm)");
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg("Please select a video file to upload.");
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (cameraName.trim()) {
      formData.append("name", cameraName.trim());
    }

    try {
      const res = await fetch(`${backendUrl}/api/cameras/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed with status ${res.status}`);
      }

      const newCamera: CameraData = await res.json();
      onSuccess(newCamera);
      handleClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to upload video feed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    setSelectedFile(null);
    setCameraName("");
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Upload New Video Feed
              </h2>
              <p className="text-xs text-slate-500">
                Add an edge surveillance video for real-time violence detection
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleUpload} className="p-6 flex flex-col gap-4">
          {/* File Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition ${
              isDragOver
                ? "border-teal-500 bg-teal-50/40"
                : selectedFile
                ? "border-emerald-300 bg-emerald-50/30"
                : "border-slate-200 hover:border-teal-400 bg-slate-50/60"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.avi,.mov,.mkv,.webm,.m4v"
              onChange={handleFileChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <FileVideo className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 break-all">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <span className="text-xs text-teal-700 font-medium hover:underline mt-1">
                  Click or drag to choose another file
                </span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Click to browse or drag and drop video
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Supports MP4, AVI, MOV, MKV, WebM
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Camera Name Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Camera Name / Description
            </label>
            <input
              type="text"
              value={cameraName}
              onChange={(e) => setCameraName(e.target.value)}
              placeholder="e.g. Entrance Gate 1, Cafeteria Front..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClose}
              disabled={isUploading}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className={`px-5 py-2.5 rounded-xl text-xs font-semibold text-white flex items-center gap-2 shadow-xs transition cursor-pointer ${
                !selectedFile || isUploading
                  ? "bg-teal-400 opacity-60 cursor-not-allowed"
                  : "bg-[#005c53] hover:bg-[#004b44]"
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading & Initializing...</span>
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  <span>Start Monitoring Feed</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
