import io
import hashlib
import json
import logging
import math
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import numpy as np
import tensorflow as tf
from fastapi import FastAPI, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "plant_disease_mobilenetv2.keras"
LABELS_PATH = ROOT / "models" / "plant_disease_labels.json"
CALIBRATION_PATH = ROOT / "models" / "plant_disease_calibration.json"
IMAGE_SIZE = (160, 160)
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MIN_IMAGE_SIDE = 64
MAX_IMAGE_PIXELS = 40_000_000
DEFAULT_CONFIDENCE_THRESHOLD = 0.60


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as model_file:
        for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def decode_image_bytes(image_bytes: bytes) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(status_code=415, detail="Use a JPEG, PNG, or WebP image")
            width, height = image.size
            if min(width, height) < MIN_IMAGE_SIDE:
                raise HTTPException(status_code=422, detail="Image must be at least 64 by 64 pixels")
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image dimensions are too large")
        return tf.io.decode_image(
            image_bytes,
            channels=3,
            expand_animations=False,
        ).numpy()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, tf.errors.InvalidArgumentError) as exc:
        raise HTTPException(status_code=415, detail="Uploaded file is not a valid supported image") from exc


def calibrated_probabilities(probabilities: np.ndarray, temperature: float) -> np.ndarray:
    clipped = np.clip(probabilities, 1e-7, 1.0)
    logits = np.log(clipped) / temperature
    logits -= logits.max(axis=1, keepdims=True)
    scaled = np.exp(logits)
    return scaled / scaled.sum(axis=1, keepdims=True)


class DiseaseModelState:
    def __init__(self):
        self.model = None
        self.classes = []
        self.load_error: Optional[str] = None
        self.temperature = 1.0
        self.confidence_threshold = DEFAULT_CONFIDENCE_THRESHOLD
        self.calibration_status = "unavailable"
        self.threshold_source = "default_heuristic"

    def load_calibration(self):
        self.temperature = 1.0
        self.calibration_status = "unavailable"
        self.threshold_source = "default_heuristic"
        try:
            calibration = json.loads(CALIBRATION_PATH.read_text(encoding="utf-8"))
            temperature = float(calibration["temperature"])
            if (
                calibration.get("status") != "evaluated"
                or calibration.get("model_sha256") != file_sha256(MODEL_PATH)
                or calibration.get("labels_sha256") != file_sha256(LABELS_PATH)
                or not math.isfinite(temperature)
                or not 0.0 < temperature <= 20.0
            ):
                raise ValueError("Calibration metadata is missing, invalid, or belongs to another model")

            threshold = calibration.get("confidence_threshold", {})
            selected_threshold = threshold.get("value")
            if (
                threshold.get("status") == "selected"
                and isinstance(selected_threshold, (int, float))
                and math.isfinite(selected_threshold)
                and 0.0 <= selected_threshold <= 1.0
            ):
                self.confidence_threshold = float(selected_threshold)
                self.threshold_source = "grouped_validation"
            self.temperature = temperature
            self.calibration_status = "applied"
        except (FileNotFoundError, KeyError, TypeError, ValueError, OSError) as exc:
            logging.warning("Disease confidence calibration unavailable: %s", exc)

        configured_threshold = os.getenv("DISEASE_CONFIDENCE_THRESHOLD")
        if configured_threshold is not None:
            try:
                threshold_value = float(configured_threshold)
            except ValueError as exc:
                raise ValueError("DISEASE_CONFIDENCE_THRESHOLD must be a number from 0 to 1") from exc
            if not math.isfinite(threshold_value) or not 0.0 <= threshold_value <= 1.0:
                raise ValueError("DISEASE_CONFIDENCE_THRESHOLD must be a number from 0 to 1")
            self.confidence_threshold = threshold_value
            self.threshold_source = "environment_override"

    def load(self):
        try:
            metadata = json.loads(LABELS_PATH.read_text(encoding="utf-8"))
            classes = metadata["classes"]
            if (
                len(classes) != 38
                or len(set(classes)) != len(classes)
                or any(not isinstance(label, str) or "___" not in label for label in classes)
            ):
                raise ValueError("Expected 38 unique disease class labels")
            model = tf.keras.models.load_model(MODEL_PATH, compile=False)
            if int(model.output_shape[-1]) != len(classes):
                raise ValueError("Model output count does not match the label map")
            if tuple(model.input_shape[1:]) != (*IMAGE_SIZE, 3):
                raise ValueError("Model input size does not match the inference preprocessing")
            self.model = model
            self.classes = classes
            self.load_calibration()
            self.load_error = None
        except Exception as exc:
            self.model = None
            self.classes = []
            self.load_error = str(exc)
            logging.exception("Could not load the plant disease model")


state = DiseaseModelState()


@asynccontextmanager
async def lifespan(application: FastAPI):
    state.load()
    yield


app = FastAPI(
    title="AgriTech Plant Disease Inference",
    version="1.0",
    description="MobileNetV2 image classifier trained on PlantVillage classes.",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    available = state.model is not None
    return {
        "status": "ok" if available else "degraded",
        "model_available": available,
        "detail": "Disease model loaded" if available else "Disease model unavailable",
    }


@app.get("/model-info")
def model_info():
    if state.model is None:
        raise HTTPException(status_code=503, detail="Disease model is unavailable")
    return {
        "model_type": "MobileNetV2",
        "model_version": "1.0",
        "input_size": list(IMAGE_SIZE),
        "supported_classes": state.classes,
        "confidence_threshold": state.confidence_threshold,
        "confidence_threshold_scale": "raw_softmax",
        "confidence_threshold_source": state.threshold_source,
        "calibration_status": state.calibration_status,
        "calibration_method": "temperature scaling" if state.calibration_status == "applied" else None,
        "dataset": "PlantVillage",
        "prediction_scope": "Closed-set image classification; field performance is unverified.",
    }


async def decode_upload(request: Request) -> np.ndarray:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid content length") from exc
    image_bytes = await request.body()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image data is required")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit")

    return decode_image_bytes(image_bytes)


@app.post("/predict-disease")
async def predict_disease(request: Request):
    if state.model is None:
        raise HTTPException(status_code=503, detail="Disease model is unavailable")
    image = await decode_upload(request)
    batch = tf.image.resize(image, IMAGE_SIZE).numpy()
    batch = tf.keras.applications.mobilenet_v2.preprocess_input(batch)
    try:
        outputs = await run_in_threadpool(
            state.model.predict,
            np.expand_dims(batch, axis=0),
            verbose=0,
        )
        if outputs.ndim != 2 or outputs.shape[0] != 1 or outputs.shape[1] != len(state.classes):
            raise ValueError("Classifier output shape does not match one image and 38 classes")
        scores = outputs[0]
        if (
            not np.isfinite(scores).all()
            or np.any(scores < 0.0)
            or np.any(scores > 1.0)
            or not np.isclose(scores.sum(), 1.0, rtol=1e-5, atol=1e-5)
        ):
            raise ValueError("Invalid classifier output")
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Disease inference failed") from exc

    ranking = np.argsort(scores)[::-1][:5]
    top_index = int(ranking[0])
    confidence = float(scores[top_index])
    calibrated_scores = calibrated_probabilities(
        np.expand_dims(scores, axis=0),
        state.temperature,
    )[0]
    calibrated_confidence = float(calibrated_scores[top_index])
    class_name = state.classes[top_index]
    crop, disease = class_name.split("___", 1)
    certain = confidence >= state.confidence_threshold
    return {
        "status": "prediction" if certain else "uncertain",
        "prediction_status": "CONFIRMED_BY_MODEL" if certain else "UNCERTAIN",
        "prediction": class_name if certain else None,
        "top_prediction": class_name,
        "crop": crop,
        "disease": disease.replace("_", " "),
        "class_name": class_name,
        "confidence": confidence,
        "raw_confidence": confidence,
        "calibrated_confidence": calibrated_confidence if state.calibration_status == "applied" else None,
        "confidence_threshold": state.confidence_threshold,
        "confidence_threshold_scale": "raw_softmax",
        "calibration_status": state.calibration_status,
        "confidence_threshold_source": state.threshold_source,
        "top_predictions": [
            {
                "class_name": state.classes[int(index)],
                "probability": float(scores[index]),
                "calibrated_probability": float(calibrated_scores[index])
                    if state.calibration_status == "applied" else None
            }
            for index in ranking
        ],
        "supported_class_count": len(state.classes),
        "model_type": "MobileNetV2",
        "model_version": "1.0",
        "caveat": "PlantVillage images are controlled-background images; predictions on field photos may be unreliable.",
    }
