import os
import shutil
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from app.services.video_processor import processor
from app.config import PROJECT_ROOT, VALID_VIDEO_EXTS

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

@router.get("")
def list_cameras():
    """Returns status of all cameras."""
    return processor.get_all_statuses()

@router.get("/blur-faces")
def get_blur_faces():
    """Returns current face blurring toggle state."""
    return {"blur_faces": processor.blur_faces}

@router.post("/blur-faces")
def set_blur_faces(enabled: Optional[bool] = Query(None)):
    """Toggles or sets face blurring."""
    if enabled is None:
        new_val = processor.toggle_blur_faces()
    else:
        new_val = processor.set_blur_faces(enabled)
    return {"blur_faces": new_val}

@router.post("/reset-benchmark")
def reset_benchmark():
    """Reloads standard benchmark camera feeds from videos/."""
    statuses = processor.reset_to_benchmark()
    return {"success": True, "cameras": statuses}

@router.post("/upload")
async def upload_video_feed(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None)
):
    """Uploads a video file and registers it as a live camera feed with real-time detection."""
    filename = file.filename or "uploaded_video.mp4"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in VALID_VIDEO_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format '{ext}'. Allowed: {', '.join(VALID_VIDEO_EXTS)}"
        )

    # Save to videos folder
    videos_dir = os.path.join(PROJECT_ROOT, "videos")
    os.makedirs(videos_dir, exist_ok=True)

    # Avoid overwriting existing files by adding timestamp/counter if needed
    save_filename = filename
    dest_path = os.path.join(videos_dir, save_filename)
    counter = 1
    base, extension = os.path.splitext(filename)
    while os.path.exists(dest_path):
        save_filename = f"{base}_{counter}{extension}"
        dest_path = os.path.join(videos_dir, save_filename)
        counter += 1

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save video: {str(e)}")

    camera_status = processor.add_camera_from_file(
        filename=save_filename,
        file_path=dest_path,
        custom_name=name
    )
    return camera_status

@router.delete("/{camera_id}")
def delete_camera_feed(camera_id: str, delete_file: bool = Query(True)):
    """Deletes camera feed, terminates processing thread, and optionally removes video file."""
    success = processor.delete_camera(camera_id, delete_file=delete_file)
    if not success:
        raise HTTPException(status_code=404, detail=f"Camera {camera_id} not found")
    return {"success": True, "camera_id": camera_id}

@router.get("/{camera_id}/status")
def get_camera_status(camera_id: str):
    """Returns status of specific camera."""
    status = processor.get_camera_status(camera_id)
    if not status:
        raise HTTPException(status_code=404, detail="Camera not found")
    return status

async def mjpeg_frame_generator(camera_id: str):
    """Generates multipart MJPEG stream for live video preview without blocking threadpool."""
    try:
        while True:
            frame_bytes = processor.get_camera_stream_frame(camera_id)
            if frame_bytes:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
                )
            await asyncio.sleep(0.04)  # ~25 FPS stream pacing asynchronously
    except asyncio.CancelledError:
        pass

@router.get("/{camera_id}/stream")
async def stream_camera(camera_id: str):
    """Live MJPEG video feed for camera."""
    worker = processor.workers.get(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Camera not found")
    return StreamingResponse(
        mjpeg_frame_generator(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
