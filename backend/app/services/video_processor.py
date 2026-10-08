"""Multi-Camera Video Processor: Manages workers for CAM-01 through CAM-04."""
import os
import time
from typing import Dict, List, Optional, Callable, Any
from app.config import DEFAULT_CAMERAS, MODEL_TFLITE_PATH, get_all_video_cameras
from app.models.movinet.detector import MoViNetDetector
from app.services.camera_worker import CameraWorker

class MultiCameraProcessor:
    def __init__(self, camera_configs: Optional[List[Dict[str, Any]]] = None):
        self.camera_configs = camera_configs
        self.workers: Dict[str, CameraWorker] = {}
        self.event_subscribers: List[Callable[[Dict[str, Any]], None]] = []

    def subscribe_events(self, callback: Callable[[Dict[str, Any]], None]):
        self.event_subscribers.append(callback)

    def _broadcast_event(self, event_data: Dict[str, Any]):
        for callback in self.event_subscribers:
            try:
                callback(event_data)
            except Exception as e:
                print(f"Error in event callback: {e}")

    def initialize(self):
        """Creates independent worker and detector for each discovered camera."""
        configs = self.camera_configs if self.camera_configs is not None else get_all_video_cameras()
        self.workers.clear()
        for cfg in configs:
            cam_id = cfg["id"]
            name = cfg["name"]
            source = cfg["source"]

            detector = MoViNetDetector(MODEL_TFLITE_PATH)
            worker = CameraWorker(
                camera_id=cam_id,
                name=name,
                video_source=source,
                detector=detector,
                event_callback=self._broadcast_event,
            )
            self.workers[cam_id] = worker

    def start_all(self):
        print(f"Starting {len(self.workers)} camera workers...")
        for cam_id, worker in self.workers.items():
            worker.start()
            print(f"  [Worker Started] {cam_id}: {worker.name}")

    def stop_all(self):
        print("Stopping camera workers...")
        for worker in self.workers.values():
            worker.stop()

    def get_all_statuses(self) -> List[Dict[str, Any]]:
        return [w.get_status_dict() for w in self.workers.values()]

    def get_camera_status(self, camera_id: str) -> Optional[Dict[str, Any]]:
        worker = self.workers.get(camera_id)
        return worker.get_status_dict() if worker else None

    def get_camera_stream_frame(self, camera_id: str) -> Optional[bytes]:
        worker = self.workers.get(camera_id)
        return worker.get_latest_jpeg() if worker else None

processor = MultiCameraProcessor()
