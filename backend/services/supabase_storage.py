"""Supabase S3 Storage Service for storing Top-1 matching video frames.

Uses boto3 S3 client with Supabase S3 endpoint and credentials:
- Endpoint: https://idefxpaoppynikcopbzn.storage.supabase.co/storage/v1/s3
- Bucket: nexgi-vdo
- Signature: SigV4
"""

from pathlib import Path
from typing import Any, Dict, Optional
import logging
import mimetypes
import time
import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

SUPABASE_S3_ENDPOINT = "https://idefxpaoppynikcopbzn.storage.supabase.co/storage/v1/s3"
SUPABASE_ACCESS_KEY_ID = "5b07df10dff1ddfc716cf64c718a40a4"
SUPABASE_SECRET_ACCESS_KEY = "fea02e888d98796bba85b56a9c3447d596b88de22faec6d2afd775cd201d3346"
SUPABASE_BUCKET_NAME = "nexgi-vdo"
SUPABASE_REGION = "us-east-1"


class SupabaseStorageService:
    """Manages S3 operations for Top-1 video frames in Supabase Bucket Storage."""

    def __init__(
        self,
        endpoint_url: str = SUPABASE_S3_ENDPOINT,
        access_key_id: str = SUPABASE_ACCESS_KEY_ID,
        secret_access_key: str = SUPABASE_SECRET_ACCESS_KEY,
        bucket_name: str = SUPABASE_BUCKET_NAME,
        region_name: str = SUPABASE_REGION,
    ):
        self.endpoint_url = endpoint_url
        self.access_key_id = access_key_id
        self.secret_access_key = secret_access_key
        self.bucket_name = bucket_name
        self.region_name = region_name

        self.s3_client = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            region_name=self.region_name,
            config=Config(signature_version="s3v4"),
        )

    def upload_top_frame(
        self,
        frame_path: Path,
        custom_key: Optional[str] = None,
        expires_in_seconds: int = 86400 * 7,  # 7 days
    ) -> Dict[str, Any]:
        """
        Uploads local Top-1 video frame to Supabase S3 bucket and returns its accessible HTTPS URL.
        """
        file_path = Path(frame_path).resolve()
        if not file_path.exists():
            raise FileNotFoundError(f"Frame file not found: {file_path}")

        ext = file_path.suffix.lower()
        content_type = mimetypes.guess_type(file_path.name)[0] or ("image/png" if ext == ".png" else "image/jpeg")

        key = custom_key or f"top1_frames/{int(time.time())}_{file_path.name}"

        logger.info(
            "Uploading Top-1 frame '%s' (%d bytes) to Supabase S3 bucket '%s' with key '%s'",
            file_path.name,
            file_path.stat().st_size,
            self.bucket_name,
            key,
        )

        with open(file_path, "rb") as f:
            self.s3_client.upload_fileobj(
                f,
                self.bucket_name,
                key,
                ExtraArgs={"ContentType": content_type},
            )

        # Generate accessible HTTPS URL using SigV4 presigned URL
        image_url = self.s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket_name, "Key": key},
            ExpiresIn=expires_in_seconds,
        )

        logger.info("Top-1 frame uploaded successfully. Generated image URL: %s", image_url[:80])

        return {
            "success": True,
            "bucket": self.bucket_name,
            "key": key,
            "image_url": image_url,
            "content_type": content_type,
            "size_bytes": file_path.stat().st_size,
        }


# Global singleton instance
supabase_storage = SupabaseStorageService()
