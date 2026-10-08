"""SigLIP 2 Model Service for local image and text embedding.

Uses official Hugging Face AutoProcessor and AutoModel.
Loads google/siglip2-base-patch16-224 locally with GPU/CPU support,
accurate sub-step latency benchmarks, and L2-normalized float32 vectors.
"""

from typing import Any, Dict, List, Optional, Tuple, Union
import logging
import time
import numpy as np
from PIL import Image

import torch
from transformers import AutoModel, AutoProcessor

logger = logging.getLogger(__name__)


class SigLIPService:
    """Encapsulates SigLIP 2 image and text encoders, warmup, and latency instrumentation."""

    def __init__(
        self,
        model_id: str = "google/siglip2-base-patch16-224",
        device: Optional[str] = None,
    ):
        self.model_id = model_id
        if device is not None:
            self.device = torch.device(device)
        else:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        self.dtype = torch.float16 if self.device.type == "cuda" else torch.float32

        self.processor: Optional[AutoProcessor] = None
        self.model: Optional[AutoModel] = None
        self.embedding_dimension: int = 768

        # Startup benchmark metrics
        self.load_benchmark: Dict[str, Any] = {
            "model_load_time_sec": 0.0,
            "vram_before_mb": 0.0,
            "vram_after_mb": 0.0,
            "vram_increase_mb": 0.0,
            "device": str(self.device),
            "dtype": str(self.dtype),
        }

        self._load_model()

    def _sync_cuda(self) -> None:
        """Synchronize CUDA if running on GPU for accurate latency measurement."""
        if self.device.type == "cuda" and torch.cuda.is_available():
            torch.cuda.synchronize()

    @staticmethod
    def _extract_pooler(features_output: Any) -> torch.Tensor:
        """Extract dense pooled embedding tensor from model output."""
        if hasattr(features_output, "pooler_output") and features_output.pooler_output is not None:
            return features_output.pooler_output
        if hasattr(features_output, "image_embeds") and features_output.image_embeds is not None:
            return features_output.image_embeds
        if hasattr(features_output, "text_embeds") and features_output.text_embeds is not None:
            return features_output.text_embeds
        if isinstance(features_output, torch.Tensor):
            return features_output
        return features_output[0]

    def _load_model(self) -> None:
        """Load AutoProcessor and AutoModel with timing and VRAM monitoring."""
        logger.info("Initializing SigLIP 2 on %s with dtype %s...", self.device, self.dtype)
        print(f"\n============================================================")
        print(f"LOADING SIGLIP 2 MODEL: {self.model_id}")
        print(f"DEVICE: {self.device} | DTYPE: {self.dtype}")
        print(f"============================================================")

        vram_before = 0.0
        if self.device.type == "cuda" and torch.cuda.is_available():
            torch.cuda.empty_cache()
            vram_before = torch.cuda.memory_allocated() / (1024 * 1024)

        t_start = time.perf_counter()

        # Load processor & model from Hugging Face cache or local
        self.processor = AutoProcessor.from_pretrained(self.model_id)
        self.model = AutoModel.from_pretrained(
            self.model_id,
            dtype=self.dtype,
        )
        self.model.to(self.device)
        self.model.eval()

        self._sync_cuda()
        load_duration = time.perf_counter() - t_start

        vram_after = 0.0
        if self.device.type == "cuda" and torch.cuda.is_available():
            vram_after = torch.cuda.memory_allocated() / (1024 * 1024)

        vram_increase = max(0.0, vram_after - vram_before)

        # Determine embedding dimension by testing text encoder
        test_text = ["warmup query"]
        with torch.inference_mode():
            t_inputs = self.processor(text=test_text, padding="max_length", return_tensors="pt").to(self.device)
            if hasattr(self.model, "get_text_features"):
                raw_out = self.model.get_text_features(**t_inputs)
            else:
                raw_out = self.model(**t_inputs)
            test_vec = self._extract_pooler(raw_out)
            self.embedding_dimension = int(test_vec.shape[-1])

        self.load_benchmark = {
            "model_load_time_sec": round(load_duration, 2),
            "vram_before_mb": round(vram_before, 1),
            "vram_after_mb": round(vram_after, 1),
            "vram_increase_mb": round(vram_increase, 1),
            "device": str(self.device),
            "dtype": str(self.dtype),
            "dimension": self.embedding_dimension,
        }

        print(f"Model load time: {load_duration:.2f} seconds")
        print(f"GPU memory before model: {vram_before:.1f} MB")
        print(f"GPU memory after model:  {vram_after:.1f} MB")
        print(f"Model memory increase:   {vram_increase:.1f} MB")
        print(f"Embedding dimension:     {self.embedding_dimension}")
        print(f"============================================================\n")

    def encode_image(
        self,
        image: Image.Image,
    ) -> Tuple[np.ndarray, Dict[str, float]]:
        """
        Encode a single PIL Image directly into a normalized float32 NumPy vector.
        Accurately measures:
          1. Image preprocessing latency
          2. Image encoder inference latency
          3. Image postprocessing latency
          4. Total image embedding latency
        """
        # 1. Preprocessing
        t_pre_start = time.perf_counter()
        rgb_image = image.convert("RGB")
        inputs = self.processor(images=rgb_image, return_tensors="pt").to(self.device)
        self._sync_cuda()
        t_pre = (time.perf_counter() - t_pre_start) * 1000.0

        # 2. Inference
        self._sync_cuda()
        t_inf_start = time.perf_counter()
        with torch.inference_mode():
            if hasattr(self.model, "get_image_features"):
                raw_features = self.model.get_image_features(pixel_values=inputs["pixel_values"])
            elif hasattr(self.model, "vision_model"):
                out = self.model.vision_model(pixel_values=inputs["pixel_values"])
                raw_features = out[1] if len(out) > 1 else out[0].mean(dim=1)
            else:
                out = self.model(pixel_values=inputs["pixel_values"])
                raw_features = getattr(out, "image_embeds", out[0])
            features = self._extract_pooler(raw_features)

        self._sync_cuda()
        t_inf = (time.perf_counter() - t_inf_start) * 1000.0

        # 3. Postprocessing (L2 Normalization & conversion to CPU float32 NumPy)
        t_post_start = time.perf_counter()
        norm_features = features / features.norm(p=2, dim=-1, keepdim=True)
        # Move vector to CPU immediately; vector storage does not consume GPU memory
        numpy_vector = norm_features.cpu().to(torch.float32).numpy().reshape(-1)
        t_post = (time.perf_counter() - t_post_start) * 1000.0

        latency_breakdown = {
            "preprocessing_ms": round(t_pre, 2),
            "inference_ms": round(t_inf, 2),
            "postprocessing_ms": round(t_post, 2),
            "total_ms": round(t_pre + t_inf + t_post, 2),
        }

        return numpy_vector, latency_breakdown

    def encode_images_batch(
        self,
        images: List[Image.Image],
        batch_size: int = 16,
    ) -> Tuple[np.ndarray, Dict[str, float]]:
        """
        Encode multiple images in safe memory batches of size batch_size.
        Keeps GPU memory bounded and moves results to CPU immediately.
        """
        total_images = len(images)
        if total_images == 0:
            return np.empty((0, self.embedding_dimension), dtype=np.float32), {
                "preprocessing_ms": 0.0,
                "inference_ms": 0.0,
                "postprocessing_ms": 0.0,
                "total_ms": 0.0,
            }

        all_vectors = []
        tot_pre = 0.0
        tot_inf = 0.0
        tot_post = 0.0

        for i in range(0, total_images, batch_size):
            batch = images[i : i + batch_size]
            rgb_batch = [img.convert("RGB") for img in batch]

            t_pre_start = time.perf_counter()
            inputs = self.processor(images=rgb_batch, return_tensors="pt").to(self.device)
            self._sync_cuda()
            tot_pre += (time.perf_counter() - t_pre_start) * 1000.0

            self._sync_cuda()
            t_inf_start = time.perf_counter()
            with torch.inference_mode():
                if hasattr(self.model, "get_image_features"):
                    raw_features = self.model.get_image_features(pixel_values=inputs["pixel_values"])
                else:
                    out = self.model(pixel_values=inputs["pixel_values"])
                    raw_features = getattr(out, "image_embeds", out[0])
                features = self._extract_pooler(raw_features)
            self._sync_cuda()
            tot_inf += (time.perf_counter() - t_inf_start) * 1000.0

            t_post_start = time.perf_counter()
            norm_features = features / features.norm(p=2, dim=-1, keepdim=True)
            numpy_batch = norm_features.cpu().to(torch.float32).numpy()
            all_vectors.append(numpy_batch)
            tot_post += (time.perf_counter() - t_post_start) * 1000.0

        stacked = np.vstack(all_vectors)
        return stacked, {
            "preprocessing_ms": round(tot_pre, 2),
            "inference_ms": round(tot_inf, 2),
            "postprocessing_ms": round(tot_post, 2),
            "total_ms": round(tot_pre + tot_inf + tot_post, 2),
        }

    def encode_text(
        self,
        text: Union[str, List[str]],
    ) -> Tuple[np.ndarray, Dict[str, float]]:
        """
        Encode text query directly into a normalized float32 NumPy vector.
        Accurately measures:
          1. Text preprocessing latency
          2. Text encoder inference latency
          3. Text postprocessing latency
          4. Total text embedding latency
        """
        is_single = isinstance(text, str)
        text_list = [text] if is_single else text

        # 1. Preprocessing
        t_pre_start = time.perf_counter()
        inputs = self.processor(
            text=text_list,
            padding="max_length",
            truncation=True,
            max_length=64,
            return_tensors="pt",
        ).to(self.device)
        self._sync_cuda()
        t_pre = (time.perf_counter() - t_pre_start) * 1000.0

        # 2. Inference
        self._sync_cuda()
        t_inf_start = time.perf_counter()
        with torch.inference_mode():
            if hasattr(self.model, "get_text_features"):
                raw_features = self.model.get_text_features(**inputs)
            elif hasattr(self.model, "text_model"):
                out = self.model.text_model(**inputs)
                raw_features = out[1] if len(out) > 1 else out[0].mean(dim=1)
            else:
                out = self.model(**inputs)
                raw_features = getattr(out, "text_embeds", out[0])
            features = self._extract_pooler(raw_features)

        self._sync_cuda()
        t_inf = (time.perf_counter() - t_inf_start) * 1000.0

        # 3. Postprocessing
        t_post_start = time.perf_counter()
        norm_features = features / features.norm(p=2, dim=-1, keepdim=True)
        numpy_vector = norm_features.cpu().to(torch.float32).numpy()
        if is_single:
            numpy_vector = numpy_vector.reshape(-1)
        t_post = (time.perf_counter() - t_post_start) * 1000.0

        latency_breakdown = {
            "preprocessing_ms": round(t_pre, 2),
            "inference_ms": round(t_inf, 2),
            "postprocessing_ms": round(t_post, 2),
            "total_ms": round(t_pre + t_inf + t_post, 2),
        }

        return numpy_vector, latency_breakdown
