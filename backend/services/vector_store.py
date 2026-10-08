"""Local vector store with FAISS and NumPy fallback.

Handles local persistence of image embeddings, index files, and metadata.
Includes duplicate detection via SHA-256 and embedding inspection.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import hashlib
import json
import logging
import time
import numpy as np

logger = logging.getLogger(__name__)

# Check FAISS availability
FAISS_AVAILABLE = False
try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    faiss = None


class LocalVectorStore:
    """Manages local embedding persistence, indexing (FAISS or NumPy fallback), and metadata."""

    def __init__(self, base_data_dir: str | Path, dimension: int = 768):
        self.base_dir = Path(base_data_dir).resolve()
        self.images_dir = self.base_dir / "images"
        self.vectors_dir = self.base_dir / "vectors"
        self.metadata_path = self.base_dir / "metadata.json"
        self.embeddings_path = self.vectors_dir / "image_embeddings.npy"
        self.faiss_index_path = self.vectors_dir / "index.faiss"

        self.dimension = dimension
        self.backend = "FAISS" if FAISS_AVAILABLE else "NumPy"

        # Ensure directories exist
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.vectors_dir.mkdir(parents=True, exist_ok=True)

        # In-memory storage
        self.metadata: List[Dict[str, Any]] = []
        self.embeddings: Optional[np.ndarray] = None  # shape: (N, dimension), float32
        self.faiss_index = None
        self._hash_to_id: Dict[str, str] = {}

        # Load existing data from disk
        self._load_from_disk()

    def _load_from_disk(self) -> None:
        """Load persisted metadata and vectors if present."""
        if self.metadata_path.exists():
            try:
                with open(self.metadata_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
                self._hash_to_id = {
                    item["file_hash"]: item["id"]
                    for item in self.metadata
                    if "file_hash" in item
                }
                logger.info("Loaded %d metadata records from %s", len(self.metadata), self.metadata_path)
            except Exception as e:
                logger.error("Failed to load metadata: %s", e)
                self.metadata = []

        if self.embeddings_path.exists():
            try:
                loaded = np.load(self.embeddings_path)
                if loaded.ndim == 2 and loaded.shape[1] == self.dimension:
                    self.embeddings = loaded.astype(np.float32)
                    logger.info("Loaded embeddings of shape %s from %s", self.embeddings.shape, self.embeddings_path)
                else:
                    logger.warning("Loaded embeddings shape mismatch: %s", loaded.shape)
            except Exception as e:
                logger.error("Failed to load embeddings.npy: %s", e)

        # Initialize FAISS index if available
        if FAISS_AVAILABLE:
            try:
                if self.faiss_index_path.exists():
                    self.faiss_index = faiss.read_index(str(self.faiss_index_path))
                    logger.info("Loaded FAISS index from %s", self.faiss_index_path)
                else:
                    self._rebuild_faiss_index()
            except Exception as e:
                logger.warning("Failed to load FAISS index directly: %s. Rebuilding...", e)
                self._rebuild_faiss_index()
        else:
            self.backend = "NumPy"
            logger.info("FAISS unavailable. Using NumPy brute-force cosine similarity.")

    def _rebuild_faiss_index(self) -> None:
        """Rebuild FAISS inner-product index from in-memory embeddings."""
        if not FAISS_AVAILABLE:
            return
        self.faiss_index = faiss.IndexFlatIP(self.dimension)
        if self.embeddings is not None and len(self.embeddings) > 0:
            self.faiss_index.add(self.embeddings)
            faiss.write_index(self.faiss_index, str(self.faiss_index_path))

    def _save_to_disk(self) -> None:
        """Persist metadata and vector files to disk."""
        try:
            with open(self.metadata_path, "w", encoding="utf-8") as f:
                json.dump(self.metadata, f, indent=2)

            if self.embeddings is not None:
                np.save(self.embeddings_path, self.embeddings)

            if FAISS_AVAILABLE and self.faiss_index is not None:
                faiss.write_index(self.faiss_index, str(self.faiss_index_path))
        except Exception as e:
            logger.error("Failed to persist vector store to disk: %s", e)
            raise

    @staticmethod
    def compute_file_hash(data: bytes) -> str:
        """Compute SHA-256 hash of file bytes."""
        return hashlib.sha256(data).hexdigest()

    def find_by_hash(self, file_hash: str) -> Optional[Dict[str, Any]]:
        """Check if an image with this SHA-256 hash has already been indexed."""
        if file_hash in self._hash_to_id:
            existing_id = self._hash_to_id[file_hash]
            for item in self.metadata:
                if item["id"] == existing_id:
                    return item
        return None

    def add_image(
        self,
        image_bytes: bytes,
        original_filename: str,
        embedding: np.ndarray,
        width: int,
        height: int,
        image_id: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], bool]:
        """
        Add a single image and its normalized embedding to the local vector store.
        Returns: (metadata_item, is_new: bool)
        """
        file_hash = self.compute_file_hash(image_bytes)
        existing = self.find_by_hash(file_hash)
        if existing is not None:
            return existing, False

        # Ensure embedding shape (1, dimension) and float32
        vec = np.asarray(embedding, dtype=np.float32).reshape(1, self.dimension)
        # Normalize just in case
        norm = np.linalg.norm(vec, axis=1, keepdims=True)
        if norm[0, 0] > 0:
            vec = vec / norm

        # Generate unique ID
        if image_id is None:
            image_id = f"img_{len(self.metadata) + 1:04d}_{int(time.time())}"

        # Clean filename and save image locally
        safe_ext = Path(original_filename).suffix or ".jpg"
        saved_filename = f"{image_id}{safe_ext}"
        saved_path = self.images_dir / saved_filename
        with open(saved_path, "wb") as f:
            f.write(image_bytes)

        # Metadata
        meta_entry = {
            "id": image_id,
            "filename": original_filename,
            "saved_filename": saved_filename,
            "path": f"/data/images/{saved_filename}",
            "width": width,
            "height": height,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "embedding_dimension": self.dimension,
            "file_hash": file_hash,
            "index_position": len(self.metadata),
        }

        # Update in-memory embeddings
        if self.embeddings is None or len(self.embeddings) == 0:
            self.embeddings = vec
        else:
            self.embeddings = np.vstack([self.embeddings, vec])

        # Update FAISS
        if FAISS_AVAILABLE and self.faiss_index is not None:
            self.faiss_index.add(vec)

        self.metadata.append(meta_entry)
        self._hash_to_id[file_hash] = image_id

        # Persist
        self._save_to_disk()

        return meta_entry, True

    def search(
        self,
        query_vector: np.ndarray,
        top_k: int = 5,
    ) -> Tuple[List[Dict[str, Any]], float]:
        """
        Perform vector search for Top-K nearest items using inner product (cosine similarity).
        Returns: (results_list, search_latency_ms)
        """
        total_items = len(self.metadata)
        if total_items == 0 or self.embeddings is None:
            return [], 0.0

        k = min(top_k, total_items)
        q_vec = np.asarray(query_vector, dtype=np.float32).reshape(1, self.dimension)
        # L2 normalize query
        q_norm = np.linalg.norm(q_vec)
        if q_norm > 0:
            q_vec = q_vec / q_norm

        t_start = time.perf_counter()

        if FAISS_AVAILABLE and self.faiss_index is not None:
            distances, indices = self.faiss_index.search(q_vec, k)
            lat_ms = (time.perf_counter() - t_start) * 1000.0

            results = []
            for score, idx in zip(distances[0], indices[0]):
                if 0 <= idx < len(self.metadata):
                    meta = self.metadata[idx]
                    results.append({
                        "id": meta["id"],
                        "filename": meta["filename"],
                        "path": meta["path"],
                        "similarity": round(float(score), 4),
                        "width": meta.get("width"),
                        "height": meta.get("height"),
                        "created_at": meta.get("created_at"),
                    })
            return results, round(lat_ms, 3)

        else:
            # NumPy cosine similarity (matrix-vector dot product)
            # scores: shape (N,)
            scores = np.dot(self.embeddings, q_vec.flatten())
            top_indices = np.argsort(-scores)[:k]
            lat_ms = (time.perf_counter() - t_start) * 1000.0

            results = []
            for idx in top_indices:
                meta = self.metadata[idx]
                results.append({
                    "id": meta["id"],
                    "filename": meta["filename"],
                    "path": meta["path"],
                    "similarity": round(float(scores[idx]), 4),
                    "width": meta.get("width"),
                    "height": meta.get("height"),
                    "created_at": meta.get("created_at"),
                })
            return results, round(lat_ms, 3)

    def get_embedding_inspection(self, image_id: str) -> Optional[Dict[str, Any]]:
        """Extract vector statistics for inspection panel."""
        for idx, meta in enumerate(self.metadata):
            if meta["id"] == image_id:
                if self.embeddings is not None and idx < len(self.embeddings):
                    vec = self.embeddings[idx]
                    norm = float(np.linalg.norm(vec))
                    return {
                        "id": image_id,
                        "filename": meta["filename"],
                        "shape": list(vec.shape),
                        "dtype": str(vec.dtype),
                        "norm": round(norm, 6),
                        "first_10_values": [round(float(v), 5) for v in vec[:10]],
                        "min": round(float(np.min(vec)), 5),
                        "max": round(float(np.max(vec)), 5),
                        "mean": round(float(np.mean(vec)), 6),
                        "std": round(float(np.std(vec)), 6),
                        "dimension": int(vec.shape[0]),
                    }
        return None

    def get_all_images(self) -> List[Dict[str, Any]]:
        """Return list of all indexed images metadata."""
        return list(reversed(self.metadata))

    def reset(self, delete_images: bool = True) -> Dict[str, Any]:
        """
        Safely reset local vector store.
        Deletes vector index files, metadata, and uploaded image files inside data/images/.
        Strictly contained within data directory.
        """
        deleted_count = len(self.metadata)

        # Clear in-memory state
        self.metadata = []
        self._hash_to_id = {}
        self.embeddings = None

        if FAISS_AVAILABLE:
            self.faiss_index = faiss.IndexFlatIP(self.dimension)

        # Remove vector files
        if self.embeddings_path.exists():
            self.embeddings_path.unlink()
        if self.faiss_index_path.exists():
            self.faiss_index_path.unlink()
        if self.metadata_path.exists():
            self.metadata_path.unlink()

        # Remove images if requested
        if delete_images and self.images_dir.exists():
            for f in self.images_dir.iterdir():
                if f.is_file():
                    try:
                        f.unlink()
                    except Exception as e:
                        logger.warning("Could not delete file %s: %s", f, e)

        # Re-save empty metadata
        self._save_to_disk()

        return {
            "status": "reset_successful",
            "deleted_count": deleted_count,
            "images_deleted": delete_images,
        }
