"""Explainable-AI client service.

Stores Top-1 matching video frame in Supabase S3 bucket ('nexgi-vdo'),
generates an accessible HTTPS URL, and shares that URL to the multimodal
Explainable-AI endpoint (no base64, no file:// URIs).
"""

from pathlib import Path
from typing import Any, Dict, Optional
import json
import logging
import os
import time
import requests

from services.supabase_storage import supabase_storage

logger = logging.getLogger(__name__)

EXPLAINABLE_AI_BASE_URL = "https://florist-divinely-refining.ngrok-free.dev"
EXPLAINABLE_AI_API_URL = EXPLAINABLE_AI_BASE_URL
EXPLAINABLE_AI_TEXT_URL = f"{EXPLAINABLE_AI_BASE_URL}/text"
EXPLAINABLE_AI_IMAGE_URL = f"{EXPLAINABLE_AI_BASE_URL}/image"


def call_explainable_ai(
    frame_image_path: Path,
    query: str,
    frame_number: Optional[int] = None,
    timestamp_str: Optional[str] = None,
    timeout_sec: float = 40.0,
) -> Dict[str, Any]:
    """
    1. Uploads the Top-1 matching frame to Supabase S3 bucket 'nexgi-vdo'.
    2. Obtains the public/presigned HTTPS image URL.
    3. Shares the image URL directly to the AI vision endpoint (no base64, no file://).
    4. Returns grounded visual explanation and S3 storage metadata.
    """
    t0 = time.perf_counter()
    target_file = Path(frame_image_path).resolve()

    if not target_file.exists():
        return {
            "success": False,
            "error": f"Top-1 frame file not found on disk: {target_file}",
            "explanation": None,
            "image_url": None,
            "latency_ms": 0.0,
            "status_code": 404,
        }

    # Step 1: Upload Top-1 image to Supabase S3 bucket
    image_url = None
    storage_meta = {}
    try:
        logger.info("Uploading Top-1 frame '%s' to Supabase S3 bucket...", target_file.name)
        storage_meta = supabase_storage.upload_top_frame(target_file)
        image_url = storage_meta.get("image_url")
        logger.info("Supabase S3 upload succeeded. Image URL: %s", image_url[:90] if image_url else "None")
    except Exception as s3_err:
        logger.exception("Failed uploading frame to Supabase S3: %s", s3_err)
        return {
            "success": False,
            "error": f"Supabase S3 storage upload failed: {str(s3_err)}",
            "explanation": None,
            "image_url": None,
            "latency_ms": round((time.perf_counter() - t0) * 1000.0, 2),
            "status_code": 500,
        }

    frame_desc = f"Frame #{frame_number} at {timestamp_str}" if frame_number is not None else "Top 1 matching video frame"

    # Step 2: Construct prompts sharing the image URL (no base64, no file://)
    user_prompt = (
        f"Analyze the image at this URL in relation to the user's query: '{query}'. "
        f"Image URL: {image_url}. "
        f"Frame: {frame_desc}. "
        f"Explain the visible visual evidence that supports the match. "
        f"Only describe information that is actually visible in the image."
    )
    system_prompt = (
        "You are an Explainable AI vision assistant. "
        "Analyze the image at the provided URL specifically in relation to the user's query. "
        "Explain the visible evidence supporting the match. "
        "Only describe information that can be observed in the image. "
        "Do not invent objects, actions, colors, or events that are not visible."
    )

    headers = {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "SigLIP2-Explainable-AI-Client/2.0",
    }

    try:
        logger.info("Sharing Supabase S3 image URL to AI endpoint: %s", EXPLAINABLE_AI_TEXT_URL)

        resp = requests.post(
            EXPLAINABLE_AI_TEXT_URL,
            data={
                "user_prompt": user_prompt,
                "system_prompt": system_prompt,
            },
            headers=headers,
            timeout=timeout_sec,
        )

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        status_code = resp.status_code
        logger.info("AI endpoint returned HTTP %d in %.2f ms", status_code, elapsed_ms)

        if status_code == 200:
            raw_text = resp.text.strip()
            explanation_text = raw_text

            try:
                parsed_json = resp.json()
                if isinstance(parsed_json, dict):
                    explanation_text = (
                        parsed_json.get("explanation")
                        or parsed_json.get("response")
                        or parsed_json.get("text")
                        or parsed_json.get("output")
                        or parsed_json.get("message")
                        or raw_text
                    )
            except Exception:
                pass

            if explanation_text.startswith("Error:") or explanation_text.startswith("error:"):
                logger.warning("AI endpoint returned error text: %s", explanation_text)
                return {
                    "success": False,
                    "error": explanation_text,
                    "explanation": None,
                    "image_url": image_url,
                    "storage_bucket": storage_meta.get("bucket"),
                    "storage_key": storage_meta.get("key"),
                    "latency_ms": round(elapsed_ms, 2),
                    "status_code": 200,
                    "user_prompt": user_prompt,
                }

            return {
                "success": True,
                "explanation": explanation_text,
                "error": None,
                "image_url": image_url,
                "storage_bucket": storage_meta.get("bucket"),
                "storage_key": storage_meta.get("key"),
                "latency_ms": round(elapsed_ms, 2),
                "status_code": 200,
                "user_prompt": user_prompt,
            }

        return {
            "success": False,
            "error": f"API error (HTTP {status_code}): {resp.text[:300]}",
            "explanation": None,
            "image_url": image_url,
            "storage_bucket": storage_meta.get("bucket"),
            "storage_key": storage_meta.get("key"),
            "latency_ms": round(elapsed_ms, 2),
            "status_code": status_code,
            "user_prompt": user_prompt,
        }

    except requests.exceptions.Timeout:
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        logger.warning("Explainable-AI request timed out after %.2f s", timeout_sec)
        return {
            "success": False,
            "error": f"Explainable AI API timed out after {timeout_sec:.0f}s.",
            "explanation": None,
            "image_url": image_url,
            "storage_bucket": storage_meta.get("bucket"),
            "storage_key": storage_meta.get("key"),
            "latency_ms": round(elapsed_ms, 2),
            "status_code": 408,
            "user_prompt": user_prompt,
        }
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        logger.exception("Explainable-AI request failed: %s", exc)
        return {
            "success": False,
            "error": str(exc),
            "explanation": None,
            "image_url": image_url,
            "storage_bucket": storage_meta.get("bucket"),
            "storage_key": storage_meta.get("key"),
            "latency_ms": round(elapsed_ms, 2),
            "status_code": 500,
            "user_prompt": user_prompt,
        }
