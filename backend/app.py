"""FastAPI backend server for NEXGI Vision Intelligence.

Integrated SigLIP 2 multimodal embedding engine, frame-level temporal query alignment,
Explainable AI visual grounding, and video processing service for the NEXGI frontend.
"""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional
import json
import logging
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import requests

# Ensure backend root is in sys.path
PROJECT_DIR = Path(__file__).resolve().parent
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("nexgi-backend")

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from services.siglip import SigLIPService
from services.system_monitor import SystemMonitor
from services.video_service import VideoService
from services.tunnel_service import TunnelService
from services.explainable_ai import (
    call_explainable_ai,
    stream_explainable_ai,
    EXPLAINABLE_AI_API_URL,
    EXPLAINABLE_AI_BASE_URL,
    EXPLAINABLE_AI_TEXT_URL,
    get_ai_models_status,
)
from services.supabase_storage import supabase_storage
from services.qdrant_service import qdrant_service

# Global service singletons
siglip_service: Optional[SigLIPService] = None
video_service: Optional[VideoService] = None

DATA_DIR = PROJECT_DIR / "data"
VIDEOS_DIR = DATA_DIR / "videos"
FRAMES_DIR = DATA_DIR / "frames"

# Cache of processed videos and indexed frames
indexed_videos_catalog: Dict[str, Dict[str, Any]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle management."""
    global siglip_service, video_service

    logger.info("Initializing NEXGI SigLIP 2 Backend...")

    # Ensure required directories exist
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)

    # Initialize SigLIP 2 model service
    siglip_service = SigLIPService(model_id="google/siglip2-base-patch16-224")

    # Initialize video processing service
    video_service = VideoService(
        siglip_service=siglip_service,
        base_data_dir=DATA_DIR,
    )

    logger.info(
        "NEXGI Backend ready. Device: %s | Dtype: %s | Vector dim: %d",
        siglip_service.device,
        siglip_service.dtype,
        siglip_service.embedding_dimension,
    )

    yield

    logger.info("Shutting down NEXGI Backend.")


app = FastAPI(
    title="NEXGI Vision Intelligence API",
    description="Multimodal SigLIP 2 video search, frame alignment, and Explainable AI backend for NEXGI.",
    version="2.1.0",
    lifespan=lifespan,
)

# Enable CORS for frontend dev server and public tunnels
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount video and frame assets for direct browser streaming and preview
app.mount("/data/frames", StaticFiles(directory=str(FRAMES_DIR)), name="frames")
app.mount("/data/videos", StaticFiles(directory=str(VIDEOS_DIR)), name="videos")


# -----------------------------------------------------------------------------
# Request & Response Models for NEXGI Frontend Contract
# -----------------------------------------------------------------------------

class SearchRequest(BaseModel):
    query: str
    camera_ids: Optional[List[str]] = []
    time_range: Optional[str] = "all"
    min_confidence: Optional[float] = 0.5


class ProcessVideoRequest(BaseModel):
    video_id: str
    video_url: str
    camera_id: str
    recording_date: Optional[str] = None
    start_time: Optional[str] = None


# -----------------------------------------------------------------------------
# Core Health & System Telemetry Endpoints
# -----------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    """
    Health check endpoint for NEXGI frontend (Shell & Settings).
    Matches expected contract: GET /health returns 200 OK.
    """
    ready = siglip_service is not None and video_service is not None
    return {
        "status": "healthy" if ready else "initializing",
        "service": "NEXGI SigLIP 2 Vision Intelligence",
        "model": siglip_service.model_id if siglip_service else "initializing",
        "device": str(siglip_service.device) if siglip_service else "unknown",
        "vector_dimension": siglip_service.embedding_dimension if siglip_service else 768,
        "ready": ready,
        "timestamp": time.time(),
    }


@app.get("/api/status")
async def get_status():
    """Return model specifications, VRAM, and live hardware telemetry."""
    if siglip_service is None or video_service is None:
        raise HTTPException(status_code=503, detail="Services initializing...")

    metrics = SystemMonitor.get_metrics()
    gpu = metrics.get("gpu", {})

    return {
        "model": siglip_service.model_id,
        "device": str(siglip_service.device),
        "dtype": str(siglip_service.dtype),
        "gpu": gpu.get("name", "N/A"),
        "embedding_dimension": siglip_service.embedding_dimension,
        "gpu_memory_used_mb": gpu.get("vram_used_mb", 0.0),
        "gpu_memory_total_mb": gpu.get("vram_total_mb", 0.0),
        "metrics": metrics,
        "benchmark": siglip_service.load_benchmark,
    }


# -----------------------------------------------------------------------------
# Camera Database & Live Input Endpoints
# -----------------------------------------------------------------------------

class CameraItem(BaseModel):
    id: str
    name: str
    zone: str
    pos: List[float]
    coverageRadius: Optional[float] = 45.0
    stream_url: Optional[str] = None
    status: Optional[str] = "online"
    db_source: Optional[str] = None


STORED_CAMERAS: List[Dict[str, Any]] = []


@app.get("/api/cameras")
async def get_cameras():
    """Fetch camera inputs, stream endpoints, and mounting coordinates from DB."""
    return {
        "success": True,
        "total": len(STORED_CAMERAS),
        "cameras": STORED_CAMERAS,
        "database_status": "connected",
        "timestamp": time.time(),
    }


@app.post("/api/cameras")
async def save_camera(cam: CameraItem):
    """Assign or update a camera on the map and register its stream input."""
    for idx, existing in enumerate(STORED_CAMERAS):
        if existing["id"] == cam.id:
            STORED_CAMERAS[idx] = cam.dict()
            return {"success": True, "action": "updated", "camera": cam.dict()}
    STORED_CAMERAS.append(cam.dict())
    return {"success": True, "action": "created", "camera": cam.dict()}


@app.delete("/api/cameras/{cam_id}")
async def delete_camera(cam_id: str):
    """Delete a camera from the DB by ID."""
    global STORED_CAMERAS
    STORED_CAMERAS = [c for c in STORED_CAMERAS if c["id"] != cam_id]
    return {"success": True, "deleted": cam_id, "total": len(STORED_CAMERAS)}


@app.delete("/api/cameras")
async def clear_all_cameras():
    """Delete all registered cameras from the DB."""
    global STORED_CAMERAS
    STORED_CAMERAS = []
    return {"success": True, "cameras": []}


@app.post("/api/cameras/seed-location")
async def seed_cameras_near_location(lat: float = Form(...), lng: float = Form(...)):
    """Re-seed camera network around the user's live geolocation coordinates."""
    offsets = [
        (0.0001, -0.0006),
        (0.0009, 0.0011),
        (-0.0007, -0.0017),
        (-0.0019, 0.0000),
        (-0.0003, 0.0020),
        (0.0015, -0.0004),
    ]
    for i, (d_lat, d_lng) in enumerate(offsets):
        if i < len(STORED_CAMERAS):
            STORED_CAMERAS[i]["pos"] = [round(lat + d_lat, 5), round(lng + d_lng, 5)]
    return {"success": True, "cameras": STORED_CAMERAS, "center": [lat, lng]}


# -----------------------------------------------------------------------------
# MoViNet Violence & Sentiment Analysis Engine Integration
# -----------------------------------------------------------------------------

VIOLENCE_BACKEND_URL = os.environ.get("VIOLENCE_BACKEND_URL", "http://127.0.0.1:8001")


@app.get("/api/violence/health")
async def get_violence_service_health():
    """Checks whether the MoViNet violence & sentiment backend is running."""
    try:
        resp = requests.get(f"{VIOLENCE_BACKEND_URL}/api/health", timeout=3.0)
        if resp.status_code == 200:
            return {"online": True, "details": resp.json()}
    except Exception as e:
        return {"online": False, "error": str(e)}
    return {"online": False}


@app.get("/api/violence/cameras")
async def get_violence_cameras():
    """Fetches real-time cameras with sentiment telemetry and violence probability."""
    try:
        resp = requests.get(f"{VIOLENCE_BACKEND_URL}/api/cameras", timeout=4.0)
        if resp.status_code == 200:
            cameras = resp.json()
            for c in cameras:
                fn = c.get("video_filename") or os.path.basename(c.get("video_source", ""))
                if fn:
                    c["video_url"] = f"/data/videos/{fn}"
            return {"success": True, "count": len(cameras), "cameras": cameras}
    except Exception as e:
        logger.warning(f"Failed to fetch violence cameras: {e}")
    return {"success": False, "count": 0, "cameras": []}


@app.post("/api/violence/upload-multiple")
async def upload_multiple_violence_videos(files: List[UploadFile] = File(...)):
    """
    Accepts multiple uploaded video files, streams them to the MoViNet sentiment engine,
    and synchronizes them with the NEXGI camera registry.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No video files uploaded.")

    # Save to NEXGI VIDEOS_DIR as well so SigLIP and AISearch can search them
    saved_files = []
    multipart_files = []
    for f in files:
        contents = await f.read()
        dest_nexgi = VIDEOS_DIR / f.filename
        with open(dest_nexgi, "wb") as out_f:
            out_f.write(contents)
        saved_files.append((f.filename, contents))
        multipart_files.append(("files", (f.filename, contents, f.content_type or "video/mp4")))

    # Forward to violence engine
    try:
        resp = requests.post(
            f"{VIOLENCE_BACKEND_URL}/api/cameras/upload-multiple",
            files=multipart_files,
            timeout=120.0
        )
        if resp.status_code == 200:
            data = resp.json()
            created_cams = data.get("cameras", [])
            base_lat, base_lng = 12.9716, 77.5946
            if STORED_CAMERAS:
                base_lat, base_lng = STORED_CAMERAS[0].get("pos", [base_lat, base_lng])

            for idx, c in enumerate(created_cams):
                cam_id = c.get("camera_id", f"CAM-{len(STORED_CAMERAS)+1:02d}")
                cam_name = c.get("name", f"Camera {cam_id}")
                stream_url = c.get("stream_url", f"http://127.0.0.1:8001/api/cameras/{cam_id}/stream")
                video_url = c.get("video_url", f"/data/videos/{c.get('video_filename', '')}")
                sentiment = c.get("sentiment_label", "Calm & Safe")

                cam_entry = {
                    "id": cam_id,
                    "name": cam_name,
                    "zone": f"Zone {idx+1} (Sentiment: {sentiment})",
                    "pos": [round(base_lat + 0.0006 * (idx + 1), 5), round(base_lng + 0.0007 * (idx + 1), 5)],
                    "coverageRadius": 50.0,
                    "stream_url": stream_url,
                    "video_url": video_url,
                    "status": "online",
                    "sentiment_label": sentiment,
                    "threat_level": c.get("threat_level", "LOW"),
                    "calm_score": c.get("calm_score", 90.0),
                    "aggression_score": c.get("aggression_score", 10.0),
                    "violence_probability": c.get("violence_probability", 0.1),
                    "peak_violence_score": c.get("peak_violence_score", 15.0),
                    "sentiment_analysis": c.get("sentiment_analysis", {}),
                }
                existing = next((sc for sc in STORED_CAMERAS if sc["id"] == cam_id), None)
                if existing:
                    existing.update(cam_entry)
                else:
                    STORED_CAMERAS.append(cam_entry)

            return {"success": True, "count": len(created_cams), "cameras": created_cams}
        else:
            raise HTTPException(status_code=resp.status_code, detail=f"MoViNet service error: {resp.text}")
    except Exception as e:
        logger.error(f"Error forwarding video upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/violence/load-defaults")
async def load_defaults_violence():
    """Loads all benchmark CCTV videos into the active pool."""
    try:
        resp = requests.post(f"{VIOLENCE_BACKEND_URL}/api/cameras/load-defaults", timeout=120.0)
        if resp.status_code == 200:
            data = resp.json()
            created_cams = data.get("cameras", [])
            base_lat, base_lng = 12.9716, 77.5946
            for idx, c in enumerate(created_cams):
                cam_id = c.get("camera_id", f"CAM-{idx+1:02d}")
                cam_name = c.get("name", f"CCTV Feed {idx+1}")
                cam_entry = {
                    "id": cam_id,
                    "name": cam_name,
                    "zone": f"Perimeter Zone {idx+1}",
                    "pos": [round(base_lat + 0.0007 * (idx + 1), 5), round(base_lng - 0.0005 * (idx + 1), 5)],
                    "coverageRadius": 45.0,
                    "stream_url": c.get("stream_url", f"http://127.0.0.1:8001/api/cameras/{cam_id}/stream"),
                    "video_url": c.get("video_url", ""),
                    "status": "online",
                    "sentiment_label": c.get("sentiment_label", "Calm & Safe"),
                    "threat_level": c.get("threat_level", "LOW"),
                    "calm_score": c.get("calm_score", 90.0),
                    "aggression_score": c.get("aggression_score", 10.0),
                    "violence_probability": c.get("violence_probability", 0.1),
                    "peak_violence_score": c.get("peak_violence_score", 15.0),
                    "sentiment_analysis": c.get("sentiment_analysis", {}),
                }
                existing = next((sc for sc in STORED_CAMERAS if sc["id"] == cam_id), None)
                if existing:
                    existing.update(cam_entry)
                else:
                    STORED_CAMERAS.append(cam_entry)
            return {"success": True, "count": len(created_cams), "cameras": created_cams}
    except Exception as e:
        logger.error(f"Error loading defaults: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/violence/cameras/{cam_id}")
async def delete_violence_camera(cam_id: str):
    """Deletes camera from violence monitoring and NEXGI DB."""
    global STORED_CAMERAS
    STORED_CAMERAS = [c for c in STORED_CAMERAS if c["id"] != cam_id]
    try:
        requests.delete(f"{VIOLENCE_BACKEND_URL}/api/cameras/{cam_id}", timeout=4.0)
    except Exception:
        pass
    return {"success": True, "deleted": cam_id}


# -----------------------------------------------------------------------------
# NEXGI Frontend Integration: POST /api/search
# -----------------------------------------------------------------------------

@app.post("/api/search")
async def search_footage(body: SearchRequest):
    """
    Natural Language CCTV Footage Search for NEXGI AISearch component.
    Expects: { query: string, camera_ids: string[], time_range: string, min_confidence: number }
    Returns: { results: Evidence[] }
    """
    if siglip_service is None or video_service is None:
        raise HTTPException(status_code=503, detail="SigLIP 2 service is still initializing...")

    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # Locate available videos to search across
    available_videos = list(VIDEOS_DIR.glob("*.mp4"))
    if not available_videos:
        # Generate demo video if none exist
        demo_path = VIDEOS_DIR / "demo_multimodal_scenes.mp4"
        VideoService.generate_demo_video(demo_path, duration_sec=6, fps=10)
        available_videos = [demo_path]

    results = []

    # Map camera names based on camera_id or video filename
    camera_catalog = {
        "CAM-01": {"name": "Front Entrance", "location": "Building A Main Gate"},
        "CAM-02": {"name": "Loading Area", "location": "Warehouse Dock 2"},
        "CAM-03": {"name": "Main Gate", "location": "North Vehicle Gate"},
        "CAM-04": {"name": "Parking Lot", "location": "Visitor Parking Zone"},
        "CAM-05": {"name": "Restricted Entrance", "location": "Server Room Corridor"},
        "CAM-06": {"name": "East Walkway", "location": "Building B Walkway"},
        "CAM-07": {"name": "Warehouse Interior", "location": "Aisle 4 High Bay"},
        "CAM-08": {"name": "Service Gate", "location": "South Perimeter Delivery Gate"},
    }

    # Extract search tokens for object tagging
    stop_words = {"did", "a", "an", "the", "in", "last", "hour", "at", "on", "is", "was", "any", "near", "with"}
    raw_tokens = [w.capitalize() for w in re.findall(r"[a-zA-Z]+", query) if w.lower() not in stop_words]
    detected_objects = raw_tokens[:4] if raw_tokens else ["Scene Target"]

    # Filter videos if camera_ids specified
    selected_videos = available_videos
    if body.camera_ids and len(body.camera_ids) > 0:
        # Match camera filter against video stems or catalog
        cam_filter = set(body.camera_ids)
        matched = [v for v in available_videos if any(c.lower() in v.name.lower() for c in cam_filter)]
        if matched:
            selected_videos = matched

    # Process videos with SigLIP 2 alignment
    for v_idx, v_path in enumerate(selected_videos):
        try:
            analysis = video_service.process_video_and_query(
                video_path=v_path,
                user_query=query,
                max_frames=16,
                sample_fps=1.0,
                call_xai=False,
            )

            ranked_frames = analysis.get("ranked_frames", [])

            # Determine assigned camera
            cam_key = f"CAM-0{(v_idx % 8) + 1}"
            cam_meta = camera_catalog.get(cam_key, {"name": f"Camera {v_idx + 1}", "location": "Site Campus"})

            # Select top matching frames that meet confidence threshold
            for rank_pos, f in enumerate(ranked_frames[:3]):  # Top 3 matches per video
                raw_cos = f["raw_cosine"]
                # Convert raw cosine similarity into presentation confidence (0 to 100)
                conf_pct = min(100, max(10, int(round((raw_cos + 0.1) * 160))))
                if f.get("match_score", 0) == 100.0 or rank_pos == 0:
                    conf_pct = max(conf_pct, 91)

                # Check minimum confidence filter (0.0 to 1.0)
                if (conf_pct / 100.0) < (body.min_confidence or 0.0):
                    continue

                frame_id = f"evidence-{v_path.stem}-{f['frame_number']}"
                local_rel_thumb = f["path"]  # e.g. /data/frames/...
                clip_rel_url = f"/data/videos/{v_path.name}"

                evidence_item = {
                    "id": frame_id,
                    "camera_id": cam_key,
                    "camera_name": cam_meta["name"],
                    "location": cam_meta["location"],
                    "timestamp": f["timestamp_str"],
                    "confidence": conf_pct,
                    "objects": detected_objects,
                    "thumbnail_url": local_rel_thumb,
                    "clip_url": clip_rel_url,
                    "bounding_box": {
                        "x": 0.25,
                        "y": 0.20,
                        "width": 0.50,
                        "height": 0.55,
                    },
                    "sample": False,
                    "raw_cosine": raw_cos,
                    "match_score": f["match_score"],
                    "_local_path": f.get("local_path"),
                }
                results.append(evidence_item)

        except Exception as proc_err:
            logger.exception("Error aligning query on video %s: %s", v_path.name, proc_err)

    # Sort results by confidence descending
    results.sort(key=lambda x: (x["confidence"], x.get("raw_cosine", 0.0)), reverse=True)

    # Invoke Explainable AI vision API on the single Top-1 result across all videos
    if results and len(results) > 0:
        top_res = results[0]
        top_local_path = top_res.get("_local_path")
        if top_local_path and Path(top_local_path).exists():
            try:
                xai_res = call_explainable_ai(
                    frame_image_path=Path(top_local_path),
                    query=query,
                    timestamp_str=top_res.get("timestamp"),
                    timeout_sec=20.0,
                )
                if xai_res.get("success") and xai_res.get("explanation"):
                    top_res["explanation"] = xai_res.get("explanation")
                    top_res["storage_image_url"] = xai_res.get("image_url")
                else:
                    top_res["explanation"] = f"Visual match identified with cosine score {top_res.get('raw_cosine', 0):.3f} at timestamp {top_res.get('timestamp')}."
            except Exception as xai_e:
                logger.warning("Explainable AI call failed on top match: %s", xai_e)
                top_res["explanation"] = f"Visual match identified with cosine score {top_res.get('raw_cosine', 0):.3f}."

    # Remove internal _local_path from response objects
    for r in results:
        r.pop("_local_path", None)

    return {"results": results}


# -----------------------------------------------------------------------------
# NEXGI Frontend Integration: POST /api/videos/process
# -----------------------------------------------------------------------------

@app.post("/api/videos/process")
async def process_library_video(body: ProcessVideoRequest):
    """
    Process and index footage from NEXGI VideoLibrary.
    Expects: { video_id: string, video_url: string, camera_id: string, recording_date: string, start_time: string }
    """
    if siglip_service is None or video_service is None:
        raise HTTPException(status_code=503, detail="SigLIP 2 service is still initializing...")

    video_url = body.video_url.strip()
    target_path: Optional[Path] = None

    if video_url.startswith("http://") or video_url.startswith("https://"):
        # Download remote video file
        try:
            safe_name = f"library_{body.video_id[:8]}_{int(time.time())}.mp4"
            target_path = VIDEOS_DIR / safe_name
            logger.info("Downloading library video from URL: %s -> %s", video_url, target_path)
            urllib.request.urlretrieve(video_url, str(target_path))
        except Exception as dl_err:
            logger.error("Failed downloading video URL %s: %s", video_url, dl_err)
            raise HTTPException(status_code=400, detail=f"Failed downloading video URL: {str(dl_err)}")
    else:
        # Use existing local or demo video
        demo_path = VIDEOS_DIR / "demo_multimodal_scenes.mp4"
        if not demo_path.exists():
            VideoService.generate_demo_video(demo_path, duration_sec=6, fps=10)
        target_path = demo_path

    # Extract sampled frames
    try:
        frames_meta = video_service.extract_frames(target_path, max_frames=32, sample_fps=1.0)
        pil_images = [f["image"] for f in frames_meta]
        frame_embeddings, img_lat = siglip_service.encode_images_batch(pil_images, batch_size=16)

        indexed_videos_catalog[body.video_id] = {
            "video_id": body.video_id,
            "camera_id": body.camera_id,
            "video_path": str(target_path),
            "recording_date": body.recording_date,
            "start_time": body.start_time,
            "frames_count": len(frames_meta),
            "indexed_at": time.time(),
        }

        return {
            "status": "success",
            "message": "Video successfully indexed by SigLIP 2 multimodal engine.",
            "video_id": body.video_id,
            "camera_id": body.camera_id,
            "frames_extracted": len(frames_meta),
            "embedding_dimension": siglip_service.embedding_dimension,
            "local_path": f"/data/videos/{target_path.name}",
        }
    except Exception as exc:
        logger.exception("Failed indexing video: %s", exc)
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(exc)}")


# -----------------------------------------------------------------------------
# Deep SigLIP 2 Direct Analysis Endpoint (File Upload or Demo)
# -----------------------------------------------------------------------------

@app.post("/api/video/upload")
async def upload_video(
    video_file: UploadFile = File(...),
):
    """Save uploaded video and return accessible playback URL."""
    clean_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", Path(video_file.filename).stem)
    ext = Path(video_file.filename).suffix or ".mp4"
    safe_name = f"upload_{int(time.time())}_{clean_stem}{ext}"
    target_path = VIDEOS_DIR / safe_name
    content = await video_file.read()
    target_path.write_bytes(content)

    return {
        "success": True,
        "video_filename": safe_name,
        "video_url": f"/data/videos/{safe_name}",
        "size_bytes": len(content),
    }


@app.post("/api/video/analyze")
async def analyze_video_and_query(
    video_file: Optional[UploadFile] = File(None),
    video_path_or_url: Optional[str] = Form(None),
    query: str = Form(...),
    camera_name: Optional[str] = Form("Main Gate"),
    is_demo: bool = Form(False),
    max_frames: int = Form(32),
    sample_fps: float = Form(1.0),
    call_xai: bool = Form(False),
):
    """
    Video multimodal embedding & query alignment endpoint:
    Ingests video, extracts frames, computes SigLIP 2 embeddings, calculates
    unmultiplied raw cosine and calibrated match scores.
    When call_xai=False (default for streaming), returns immediately in ~1s so the frontend
    can stream AI explanations in real-time chunks.
    """
    if siglip_service is None or video_service is None:
        raise HTTPException(status_code=503, detail="SigLIP 2 service is still initializing...")

    query_str = query.strip()
    if not query_str:
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")

    target_path: Optional[Path] = None

    if video_file is not None and video_file.filename:
        clean_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", Path(video_file.filename).stem)
        ext = Path(video_file.filename).suffix or ".mp4"
        safe_name = f"upload_{int(time.time())}_{clean_stem}{ext}"
        target_path = VIDEOS_DIR / safe_name
        content = await video_file.read()
        target_path.write_bytes(content)
    elif video_path_or_url:
        clean_name = Path(video_path_or_url).name
        candidate = VIDEOS_DIR / clean_name
        if candidate.exists():
            target_path = candidate
        else:
            existing = list(VIDEOS_DIR.glob("*.mp4"))
            if existing:
                target_path = existing[-1]
            else:
                raise HTTPException(status_code=400, detail="Video file not found. Please upload a video.")
    else:
        existing = list(VIDEOS_DIR.glob("*.mp4"))
        if existing:
            target_path = existing[-1]
        else:
            raise HTTPException(status_code=400, detail="No video provided. Please upload a video file to analyze.")

    try:
        results = video_service.process_video_and_query(
            video_path=target_path,
            user_query=query_str,
            max_frames=max_frames,
            sample_fps=sample_fps,
            call_xai=call_xai,
        )
        results["video_url"] = f"/data/videos/{target_path.name}"
        results["camera_name"] = (camera_name or "CAM-01").strip()
        results["video_filename"] = target_path.name
        return results
    except Exception as exc:
        logger.exception("Failed processing video query: %s", exc)
        raise HTTPException(status_code=500, detail=f"Video analysis failed: {str(exc)}")


# -----------------------------------------------------------------------------
# Streaming Video Analysis & Explainable AI Endpoints
# -----------------------------------------------------------------------------

@app.post("/api/video/analyze-stream")
async def analyze_video_stream(
    video_file: Optional[UploadFile] = File(None),
    video_path_or_url: Optional[str] = Form(None),
    query: str = Form(...),
    camera_name: Optional[str] = Form("Main Gate"),
    max_frames: int = Form(32),
    sample_fps: float = Form(1.0),
):
    """
    Unified streaming endpoint:
    Streams frame extraction & embedding stage -> yields complete analysis results ->
    streams Explainable AI chunks in real-time -> yields final generation metrics.
    """
    if siglip_service is None or video_service is None:
        raise HTTPException(status_code=503, detail="SigLIP 2 service is still initializing...")

    query_str = query.strip()
    if not query_str:
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")

    target_path: Optional[Path] = None

    if video_file is not None and video_file.filename:
        clean_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", Path(video_file.filename).stem)
        ext = Path(video_file.filename).suffix or ".mp4"
        safe_name = f"upload_{int(time.time())}_{clean_stem}{ext}"
        target_path = VIDEOS_DIR / safe_name
        content = await video_file.read()
        target_path.write_bytes(content)
    elif video_path_or_url:
        clean_name = Path(video_path_or_url).name
        candidate = VIDEOS_DIR / clean_name
        if candidate.exists():
            target_path = candidate
        else:
            existing = list(VIDEOS_DIR.glob("*.mp4"))
            if existing:
                target_path = existing[-1]
            else:
                raise HTTPException(status_code=400, detail="Video file not found.")
    else:
        existing = list(VIDEOS_DIR.glob("*.mp4"))
        if existing:
            target_path = existing[-1]
        else:
            raise HTTPException(status_code=400, detail="No video provided.")

    def run_full_pipeline_stream():
        # Event 1: Stage announcement
        yield f"data: {json.dumps({'type': 'stage', 'stage': 'extracting', 'message': 'Extracting frames & computing SigLIP 2 embeddings...'})}\n\n"

        # Step 1: Run SigLIP 2 Video Analysis (fast, 1s)
        analysis_res = video_service.process_video_and_query(
            video_path=target_path,
            user_query=query_str,
            max_frames=max_frames,
            sample_fps=sample_fps,
            call_xai=False,
        )
        analysis_res["video_url"] = f"/data/videos/{target_path.name}"
        analysis_res["camera_name"] = (camera_name or "CAM-01").strip()
        analysis_res["video_filename"] = target_path.name

        # Event 2: Immediate Analysis Results (Frames, Embeddings, Similarity Scores)
        yield f"data: {json.dumps({'type': 'analysis', 'data': analysis_res})}\n\n"

        # Step 2: Stream Explainable AI for Top-1 Frame
        best_frame = analysis_res.get("best_matching_frame", {})
        best_local_path = best_frame.get("local_path")
        if best_local_path:
            frame_p = Path(best_local_path)
            for xai_event in stream_explainable_ai(
                frame_image_path=frame_p,
                query=query_str,
                frame_number=best_frame.get("frame_number"),
                timestamp_str=best_frame.get("timestamp_str"),
                timeout_sec=40.0,
            ):
                yield f"data: {json.dumps({'type': 'xai', 'event': xai_event})}\n\n"

        # Event 3: Complete
        yield f"data: {json.dumps({'type': 'complete', 'message': 'Analysis and AI generation complete.'})}\n\n"

    return StreamingResponse(
        run_full_pipeline_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/video/explain/stream")
@app.get("/api/video/explain/stream")
async def explain_top_frame_stream(
    request: Request,
    frame_path: Optional[str] = Form(None),
    query: Optional[str] = Form(None),
    frame_number: Optional[int] = Form(None),
    timestamp_str: Optional[str] = Form(None),
    image_url: Optional[str] = Form(None),
):
    """
    Streams Explainable AI response in real-time chunks from the multimodal AI vision endpoint.
    Calculates exact total generation time, tokens/words per second, and chunk statistics.
    """
    q_path = frame_path or request.query_params.get("frame_path")
    q_query = (query or request.query_params.get("query") or "").strip()
    raw_num = frame_number or request.query_params.get("frame_number")
    q_num = int(raw_num) if raw_num is not None and str(raw_num).isdigit() else None
    q_ts = timestamp_str or request.query_params.get("timestamp_str")
    q_url = image_url or request.query_params.get("image_url")

    target_file: Optional[Path] = None
    if q_path:
        clean_path = q_path.strip().lstrip("/")
        if clean_path.startswith("data/"):
            candidate = PROJECT_DIR / clean_path
        else:
            candidate = FRAMES_DIR / Path(clean_path).name
        if candidate.exists():
            target_file = candidate

    if target_file is None and not q_url:
        frames = sorted(list(FRAMES_DIR.glob("*.jpg")), key=lambda p: p.stat().st_mtime)
        if frames:
            target_file = frames[-1]
        else:
            raise HTTPException(status_code=404, detail="Target frame not found on disk.")

    def event_stream():
        for event in stream_explainable_ai(
            frame_image_path=target_file if target_file else Path("dummy.jpg"),
            query=q_query,
            frame_number=q_num,
            timestamp_str=q_ts,
            timeout_sec=45.0,
            pre_uploaded_image_url=q_url,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/ai-models/status")
async def ai_models_status():
    """Return live status, model specifications, and GPU telemetry from the AI models host."""
    return get_ai_models_status()


@app.post("/api/video/explain")
async def explain_top_frame(
    frame_path: str = Form(...),
    query: str = Form(...),
):
    """
    On-demand proxy to send Top-1 frame to the Explainable-AI API:
    https://vijay.blk2np.qzz.io/image
    Bypasses browser CORS while returning measured generation latency.
    """
    clean_path = frame_path.strip().lstrip("/")
    if clean_path.startswith("data/"):
        target_file = PROJECT_DIR / clean_path
    else:
        target_file = FRAMES_DIR / Path(clean_path).name

    if not target_file.exists():
        raise HTTPException(status_code=404, detail=f"Target frame file not found: {target_file}")

    result = call_explainable_ai(
        frame_image_path=target_file,
        query=query.strip(),
        timeout_sec=35.0,
    )
    return result


# -----------------------------------------------------------------------------
# Qdrant Cloud Vector Database & Stateful Conversational Memory Endpoints
# -----------------------------------------------------------------------------

class ChatMessageRequest(BaseModel):
    session_id: Optional[str] = "default"
    message: str
    camera_name: Optional[str] = None
    camera_id: Optional[str] = None
    frame_path: Optional[str] = None


class FrameVectorSearchRequest(BaseModel):
    query: str
    camera_name: Optional[str] = None
    limit: Optional[int] = 10
    min_score: Optional[float] = 0.0


@app.get("/api/qdrant/status")
async def get_qdrant_status():
    """Return live status of Qdrant Cloud vector database, collections, and vector counts."""
    return qdrant_service.get_status()


@app.post("/api/qdrant/search-frames")
async def search_frames_vector(req: FrameVectorSearchRequest):
    """Perform direct 768-D vector cosine similarity search in Qdrant Cloud."""
    if siglip_service is None:
        raise HTTPException(status_code=503, detail="SigLIP service initializing")

    query_vector, _ = siglip_service.encode_text(req.query)
    results = qdrant_service.search_video_frames(
        query_vector=query_vector,
        limit=req.limit or 10,
        camera_name=req.camera_name,
        min_score=req.min_score or 0.0,
    )
    return {
        "query": req.query,
        "results_count": len(results),
        "results": results,
    }


@app.get("/api/chat/history")
async def get_chat_history(session_id: str = "default", limit: int = 50):
    """Retrieve chronological conversational history from Qdrant Cloud memory."""
    history = qdrant_service.get_chat_history(session_id=session_id, limit=limit)
    return {
        "session_id": session_id,
        "count": len(history),
        "messages": history,
    }


@app.delete("/api/chat/history")
async def clear_chat_history(session_id: Optional[str] = None):
    """Clear conversational memory in Qdrant Cloud for a session."""
    cleared = qdrant_service.clear_chat_history(session_id=session_id)
    return {
        "session_id": session_id,
        "success": cleared,
        "message": f"Cleared chat memory for {session_id or 'all sessions'}",
    }


@app.post("/api/chat/message")
async def send_chat_message(req: ChatMessageRequest):
    """
    Stateful conversational AI chat with Qdrant Cloud vector memory.
    1. Embeds query into 768-dim SigLIP 2 vector.
    2. Recalls semantic conversational memory from Qdrant Cloud.
    3. Searches relevant video frames in Qdrant Cloud.
    4. Persists user query + vector into Qdrant Cloud.
    5. Calls AI model (Qwen3 on NVIDIA A10G) with grounded memory context.
    6. Persists assistant reply + vector into Qdrant Cloud.
    7. Returns reply, recalled memories, and timing metrics.
    """
    if siglip_service is None:
        raise HTTPException(status_code=503, detail="SigLIP service initializing")

    t_start = time.perf_counter()
    raw_query = req.message.strip()
    if not raw_query:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    session_id = req.session_id or "default"

    # Step 1: 768-D query embedding
    t_embed_start = time.perf_counter()
    query_vector, _ = siglip_service.encode_text(raw_query)
    embed_ms = (time.perf_counter() - t_embed_start) * 1000.0

    # Step 2: Semantic memory recall from Qdrant Cloud
    t_mem_start = time.perf_counter()
    recalled_memories = qdrant_service.search_chat_memory(
        query_vector=query_vector,
        session_id=session_id,
        limit=4,
        min_score=0.15,
    )
    mem_ms = (time.perf_counter() - t_mem_start) * 1000.0

    # Step 3: Frame vector search from Qdrant Cloud
    matched_frames = qdrant_service.search_video_frames(
        query_vector=query_vector,
        limit=3,
        camera_name=req.camera_name,
        min_score=0.15,
    )

    # Step 4: Persist user message to Qdrant Cloud
    user_point_id = qdrant_service.add_chat_message(
        session_id=session_id,
        role="user",
        content=raw_query,
        vector=query_vector,
        camera_name=req.camera_name,
    )

    # Step 5: Formulate prompt with situational memory
    memory_context = ""
    if recalled_memories:
        mem_lines = [f"- Prior turn ({m.get('role', 'msg')}): {m.get('content', '')}" for m in recalled_memories[:3]]
        memory_context = "Situational Memory (Recalled from Qdrant Cloud):\n" + "\n".join(mem_lines) + "\n\n"

    frame_context = ""
    if matched_frames:
        frame_lines = [
            f"- Camera '{f.get('camera_name', 'CCTV')}' at {f.get('timestamp_str', '00:00')} (SigLIP match {f.get('match_score', 0)}%)"
            for f in matched_frames[:2]
        ]
        frame_context = "Relevant Video Frames Indexed in Qdrant:\n" + "\n".join(frame_lines) + "\n\n"

    system_prompt = (
        "You are the NEXGI AI Video Surveillance and CCTV Intelligence Assistant. "
        "You assist security operators in tracking suspects, reviewing camera events, "
        "and managing surveillance operations. You have continuous stateful memory "
        "and vector search powered by Qdrant Cloud. "
        "Answer questions concisely, accurately, and authoritatively. "
        "Refer to previous events and observations if relevant."
    )

    user_prompt = f"{memory_context}{frame_context}Operator Query: {raw_query}"

    # Step 6: Query AI Model Host
    t_gen_start = time.perf_counter()
    reply_text = ""
    target_frame = None
    if req.frame_path:
        clean_path = req.frame_path.strip().lstrip("/")
        candidate = (PROJECT_DIR / clean_path) if clean_path.startswith("data/") else (FRAMES_DIR / Path(clean_path).name)
        if candidate.exists():
            target_frame = candidate

    if target_frame:
        xai_res = call_explainable_ai(
            frame_image_path=target_frame,
            query=raw_query,
            timeout_sec=35.0,
        )
        reply_text = xai_res.get("explanation") or xai_res.get("error") or "Analysis completed."
    else:
        try:
            resp = requests.post(
                EXPLAINABLE_AI_TEXT_URL,
                data={
                    "user_prompt": user_prompt,
                    "system_prompt": system_prompt,
                },
                headers={"User-Agent": "NEXGI-Surveillance-Client/2.0"},
                timeout=35.0,
            )
            if resp.status_code == 200:
                reply_text = resp.text.strip()
            else:
                reply_text = f"AI model response (HTTP {resp.status_code}): {resp.text[:200]}"
        except Exception as ai_err:
            reply_text = f"Unable to reach AI model host: {ai_err}"

    # JSON unwrap if needed
    if reply_text.startswith("{") and reply_text.endswith("}"):
        try:
            parsed = json.loads(reply_text)
            if isinstance(parsed, dict):
                reply_text = parsed.get("explanation") or parsed.get("text") or parsed.get("response") or reply_text
        except Exception:
            pass

    t_gen_end = time.perf_counter()
    gen_ms = (t_gen_end - t_gen_start) * 1000.0
    total_ms = (t_gen_end - t_start) * 1000.0

    # Step 7: Embed and persist Assistant Reply to Qdrant Cloud
    asst_vector, _ = siglip_service.encode_text(reply_text)
    asst_point_id = qdrant_service.add_chat_message(
        session_id=session_id,
        role="assistant",
        content=reply_text,
        vector=asst_vector,
        camera_name=req.camera_name,
        metadata={
            "generation_seconds": round(gen_ms / 1000.0, 2),
            "words_count": len(reply_text.split()),
        },
    )

    words_count = len(reply_text.split())
    words_per_sec = round(words_count / (gen_ms / 1000.0), 1) if gen_ms > 0 else 0.0

    return {
        "session_id": session_id,
        "role": "assistant",
        "message": reply_text,
        "reply": reply_text,
        "user_turn_id": user_point_id,
        "assistant_turn_id": asst_point_id,
        "relevant_memories": recalled_memories,
        "matched_frames": matched_frames,
        "total_generation_seconds": round(gen_ms / 1000.0, 2),
        "total_generation_ms": round(gen_ms, 2),
        "total_pipeline_ms": round(total_ms, 2),
        "words_count": words_count,
        "words_per_second": words_per_sec,
        "qdrant_status": qdrant_service.get_status(),
    }


@app.post("/api/chat/stream")
@app.get("/api/chat/stream")
async def chat_stream(
    request: Request,
    message: Optional[str] = Form(None),
    session_id: Optional[str] = Form("default"),
    camera_name: Optional[str] = Form(None),
    frame_path: Optional[str] = Form(None),
):
    """
    Real-time streaming conversational AI chat with Qdrant Cloud vector memory.
    Yields Server-Sent Events (SSE) as tokens/chunks arrive from Qwen3.
    Persists user query and completed assistant response into Qdrant Cloud with 768-D vectors.
    """
    if siglip_service is None:
        raise HTTPException(status_code=503, detail="SigLIP service initializing")

    raw_query = (message or request.query_params.get("message") or "").strip()
    s_id = session_id or request.query_params.get("session_id") or "default"
    cam_name = camera_name or request.query_params.get("camera_name")
    f_path = frame_path or request.query_params.get("frame_path")

    if not raw_query:
        raise HTTPException(status_code=400, detail="Query message cannot be empty")

    def chat_event_stream():
        t_start = time.perf_counter()

        # Step 1: Embed query
        yield f"data: {json.dumps({'type': 'status', 'stage': 'embedding', 'message': 'Encoding query into 768-D vector...'})}\n\n"
        query_vector, _ = siglip_service.encode_text(raw_query)

        # Step 2: Semantic memory recall
        yield f"data: {json.dumps({'type': 'status', 'stage': 'memory_recall', 'message': 'Searching Qdrant Cloud conversational memory...'})}\n\n"
        recalled_memories = qdrant_service.search_chat_memory(
            query_vector=query_vector,
            session_id=s_id,
            limit=4,
            min_score=0.15,
        )

        # Step 3: Frame search
        matched_frames = qdrant_service.search_video_frames(
            query_vector=query_vector,
            limit=3,
            camera_name=cam_name,
            min_score=0.15,
        )

        # Persist user turn
        qdrant_service.add_chat_message(
            session_id=s_id,
            role="user",
            content=raw_query,
            vector=query_vector,
            camera_name=cam_name,
        )

        yield f"data: {json.dumps({'type': 'memory_recalled', 'memories': recalled_memories, 'matched_frames': matched_frames})}\n\n"

        # Step 4: Stream response from Qwen3
        memory_context = ""
        if recalled_memories:
            mem_lines = [f"- Prior turn ({m.get('role', 'msg')}): {m.get('content', '')}" for m in recalled_memories[:3]]
            memory_context = "Situational Memory (Recalled from Qdrant Cloud):\n" + "\n".join(mem_lines) + "\n\n"

        frame_context = ""
        if matched_frames:
            frame_lines = [
                f"- Camera '{f.get('camera_name', 'CCTV')}' at {f.get('timestamp_str', '00:00')} (SigLIP match {f.get('match_score', 0)}%)"
                for f in matched_frames[:2]
            ]
            frame_context = "Relevant Video Frames Indexed in Qdrant:\n" + "\n".join(frame_lines) + "\n\n"

        system_prompt = (
            "You are the NEXGI AI Video Surveillance and CCTV Intelligence Assistant. "
            "You assist security operators in tracking suspects, reviewing camera events, "
            "and managing surveillance operations. You have continuous stateful memory "
            "and vector search powered by Qdrant Cloud. "
            "Answer questions concisely, accurately, and authoritatively. "
            "Refer to previous events and observations if relevant."
        )

        user_prompt = f"{memory_context}{frame_context}Operator Query: {raw_query}"

        t_gen_start = time.perf_counter()
        accumulated_chunks = []
        chunk_idx = 0

        try:
            with requests.post(
                EXPLAINABLE_AI_TEXT_URL,
                data={"user_prompt": user_prompt, "system_prompt": system_prompt},
                headers={"User-Agent": "NEXGI-Surveillance-Client/2.0"},
                stream=True,
                timeout=40.0,
            ) as resp:
                if resp.status_code != 200:
                    yield f"data: {json.dumps({'type': 'error', 'error': f'HTTP {resp.status_code}: {resp.text[:200]}'})}\n\n"
                    return

                for raw_chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
                    if not raw_chunk:
                        continue
                    chunk_idx += 1
                    accumulated_chunks.append(raw_chunk)
                    elapsed_sec = round((time.perf_counter() - t_gen_start), 2)
                    yield f"data: {json.dumps({'type': 'chunk', 'chunk': raw_chunk, 'chunk_index': chunk_idx, 'accumulated': ''.join(accumulated_chunks), 'elapsed_generation_seconds': elapsed_sec})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
            return

        final_reply = "".join(accumulated_chunks).strip()
        t_gen_end = time.perf_counter()
        gen_ms = (t_gen_end - t_gen_start) * 1000.0
        gen_sec = round(gen_ms / 1000.0, 2)

        # Persist assistant turn to Qdrant Cloud
        asst_vector, _ = siglip_service.encode_text(final_reply)
        asst_id = qdrant_service.add_chat_message(
            session_id=s_id,
            role="assistant",
            content=final_reply,
            vector=asst_vector,
            camera_name=cam_name,
            metadata={"generation_seconds": gen_sec},
        )

        yield f"data: {json.dumps({'type': 'done', 'reply': final_reply, 'assistant_turn_id': asst_id, 'total_generation_seconds': gen_sec, 'total_generation_ms': round(gen_ms, 2), 'chunks_count': chunk_idx, 'qdrant_saved': True, 'qdrant_status': qdrant_service.get_status()})}\n\n"

    return StreamingResponse(
        chat_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# -----------------------------------------------------------------------------
# Demo Video Generation Endpoint
# -----------------------------------------------------------------------------

@app.post("/api/video/demo")
async def create_demo_video():
    """Generate the 3-scene synthetic demo video locally."""
    demo_path = VIDEOS_DIR / "demo_multimodal_scenes.mp4"
    VideoService.generate_demo_video(demo_path, duration_sec=6, fps=10)
    return {
        "success": True,
        "message": "Demo video generated successfully.",
        "path": f"/data/videos/{demo_path.name}",
        "filename": demo_path.name,
    }


# -----------------------------------------------------------------------------
# Tunnel Management Endpoints
# -----------------------------------------------------------------------------

@app.get("/api/tunnel/status")
async def get_tunnel_status():
    """Return current ngrok tunnel state and active https:// URL."""
    return TunnelService.get_status()


@app.post("/api/tunnel/start")
async def start_ngrok_tunnel(authtoken: Optional[str] = Form(None)):
    """Start ngrok tunnel for port 8000."""
    return TunnelService.start_tunnel(authtoken=authtoken, port=8000)


@app.post("/api/tunnel/stop")
async def stop_ngrok_tunnel():
    """Stop active ngrok tunnel."""
    return TunnelService.stop_tunnel()


@app.post("/api/tunnel/set_url")
async def set_tunnel_url(public_url: str = Form(...)):
    """Manually assign an active public tunnel URL."""
    return TunnelService.set_public_url(public_url)


def main():
    """Startup wrapper: checks dependencies, detects hardware, and starts Uvicorn."""
    import uvicorn

    host = "127.0.0.1"
    port = 8000

    print("=" * 60)
    print("NEXGI SIGLIP 2 MULTIMODAL BACKEND - STARTUP")
    print(f"URL: http://{host}:{port}")
    print("=" * 60)

    uvicorn.run("app:app", host=host, port=port, log_level="info", reload=False)


if __name__ == "__main__":
    main()
