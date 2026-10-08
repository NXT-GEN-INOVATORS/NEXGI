"""Video processing and multimodal video-text embedding service.

Extracts frames from input video using OpenCV, generates frame-level and
aggregated video-level SigLIP 2 embeddings, encodes user text queries,
and calculates the best matching image frame with temporal timestamps.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import time
import logging
import cv2
import numpy as np
from PIL import Image

from services.siglip import SigLIPService
from services.explainable_ai import call_explainable_ai, EXPLAINABLE_AI_API_URL

logger = logging.getLogger(__name__)


class VideoService:
    """Handles video frame extraction, video-level embedding pooling, and temporal text-video alignment."""

    def __init__(self, siglip_service: SigLIPService, base_data_dir: str | Path):
        self.siglip = siglip_service
        self.base_dir = Path(base_data_dir).resolve()
        self.videos_dir = self.base_dir / "videos"
        self.frames_dir = self.base_dir / "frames"

        self.videos_dir.mkdir(parents=True, exist_ok=True)
        self.frames_dir.mkdir(parents=True, exist_ok=True)

    def extract_frames(
        self,
        video_path: Path,
        max_frames: int = 32,
        sample_fps: float = 1.0,
    ) -> List[Dict[str, Any]]:
        """
        Extract frames at sample_fps intervals up to max_frames.
        Returns list of dicts with PIL Image, frame index, timestamp, and saved path.
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        duration_sec = total_frames / orig_fps if orig_fps > 0 else 0.0

        # Calculate sampling step in frame counts
        step_frames = max(1, int(round(orig_fps / sample_fps)))
        if total_frames > 0 and (total_frames // step_frames) > max_frames:
            step_frames = max(1, total_frames // max_frames)

        extracted = []
        frame_idx = 0
        saved_count = 0

        video_stem = video_path.stem

        while cap.isOpened() and saved_count < max_frames:
            ret, frame_bgr = cap.read()
            if not ret:
                break

            if frame_idx % step_frames == 0:
                timestamp_sec = round(frame_idx / orig_fps, 2)
                mins = int(timestamp_sec // 60)
                secs = timestamp_sec % 60
                time_str = f"{mins:02d}:{secs:04.1f}"

                # Convert BGR (OpenCV) to RGB (PIL)
                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                pil_img = Image.fromarray(frame_rgb)

                # Save frame image
                frame_filename = f"{video_stem}_frame_{saved_count:03d}_{timestamp_sec}s.jpg"
                frame_save_path = self.frames_dir / frame_filename
                pil_img.save(frame_save_path, quality=90)

                extracted.append({
                    "frame_index": frame_idx,
                    "sample_index": saved_count,
                    "timestamp_sec": timestamp_sec,
                    "timestamp_str": time_str,
                    "image": pil_img,
                    "path": f"/data/frames/{frame_filename}",
                    "local_path": frame_save_path,
                    "width": pil_img.width,
                    "height": pil_img.height,
                })
                saved_count += 1

            frame_idx += 1

        cap.release()
        return extracted

    def process_video_and_query(
        self,
        video_path: Path,
        user_query: str,
        max_frames: int = 32,
        sample_fps: float = 1.0,
        call_xai: bool = True,
    ) -> Dict[str, Any]:
        """
        Complete video alignment pipeline:
        1. Extract video frames.
        2. Encode all frames via SigLIP 2 Image Encoder (batched).
        3. Compute overall Video Embedding (mean pooling + L2 norm).
        4. Encode User Query via SigLIP 2 Text Encoder.
        5. Calculate Raw SigLIP2 Cosine similarities.
        6. Calculate User-Facing Relative Match Score (Peak = 0.910, clamped [0.0, 1.0]).
        7. Rank frames by raw SigLIP2 cosine similarity.
        8. Accurately measure end-to-end and granular latencies with CUDA synchronization.
        """
        # Synchronize CUDA before starting timer
        self.siglip._sync_cuda()
        t_analysis_start = time.perf_counter()

        # Step 1: Extract frames
        t_ext_start = time.perf_counter()
        frames_meta = self.extract_frames(video_path, max_frames=max_frames, sample_fps=sample_fps)
        self.siglip._sync_cuda()
        t_ext_ms = (time.perf_counter() - t_ext_start) * 1000.0

        if not frames_meta:
            raise ValueError("No frames could be extracted from video.")

        # Step 2: Encode video frames with SigLIP 2 (Batched)
        t_img_start = time.perf_counter()
        pil_images = [f["image"] for f in frames_meta]
        frame_embeddings, img_lat = self.siglip.encode_images_batch(pil_images, batch_size=16)
        self.siglip._sync_cuda()
        t_img_ms = (time.perf_counter() - t_img_start) * 1000.0

        # Step 3: Compute aggregated Video Embedding (mean pooling + L2 norm)
        mean_vec = np.mean(frame_embeddings, axis=0)
        norm_val = np.linalg.norm(mean_vec)
        video_vector = (mean_vec / norm_val if norm_val > 0 else mean_vec).astype(np.float32)

        # Step 4: Encode user query
        t_txt_start = time.perf_counter()
        query_vector, txt_lat = self.siglip.encode_text(user_query)
        self.siglip._sync_cuda()
        t_txt_ms = (time.perf_counter() - t_txt_start) * 1000.0

        # Step 5: Similarity calculation
        # Raw SigLIP2 Cosine = normalized_frame_embedding @ normalized_text_embedding
        t_sim_start = time.perf_counter()
        video_raw_cosine = float(np.dot(video_vector, query_vector))
        frame_raw_scores = np.dot(frame_embeddings, query_vector)
        self.siglip._sync_cuda()
        t_sim_ms = (time.perf_counter() - t_sim_start) * 1000.0

        # Step 6: Ranking and User-Facing Match Score Calculation
        t_rank_start = time.perf_counter()
        best_idx = int(np.argmax(frame_raw_scores))
        best_raw_similarity = float(frame_raw_scores[best_idx])
        best_frame = frames_meta[best_idx]
        best_vec = frame_embeddings[best_idx]

        # Calculate Relative Match Percentage (0.0% to 100.0%):
        # best_raw_similarity = max(all_frame_raw_similarities)
        # relative_match_percentage = 100 * (raw_similarity / best_raw_similarity), clamped [0.0, 100.0]
        # The BEST matching frame must always be 100.0%
        if best_raw_similarity > 0:
            relative_match_percentages = 100.0 * (frame_raw_scores / best_raw_similarity)
        else:
            relative_match_percentages = np.zeros_like(frame_raw_scores)
        relative_match_percentages = np.clip(relative_match_percentages, 0.0, 100.0)

        # Ranking MUST be strictly based on the actual raw SigLIP2 cosine similarity
        ranked_indices = np.argsort(-frame_raw_scores)
        ranked_frames = []
        for rank, idx in enumerate(ranked_indices):
            f = frames_meta[idx]
            match_pct = round(float(relative_match_percentages[idx]), 1)
            ranked_frames.append({
                "rank": rank + 1,
                "frame_number": f["frame_index"],
                "sample_index": f["sample_index"],
                "timestamp_sec": f["timestamp_sec"],
                "timestamp_str": f["timestamp_str"],
                "path": f["path"],
                "local_path": str(f["local_path"]),
                "raw_cosine": round(float(frame_raw_scores[idx]), 4),
                "match_score": match_pct,
                "match_percentage_str": f"{match_pct:.1f}%",
            })

        t_rank_ms = (time.perf_counter() - t_rank_start) * 1000.0

        # Step 7: Explainable-AI API Integration (Top 1 Frame ONLY)
        t_xai_start = time.perf_counter()
        if call_xai:
            xai_res = call_explainable_ai(
                frame_image_path=best_frame["local_path"],
                query=user_query,
                frame_number=best_frame.get("frame_index"),
                timestamp_str=best_frame.get("timestamp_str"),
                timeout_sec=25.0,
            )
        else:
            xai_res = {
                "success": False,
                "explanation": None,
                "error": None,
                "latency_ms": 0.0,
            }
        t_xai_ms = (time.perf_counter() - t_xai_start) * 1000.0

        # Total processing time matches the sum of the pipeline stages
        t_total_ms = t_ext_ms + t_img_ms + t_txt_ms + t_sim_ms + t_rank_ms + t_xai_ms
        t_total_sec = round(t_total_ms / 1000.0, 2)

        # Helper for vector summary stats
        def get_vec_stats(vec: np.ndarray) -> Dict[str, Any]:
            norm = float(np.linalg.norm(vec))
            return {
                "shape": list(vec.shape),
                "dtype": str(vec.dtype),
                "dimension": int(vec.shape[0]),
                "norm": round(norm, 6),
                "min": round(float(np.min(vec)), 5),
                "max": round(float(np.max(vec)), 5),
                "mean": round(float(np.mean(vec)), 6),
                "std": round(float(np.std(vec)), 6),
                "first_10_values": [round(float(v), 5) for v in vec[:10]],
                "preview_values": [round(float(v), 5) for v in vec[:32]],
                "all_values": [round(float(v), 4) for v in vec.tolist()],
            }

        return {
            "query": user_query,
            "user_query": user_query,  # compatibility
            "video_filename": video_path.name,
            "frames_analyzed": len(frames_meta),
            "total_frames_extracted": len(frames_meta),  # compatibility
            "sample_fps": sample_fps,
            "processing_time": {
                "total_seconds": t_total_sec,
                "total_ms": round(t_total_ms, 2),
                "breakdown": {
                    "frame_extraction_ms": round(t_ext_ms, 2),
                    "image_embedding_ms": round(t_img_ms, 2),
                    "text_embedding_ms": round(t_txt_ms, 2),
                    "similarity_calc_ms": round(t_sim_ms, 2),
                    "ranking_ms": round(t_rank_ms, 2),
                    "explainable_ai_api_ms": round(t_xai_ms, 2),
                    "total_ms": round(t_total_ms, 2),
                },
            },
            "overall_video": {
                "pooled_video_raw_cosine": round(video_raw_cosine, 4),
                "peak_frame_raw_cosine": round(best_raw_similarity, 4),
                "peak_frame_match_score": 100.0,
                "peak_frame_match_percentage_str": "100.0%",
                "video_embedding": get_vec_stats(video_vector),
                "query_embedding": get_vec_stats(query_vector),
            },
            "best_matching_frame": {
                "frame_number": best_frame["frame_index"],
                "sample_index": best_frame["sample_index"],
                "timestamp_sec": best_frame["timestamp_sec"],
                "timestamp_str": best_frame["timestamp_str"],
                "match_score": 100.0,
                "match_percentage_str": "100.0%",
                "raw_cosine": round(best_raw_similarity, 4),
                "norm": round(float(np.linalg.norm(best_vec)), 6),
                "path": best_frame["path"],
                "local_path": str(best_frame["local_path"]),
                "embedding_stats": get_vec_stats(best_vec),
            },
            "explainable_ai": {
                "success": xai_res["success"],
                "explanation": xai_res["explanation"],
                "error": xai_res["error"],
                "latency_ms": xai_res["latency_ms"],
                "image_url": xai_res.get("image_url"),
                "storage_bucket": xai_res.get("storage_bucket"),
                "storage_key": xai_res.get("storage_key"),
                "analyzed_frame_number": best_frame["frame_index"],
                "analyzed_timestamp_str": best_frame["timestamp_str"],
                "query": user_query,
                "api_url": EXPLAINABLE_AI_API_URL,
            },
            # Embeddings inspection
            "embeddings": {
                "query": get_vec_stats(query_vector),
                "best_frame": get_vec_stats(best_vec),
                "video_pooled": get_vec_stats(video_vector),
            },
            "best_frame_embedding": get_vec_stats(best_vec),
            "video_similarity": round(video_raw_cosine, 4),
            "video_embedding": get_vec_stats(video_vector),
            "query_embedding": get_vec_stats(query_vector),
            "best_calculated_image": {
                "frame_index": best_frame["frame_index"],
                "frame_number": best_frame["frame_index"],
                "sample_index": best_frame["sample_index"],
                "timestamp_sec": best_frame["timestamp_sec"],
                "timestamp_str": best_frame["timestamp_str"],
                "match_score": 100.0,
                "match_percentage_str": "100.0%",
                "raw_cosine": round(best_raw_similarity, 4),
                "similarity": round(best_raw_similarity, 4),
                "norm": round(float(np.linalg.norm(best_vec)), 6),
                "path": best_frame["path"],
                "local_path": str(best_frame["local_path"]),
                "embedding_stats": get_vec_stats(best_vec),
            },
            "ranked_frames": ranked_frames,
            "latencies": {
                "frame_extraction_ms": round(t_ext_ms, 2),
                "frames_embedding_ms": round(t_img_ms, 2),
                "query_embedding_ms": round(t_txt_ms, 2),
                "similarity_calc_ms": round(t_sim_ms, 2),
                "ranking_ms": round(t_rank_ms, 2),
                "explainable_ai_api_ms": round(t_xai_ms, 2),
                "total_processing_ms": round(t_total_ms, 2),
            },
        }

    @staticmethod
    def generate_demo_video(output_path: Path, duration_sec: int = 6, fps: int = 10) -> Path:
        """
        Generate a synthetic 3-scene semantic video for immediate 1-click testing:
        - 0s - 2s: Red car scene
        - 2s - 4s: Green lush forest scene
        - 4s - 6s: Blue ocean sailboat scene
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        width, height = 320, 240
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

        total_frames = duration_sec * fps

        for i in range(total_frames):
            t = i / fps
            img = np.zeros((height, width, 3), dtype=np.uint8)

            if t < 2.0:
                # Scene 1: Red Sports Car moving
                img[:] = (30, 30, 180)  # red background in BGR
                car_x = int((t / 2.0) * 160) + 40
                cv2.rectangle(img, (car_x, 120), (car_x + 90, 170), (0, 0, 220), -1)
                cv2.rectangle(img, (car_x + 20, 90), (car_x + 70, 120), (20, 20, 240), -1)
                cv2.circle(img, (car_x + 20, 175), 14, (20, 20, 20), -1)
                cv2.circle(img, (car_x + 70, 175), 14, (20, 20, 20), -1)
                cv2.putText(img, f"Scene 1: Red Car ({t:.1f}s)", (15, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

            elif t < 4.0:
                # Scene 2: Green Forest Park
                img[:] = (20, 120, 30)  # green background in BGR
                cv2.rectangle(img, (140, 120), (180, 200), (20, 60, 100), -1)
                pts = np.array([[160, 40], [100, 130], [220, 130]], np.int32)
                cv2.fillPoly(img, [pts], (40, 200, 50))
                cv2.putText(img, f"Scene 2: Green Forest ({t:.1f}s)", (15, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

            else:
                # Scene 3: Blue Ocean with Sailboat
                img[:] = (180, 80, 20)  # blue ocean in BGR
                cv2.rectangle(img, (0, 140), (320, 240), (220, 100, 30), -1)
                boat_pts = np.array([[80, 170], [220, 170], [190, 200], [110, 200]], np.int32)
                cv2.fillPoly(img, [boat_pts], (255, 255, 255))
                sail_pts = np.array([[150, 70], [150, 160], [200, 160]], np.int32)
                cv2.fillPoly(img, [sail_pts], (50, 50, 240))
                cv2.putText(img, f"Scene 3: Blue Ocean ({t:.1f}s)", (15, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

            out.write(img)

        out.release()
        return output_path
