import io
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import disease_service
from disease_service import app, state


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
    assert len(client.get("/model-info").json()["supported_classes"]) == 38


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
    assert len(body["top_predictions"]) == 5


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
    assert response.json()["prediction"] is None
