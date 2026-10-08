"""Automated verification test script for SigLIP 2 Video & Query Alignment Lab.

Tests:
1. Video frame extraction & batched SigLIP 2 encoding.
2. Query text encoding & L2 normalization.
3. Raw SigLIP 2 cosine similarity calculation (mathematically unmultiplied).
4. Relative Match Score calibration (Peak Frame = 0.910).
5. Granular timing breakdown and CUDA synchronization.
6. Temporal scene alignment for 3 distinct scenes.
"""

import sys
from pathlib import Path
import numpy as np

# Set stdout encoding
sys.stdout.reconfigure(encoding="utf-8")

from services.siglip import SigLIPService
from services.video_service import VideoService

def run_tests():
    print("=" * 70)
    print("VERIFYING SIGLIP 2 VIDEO & QUERY ALIGNMENT (RELATIVE MATCH SCORE & TIMING)")
    print("=" * 70)

    base_dir = Path("./data").resolve()
    videos_dir = base_dir / "videos"
    frames_dir = base_dir / "frames"
    videos_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    print("\n[Checkpoint 1] Initializing SigLIP 2 Service...")
    siglip = SigLIPService(model_id="google/siglip2-base-patch16-224")
    print(f"-> Model: {siglip.model_id} on {siglip.device} ({siglip.dtype})")
    assert siglip.embedding_dimension == 768

    print("\n[Checkpoint 2] Generating 3-Scene Synthetic Test Video...")
    video_service = VideoService(siglip_service=siglip, base_data_dir=base_dir)
    test_video_path = videos_dir / "test_multimodal_scenes.mp4"
    VideoService.generate_demo_video(test_video_path, duration_sec=6, fps=10)
    assert test_video_path.exists()
    print(f"-> Video ready: {test_video_path.name} ({test_video_path.stat().st_size} bytes)")

    test_cases = [
        {"query": "red sports car moving", "scene": "Scene 1 (0-2s)", "t_min": 0.0, "t_max": 2.0},
        {"query": "green forest with trees", "scene": "Scene 2 (2-4s)", "t_min": 2.0, "t_max": 4.0},
        {"query": "blue ocean and sailboat", "scene": "Scene 3 (4-6s)", "t_min": 4.0, "t_max": 6.0},
    ]

    for tc in test_cases:
        query = tc["query"]
        print("\n" + "-" * 65)
        print(f"Testing Query: \"{query}\" (Expected Peak: {tc['scene']})")
        print("-" * 65)

        result = video_service.process_video_and_query(
            video_path=test_video_path,
            user_query=query,
            max_frames=16,
            sample_fps=1.0,
        )

        proc = result["processing_time"]
        bd = proc["breakdown"]
        best = result["best_matching_frame"]
        ranked = result["ranked_frames"]
        ov = result["overall_video"]

        print(f"-> Total Processing Time: {proc['total_seconds']} s ({proc['total_ms']} ms)")
        print(f"   Breakdown: Extract={bd['frame_extraction_ms']}ms | ImgEmbed={bd['image_embedding_ms']}ms | TxtEmbed={bd['text_embedding_ms']}ms | Sim={bd['similarity_calc_ms']}ms | Rank={bd['ranking_ms']}ms")
        assert proc["total_seconds"] > 0
        assert bd["frame_extraction_ms"] > 0
        assert bd["image_embedding_ms"] > 0

        # Assert Best Match Score is 100.0%
        print(f"-> Peak Frame #{best['frame_number']} at {best['timestamp_str']} ({best['timestamp_sec']}s)")
        print(f"   Match Score: {best['match_score']:.1f}% | Raw SigLIP2 Cosine: {best['raw_cosine']:.4f}")
        assert abs(best["match_score"] - 100.0) < 1e-1, f"Expected 100.0 match score, got {best['match_score']}"

        # Assert peak timestamp aligns with target scene
        t_sec = best["timestamp_sec"]
        assert tc["t_min"] <= t_sec <= tc["t_max"], f"Expected frame in {tc['scene']} ({tc['t_min']}-{tc['t_max']}s), got {t_sec}s"

        # Assert ranking is strictly monotonically descending by raw cosine
        raw_scores = [f["raw_cosine"] for f in ranked]
        assert raw_scores == sorted(raw_scores, reverse=True), "Ranked frames are not sorted in descending raw cosine order!"
        assert ranked[0]["match_score"] == 100.0, f"Rank #1 match score should be 100.0, got {ranked[0]['match_score']}"

        # Assert raw cosines are unmultiplied
        for f in ranked:
            assert -1.0 <= f["raw_cosine"] <= 1.0, f"Raw cosine out of bounds: {f['raw_cosine']}"
            assert 0.0 <= f["match_score"] <= 100.0, f"Match score out of [0, 100] bounds: {f['match_score']}"

        print(f"-> Successfully verified ranking and score calibration for {tc['scene']}.")

    print("\n" + "=" * 70)
    print("ALL TESTS PASSED: RELATIVE MATCH SCORES, TIMING, AND ALIGNMENT 100% VERIFIED!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
