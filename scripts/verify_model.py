"""Model verification script.
Tests pretrained MoViNet-A0 on sample videos, validates class mappings,
measures latency per inference, and tests state maintenance.
"""
import os
import sys
import time
import cv2
import numpy as np
import tensorflow as tf

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "backend", "app", "models", "movinet", "model.tflite")
CAM01_PATH = os.path.join(BASE_DIR, "videos", "cam01.mp4")
CAM03_PATH = os.path.join(BASE_DIR, "videos", "cam03.mp4")

CLASSES = ["Fight", "No_Fight"]  # Index 0: Violence, Index 1: Normal

def load_detector(model_path: str):
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found: {model_path}")
    interpreter = tf.lite.Interpreter(model_path=model_path)
    runner = interpreter.get_signature_runner()
    input_details = runner.get_input_details()
    
    def get_initial_states():
        states = {
            name: tf.zeros(x['shape'], dtype=x['dtype'])
            for name, x in input_details.items()
        }
        if 'image' in states:
            del states['image']
        return states

    return runner, get_initial_states

def preprocess_frame(bgr_frame, target_size=(172, 172)):
    """Preprocess frame to [1, 1, 172, 172, 3] float32 in range [0, 1]."""
    rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
    h, w = rgb.shape[:2]
    # Pad to square then resize to target_size
    scale = target_size[0] / max(h, w)
    nh, nw = int(h * scale), int(w * scale)
    resized = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_LINEAR)
    padded = np.zeros((target_size[0], target_size[1], 3), dtype=np.float32)
    top = (target_size[0] - nh) // 2
    left = (target_size[1] - nw) // 2
    padded[top:top+nh, left:left+nw] = resized.astype(np.float32) / 255.0
    # Add batch and time dimensions: [1, 1, H, W, C]
    return tf.convert_to_tensor(padded[np.newaxis, np.newaxis, ...], dtype=tf.float32)

def run_video_verification(runner, init_states_fn, video_path, video_label, sample_fps=5):
    print(f"\n--- Testing Video: {video_label} ({os.path.basename(video_path)}) ---")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open {video_path}")
        return []

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_interval = max(1, int(round(src_fps / sample_fps)))
    
    states = init_states_fn()
    frame_idx = 0
    sampled_count = 0
    latencies = []
    probabilities = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_idx % frame_interval == 0:
            frame_tensor = preprocess_frame(frame)
            
            t0 = time.perf_counter()
            outputs = runner(**states, image=frame_tensor)
            logits = outputs.pop('logits')
            states = outputs
            t1 = time.perf_counter()
            latencies.append((t1 - t0) * 1000.0)
            
            probs = tf.nn.softmax(logits, axis=-1).numpy()[0]
            fight_prob = float(probs[0])
            no_fight_prob = float(probs[1])
            probabilities.append(fight_prob)
            
            pred_class = CLASSES[np.argmax(probs)]
            print(f"  Frame {sampled_count:02d} | Latency: {latencies[-1]:5.1f}ms | Fight (Violence): {fight_prob:.3f} | No_Fight: {no_fight_prob:.3f} => {pred_class}")
            sampled_count += 1
            
        frame_idx += 1

    cap.release()
    avg_latency = np.mean(latencies) if latencies else 0.0
    avg_violence = np.mean(probabilities) if probabilities else 0.0
    max_violence = np.max(probabilities) if probabilities else 0.0
    print(f"  Summary for {video_label}:")
    print(f"    Sampled Frames: {sampled_count}")
    print(f"    Avg Latency:    {avg_latency:.1f} ms ({1000.0 / avg_latency:.1f} FPS)")
    print(f"    Avg Violence P: {avg_violence:.3f}")
    print(f"    Max Violence P: {max_violence:.3f}")
    return probabilities

def main():
    print("=" * 60)
    print("PHASE 1: PRETRAINED MOVIET-A0 VIOLENCE MODEL VERIFICATION")
    print("=" * 60)
    
    runner, init_states_fn = load_detector(MODEL_PATH)
    print("[OK] Successfully loaded MoViNet-A0 TFLite streaming runner.")
    
    # 1. Test normal video
    norm_probs = run_video_verification(runner, init_states_fn, CAM01_PATH, "NORMAL FOOTAGE (cam01)")
    
    # 2. Test fight video
    fight_probs = run_video_verification(runner, init_states_fn, CAM03_PATH, "VIOLENCE FOOTAGE (cam03)")
    
    print("\n" + "=" * 60)
    print("VERIFICATION RESULTS:")
    normal_avg = np.mean(norm_probs) if norm_probs else 0
    fight_avg = np.mean(fight_probs) if fight_probs else 0
    print(f"Normal Footage (cam01) Avg Violence Probability:   {normal_avg:.3f}")
    print(f"Violence Footage (cam03) Avg Violence Probability: {fight_avg:.3f}")
    
    if fight_avg > normal_avg:
        print("[SUCCESS] Pretrained MoViNet-A0 correctly distinguishes violent vs non-violent activity!")
        print("Class mapping confirmed: index 0 = Fight (Violence), index 1 = No_Fight (Normal).")
    else:
        print("[WARNING] Unexpected probability distribution. Reviewing class mappings.")

if __name__ == "__main__":
    main()
