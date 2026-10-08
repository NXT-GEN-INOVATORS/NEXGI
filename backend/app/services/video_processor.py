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
        self.blur_faces: bool = False

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
            worker.blur_faces = self.blur_faces
            self.workers[cam_id] = worker

    def start_all(self):
        print(f"Starting {len(self.workers)} camera workers...")
        for cam_id, worker in self.workers.items():
            worker.start()
            print(f"  [Worker Started] {cam_id}: {worker.name}")

    def stop_all(self):
        print("Stopping camera workers...")
        for worker in list(self.workers.values()):
            worker.stop()

    def add_camera_from_file(self, filename: str, file_path: str, custom_name: Optional[str] = None) -> Dict[str, Any]:
        """Dynamically add and spin up a new camera worker from an uploaded video file."""
        # Find next available CAM-XX ID
        existing_ids = set(self.workers.keys())
        idx = 1
        while f"CAM-{idx:02d}" in existing_ids:
            idx += 1
        cam_id = f"CAM-{idx:02d}"
        
        name = custom_name.strip() if custom_name and custom_name.strip() else f"Camera {idx} ({filename})"

        detector = MoViNetDetector(MODEL_TFLITE_PATH)
        worker = CameraWorker(
            camera_id=cam_id,
            name=name,
            video_source=file_path,
            detector=detector,
            event_callback=self._broadcast_event,
        )
        worker.blur_faces = self.blur_faces
        self.workers[cam_id] = worker
        worker.start()
        print(f"[Added Camera Worker] {cam_id}: {name}")
        return worker.get_status_dict()

    def delete_camera(self, camera_id: str, delete_file: bool = True) -> bool:
        """Stops worker, removes camera feed, and optionally deletes underlying video file."""
        worker = self.workers.get(camera_id)
        if not worker:
            return False

        video_source = worker.video_source
        worker.stop()
        del self.workers[camera_id]
        print(f"[Deleted Camera] {camera_id}")

        if delete_file and video_source and os.path.exists(video_source):
            # Short grace period for file handle release
            time.sleep(0.3)
            try:
                os.remove(video_source)
                print(f"[Deleted Video File] {video_source}")
            except Exception as e:
                print(f"Notice: Failed to delete video file {video_source}: {e}")

        return True

    def reset_to_benchmark(self) -> List[Dict[str, Any]]:
        """Reload default benchmark video feeds from videos/ folder."""
        self.stop_all()
        self.initialize()
        self.start_all()
        return self.get_all_statuses()

    def set_blur_faces(self, enabled: bool) -> bool:
        self.blur_faces = enabled
        for worker in self.workers.values():
            worker.blur_faces = enabled
        return self.blur_faces

    def toggle_blur_faces(self) -> bool:
        return self.set_blur_faces(not self.blur_faces)

    def get_all_statuses(self) -> List[Dict[str, Any]]:
        return [w.get_status_dict() for w in self.workers.values()]

    def get_camera_status(self, camera_id: str) -> Optional[Dict[str, Any]]:
        worker = self.workers.get(camera_id)
        return worker.get_status_dict() if worker else None

    def get_camera_stream_frame(self, camera_id: str) -> Optional[bytes]:
        worker = self.workers.get(camera_id)
        return worker.get_latest_jpeg() if worker else None

processor = MultiCameraProcessor()
