"""CameraWorker: Independent background thread running video processing and MoViNet inference."""
import os
import cv2
import time
import datetime
import threading
import uuid
import numpy as np
from collections import deque
from typing import Optional, Callable, Dict, Any, List

from app.models.movinet.detector import MoViNetDetector
from app.services.event_manager import event_manager
from app.services.evidence_manager import evidence_manager
from app.config import settings

class CameraWorker:
    def __init__(
        self,
        camera_id: str,
        name: str,
        video_source: str,
        detector: MoViNetDetector,
        event_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.camera_id = camera_id
        self.name = name
        self.video_source = video_source
        self.detector = detector
        self.event_callback = event_callback

        # State machine
        self.status = "NORMAL"  # "NORMAL", "CANDIDATE", "VIOLENCE", "ERROR"
        self.violence_probability = 0.0
        self.normal_probability = 1.0
        self.consecutive_positives = 0
        self.last_inference_timestamp = ""
        self.active_event_id: Optional[str] = None
        self.cooldown_until: float = 0.0

        # Video playback stats
        self.source_fps = 25.0
        self.inference_fps = 0.0
        self.frame_count = 0
        self.is_running = False
        self.thread: Optional[threading.Thread] = None

        # MoViNet internal temporal state
        self.model_states = self.detector.create_initial_states()

        # Rolling frame buffer for evidence clip (store last ~8 seconds of frames)
        self.buffer_lock = threading.Lock()
        self.buffer_max_len = 150  # ~6-8 seconds at ~20 fps
        self.rolling_frames: deque = deque(maxlen=self.buffer_max_len)
        self.latest_jpeg: Optional[bytes] = None

        # Post-event clip collection
        self.collecting_post_event = False
        self.post_event_target_frames = 0
        self.pending_event_data: Optional[Dict[str, Any]] = None

    def start(self):
        if not self.is_running:
            self.is_running = True
            self.thread = threading.Thread(target=self._run_loop, name=f"Worker-{self.camera_id}", daemon=True)
            self.thread.start()

    def stop(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)

    def get_status_dict(self) -> Dict[str, Any]:
        return {
            "camera_id": self.camera_id,
            "name": self.name,
            "violence_probability": round(self.violence_probability, 3),
            "status": self.status,
            "last_inference_timestamp": self.last_inference_timestamp or datetime.datetime.now().strftime("%H:%M:%S"),
            "source_fps": round(self.source_fps, 1),
            "inference_fps": round(self.inference_fps, 1),
            "is_active": self.is_running,
            "consecutive_positives": self.consecutive_positives,
        }

    def get_latest_jpeg(self) -> Optional[bytes]:
        with self.buffer_lock:
            return self.latest_jpeg

    def _run_loop(self):
        while self.is_running:
            if not os.path.exists(self.video_source):
                self.status = "ERROR"
                time.sleep(2.0)
                continue

            cap = cv2.VideoCapture(self.video_source)
            if not cap.isOpened():
                self.status = "ERROR"
                time.sleep(2.0)
                continue

            self.source_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            if self.source_fps <= 0 or self.source_fps > 120:
                self.source_fps = 25.0
                
            sample_interval = max(1, int(round(self.source_fps / settings.INFERENCE_FPS)))
            frame_delay = 1.0 / self.source_fps

            frame_idx = 0
            inf_times = deque(maxlen=10)

            while self.is_running:
                loop_start = time.perf_counter()
                ret, frame = cap.read()
                
                if not ret:
                    # End of prerecorded video: Loop back to start
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                    if not ret:
                        # Cannot rewind, re-open video
                        break

                self.frame_count += 1
                now_str = datetime.datetime.now().strftime("%H:%M:%S")

                # Store rolling frame
                with self.buffer_lock:
                    self.rolling_frames.append(frame.copy())
                    # Encode current frame for MJPEG live streaming
                    ret_enc, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                    if ret_enc:
                        self.latest_jpeg = buffer.tobytes()

                # Handle post-event clip collection if active
                if self.collecting_post_event:
                    self.post_event_target_frames -= 1
                    if self.post_event_target_frames <= 0:
                        self._finalize_post_event_clip()

                # Run inference at sampled rate (~5 FPS)
                if frame_idx % sample_interval == 0:
                    t0 = time.perf_counter()
                    try:
                        frame_tensor = self.detector.preprocess_frame(frame)
                        self.model_states, v_prob, n_prob = self.detector.predict_frame(
                            self.model_states, frame_tensor
                        )
                        self.violence_probability = v_prob
                        self.normal_probability = n_prob
                        self.last_inference_timestamp = now_str
                        
                        t1 = time.perf_counter()
                        inf_times.append(t1 - t0)
                        if inf_times:
                            self.inference_fps = 1.0 / (sum(inf_times) / len(inf_times))

                        # Evaluate temporal smoothing state machine
                        self._process_detection(frame, now_str)

                    except Exception as e:
                        print(f"[{self.camera_id}] Inference error: {e}")
                        self.status = "ERROR"

                frame_idx += 1
                
                # Pace video playback to approximately real-time source FPS
                elapsed = time.perf_counter() - loop_start
                sleep_time = frame_delay - elapsed
                if sleep_time > 0.001:
                    time.sleep(sleep_time)

            cap.release()

    def _process_detection(self, current_frame: np.ndarray, timestamp_str: str):
        now_time = time.time()
        is_positive = self.violence_probability >= settings.VIOLENCE_THRESHOLD

        if is_positive:
            self.consecutive_positives += 1
        else:
            self.consecutive_positives = max(0, self.consecutive_positives - 1)

        # State transitions
        if self.status == "NORMAL":
            if self.consecutive_positives >= settings.MIN_CONSECUTIVE_POSITIVE:
                if now_time >= self.cooldown_until:
                    # Transition to VIOLENCE
                    self.status = "VIOLENCE"
                    self._trigger_violence_event(current_frame, timestamp_str)
            elif self.consecutive_positives > 0:
                self.status = "CANDIDATE"

        elif self.status == "CANDIDATE":
            if self.consecutive_positives >= settings.MIN_CONSECUTIVE_POSITIVE:
                if now_time >= self.cooldown_until:
                    self.status = "VIOLENCE"
                    self._trigger_violence_event(current_frame, timestamp_str)
            elif self.consecutive_positives == 0:
                self.status = "NORMAL"

        elif self.status == "VIOLENCE":
            if not is_positive and self.consecutive_positives == 0:
                # Transition back to NORMAL with cooldown
                self.status = "NORMAL"
                self.cooldown_until = now_time + settings.EVENT_COOLDOWN_SECONDS
                if self.active_event_id:
                    event_manager.update_event_end(self.active_event_id, timestamp_str)
                    self.active_event_id = None

    def _trigger_violence_event(self, frame: np.ndarray, timestamp_str: str):
        event_id = f"evt_{uuid.uuid4().hex[:8]}"
        self.active_event_id = event_id
        
        # 1. Capture evidence image immediately
        image_rel_path = evidence_manager.save_evidence_image(
            self.camera_id, frame, timestamp_str
        )

        event_data = {
            "id": event_id,
            "camera_id": self.camera_id,
            "start_timestamp": timestamp_str,
            "detection_timestamp": timestamp_str,
            "end_timestamp": None,
            "confidence": round(self.violence_probability, 3),
            "status": "VIOLENCE",
            "image_path": image_rel_path,
            "clip_path": None,
            "created_at": datetime.datetime.now().isoformat()
        }

        # Save event to SQLite
        event_manager.save_event(event_data)

        # Notify UI immediately with image evidence
        if self.event_callback:
            self.event_callback(event_data)

        # Schedule post-event clip capture (collect next ~4 seconds of frames)
        self.collecting_post_event = True
        self.post_event_target_frames = int(self.source_fps * settings.EVIDENCE_CLIP_SECONDS_AFTER)
        self.pending_event_data = event_data

    def _finalize_post_event_clip(self):
        self.collecting_post_event = False
        if not self.pending_event_data:
            return

        with self.buffer_lock:
            clip_frames = list(self.rolling_frames)

        if clip_frames:
            clip_rel_path = evidence_manager.save_evidence_clip(
                self.camera_id,
                clip_frames,
                self.pending_event_data["detection_timestamp"],
                fps=self.source_fps
            )
            if clip_rel_path:
                self.pending_event_data["clip_path"] = clip_rel_path
                event_manager.save_event(self.pending_event_data)
                if self.event_callback:
                    self.event_callback(self.pending_event_data)

        self.pending_event_data = None
