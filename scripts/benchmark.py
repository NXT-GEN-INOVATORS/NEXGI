"""Benchmark script measuring single-camera and 4-camera aggregate FPS, latency, CPU, and RAM."""
import os
import sys
import time
import psutil
import threading
import numpy as np
import cv2
import tensorflow as tf

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "backend", "app", "models", "movinet", "model.tflite")
VIDEOS = [
    os.path.join(BASE_DIR, "videos", "cam01.mp4"),
    os.path.join(BASE_DIR, "videos", "cam02.mp4"),
    os.path.join(BASE_DIR, "videos", "cam03.mp4"),
    os.path.join(BASE_DIR, "videos", "cam04.mp4"),
]

def run_worker_benchmark(worker_id: int, video_path: str, duration_sec: float, results: dict):
    interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)
    runner = interpreter.get_signature_runner()
    input_details = runner.get_input_details()

    states = {
        name: tf.zeros(x["shape"], dtype=x["dtype"])
        for name, x in input_details.items()
        if name != "image"
    }

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        results[worker_id] = {"fps": 0.0, "latency_ms": 0.0, "frames": 0}
        return

    frames_processed = 0
    latencies = []
    start_time = time.perf_counter()

    while time.perf_counter() - start_time < duration_sec:
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if not ret:
                break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        tensor = tf.image.resize_with_pad(tf.convert_to_tensor(rgb, dtype=tf.float32) / 255.0, 172, 172)
        clip = tensor[tf.newaxis, tf.newaxis, ...]

        t0 = time.perf_counter()
        outputs = runner(**states, image=clip)
        _ = outputs.pop("logits")[0]
        states = outputs
        t1 = time.perf_counter()

        latencies.append((t1 - t0) * 1000.0)
        frames_processed += 1

    total_time = time.perf_counter() - start_time
    cap.release()

    fps = frames_processed / total_time if total_time > 0 else 0
    avg_latency = np.mean(latencies) if latencies else 0.0
    results[worker_id] = {
        "fps": fps,
        "latency_ms": avg_latency,
        "frames": frames_processed,
    }

def main():
    print("=" * 60)
    print("4-CAMERA CONCURRENT INFERENCE BENCHMARK")
    print("=" * 60)
    duration = 5.0  # benchmark for 5 seconds

    proc = psutil.Process()
    initial_cpu = psutil.cpu_percent(interval=None)
    initial_ram = proc.memory_info().rss / (1024 ** 3)

    results = {}
    threads = []
    t_start = time.perf_counter()

    for idx, vid in enumerate(VIDEOS):
        t = threading.Thread(
            target=run_worker_benchmark,
            args=(idx + 1, vid, duration, results),
            daemon=True
        )
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    t_end = time.perf_counter()
    final_cpu = psutil.cpu_percent(interval=0.2)
    final_ram = proc.memory_info().rss / (1024 ** 3)

    total_fps = sum(res["fps"] for res in results.values())
    avg_lat = np.mean([res["latency_ms"] for res in results.values()])

    print(f"\nExecution Duration: {t_end - t_start:.2f} seconds")
    for worker_id, data in sorted(results.items()):
        print(f"CAM {worker_id}: {data['fps']:.1f} FPS (Latency: {data['latency_ms']:.1f} ms, Frames: {data['frames']})")

    print("-" * 60)
    print(f"Total inference throughput: {total_fps:.1f} FPS")
    print(f"Average latency:            {avg_lat:.1f} ms")
    print(f"System CPU Utilization:     {final_cpu:.1f}%")
    print(f"Process RAM Utilization:    {final_ram:.2f} GB")
    print("=" * 60)

if __name__ == "__main__":
    main()
