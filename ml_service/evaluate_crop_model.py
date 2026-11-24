import json
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import StratifiedGroupKFold, train_test_split

from train_crop_model import DATA_PATH, FEATURES, MODEL_DIR, TARGET, validate_dataset


MODEL_PATH = MODEL_DIR / "crop_suitability.joblib"
REPORT_PATH = MODEL_DIR / "crop_suitability_report.json"
GROUPED_MATRIX_PATH = MODEL_DIR / "crop_suitability_grouped_confusion_matrix.png"
GROUP_SEED = 2026


def main() -> None:
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Trained model not found: {MODEL_PATH}")
    if not DATA_PATH.is_file():
        raise FileNotFoundError(f"Crop dataset not found: {DATA_PATH}")

    data = pd.read_csv(DATA_PATH)
    validate_dataset(data)
    features = data[FEATURES]
    target = data[TARGET]
    model = joblib.load(MODEL_PATH)

    if list(model.feature_names_in_) != FEATURES:
        raise ValueError("Saved model feature order does not match the evaluation feature order")

    _, X_remaining, _, y_remaining = train_test_split(
        features,
        target,
        test_size=0.30,
        random_state=42,
        stratify=target,
    )
    _, X_test, _, y_test = train_test_split(
        X_remaining,
        y_remaining,
        test_size=0.50,
        random_state=42,
        stratify=y_remaining,
    )
    row_split_accuracy = float(accuracy_score(y_test, model.predict(X_test)))

    groups = pd.factorize(pd.MultiIndex.from_frame(features), sort=False)[0]
    classes = [str(label) for label in model.named_steps["classifier"].classes_]
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=GROUP_SEED)
    out_of_fold_predictions = np.empty(len(data), dtype=object)
    fold_accuracies = []
    fold_sizes = []

    for train_indices, test_indices in splitter.split(features, target, groups):
        fold_model = clone(model)
        fold_model.fit(features.iloc[train_indices], target.iloc[train_indices])
        predictions = fold_model.predict(features.iloc[test_indices])
        out_of_fold_predictions[test_indices] = predictions
        fold_accuracies.append(float(accuracy_score(target.iloc[test_indices], predictions)))
        fold_sizes.append({
            "train": int(len(train_indices)),
            "test": int(len(test_indices)),
            "train_classes": int(target.iloc[train_indices].nunique()),
            "test_classes": int(target.iloc[test_indices].nunique()),
        })

    report = classification_report(
        target,
        out_of_fold_predictions,
        labels=classes,
        target_names=classes,
        output_dict=True,
        zero_division=0,
    )
    matrix = confusion_matrix(target, out_of_fold_predictions, labels=classes)
    unique_groups = int(len(np.unique(groups)))
    per_class = {
        label: report[label]
        for label in classes
    }
    off_diagonal = [
        {"actual": classes[actual], "predicted": classes[predicted], "count": int(matrix[actual, predicted])}
        for actual, predicted in zip(*np.where(matrix != np.diag(np.diag(matrix))))
    ]
    latest_evaluation = {
        "evaluation_only": True,
        "saved_model_modified": False,
        "scope": "Dataset-level evaluation only; not field-trial accuracy or real-world validation.",
        "original_row_split": {
            "accuracy": row_split_accuracy,
            "description": (
                "Re-evaluation of the existing serialized model on the seed-42 330-row test split. "
                "Rows were held out from fitting, but sample provenance is unavailable."
            ),
        },
        "five_fold_stratified_group_k_fold": {
            "grouping_key": "Exact feature vector across " + ", ".join(FEATURES) + ".",
            "unique_groups": unique_groups,
            "rows": int(len(data)),
            "duplicates_across_groups": 0,
            "train_rows_per_fold": fold_sizes[0]["train"],
            "test_rows_per_fold": fold_sizes[0]["test"],
            "classes_per_fold": {
                "train": fold_sizes[0]["train_classes"],
                "test": fold_sizes[0]["test_classes"],
            },
            "fold_sizes": fold_sizes,
            "random_state": GROUP_SEED,
            "fold_accuracies": fold_accuracies,
            "mean_fold_accuracy": float(np.mean(fold_accuracies)),
            "out_of_fold_accuracy": float(accuracy_score(target, out_of_fold_predictions)),
            "macro_avg": report["macro avg"],
            "weighted_avg": report["weighted avg"],
            "per_class": per_class,
            "confusion_matrix": {
                "labels": classes,
                "diagonal_correct_counts": {
                    label: int(matrix[index, index])
                    for index, label in enumerate(classes)
                },
                "off_diagonal_counts": off_diagonal,
            },
        },
        "method_notes": [
            "Grouping uses exact feature-vector equality because the source file has no sample or provenance identifiers.",
            (
                f"The {len(data)} rows contain {unique_groups} unique feature vectors. "
                "Exact-vector grouping does not establish independence of upstream samples."
            ),
            "Each fold uses a temporary clone of the saved pipeline; preprocessing is fitted only on that fold's training rows.",
            "The publisher describes the dataset as augmented/assembled from rainfall, climate and fertilizer data. The timing and provenance of that process are undocumented.",
        ],
        "limitations": [
            "No source IDs, farm/site, season, or collection-event metadata are available for source-grouped evaluation.",
            "An independent source-level or field-trial test set is absent; these results are not field-trial accuracy or real-world validation.",
            "High dataset-level scores may reflect the dataset's constructed class/feature patterns and do not establish agronomic performance on farms.",
        ],
    }

    existing_report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    existing_report["latest_verified_dataset_level_evaluation"] = latest_evaluation
    REPORT_PATH.write_text(json.dumps(existing_report, indent=2), encoding="utf-8")

    figure, axis = plt.subplots(figsize=(14, 14))
    ConfusionMatrixDisplay(
        confusion_matrix=matrix,
        display_labels=classes,
    ).plot(ax=axis, xticks_rotation=90, cmap="Blues", colorbar=False)
    axis.set_title("Crop Suitability — 5-fold StratifiedGroupKFold (dataset-level)")
    figure.tight_layout()
    figure.savefig(GROUPED_MATRIX_PATH, dpi=150)
    plt.close(figure)

    print(json.dumps({
        "saved_model_modified": False,
        "original_row_split_accuracy": row_split_accuracy,
        "grouped_out_of_fold_accuracy": latest_evaluation["five_fold_stratified_group_k_fold"]["out_of_fold_accuracy"],
        "fold_accuracies": fold_accuracies,
        "report": str(REPORT_PATH),
        "confusion_matrix": str(GROUPED_MATRIX_PATH),
    }, indent=2))


if __name__ == "__main__":
    main()
