import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "crop" / "Crop_recommendation.csv"
MODEL_DIR = ROOT / "models"
FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
TARGET = "label"


def validate_dataset(data: pd.DataFrame) -> None:
    missing = set(FEATURES + [TARGET]) - set(data.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")
    if data[list(FEATURES)].isna().any().any():
        raise ValueError("Dataset contains missing feature values")
    if data[TARGET].isna().any():
        raise ValueError("Dataset contains missing crop labels")

    constraints = {
        "N": (0, 300),
        "P": (0, 300),
        "K": (0, 300),
        "temperature": (-20, 60),
        "humidity": (0, 100),
        "ph": (0, 14),
        "rainfall": (0, 5000),
    }
    for feature, (minimum, maximum) in constraints.items():
        invalid = data[(data[feature] < minimum) | (data[feature] > maximum)]
        if not invalid.empty:
            raise ValueError(
                f"{feature} contains {len(invalid)} values outside "
                f"documented range [{minimum}, {maximum}]"
            )


def train() -> dict:
    data = pd.read_csv(DATA_PATH)
    validate_dataset(data)

    X = data[FEATURES]
    y = data[TARGET]

    X_train, X_remaining, y_train, y_remaining = train_test_split(
        X,
        y,
        test_size=0.30,
        random_state=42,
        stratify=y,
    )
    X_validation, X_test, y_validation, y_test = train_test_split(
        X_remaining,
        y_remaining,
        test_size=0.50,
        random_state=42,
        stratify=y_remaining,
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("scaled_numeric", StandardScaler(), FEATURES),
        ]
    )
    model = Pipeline(
        steps=[
            ("preprocess", preprocessor),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=300,
                    random_state=42,
                    class_weight="balanced",
                    n_jobs=-1,
                ),
            ),
        ]
    )

    model.fit(X_train, y_train)

    validation_predictions = model.predict(X_validation)
    validation_report = classification_report(
        y_validation,
        validation_predictions,
        output_dict=True,
        zero_division=0,
    )

    test_predictions = model.predict(X_test)
    test_report = classification_report(
        y_test,
        test_predictions,
        output_dict=True,
        zero_division=0,
    )

    class_distribution = y.value_counts().sort_index().to_dict()
    report = {
        "model": "RandomForestClassifier",
        "dataset": str(DATA_PATH.relative_to(ROOT.parent)),
        "dataset_license": "Apache 2.0",
        "dataset_rows": int(len(data)),
        "class_distribution": class_distribution,
        "features": FEATURES,
        "target": TARGET,
        "split": {
            "train": int(len(X_train)),
            "validation": int(len(X_validation)),
            "independent_test": int(len(X_test)),
            "random_seed": 42,
            "stratified": True,
        },
        "validation": {
            "accuracy": float(accuracy_score(y_validation, validation_predictions)),
        },
        "independent_test": {
            "accuracy": float(accuracy_score(y_test, test_predictions)),
            "classification_report": test_report,
        },
        "limitations": [
            "The dataset is an augmented tabular India-focused collection, not a live field trial.",
            "Weather and soil results from outside the training data may be out of distribution.",
            "The model predicts suitability from a fixed feature set and cannot replace agronomist judgment.",
        ],
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_DIR / "crop_suitability.joblib")
    (MODEL_DIR / "crop_suitability_report.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )

    fig, ax = plt.subplots(figsize=(14, 14))
    ConfusionMatrixDisplay.from_predictions(
        y_test,
        test_predictions,
        xticks_rotation=90,
        ax=ax,
        cmap="Blues",
        colorbar=False,
    )
    ax.set_title("Crop Suitability - Independent Test Confusion Matrix")
    fig.tight_layout()
    fig.savefig(MODEL_DIR / "crop_suitability_confusion_matrix.png", dpi=150)
    plt.close(fig)

    return report


if __name__ == "__main__":
    result = train()
    print(
        json.dumps(
            {
                "dataset_rows": result["dataset_rows"],
                "split": result["split"],
                "independent_test_accuracy": result["independent_test"]["accuracy"],
            },
            indent=2,
        )
    )
