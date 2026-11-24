import io
import json
import logging
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
IMAGE_SIZE = (160, 160)
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MIN_IMAGE_SIDE = 64
MAX_IMAGE_PIXELS = 40_000_000
CONFIDENCE_THRESHOLD = float(os.getenv("DISEASE_CONFIDENCE_THRESHOLD", "0.60"))


class DiseaseModelState:
    def __init__(self):
        self.model = None
        self.classes = []
        self.load_error: Optional[str] = None

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
        "confidence_threshold": CONFIDENCE_THRESHOLD,
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

    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(status_code=415, detail="Use a JPEG, PNG, or WebP image")
            width, height = image.size
            if min(width, height) < MIN_IMAGE_SIDE:
                raise HTTPException(status_code=422, detail="Image must be at least 64 by 64 pixels")
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image dimensions are too large")
            image.load()
            return np.asarray(image.convert("RGB"))
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=415, detail="Uploaded file is not a valid supported image") from exc


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
        scores = outputs[0]
        if len(scores) != len(state.classes) or not np.isfinite(scores).all():
            raise ValueError("Invalid classifier output")
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Disease inference failed") from exc

    ranking = np.argsort(scores)[::-1][:5]
    top_index = int(ranking[0])
    confidence = float(scores[top_index])
    class_name = state.classes[top_index]
    crop, disease = class_name.split("___", 1)
    certain = confidence >= CONFIDENCE_THRESHOLD
    return {
        "status": "prediction" if certain else "uncertain",
        "prediction": class_name if certain else None,
        "top_prediction": class_name,
        "crop": crop,
        "disease": disease.replace("_", " "),
        "class_name": class_name,
        "confidence": confidence,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "top_predictions": [
            {"class_name": state.classes[int(index)], "probability": float(scores[index])}
            for index in ranking
        ],
        "supported_class_count": len(state.classes),
        "model_type": "MobileNetV2",
        "model_version": "1.0",
        "caveat": "PlantVillage images are controlled-background images; predictions on field photos may be unreliable.",
    }
