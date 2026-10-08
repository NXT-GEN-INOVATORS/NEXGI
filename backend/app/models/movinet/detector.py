"""MoViNet-A0 Violence Detection model runner.
Uses pretrained MoViNet-A0 5-FPS streaming model.
Class mapping:
  Index 0: Fight (Violence)
  Index 1: No_Fight (Normal)
"""
import os
import cv2
import numpy as np
import tensorflow as tf
from typing import Dict, Any, Tuple

CLASSES = ["Fight", "No_Fight"]

class MoViNetDetector:
    def __init__(self, model_path: str):
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"MoViNet-A0 model not found at {model_path}")
        self.model_path = model_path
        self.interpreter = tf.lite.Interpreter(model_path=model_path)
        self.runner = self.interpreter.get_signature_runner()
        self.input_details = self.runner.get_input_details()

    def create_initial_states(self) -> Dict[str, tf.Tensor]:
        """Creates empty zero states matching the MoViNet streaming signature."""
        states = {
            name: tf.zeros(x["shape"], dtype=x["dtype"])
            for name, x in self.input_details.items()
        }
        if "image" in states:
            del states["image"]
        return states

    def preprocess_frame(self, bgr_frame: np.ndarray, target_size: Tuple[int, int] = (172, 172)) -> tf.Tensor:
        """
        Pad and resize BGR frame to [1, 1, 172, 172, 3] float32 in range [0, 1].
        Matches author's preprocessing from MoViNet streaming pipeline.
        """
        rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        tensor = tf.convert_to_tensor(rgb, dtype=tf.float32) / 255.0
        tensor = tf.image.resize_with_pad(tensor, target_size[0], target_size[1])
        # Add batch and time dimensions: [1, 1, H, W, C]
        return tensor[tf.newaxis, tf.newaxis, ...]

    def predict_frame(self, states: Dict[str, tf.Tensor], frame_tensor: tf.Tensor) -> Tuple[Dict[str, tf.Tensor], float, float]:
        """
        Runs streaming inference on a single frame.
        Returns:
            updated_states, violence_probability, normal_probability
        """
        outputs = self.runner(**states, image=frame_tensor)
        logits = outputs.pop("logits")[0]
        updated_states = outputs
        probs = tf.nn.softmax(logits, axis=-1).numpy()
        violence_prob = float(probs[0])
        normal_prob = float(probs[1])
        return updated_states, violence_prob, normal_prob
