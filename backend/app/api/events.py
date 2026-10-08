"""Events API endpoints."""
from fastapi import APIRouter, HTTPException, Query
from app.services.event_manager import event_manager

router = APIRouter(prefix="/api/events", tags=["events"])

@router.get("")
def list_events(limit: int = Query(default=50, ge=1, le=200)):
    """Returns recent events ordered by timestamp descending."""
    return event_manager.get_recent_events(limit=limit)

@router.get("/{event_id}")
def get_event(event_id: str):
    """Returns details for a single event."""
    event = event_manager.get_event_by_id(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event

@router.get("/{event_id}/evidence")
def get_event_evidence(event_id: str):
    """Returns evidence image and clip paths for an event."""
    event = event_manager.get_event_by_id(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return {
        "event_id": event["id"],
        "camera_id": event["camera_id"],
        "detection_timestamp": event["detection_timestamp"],
        "confidence": event["confidence"],
        "image_url": event["image_path"],
        "clip_url": event["clip_path"]
    }
