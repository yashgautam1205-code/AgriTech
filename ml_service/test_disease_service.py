import io
import json
from pathlib import Path

import numpy as np
import pytest
import tensorflow as tf
from fastapi.testclient import TestClient
from PIL import Image

import disease_service
from disease_service import IMAGE_SIZE, app, decode_image_bytes, state


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def image_bytes(width=160, height=160):
    image = Image.new("RGB", (width, height), color=(60, 120, 40))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def test_health_and_class_map_after_startup(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["model_available"] is True
    model_info = client.get("/model-info").json()
    assert len(model_info["supported_classes"]) == 38
    assert 0.0 <= model_info["confidence_threshold"] <= 1.0
    assert model_info["calibration_status"] in {"applied", "unavailable"}


def test_actual_test_image_inference(client):
    test_paths = Path("data/plantvillage/color_test.txt").read_text(encoding="utf-8").splitlines()
    image_path = Path("data/plantvillage/images").joinpath(*test_paths[0].split("/"))
    response = client.post(
        "/predict-disease",
        content=image_path.read_bytes(),
        headers={"content-type": "image/jpeg"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["class_name"] in state.classes
    assert 0.0 <= body["confidence"] <= 1.0
    assert body["raw_confidence"] == body["confidence"]
    assert body["prediction_status"] in {"CONFIRMED_BY_MODEL", "UNCERTAIN"}
    assert len(body["top_predictions"]) == 5
    if body["calibration_status"] == "applied":
        assert 0.0 <= body["calibrated_confidence"] <= 1.0
        assert body["top_predictions"][0]["calibrated_probability"] == body["calibrated_confidence"]
    else:
        assert body["calibrated_confidence"] is None


def test_serving_preprocessing_matches_training_pipeline():
    test_paths = Path("data/plantvillage/color_test.txt").read_text(encoding="utf-8").splitlines()
    image_path = Path("data/plantvillage/images").joinpath(*test_paths[0].split("/"))
    image_bytes = image_path.read_bytes()

    served_image = decode_image_bytes(image_bytes)
    training_image = tf.io.decode_image(
        image_bytes,
        channels=3,
        expand_animations=False,
    ).numpy()
    np.testing.assert_array_equal(served_image, training_image)

    served_preprocessing = tf.keras.applications.mobilenet_v2.preprocess_input(
        tf.image.resize(served_image, IMAGE_SIZE)
    ).numpy()
    training_preprocessing = tf.keras.applications.mobilenet_v2.preprocess_input(
        tf.image.resize(training_image, IMAGE_SIZE)
    ).numpy()
    np.testing.assert_array_equal(served_preprocessing, training_preprocessing)


def test_non_image_upload_is_rejected(client):
    response = client.post(
        "/predict-disease",
        content=b"not an image",
        headers={"content-type": "image/jpeg"},
    )
    assert response.status_code == 415


def test_too_small_image_is_rejected(client):
    response = client.post(
        "/predict-disease",
        content=image_bytes(32, 32),
        headers={"content-type": "image/jpeg"},
    )
    assert response.status_code == 422


def test_uncertain_prediction_does_not_force_class(monkeypatch, client):
    class LowConfidenceModel:
        def predict(self, batch, verbose=0):
            scores = np.zeros(38, dtype=np.float32)
            scores[0] = 0.2
            scores[1:] = 0.8 / 37
            return np.asarray([scores])

    monkeypatch.setattr(state, "model", LowConfidenceModel())
    response = client.post(
        "/predict-disease",
        content=image_bytes(),
        headers={"content-type": "image/jpeg"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "uncertain"
    assert response.json()["prediction_status"] == "UNCERTAIN"
    assert response.json()["prediction"] is None


def test_43_percent_raw_score_stays_uncertain_below_the_validation_cutoff(monkeypatch, client):
    class FortyThreePercentModel:
        def predict(self, batch, verbose=0):
            scores = np.full(38, (1.0 - 0.434) / 37, dtype=np.float32)
            scores[0] = 0.434
            return np.asarray([scores])

    monkeypatch.setattr(state, "model", FortyThreePercentModel())
    response = client.post(
        "/predict-disease",
        content=image_bytes(),
        headers={"content-type": "image/jpeg"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["confidence_threshold"] >= 0.60
    assert body["raw_confidence"] < body["confidence_threshold"]
    assert body["status"] == "uncertain"
    assert body["prediction"] is None
