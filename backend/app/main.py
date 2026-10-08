"""FastAPI application entrypoint for CCTV Violence Monitor."""
import os
import asyncio
import psutil
from contextlib import asynccontextmanager
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings, EVIDENCE_DIR, CLIPS_DIR
from app.services.video_processor import processor
from app.services.event_manager import event_manager
from app.api.cameras import router as cameras_router
from app.api.events import router as events_router

connected_websockets: Set[WebSocket] = set()

def on_violence_event(event_data):
    """Callback when any camera detects violence: broadcast to all active websockets."""
    msg = {"type": "EVENT", "data": event_data}
    for ws in list(connected_websockets):
        try:
            asyncio.run_coroutine_threadsafe(ws.send_json(msg), asyncio.get_event_loop())
        except Exception:
            pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize detectors and start all 4 camera workers
    print("\n--- Initializing Multi-Camera Violence Detection System ---")
    processor.subscribe_events(on_violence_event)
    processor.initialize()
    processor.start_all()
    print("[OK] All 4 camera workers running concurrently.\n")
    yield
    # Shutdown: Stop workers cleanly
    print("Stopping camera workers...")
    processor.stop_all()

app = FastAPI(title="CCTV Violence Monitor", version="1.0.0", lifespan=lifespan)

# Allow CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import FileResponse

# Static file serving for evidence images and clips
@app.get("/evidence/{camera_id}/{filename}")
async def get_evidence_image(camera_id: str, filename: str):
    path = os.path.join(EVIDENCE_DIR, camera_id, filename)
    if not os.path.exists(path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Evidence not found")
    return FileResponse(path, media_type="image/jpeg")

@app.get("/clips/{camera_id}/{filename}")
async def get_evidence_clip(camera_id: str, filename: str):
    path = os.path.join(CLIPS_DIR, camera_id, filename)
    if not os.path.exists(path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Clip not found")
    return FileResponse(path, media_type="video/mp4")

app.mount("/evidence", StaticFiles(directory=EVIDENCE_DIR), name="evidence")
app.mount("/clips", StaticFiles(directory=CLIPS_DIR), name="clips")

# Routers
app.include_router(cameras_router)
app.include_router(events_router)

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "cctv-violence-monitor"}

@app.get("/api/stats")
def get_stats():
    statuses = processor.get_all_statuses()
    total_inf_fps = sum(s.get("inference_fps", 0.0) for s in statuses)
    return {
        "aggregate_fps": round(total_inf_fps, 1),
        "cpu_percent": psutil.cpu_percent(),
        "memory_percent": psutil.virtual_memory().percent,
        "active_cameras": len([s for s in statuses if s.get("is_active")]),
        "total_events": event_manager.get_total_events_count()
    }

@app.websocket("/ws/live")
async def websocket_live_feed(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)
    try:
        # Initial greeting with full camera status and recent events
        initial_payload = {
            "type": "INIT",
            "cameras": processor.get_all_statuses(),
            "events": event_manager.get_recent_events(limit=20)
        }
        await websocket.send_json(initial_payload)

        # Broadcast periodic telemetry updates every 400ms
        while True:
            await asyncio.sleep(0.4)
            statuses = processor.get_all_statuses()
            await websocket.send_json({
                "type": "STATUS_UPDATE",
                "cameras": statuses
            })
    except WebSocketDisconnect:
        connected_websockets.remove(websocket)
    except Exception:
        if websocket in connected_websockets:
            connected_websockets.remove(websocket)
