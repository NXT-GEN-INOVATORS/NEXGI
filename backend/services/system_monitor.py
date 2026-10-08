"""System and hardware resource monitoring service.

Monitors CPU, RAM, and NVIDIA GPU telemetry (via nvidia-smi and torch.cuda).
Handles graceful fallback if GPU/nvidia-smi is unavailable.
"""

from typing import Any, Dict
import subprocess
import psutil

try:
    import torch
except ImportError:
    torch = None


class SystemMonitor:
    """Provides local hardware resource telemetry without external dependencies."""

    @staticmethod
    def get_gpu_telemetry() -> Dict[str, Any]:
        """Fetch GPU information via nvidia-smi, with torch.cuda fallback, or graceful error."""
        # Method 1: Try nvidia-smi CLI
        try:
            cmd = [
                "nvidia-smi",
                "--query-gpu=gpu_name,memory.total,memory.used,memory.free,utilization.gpu",
                "--format=csv,noheader,nounits",
            ]
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
                timeout=1.5,
            )
            if result.returncode == 0 and result.stdout.strip():
                parts = [p.strip() for p in result.stdout.strip().split(",")]
                if len(parts) >= 5:
                    name = parts[0]
                    total_mb = float(parts[1])
                    used_mb = float(parts[2])
                    free_mb = float(parts[3])
                    util_pct = float(parts[4])
                    return {
                        "available": True,
                        "name": name,
                        "vram_total_mb": round(total_mb, 1),
                        "vram_used_mb": round(used_mb, 1),
                        "vram_free_mb": round(free_mb, 1),
                        "vram_percent": round((used_mb / total_mb) * 100, 1) if total_mb > 0 else 0.0,
                        "gpu_util_percent": round(util_pct, 1),
                        "source": "nvidia-smi",
                    }
        except Exception:
            pass

        # Method 2: Fallback to torch.cuda if available
        if torch is not None and torch.cuda.is_available():
            try:
                name = torch.cuda.get_device_name(0)
                device_props = torch.cuda.get_device_properties(0)
                total_mb = device_props.total_memory / (1024 * 1024)
                used_mb = torch.cuda.memory_allocated(0) / (1024 * 1024)
                free_mb = total_mb - used_mb
                return {
                    "available": True,
                    "name": name,
                    "vram_total_mb": round(total_mb, 1),
                    "vram_used_mb": round(used_mb, 1),
                    "vram_free_mb": round(free_mb, 1),
                    "vram_percent": round((used_mb / total_mb) * 100, 1) if total_mb > 0 else 0.0,
                    "gpu_util_percent": 0.0,
                    "source": "torch.cuda",
                }
            except Exception:
                pass

        # Method 3: Graceful fallback
        return {
            "available": False,
            "name": "GPU telemetry unavailable",
            "vram_total_mb": 0.0,
            "vram_used_mb": 0.0,
            "vram_free_mb": 0.0,
            "vram_percent": 0.0,
            "gpu_util_percent": 0.0,
            "source": "none",
        }

    @classmethod
    def get_metrics(cls) -> Dict[str, Any]:
        """Aggregate CPU, RAM, and GPU telemetry."""
        cpu_pct = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        gpu_info = cls.get_gpu_telemetry()

        return {
            "cpu_percent": round(cpu_pct, 1),
            "ram_used_mb": round(mem.used / (1024 * 1024), 1),
            "ram_total_mb": round(mem.total / (1024 * 1024), 1),
            "ram_percent": round(mem.percent, 1),
            "gpu": gpu_info,
        }
