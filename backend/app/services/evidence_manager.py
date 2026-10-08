"""Evidence Manager for saving event frames and video clips."""
import os
import cv2
import datetime
import numpy as np
from typing import List, Optional
from app.config import EVIDENCE_DIR, CLIPS_DIR

class EvidenceManager:
    def __init__(self, evidence_dir: str = EVIDENCE_DIR, clips_dir: str = CLIPS_DIR):
        self.evidence_dir = evidence_dir
        self.clips_dir = clips_dir

    def save_evidence_image(self, camera_id: str, frame: np.ndarray, timestamp_str: str) -> str:
        """
        Saves a single evidence frame as JPEG.
        Example path: local_data/evidence/CAM-03/2026-10-08_20-14-32.jpg
        """
        cam_dir = os.path.join(self.evidence_dir, camera_id)
        os.makedirs(cam_dir, exist_ok=True)
        
        safe_time = timestamp_str.replace(":", "-").replace(" ", "_")
        filename = f"{safe_time}.jpg"
        file_path = os.path.join(cam_dir, filename)
        
        # Save at 92% JPEG quality
        cv2.imwrite(file_path, frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        # Return relative path for web serving: /evidence/CAM-03/filename.jpg
        return f"/evidence/{camera_id}/{filename}"

    def save_evidence_clip(self, camera_id: str, frames: List[np.ndarray], timestamp_str: str, fps: float = 20.0) -> Optional[str]:
        """
        Encodes a list of rolling frames into a browser-playable H.264 MP4 clip.
        Example path: local_data/clips/CAM-03/2026-10-08_20-14-32.mp4
        """
        if not frames:
            return None

        cam_dir = os.path.join(self.clips_dir, camera_id)
        os.makedirs(cam_dir, exist_ok=True)

        safe_time = timestamp_str.replace(":", "-").replace(" ", "_")
        filename = f"{safe_time}.mp4"
        file_path = os.path.join(cam_dir, filename)

        h, w = frames[0].shape[:2]

        # 1. Prefer FFmpeg for browser-native H.264 (AVC) encoding
        try:
            import subprocess
            import imageio_ffmpeg
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            proc = subprocess.Popen([
                ffmpeg_exe, "-y",
                "-f", "rawvideo",
                "-vcodec", "rawvideo",
                "-s", f"{w}x{h}",
                "-pix_fmt", "bgr24",
                "-r", str(max(1.0, fps)),
                "-i", "-",
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-preset", "veryfast",
                "-movflags", "+faststart",
                file_path
            ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

            for f in frames:
                if f.shape[:2] == (h, w):
                    proc.stdin.write(f.tobytes())
            proc.stdin.close()
            proc.wait(timeout=10)
            if proc.returncode == 0 and os.path.exists(file_path) and os.path.getsize(file_path) > 1000:
                return f"/clips/{camera_id}/{filename}"
        except Exception as e:
            print(f"FFmpeg encoding fallback: {e}")

        # 2. Fallback to OpenCV VideoWriter
        fourcc = cv2.VideoWriter_fourcc(*"avc1")
        out = cv2.VideoWriter(file_path, fourcc, max(1.0, fps), (w, h))
        if not out.isOpened():
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            out = cv2.VideoWriter(file_path, fourcc, max(1.0, fps), (w, h))

        if out.isOpened():
            for f in frames:
                if f.shape[:2] == (h, w):
                    out.write(f)
            out.release()
            return f"/clips/{camera_id}/{filename}"
        return None

evidence_manager = EvidenceManager()
