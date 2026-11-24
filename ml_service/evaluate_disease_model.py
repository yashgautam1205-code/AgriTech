import json
import math
from pathlib import Path

import tensorflow as tf

from train_disease_model import IMAGE_SIZE, MODEL_DIR, evaluate, load_records, make_dataset


MODEL_PATH = MODEL_DIR / "plant_disease_mobilenetv2.keras"
LABELS_PATH = MODEL_DIR / "plant_disease_labels.json"
REPORT_PATH = MODEL_DIR / "plant_disease_evaluation.json"


def main() -> None:
    for path in (MODEL_PATH, LABELS_PATH, REPORT_PATH):
        if not path.is_file():
            raise FileNotFoundError(f"Required disease evaluation artifact not found: {path}")

    labels_metadata = json.loads(LABELS_PATH.read_text(encoding="utf-8"))
    records, classes = load_records()
    if labels_metadata.get("classes") != classes:
        raise ValueError("Saved model label map does not match the dataset class order")
    if labels_metadata.get("input_size") != list(IMAGE_SIZE):
        raise ValueError("Saved model input size does not match evaluation preprocessing")

    model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    if int(model.output_shape[-1]) != len(classes):
        raise ValueError("Saved model output count does not match the class labels")

    test_records = records["test"]
    metrics = evaluate(
        model,
        make_dataset(test_records, classes, training=False),
        test_records,
        classes,
    )
    saved_report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    expected_metrics = saved_report["independent_test_metrics"]
    summaries_match = all(
        math.isclose(metrics["accuracy"], expected_metrics["accuracy"], abs_tol=1e-7)
        and math.isclose(
            metrics["classification_report"][aggregate][metric],
            expected_metrics["classification_report"][aggregate][metric],
            abs_tol=1e-7,
        )
        for aggregate in ("macro avg", "weighted avg")
        for metric in ("precision", "recall", "f1-score")
    )
    if not summaries_match:
        raise AssertionError("Recomputed independent-test metrics do not match the saved report")

    print(json.dumps({
        "evaluation_scope": saved_report["evaluation_scope"],
        "test_images": len(test_records),
        "class_count": len(classes),
        "accuracy": metrics["accuracy"],
        "macro_avg": metrics["classification_report"]["macro avg"],
        "weighted_avg": metrics["classification_report"]["weighted avg"],
        "saved_report_matches_recomputed_metrics": summaries_match,
        "model_modified": False,
    }, indent=2))


if __name__ == "__main__":
    main()
