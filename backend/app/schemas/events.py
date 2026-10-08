from typing import Optional, List
from pydantic import BaseModel

class CameraStatus(BaseModel):
    camera_id: str
    name: str
    violence_probability: float
    status: str  # "NORMAL", "CANDIDATE", "VIOLENCE", "ERROR"
    last_inference_timestamp: str
    source_fps: float = 0.0
    inference_fps: float = 0.0
    is_active: bool = True
    consecutive_positives: int = 0

class ViolenceEvent(BaseModel):
    id: str
    camera_id: str
    start_timestamp: str
    detection_timestamp: str
    end_timestamp: Optional[str] = None
    confidence: float
    status: str  # "VIOLENCE"
    evidence_image_path: Optional[str] = None
    evidence_clip_path: Optional[str] = None
    created_at: str

class SystemStats(BaseModel):
    aggregate_fps: float
    cpu_percent: float
    memory_percent: float
    active_cameras: int
    total_events: int
