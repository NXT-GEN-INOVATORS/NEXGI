import os
from typing import List, Dict, Any
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8000
    
    VIOLENCE_THRESHOLD: float = 0.60
    MIN_CONSECUTIVE_POSITIVE: int = 3
    EVENT_COOLDOWN_SECONDS: float = 10.0
    
    INFERENCE_FPS: float = 5.0
    EVIDENCE_CLIP_SECONDS_BEFORE: float = 5.0
    EVIDENCE_CLIP_SECONDS_AFTER: float = 5.0
    
    VIDEO_DIR: str = "./videos"
    LOCAL_DATA_DIR: str = "./local_data"
    MODEL_DIR: str = "./backend/app/models/movinet"
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

# Base paths
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVIDENCE_DIR = os.path.join(PROJECT_ROOT, "local_data", "evidence")
CLIPS_DIR = os.path.join(PROJECT_ROOT, "local_data", "clips")
EVENTS_DIR = os.path.join(PROJECT_ROOT, "local_data", "events")
DB_PATH = os.path.join(EVENTS_DIR, "events.db")
MODEL_TFLITE_PATH = os.path.join(PROJECT_ROOT, "backend", "app", "models", "movinet", "model.tflite")

# Ensure required directories exist
os.makedirs(EVIDENCE_DIR, exist_ok=True)
os.makedirs(CLIPS_DIR, exist_ok=True)
os.makedirs(EVENTS_DIR, exist_ok=True)

VALID_VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"}

def get_all_video_cameras(video_dir: str = None) -> List[Dict[str, Any]]:
    """Scans the video directory and registers every video file as an independent camera stream."""
    if not video_dir:
        video_dir = os.path.join(PROJECT_ROOT, "videos")

    if not os.path.exists(video_dir):
        return []

    files = sorted([
        f for f in os.listdir(video_dir)
        if os.path.splitext(f)[1].lower() in VALID_VIDEO_EXTS
    ])

    cameras = []
    for idx, filename in enumerate(files, start=1):
        cam_id = f"CAM-{idx:02d}"
        cameras.append({
            "id": cam_id,
            "name": f"Camera {idx} ({filename})",
            "source": os.path.join(video_dir, filename),
        })
    return cameras

DEFAULT_CAMERAS: List[Dict[str, Any]] = get_all_video_cameras()
