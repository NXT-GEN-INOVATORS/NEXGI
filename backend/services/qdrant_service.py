"""Qdrant Cloud vector database and conversational memory service.

Manages 768-dimensional multimodal SigLIP 2 video frame embeddings and
stateful conversational memory for the NEXGI AI surveillance chat assistant.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import logging
import os
import time
import uuid

from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

logger = logging.getLogger("nexgi-qdrant")

DEFAULT_QDRANT_URL = "https://b99cad3d-5abe-450c-b57d-86443d60834b.eu-west-1-0.aws.cloud.qdrant.io"
DEFAULT_QDRANT_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6ZDNjNzQ4N2QtMDBlMi00YmFkLTg0NDAtYzk5OTU4NTRhMTY2In0.Uhhd1KGfGsIEQ9yB7GOZmo_ha0dfmFDuNCJnX-3Tqc4"

VIDEO_FRAMES_COLLECTION = "nexgi_video_frames"
CHAT_MEMORY_COLLECTION = "nexgi_chat_memory"
VECTOR_DIMENSION = 768


class QdrantService:
    """Manages vector search and persistent stateful chat memory on Qdrant Cloud."""

    def __init__(
        self,
        url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 12.0,
    ):
        self.url = (url or os.environ.get("QDRANT_URL") or DEFAULT_QDRANT_URL).rstrip("/")
        self.api_key = api_key or os.environ.get("QDRANT_API_KEY") or DEFAULT_QDRANT_API_KEY
        self.timeout = timeout
        self.client: Optional[QdrantClient] = None
        self._is_connected = False
        self._last_error: Optional[str] = None

        self._connect()

    def _connect(self) -> bool:
        """Establish connection to Qdrant Cloud and ensure collections exist."""
        try:
            self.client = QdrantClient(
                url=self.url,
                api_key=self.api_key,
                port=443,
                https=True,
                timeout=self.timeout,
            )
            # Verify connectivity
            self.client.get_collections()
            self._is_connected = True
            self._last_error = None
            logger.info("Successfully connected to Qdrant Cloud at %s", self.url)
            self._ensure_collections()
            return True
        except Exception as err:
            self._is_connected = False
            self._last_error = str(err)
            logger.warning("Failed connecting to Qdrant Cloud: %s", err)
            return False

    def _ensure_collections(self) -> None:
        """Create collections with 768-dim vectors if they do not exist."""
        if not self.client:
            return

        for col_name in [VIDEO_FRAMES_COLLECTION, CHAT_MEMORY_COLLECTION]:
            try:
                if not self.client.collection_exists(col_name):
                    self.client.create_collection(
                        collection_name=col_name,
                        vectors_config=VectorParams(
                            size=VECTOR_DIMENSION,
                            distance=Distance.COSINE,
                        ),
                    )
                    logger.info("Created Qdrant collection '%s' (dim: %d)", col_name, VECTOR_DIMENSION)
                else:
                    logger.debug("Qdrant collection '%s' exists.", col_name)

                # Ensure payload indexes exist for filtered queries
                if col_name == CHAT_MEMORY_COLLECTION:
                    for field in ["session_id", "role"]:
                        try:
                            self.client.create_payload_index(col_name, field, field_schema="keyword")
                        except Exception:
                            pass
                elif col_name == VIDEO_FRAMES_COLLECTION:
                    for field in ["camera_name", "video_id", "camera_id"]:
                        try:
                            self.client.create_payload_index(col_name, field, field_schema="keyword")
                        except Exception:
                            pass
            except Exception as e:
                logger.error("Error creating/checking collection '%s': %s", col_name, e)

    # -------------------------------------------------------------------------
    # Video Frame Embeddings (768-dim SigLIP 2)
    # -------------------------------------------------------------------------

    def upsert_frames_batch(
        self,
        video_id: str,
        frames_meta: List[Dict[str, Any]],
        embeddings: Any,
        camera_name: Optional[str] = None,
        camera_id: Optional[str] = None,
    ) -> int:
        """
        Store a batch of video frame embeddings into Qdrant Cloud.
        embeddings: np.ndarray or List[List[float]] of shape (N, 768)
        """
        if not self._is_connected and not self._connect():
            logger.warning("Qdrant not connected; skipping frame vector upsert.")
            return 0

        points: List[PointStruct] = []
        now_ts = datetime.now(timezone.utc).isoformat()

        for idx, f in enumerate(frames_meta):
            vec = embeddings[idx]
            if hasattr(vec, "tolist"):
                vec = vec.tolist()

            pt_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{video_id}:{f.get('frame_index', idx)}"))
            payload = {
                "video_id": video_id,
                "frame_index": f.get("frame_index", idx),
                "sample_index": f.get("sample_index", idx),
                "timestamp_sec": f.get("timestamp_sec", 0.0),
                "timestamp_str": f.get("timestamp_str", "00:00.0"),
                "frame_path": f.get("path", ""),
                "camera_name": camera_name or "Camera",
                "camera_id": camera_id or "",
                "indexed_at": now_ts,
            }
            points.append(PointStruct(id=pt_id, vector=vec, payload=payload))

        try:
            self.client.upsert(
                collection_name=VIDEO_FRAMES_COLLECTION,
                points=points,
            )
            logger.info("Upserted %d frame vectors into '%s' for video '%s'", len(points), VIDEO_FRAMES_COLLECTION, video_id)
            return len(points)
        except Exception as e:
            logger.error("Failed to upsert frame vectors to Qdrant: %s", e)
            return 0

    def search_video_frames(
        self,
        query_vector: List[float],
        limit: int = 10,
        camera_name: Optional[str] = None,
        min_score: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """
        Search for video frames closest to the query vector using Cosine distance.
        """
        if not self._is_connected and not self._connect():
            return []

        if hasattr(query_vector, "tolist"):
            query_vector = query_vector.tolist()

        query_filter = None
        if camera_name:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="camera_name",
                        match=MatchValue(value=camera_name),
                    )
                ]
            )

        try:
            res = self.client.query_points(
                collection_name=VIDEO_FRAMES_COLLECTION,
                query=query_vector,
                limit=limit,
                query_filter=query_filter,
                score_threshold=min_score if min_score > 0 else None,
            )
            results = []
            for pt in res.points:
                results.append({
                    "id": str(pt.id),
                    "score": round(float(pt.score), 4),
                    "match_score": round(max(0.0, min(100.0, float(pt.score) * 100.0)), 1),
                    **pt.payload,
                })
            return results
        except Exception as e:
            logger.error("Failed querying video frames in Qdrant: %s", e)
            return []

    # -------------------------------------------------------------------------
    # Stateful Conversational Memory & Chat State
    # -------------------------------------------------------------------------

    def add_chat_message(
        self,
        session_id: str,
        role: str,
        content: str,
        vector: Optional[List[float]] = None,
        camera_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Persist a conversation turn into Qdrant Cloud.
        Stores message content, role, timestamps, and semantic embedding.
        """
        if not self._is_connected and not self._connect():
            logger.warning("Qdrant not connected; cannot save chat turn.")
            return ""

        pt_id = str(uuid.uuid4())
        # Use provided vector or neutral zero vector
        if vector is not None and hasattr(vector, "tolist"):
            vector = vector.tolist()
        elif vector is None:
            vector = [0.0] * VECTOR_DIMENSION

        payload = {
            "session_id": session_id or "default",
            "role": role,
            "content": content,
            "camera_name": camera_name or "",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "epoch": time.time(),
            **(metadata or {}),
        }

        try:
            self.client.upsert(
                collection_name=CHAT_MEMORY_COLLECTION,
                points=[PointStruct(id=pt_id, vector=vector, payload=payload)],
            )
            logger.debug("Saved chat memory turn '%s' (role: %s) to Qdrant", pt_id, role)
            return pt_id
        except Exception as e:
            logger.error("Failed saving chat message to Qdrant: %s", e)
            return ""

    def get_chat_history(
        self,
        session_id: str = "default",
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve chronological conversation state / history for a given session.
        """
        if not self._is_connected and not self._connect():
            return []

        try:
            scroll_res = self.client.scroll(
                collection_name=CHAT_MEMORY_COLLECTION,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="session_id",
                            match=MatchValue(value=session_id),
                        )
                    ]
                ),
                limit=limit,
                with_payload=True,
                with_vectors=False,
            )
            records = [
                {
                    "id": str(pt.id),
                    **pt.payload,
                }
                for pt in scroll_res[0]
            ]
            # Sort chronologically by epoch
            records.sort(key=lambda r: r.get("epoch", 0.0))
            return records
        except Exception as e:
            logger.error("Failed fetching chat history from Qdrant: %s", e)
            return []

    def search_chat_memory(
        self,
        query_vector: List[float],
        session_id: Optional[str] = None,
        limit: int = 5,
        min_score: float = 0.25,
    ) -> List[Dict[str, Any]]:
        """
        Semantically search past chat interactions and observations to recall prior context.
        """
        if not self._is_connected and not self._connect():
            return []

        if hasattr(query_vector, "tolist"):
            query_vector = query_vector.tolist()

        query_filter = None
        if session_id:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="session_id",
                        match=MatchValue(value=session_id),
                    )
                ]
            )

        try:
            res = self.client.query_points(
                collection_name=CHAT_MEMORY_COLLECTION,
                query=query_vector,
                limit=limit,
                query_filter=query_filter,
                score_threshold=min_score,
            )
            results = []
            for pt in res.points:
                results.append({
                    "id": str(pt.id),
                    "score": round(float(pt.score), 4),
                    **pt.payload,
                })
            return results
        except Exception as e:
            logger.error("Failed querying chat memory in Qdrant: %s", e)
            return []

    def clear_chat_history(self, session_id: Optional[str] = None) -> bool:
        """Clear chat memory for a specific session, or all sessions if None."""
        if not self._is_connected and not self._connect():
            return False

        try:
            if session_id:
                self.client.delete(
                    collection_name=CHAT_MEMORY_COLLECTION,
                    points_selector=Filter(
                        must=[
                            FieldCondition(
                                key="session_id",
                                match=MatchValue(value=session_id),
                            )
                        ]
                    ),
                )
            else:
                self.client.delete_collection(CHAT_MEMORY_COLLECTION)
                self._ensure_collections()
            return True
        except Exception as e:
            logger.error("Failed clearing chat history in Qdrant: %s", e)
            return False

    # -------------------------------------------------------------------------
    # Telemetry and Health
    # -------------------------------------------------------------------------

    def get_status(self) -> Dict[str, Any]:
        """Return connectivity state, collection statistics, and vector counts."""
        if not self._is_connected:
            self._connect()

        status: Dict[str, Any] = {
            "connected": self._is_connected,
            "url": self.url,
            "error": self._last_error,
            "collections": {},
            "total_vectors": 0,
            "video_frames_count": 0,
            "chat_memory_count": 0,
        }

        if self._is_connected and self.client:
            try:
                for col in [VIDEO_FRAMES_COLLECTION, CHAT_MEMORY_COLLECTION]:
                    if self.client.collection_exists(col):
                        info = self.client.get_collection(col)
                        pts_count = getattr(info, "points_count", 0) or 0
                        status["collections"][col] = {
                            "points_count": pts_count,
                            "indexed_vectors_count": getattr(info, "indexed_vectors_count", 0) or pts_count,
                            "status": str(getattr(info, "status", "ready")),
                        }
                        if col == VIDEO_FRAMES_COLLECTION:
                            status["video_frames_count"] = pts_count
                        elif col == CHAT_MEMORY_COLLECTION:
                            status["chat_memory_count"] = pts_count
                        status["total_vectors"] += pts_count
            except Exception as e:
                status["error"] = str(e)

        return status


# Singleton instance
qdrant_service = QdrantService()
