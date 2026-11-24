import pytest
from fastapi.testclient import TestClient

from crop_service import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def valid_payload():
    return {
        "N": 90,
        "P": 42,
        "K": 43,
        "temperature": 20.88,
        "humidity": 82.0,
        "ph": 6.5,
        "rainfall": 202.94,
    }


def test_health_reports_loaded_model(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["model_available"] is True


def test_model_info_returns_saved_pipeline_metadata(client):
    response = client.get("/model-info")
    assert response.status_code == 200
    body = response.json()
    assert body["model_type"] == "RandomForestClassifier"
    assert body["features"] == ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
    assert len(body["supported_crops"]) == 22
    assert body["original_row_split_accuracy"] == 1.0
    evaluation = body["dataset_level_evaluation"]
    assert evaluation["out_of_fold_accuracy"] == pytest.approx(0.9945454545)
    assert evaluation["source_independence_verified"] is False


def test_valid_prediction_uses_saved_model(client):
    response = client.post("/predict-crop", json=valid_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["recommended_crop"] in [item["crop"] for item in body["probabilities"]]
    assert 0 <= body["confidence"] <= 1
    assert len(body["probabilities"]) == 22
    assert body["model_type"] == "RandomForestClassifier"


def test_missing_feature_is_rejected(client):
    payload = valid_payload()
    del payload["rainfall"]
    response = client.post("/predict-crop", json=payload)
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("N", -1),
        ("P", 301),
        ("K", -1),
        ("temperature", 61),
        ("humidity", 101),
        ("ph", 15),
        ("rainfall", -1),
    ],
)
def test_out_of_range_feature_is_rejected(client, field, value):
    payload = valid_payload()
    payload[field] = value
    response = client.post("/predict-crop", json=payload)
    assert response.status_code == 422
