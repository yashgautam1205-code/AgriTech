from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "crop_suitability.joblib"
REPORT_PATH = ROOT / "models" / "crop_suitability_report.json"
FEATURE_ORDER = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]


class CropPredictionRequest(BaseModel):
    N: float = Field(..., ge=0, le=300, description="Nitrogen ratio in soil")
    P: float = Field(..., ge=0, le=300, description="Phosphorus ratio in soil")
    K: float = Field(..., ge=0, le=300, description="Potassium ratio in soil")
    temperature: float = Field(..., ge=-20, le=60, description="Temperature in Celsius")
    humidity: float = Field(..., ge=0, le=100, description="Relative humidity percentage")
    ph: float = Field(..., ge=0, le=14, description="Soil pH")
    rainfall: float = Field(..., ge=0, le=5000, description="Rainfall in millimeters")


class ModelState:
    def __init__(self) -> None:
        self.model = None
        self.report = None
        self.load_error: Optional[str] = None

    def load(self) -> None:
        try:
            self.model = joblib.load(MODEL_PATH)
            classifier = self.model.named_steps["classifier"]
            pipeline_features = list(self.model.feature_names_in_)
            if pipeline_features != FEATURE_ORDER:
                raise ValueError(
                    f"Saved pipeline feature order {pipeline_features} does not match {FEATURE_ORDER}"
                )
            if not hasattr(classifier, "predict_proba"):
                raise ValueError("Saved classifier does not support probability prediction")
            if REPORT_PATH.exists():
                import json

                self.report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
            self.load_error = None
        except Exception as exc:
            self.model = None
            self.report = None
            self.load_error = str(exc)


state = ModelState()
@asynccontextmanager
async def lifespan(application: FastAPI):
    state.load()
    yield


app = FastAPI(
    title="AgriTech ML Service",
    version="1.0",
    description="Crop suitability inference using the serialized RandomForest pipeline.",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    model_available = state.model is not None
    return {
        "status": "ok" if model_available else "degraded",
        "model_available": model_available,
        "detail": "Model loaded" if model_available else "Model unavailable",
    }


@app.get("/model-info")
def model_info():
    if state.model is None:
        raise HTTPException(status_code=503, detail="Crop model is unavailable")

    classifier = state.model.named_steps["classifier"]
    crops = [str(crop) for crop in classifier.classes_.tolist()]
    latest_evaluation = (
        (state.report or {})
        .get("latest_verified_dataset_level_evaluation", {})
        .get("five_fold_stratified_group_k_fold", {})
    )

    return {
        "model_type": type(classifier).__name__,
        "model_version": "1.0",
        "features": FEATURE_ORDER,
        "supported_crops": crops,
        "original_row_split_accuracy": (
            (state.report or {}).get("independent_test", {}).get("accuracy")
        ),
        "dataset_level_evaluation": {
            "method": "five-fold StratifiedGroupKFold grouped by exact feature vector",
            "out_of_fold_accuracy": latest_evaluation.get("out_of_fold_accuracy"),
            "macro_avg": latest_evaluation.get("macro_avg"),
            "weighted_avg": latest_evaluation.get("weighted_avg"),
            "fold_accuracies": latest_evaluation.get("fold_accuracies"),
            "source_independence_verified": False,
        },
        "probability_output": True,
        "limitations": (
            state.report or {}
        ).get("limitations", []),
    }


@app.post("/predict-crop")
def predict_crop(payload: CropPredictionRequest):
    if state.model is None:
        raise HTTPException(status_code=503, detail="Crop model is unavailable")

    values = {
        "N": payload.N,
        "P": payload.P,
        "K": payload.K,
        "temperature": payload.temperature,
        "humidity": payload.humidity,
        "ph": payload.ph,
        "rainfall": payload.rainfall,
    }
    frame = pd.DataFrame([[values[feature] for feature in FEATURE_ORDER]], columns=FEATURE_ORDER)

    try:
        predicted_crop = str(state.model.predict(frame)[0])
        probabilities = state.model.predict_proba(frame)[0]
        classes = [str(crop) for crop in state.model.named_steps["classifier"].classes_.tolist()]
        ranking = sorted(
            (
                {"crop": crop, "probability": round(float(probability), 6)}
                for crop, probability in zip(classes, probabilities)
            ),
            key=lambda item: item["probability"],
            reverse=True,
        )
        return {
            "recommended_crop": predicted_crop,
            "confidence": next(
                item["probability"] for item in ranking if item["crop"] == predicted_crop
            ),
            "probabilities": ranking,
            "input_features": values,
            "feature_order": FEATURE_ORDER,
            "model_type": type(state.model.named_steps["classifier"]).__name__,
            "model_version": "1.0",
            "metadata": {
                "dataset": "Crop Recommendation Dataset",
                "license": "Apache 2.0",
                "prediction_type": "model-based suitability",
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Prediction failed: {type(exc).__name__}") from exc
