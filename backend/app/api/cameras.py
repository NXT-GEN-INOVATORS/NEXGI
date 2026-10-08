import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.services.video_processor import processor

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

@router.get("")
def list_cameras():
    """Returns status of all cameras."""
    return processor.get_all_statuses()

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
