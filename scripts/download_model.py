"""Download script for MoViNet-A0 Violence Detection pretrained checkpoint and sample videos.
Target model: engares/MoViNet4Violence-Detection (MoViNet-A0 5-FPS checkpoint)
"""
import os
import sys
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKPOINT_DIR = os.path.join(
    BASE_DIR,
    "backend", "app", "models", "movinet", "checkpoints",
    "movinet_a0_5fps_32bs_0.001lr_0.2dr_2tl"
)
MODEL_DIR = os.path.join(BASE_DIR, "backend", "app", "models", "movinet")
VIDEOS_DIR = os.path.join(BASE_DIR, "videos")

HF_BASE_URL = "https://huggingface.co/engares/MoViNet4Violence-Detection/resolve/main/trained_models_dropout_autolr_trlayers_NoAug/movinet_a0_5fps_32bs_0.001lr_0.2dr_2tl"
GITHUB_RAW_BASE = "https://raw.githubusercontent.com/engares/MoViNets-for-Violence-Detection-in-Live-Video-Streaming/main"

HF_FILES = [
    "checkpoint",
    "movinet_a0_stream_wbm.index",
    "movinet_a0_stream_wbm.data-00000-of-00001",
]

SAMPLE_VIDEOS = {
    "cam01.mp4": f"{GITHUB_RAW_BASE}/example_videos/No_Fight_1.mp4",
    "cam02.mp4": f"{GITHUB_RAW_BASE}/example_videos/No_Fight_2.mp4",
    "cam03.mp4": f"{GITHUB_RAW_BASE}/example_videos/Fight_1.mp4",
    "cam04.mp4": f"{GITHUB_RAW_BASE}/example_videos/Fight_2.mp4",
}

def download_file(url: str, dest_path: str):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        print(f"  [OK] Exists: {os.path.basename(dest_path)} ({os.path.getsize(dest_path):,} bytes)")
        return
    print(f"  [..] Downloading {os.path.basename(dest_path)} from {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as response, open(dest_path, "wb") as out_file:
        total = 0
        chunk_size = 1024 * 64
        while True:
            chunk = response.read(chunk_size)
            if not chunk:
                break
            out_file.write(chunk)
            total += len(chunk)
    print(f"  [OK] Downloaded {os.path.basename(dest_path)} ({total:,} bytes)")

def download_movinet_checkpoint():
    print("\n--- 1. Downloading MoViNet-A0 Checkpoint from Hugging Face ---")
    for f in HF_FILES:
        url = f"{HF_BASE_URL}/{f}"
        dest = os.path.join(CHECKPOINT_DIR, f)
        download_file(url, dest)

def download_tflite_model():
    print("\n--- 2. Downloading exported model.tflite from official repo ---")
    url = f"{GITHUB_RAW_BASE}/model.tflite"
    dest = os.path.join(MODEL_DIR, "model.tflite")
    download_file(url, dest)

def download_sample_videos():
    print("\n--- 3. Downloading sample CCTV test videos into videos/ ---")
    for name, url in SAMPLE_VIDEOS.items():
        dest = os.path.join(VIDEOS_DIR, name)
        download_file(url, dest)

if __name__ == "__main__":
    print("Starting download of MoViNet-A0 checkpoint and test assets...")
    download_movinet_checkpoint()
    download_tflite_model()
    download_sample_videos()
    print("\n[OK] All model files and sample videos are ready!")
