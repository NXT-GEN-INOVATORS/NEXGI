"""Explainable-AI client service.

Stores Top-1 matching video frame in Supabase S3 bucket ('nexgi-vdo'),
generates an accessible HTTPS URL, and shares that URL to the multimodal
Explainable-AI endpoint. Supports real-time token/chunk streaming and exact
timing metrics for total generation time calculation.
"""

from pathlib import Path
from typing import Any, Dict, Generator, Optional
import json
import logging
import os
import time
import requests

from services.supabase_storage import supabase_storage

logger = logging.getLogger(__name__)

EXPLAINABLE_AI_BASE_URL = os.environ.get(
    "EXPLAINABLE_AI_BASE_URL",
    "https://vijay.blk2np.qzz.io",
).rstrip("/")
EXPLAINABLE_AI_API_URL = EXPLAINABLE_AI_BASE_URL
EXPLAINABLE_AI_TEXT_URL = f"{EXPLAINABLE_AI_BASE_URL}/text"
EXPLAINABLE_AI_IMAGE_URL = f"{EXPLAINABLE_AI_BASE_URL}/image"
EXPLAINABLE_AI_STATUS_URL = f"{EXPLAINABLE_AI_BASE_URL}/status"


def get_ai_models_status() -> Dict[str, Any]:
    """Query live status and telemetry from the AI models host."""
    try:
        resp = requests.get(EXPLAINABLE_AI_STATUS_URL, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "online": True,
                "host": EXPLAINABLE_AI_BASE_URL,
                "status_code": 200,
                **data,
            }
        return {
            "online": False,
            "host": EXPLAINABLE_AI_BASE_URL,
            "status_code": resp.status_code,
            "error": resp.text[:200],
        }
    except Exception as e:
        return {
            "online": False,
            "host": EXPLAINABLE_AI_BASE_URL,
            "error": str(e),
        }


def stream_explainable_ai(
    frame_image_path: Path,
    query: str,
    frame_number: Optional[int] = None,
    timestamp_str: Optional[str] = None,
    timeout_sec: float = 40.0,
    pre_uploaded_image_url: Optional[str] = None,
) -> Generator[Dict[str, Any], None, None]:
    """
    Generator yielding real-time chunks from the multimodal AI vision endpoint (Qwen3-VL-4B on A10G).

    Emits events:
      - {"type": "status", "stage": "...", "message": "..."}
      - {"type": "image_ready", "image_url": "...", "upload_time_ms": ...}
      - {"type": "chunk", "chunk": "...", "chunk_index": int, "accumulated": "...", "elapsed_ms": ...}
      - {"type": "done", "success": True, "explanation": "...", "total_generation_ms": ..., ...}
    """
    t_start = time.perf_counter()
    target_file = Path(frame_image_path).resolve()

    if not target_file.exists() and not pre_uploaded_image_url:
        yield {
            "type": "error",
            "success": False,
            "error": f"Top-1 frame file not found on disk: {target_file}",
            "latency_ms": 0.0,
            "status_code": 404,
        }
        return

    # Step 1: Upload to Supabase S3 for frontend image presentation (if not already provided)
    image_url = pre_uploaded_image_url
    storage_meta: Dict[str, Any] = {}
    upload_ms = 0.0

    if not image_url and target_file.exists():
        yield {
            "type": "status",
            "stage": "uploading_s3",
            "message": f"Uploading frame '{target_file.name}' to Supabase S3 bucket...",
        }
        t_upload_start = time.perf_counter()
        try:
            storage_meta = supabase_storage.upload_top_frame(target_file)
            image_url = storage_meta.get("image_url")
            upload_ms = (time.perf_counter() - t_upload_start) * 1000.0
            logger.info("Supabase S3 upload succeeded in %.2f ms: %s", upload_ms, image_url[:80] if image_url else "None")
        except Exception as s3_err:
            logger.warning("Supabase S3 storage upload skipped/failed: %s", s3_err)
            # Non-blocking: continue directly with local image file upload to AI model host

    yield {
        "type": "image_ready",
        "image_url": image_url or f"/data/frames/{target_file.name}",
        "storage_bucket": storage_meta.get("bucket"),
        "storage_key": storage_meta.get("key"),
        "upload_time_ms": round(upload_ms, 2),
        "message": "Image prepared. Streaming AI vision explanation from Qwen3-VL...",
    }

    # Step 2: Formulate prompt
    frame_desc = f"Frame #{frame_number} at {timestamp_str}" if frame_number is not None else "Top 1 matching video frame"
    user_prompt = (
        f"Analyze this image in relation to the user's query: '{query}'. "
        f"Frame: {frame_desc}. "
        f"Explain the visible visual evidence that supports the match. "
        f"Detail the specific objects, visual characteristics, and context observed."
    )
    system_prompt = (
        "You are an Explainable AI CCTV vision assistant. "
        "Analyze the provided image specifically in relation to the user query. "
        "Explain the visible evidence supporting the match with clear, concise bullet points. "
        "Only describe visual evidence that is actually visible in the image."
    )

    headers = {
        "User-Agent": "NEXGI-Vision-Client/2.0",
    }

    # Step 3: Stream from Explainable AI endpoint (prefer /image with multipart file, fallback to /text)
    t_gen_start = time.perf_counter()
    first_chunk_t: Optional[float] = None
    accumulated_chunks = []
    chunk_index = 0

    try:
        # Determine whether to use /image (file upload) or /text (prompt with URL)
        use_image_endpoint = target_file.exists() and target_file.is_file()
        file_obj = None

        if use_image_endpoint:
            file_obj = open(target_file, "rb")
            ext = target_file.suffix.lower()
            mime = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"
            files = {"image": (target_file.name, file_obj, mime)}
            post_url = EXPLAINABLE_AI_IMAGE_URL
            post_data = {
                "user_prompt": user_prompt,
                "system_prompt": system_prompt,
            }
            logger.info("Streaming vision explanation from %s (multipart upload: %s)", post_url, target_file.name)
        else:
            files = None
            post_url = EXPLAINABLE_AI_TEXT_URL
            text_prompt = f"{user_prompt}\nImage URL: {image_url}" if image_url else user_prompt
            post_data = {
                "user_prompt": text_prompt,
                "system_prompt": system_prompt,
            }
            logger.info("Streaming text explanation from %s", post_url)

        try:
            with requests.post(
                post_url,
                data=post_data,
                files=files,
                headers=headers,
                stream=True,
                timeout=timeout_sec,
            ) as resp:
                status_code = resp.status_code
                if status_code != 200:
                    body_err = resp.text[:300]
                    logger.error("AI model host error (%d): %s", status_code, body_err)
                    yield {
                        "type": "error",
                        "success": False,
                        "error": f"AI models host error (HTTP {status_code}): {body_err}",
                        "image_url": image_url,
                        "status_code": status_code,
                        "latency_ms": round((time.perf_counter() - t_start) * 1000.0, 2),
                    }
                    return

                for raw_chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
                    if not raw_chunk:
                        continue

                    now = time.perf_counter()
                    if first_chunk_t is None:
                        first_chunk_t = now

                    chunk_index += 1
                    accumulated_chunks.append(raw_chunk)
                    accumulated_text = "".join(accumulated_chunks)
                    chunk_gen_ms = (now - t_gen_start) * 1000.0

                    yield {
                        "type": "chunk",
                        "chunk": raw_chunk,
                        "chunk_index": chunk_index,
                        "accumulated": accumulated_text,
                        "elapsed_generation_ms": round(chunk_gen_ms, 2),
                        "elapsed_generation_seconds": round(chunk_gen_ms / 1000.0, 2),
                    }
        finally:
            if file_obj:
                try:
                    file_obj.close()
                except Exception:
                    pass

        t_gen_end = time.perf_counter()
        total_gen_ms = (t_gen_end - t_gen_start) * 1000.0
        total_gen_sec = round(total_gen_ms / 1000.0, 2)
        total_pipeline_ms = (t_gen_end - t_start) * 1000.0
        total_pipeline_sec = round(total_pipeline_ms / 1000.0, 2)

        final_text = "".join(accumulated_chunks).strip()

        # Handle possible JSON encapsulation if model returned JSON
        if final_text.startswith("{") and final_text.endswith("}"):
            try:
                parsed = json.loads(final_text)
                if isinstance(parsed, dict):
                    final_text = (
                        parsed.get("explanation")
                        or parsed.get("response")
                        or parsed.get("text")
                        or parsed.get("output")
                        or parsed.get("message")
                        or final_text
                    )
            except Exception:
                pass

        first_chunk_ms = ((first_chunk_t - t_gen_start) * 1000.0) if first_chunk_t else 0.0
        words_count = len(final_text.split())
        words_per_sec = round(words_count / (total_gen_ms / 1000.0), 1) if total_gen_ms > 0 else 0.0

        yield {
            "type": "done",
            "success": True,
            "explanation": final_text,
            "full_explanation": final_text,
            "image_url": image_url,
            "storage_bucket": storage_meta.get("bucket"),
            "storage_key": storage_meta.get("key"),
            "total_generation_ms": round(total_gen_ms, 2),
            "total_generation_seconds": total_gen_sec,
            "total_pipeline_ms": round(total_pipeline_ms, 2),
            "total_pipeline_seconds": total_pipeline_sec,
            "first_chunk_latency_ms": round(first_chunk_ms, 2),
            "chunks_count": chunk_index,
            "characters_count": len(final_text),
            "words_count": words_count,
            "words_per_second": words_per_sec,
        }

    except requests.exceptions.Timeout:
        elapsed_ms = (time.perf_counter() - t_start) * 1000.0
        logger.warning("Explainable-AI request timed out after %.2f s", timeout_sec)
        yield {
            "type": "error",
            "success": False,
            "error": f"Explainable AI API timed out after {timeout_sec:.0f}s.",
            "image_url": image_url,
            "latency_ms": round(elapsed_ms, 2),
            "status_code": 408,
        }
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - t_start) * 1000.0
        logger.exception("Explainable-AI request failed: %s", exc)
        yield {
            "type": "error",
            "success": False,
            "error": str(exc),
            "image_url": image_url,
            "latency_ms": round(elapsed_ms, 2),
            "status_code": 500,
        }


def call_explainable_ai(
    frame_image_path: Path,
    query: str,
    frame_number: Optional[int] = None,
    timestamp_str: Optional[str] = None,
    timeout_sec: float = 40.0,
    pre_uploaded_image_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Synchronous wrapper around stream_explainable_ai.
    Collects all streaming chunks and returns complete response with exact timing metrics.
    """
    result: Dict[str, Any] = {
        "success": False,
        "explanation": None,
        "error": None,
        "image_url": None,
        "total_generation_ms": 0.0,
        "total_generation_seconds": 0.0,
        "latency_ms": 0.0,
        "chunks_count": 0,
        "words_count": 0,
        "words_per_second": 0.0,
    }

    accumulated = ""
    for event in stream_explainable_ai(
        frame_image_path=frame_image_path,
        query=query,
        frame_number=frame_number,
        timestamp_str=timestamp_str,
        timeout_sec=timeout_sec,
        pre_uploaded_image_url=pre_uploaded_image_url,
    ):
        evt_type = event.get("type")
        if evt_type == "chunk":
            accumulated = event.get("accumulated", "")
        elif evt_type == "image_ready":
            result["image_url"] = event.get("image_url")
            result["storage_bucket"] = event.get("storage_bucket")
            result["storage_key"] = event.get("storage_key")
        elif evt_type == "done":
            result["success"] = True
            result["explanation"] = event.get("explanation")
            result["image_url"] = event.get("image_url") or result["image_url"]
            result["storage_bucket"] = event.get("storage_bucket")
            result["storage_key"] = event.get("storage_key")
            result["total_generation_ms"] = event.get("total_generation_ms", 0.0)
            result["total_generation_seconds"] = event.get("total_generation_seconds", 0.0)
            result["latency_ms"] = event.get("total_pipeline_ms", 0.0)
            result["first_chunk_latency_ms"] = event.get("first_chunk_latency_ms")
            result["chunks_count"] = event.get("chunks_count", 0)
            result["words_count"] = event.get("words_count", 0)
            result["words_per_second"] = event.get("words_per_second", 0.0)
            return result
        elif evt_type == "error":
            result["success"] = False
            result["error"] = event.get("error")
            result["latency_ms"] = event.get("latency_ms", 0.0)
            result["status_code"] = event.get("status_code", 500)
            return result

    if not result["explanation"] and accumulated:
        result["explanation"] = accumulated.strip()
        result["success"] = True

    return result
