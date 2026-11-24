import json
import hashlib
from collections import Counter
from pathlib import Path

import numpy as np
import tensorflow as tf
from scipy.optimize import minimize_scalar
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import classification_report, confusion_matrix

from train_disease_model import (
    IMAGE_SIZE,
    MODEL_DIR,
    cap_per_class,
    grouped_train_validation_split,
    is_fallback_leaf_id,
    load_records,
    make_dataset,
)


MODEL_PATH = MODEL_DIR / "plant_disease_mobilenetv2.keras"
LABELS_PATH = MODEL_DIR / "plant_disease_labels.json"
REPORT_PATH = MODEL_DIR / "plant_disease_evaluation.json"
SPLIT_REPORT_PATH = MODEL_DIR / "plant_disease_split_report.json"


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as image_file:
        for chunk in iter(lambda: image_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probability_scores(model, records, classes):
    metrics_dataset = make_dataset(records, classes, training=False)
    probabilities = model.predict(metrics_dataset, verbose=0)
    return np.asarray(probabilities, dtype=np.float64)


def apply_temperature(probabilities, temperature):
    clipped = np.clip(probabilities, 1e-7, 1.0)
    log_probabilities = np.log(clipped) / temperature
    log_probabilities -= log_probabilities.max(axis=1, keepdims=True)
    scaled = np.exp(log_probabilities)
    return scaled / scaled.sum(axis=1, keepdims=True)


def temperature_scale(probabilities, truth):
    def objective(temperature):
        scaled = apply_temperature(probabilities, float(temperature))
        selected = scaled[np.arange(len(truth)), truth]
        return float(-np.log(np.clip(selected, 1e-7, 1.0)).mean())

    result = minimize_scalar(objective, bounds=(0.05, 20.0), method="bounded")
    if not result.success:
        raise RuntimeError("Temperature calibration fitting failed")
    return float(result.x)


def calibration_metrics(probabilities, truth, bins=10):
    confidences = probabilities.max(axis=1)
    predictions = probabilities.argmax(axis=1)
    correctness = predictions == truth
    edges = np.linspace(0.0, 1.0, bins + 1)
    reliability = []
    ece = 0.0
    for low, high in zip(edges[:-1], edges[1:]):
        in_bin = (confidences > low) & (confidences <= high)
        count = int(in_bin.sum())
        if count:
            confidence = float(confidences[in_bin].mean())
            accuracy = float(correctness[in_bin].mean())
            weight = count / len(truth)
            ece += weight * abs(accuracy - confidence)
            reliability.append({
                "lower": float(low),
                "upper": float(high),
                "count": count,
                "accuracy": accuracy,
                "confidence": confidence,
            })
        else:
            reliability.append({
                "lower": float(low),
                "upper": float(high),
                "count": 0,
                "accuracy": None,
                "confidence": None,
            })
    return {
        "ece": float(ece),
        "bins": reliability,
    }


def multiclass_brier_score(probabilities, truth):
    targets = np.eye(probabilities.shape[1], dtype=np.float64)[truth]
    return float(np.mean(np.sum((probabilities - targets) ** 2, axis=1)))


def select_confidence_threshold(
    probabilities,
    truth,
    minimum_precision=0.95,
    minimum_coverage=0.50,
    minimum_threshold=0.60
):
    confidences = probabilities.max(axis=1)
    predictions = probabilities.argmax(axis=1)
    correct = predictions == truth
    valid_thresholds = []
    for threshold in np.unique(confidences):
        if threshold < minimum_threshold:
            continue
        accepted = confidences >= threshold
        coverage = float(accepted.mean())
        precision = float(correct[accepted].mean()) if accepted.any() else 0.0
        if coverage >= minimum_coverage and precision >= minimum_precision:
            valid_thresholds.append((float(threshold), precision, coverage))
    if not valid_thresholds:
        return {
            "status": "not_selected",
            "value": None,
            "minimum_validation_precision": minimum_precision,
            "minimum_validation_coverage": minimum_coverage,
            "minimum_raw_confidence": minimum_threshold,
            "validation_precision": None,
            "validation_coverage": None,
            "method": "no threshold met the validation precision and coverage criteria"
        }
    threshold, precision, coverage = min(valid_thresholds, key=lambda row: row[0])
    return {
        "status": "selected",
        "value": threshold,
        "minimum_validation_precision": minimum_precision,
        "minimum_validation_coverage": minimum_coverage,
        "minimum_raw_confidence": minimum_threshold,
        "validation_precision": precision,
        "validation_coverage": coverage,
        "method": "lowest raw softmax confidence at least 0.60 with at least 95% validation top-1 precision and 50% coverage"
    }


def clean_grouped_partitions(records, max_per_class, seed):
    train_pool, validation_pool = grouped_train_validation_split(records["train"])
    model_train_records = cap_per_class(train_pool, max_per_class, seed)
    validation_records = cap_per_class(validation_pool, max_per_class, seed + 1)

    hash_cache = {}

    def content_hash(record):
        path = record["path"]
        if path not in hash_cache:
            hash_cache[path] = file_sha256(path)
        return hash_cache[path]

    train_hashes = {content_hash(record) for record in model_train_records}
    validation_seen = set()
    clean_validation = []
    validation_train_duplicates = []
    validation_repeated_images = []
    for record in validation_records:
        digest = content_hash(record)
        if digest in train_hashes:
            validation_train_duplicates.append(record)
        elif digest in validation_seen:
            validation_repeated_images.append(record)
        else:
            validation_seen.add(digest)
            clean_validation.append(record)

    validation_hashes = {content_hash(record) for record in validation_records}
    test_seen = set()
    clean_test = []
    test_train_duplicates = []
    test_validation_duplicates = []
    test_repeated_images = []
    conflicting_hash_labels = {}
    labels_by_hash = {}
    for record in model_train_records + validation_records + records["test"]:
        labels_by_hash.setdefault(content_hash(record), set()).add(record["class_name"])
    for digest, labels in labels_by_hash.items():
        if len(labels) > 1:
            conflicting_hash_labels[digest] = sorted(labels)
    if train_hashes.intersection(conflicting_hash_labels):
        raise ValueError("The model training partition contains byte-identical images with conflicting labels")
    conflicting_validation_records = [
        record for record in clean_validation
        if content_hash(record) in conflicting_hash_labels
    ]
    if conflicting_validation_records:
        clean_validation = [
            record for record in clean_validation
            if content_hash(record) not in conflicting_hash_labels
        ]

    conflicting_test_records = []
    for record in records["test"]:
        digest = content_hash(record)
        if digest in conflicting_hash_labels:
            conflicting_test_records.append(record)
        elif digest in train_hashes:
            test_train_duplicates.append(record)
        elif digest in validation_hashes:
            test_validation_duplicates.append(record)
        elif digest in test_seen:
            test_repeated_images.append(record)
        else:
            test_seen.add(digest)
            clean_test.append(record)

    grouped_training_pool_hashes = {
        content_hash(record) for record in records["train"]
    }
    original_test_hashes = {content_hash(record) for record in records["test"]}
    source_train_hashes = {
        content_hash(record) for record in records["source_train"]
    }
    source_test_hashes = {
        content_hash(record) for record in records["source_test"]
    }

    return model_train_records, clean_validation, clean_test, {
        "method": "SHA-256 of original image bytes",
        "training_images_hashed": len(model_train_records),
        "validation_candidates_hashed": len(validation_records),
        "test_candidates_hashed": len(records["test"]),
        "training_validation_exact_hash_overlap": len(
            train_hashes.intersection(validation_hashes)
        ),
        "training_test_exact_hash_overlap": len(
            train_hashes.intersection({content_hash(record) for record in records["test"]})
        ),
        "grouped_training_pool_test_exact_hash_overlap": len(
            grouped_training_pool_hashes.intersection(original_test_hashes)
        ),
        "validation_test_exact_hash_overlap": len(
            validation_hashes.intersection(original_test_hashes)
        ),
        "published_train_manifest_exact_duplicate_records": len(records["source_train"]) - len(source_train_hashes),
        "published_test_manifest_exact_duplicate_records": len(records["source_test"]) - len(source_test_hashes),
        "published_manifest_exact_hash_overlap": len(source_train_hashes.intersection(source_test_hashes)),
        "conflicting_duplicate_label_groups": len(conflicting_hash_labels),
        "conflicting_validation_records_excluded": len(conflicting_validation_records),
        "conflicting_test_records_excluded": len(conflicting_test_records),
        "validation_records_excluded_for_training_overlap": len(validation_train_duplicates),
        "validation_duplicate_records_excluded": len(validation_repeated_images),
        "test_records_excluded_for_training_overlap": len(test_train_duplicates),
        "test_records_excluded_for_validation_overlap": len(test_validation_duplicates),
        "test_duplicate_records_excluded": len(test_repeated_images),
        "eligible_validation_images": len(clean_validation),
        "eligible_test_images": len(clean_test),
        "excluded_test_paths": [
            {
                "path": record["path"],
                "reason": reason
            }
            for records_to_exclude, reason in (
                (conflicting_test_records, "exact_duplicate_with_conflicting_class_labels"),
                (test_train_duplicates, "exact_duplicate_in_model_training"),
                (test_validation_duplicates, "exact_duplicate_in_validation"),
                (test_repeated_images, "duplicate_exact_image_within_test")
            )
            for record in records_to_exclude
        ],
        "limitation": "Exact-byte hashing detects byte-identical images only; it cannot detect resized, recompressed, augmented, or biologically related images."
    }


def metrics_from_probabilities(probabilities, records, classes):
    if probabilities.ndim != 2 or probabilities.shape[1] != len(classes):
        raise ValueError("Model probabilities do not match the 38 disease classes")
    if not np.isfinite(probabilities).all():
        raise ValueError("Model returned non-finite probabilities")
    if not np.allclose(probabilities.sum(axis=1), 1.0, rtol=1e-5, atol=1e-5):
        raise ValueError("Model probabilities do not sum to one")
    predictions = probabilities.argmax(axis=1)
    truth = np.asarray([row["label"] for row in records])
    if len(predictions) != len(truth):
        raise ValueError(
            f"Prediction/image count mismatch: {len(predictions)} predictions for {len(truth)} images"
        )
    report = classification_report(
        truth,
        predictions,
        labels=list(range(len(classes))),
        target_names=classes,
        output_dict=True,
        zero_division=0,
    )
    return {
        "accuracy": float((predictions == truth).mean()),
        "classification_report": report,
        "confusion_matrix": confusion_matrix(
            truth, predictions, labels=list(range(len(classes)))
        ).tolist(),
    }


def main() -> None:
    for path in (MODEL_PATH, LABELS_PATH, REPORT_PATH):
        if not path.is_file():
            raise FileNotFoundError(f"Required disease evaluation artifact not found: {path}")

    labels_metadata = json.loads(LABELS_PATH.read_text(encoding="utf-8"))
    saved_report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    records, classes = load_records(
        group_exact_images=labels_metadata.get("split_grouping_method")
        == "filename_group_plus_exact_image_sha256"
    )
    if labels_metadata.get("classes") != classes:
        raise ValueError("Saved model label map does not match the dataset class order")
    if labels_metadata.get("input_size") != list(IMAGE_SIZE):
        raise ValueError("Saved model input size does not match evaluation preprocessing")

    model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    if int(model.output_shape[-1]) != len(classes):
        raise ValueError("Saved model output count does not match the class labels")
    if tuple(model.input_shape[1:]) != (*IMAGE_SIZE, 3):
        raise ValueError("Saved model input shape does not match evaluation preprocessing")

    training_metadata = saved_report.get("training", {})
    max_per_class = int(training_metadata.get("max_images_per_class_in_train_and_validation", 300))
    seed = int(training_metadata.get("seed", 42))
    model_train_records, validation_records, test_records, duplicate_audit = clean_grouped_partitions(
        records,
        max_per_class,
        seed
    )
    if not test_records or set(row["label"] for row in test_records) != set(range(len(classes))):
        raise ValueError("Exact-duplicate filtering left an incomplete held-out test class set")

    validation_probabilities = probability_scores(model, validation_records, classes)
    test_probabilities = probability_scores(model, test_records, classes)
    validation_truth = np.asarray([row["label"] for row in validation_records])
    test_truth = np.asarray([row["label"] for row in test_records])
    temperature = temperature_scale(validation_probabilities, validation_truth)
    calibrated_validation_probabilities = apply_temperature(validation_probabilities, temperature)
    calibrated_test_probabilities = apply_temperature(test_probabilities, temperature)
    metrics = metrics_from_probabilities(test_probabilities, test_records, classes)
    uncalibrated_calibration = calibration_metrics(test_probabilities, test_truth)
    calibrated_calibration = calibration_metrics(calibrated_test_probabilities, test_truth)
    confidence_threshold = select_confidence_threshold(validation_probabilities, validation_truth)

    train_groups = {row.get("split_group", row["leaf_id"]) for row in records["train"]}
    validation_groups = {
        row.get("split_group", row["leaf_id"]) for row in validation_records
    }
    test_groups = {
        row.get("split_group", row["leaf_id"]) for row in test_records
    }
    if train_groups.intersection(test_groups) or validation_groups.intersection(test_groups):
        raise ValueError("Filename-group leakage found after exact-duplicate filtering")
    train_fallback = sum(is_fallback_leaf_id(row["leaf_id"]) for row in model_train_records)
    test_fallback = sum(is_fallback_leaf_id(row["leaf_id"]) for row in test_records)
    source_train_fallback = sum(
        is_fallback_leaf_id(row["leaf_id"]) for row in records["source_train"]
    )
    source_test_fallback = sum(
        is_fallback_leaf_id(row["leaf_id"]) for row in records["source_test"]
    )
    fallback_audit = {
        "status": "documented",
        "method": "filename-based leaf map resolution; unresolved records receive image-specific SHA-256 singleton group IDs",
        "train_fallback_records": train_fallback,
        "test_fallback_records": test_fallback,
        "source_train_fallback_records": source_train_fallback,
        "source_test_fallback_records": source_test_fallback,
        "published_manifest_overlap_leaf_groups": records["source_manifest_group_overlap"],
        "legacy_filename_group_overlap_before_fallback_fix": records["source_manifest_legacy_group_overlap"],
        "mapped_leaf_group_overlap_after_fallback_fix": records["source_manifest_mapped_group_overlap"],
        "train_test_group_overlap": len(train_groups.intersection(test_groups)),
        "limitation": "Fallback IDs do not establish biological or physical leaf independence.",
        "source_fallback_paths": [
            row["path"] for row in records["source_train"] + records["source_test"]
            if is_fallback_leaf_id(row["leaf_id"])
        ],
    }
    (MODEL_DIR / "plant_disease_fallback_audit.json").write_text(
        json.dumps(fallback_audit, indent=2),
        encoding="utf-8",
    )
    model_sha256 = file_sha256(MODEL_PATH)
    labels_sha256 = file_sha256(LABELS_PATH)
    calibration_report = {
        "status": "evaluated",
        "method": "temperature scaling using grouped validation probabilities",
        "temperature": temperature,
        "model_sha256": model_sha256,
        "labels_sha256": labels_sha256,
        "fit_data": "grouped validation partition after excluding exact byte duplicates from model training",
        "test_data": "held-out grouped test after excluding exact byte duplicates from model training and validation",
        "validation_images_used": len(validation_records),
        "test_images_evaluated": len(test_records),
        "confidence_threshold": confidence_threshold,
        "confidence_threshold_scale": "raw_softmax",
        "uncalibrated_test_ece": uncalibrated_calibration["ece"],
        "calibrated_test_ece": calibrated_calibration["ece"],
        "uncalibrated_test_brier_score": multiclass_brier_score(test_probabilities, test_truth),
        "calibrated_test_brier_score": multiclass_brier_score(calibrated_test_probabilities, test_truth),
        "uncalibrated_reliability": uncalibrated_calibration["bins"],
        "calibrated_reliability": calibrated_calibration["bins"],
        "interpretation": "Calibration describes the eligible PlantVillage split only and does not establish field calibration."
    }
    (MODEL_DIR / "plant_disease_calibration.json").write_text(
        json.dumps(calibration_report, indent=2),
        encoding="utf-8",
    )
    figure, axis = plt.subplots(figsize=(8, 8))
    ideal = [0.0, 1.0]
    axis.plot(ideal, ideal, linestyle="--", color="gray", label="Perfect calibration")
    for key, label, color in (
        ("uncalibrated_reliability", "Uncalibrated", "tab:red"),
        ("calibrated_reliability", "Temperature-scaled", "tab:blue"),
    ):
        bin_rows = calibration_report[key]
        populated = [row for row in bin_rows if row["count"]]
        centers = [
            (row["lower"] + row["upper"]) / 2.0
            for row in populated
        ]
        accuracies = [row["accuracy"] for row in populated]
        axis.plot(centers, accuracies, marker="o", label=label, color=color)
    axis.set_xlim(0.0, 1.0)
    axis.set_ylim(0.0, 1.0)
    axis.set_xlabel("Mean predicted confidence")
    axis.set_ylabel("Observed accuracy")
    axis.set_title("PlantVillage test reliability diagram")
    axis.legend()
    figure.tight_layout()
    figure.savefig(MODEL_DIR / "plant_disease_reliability_diagram.png", dpi=180)
    plt.close(figure)

    confusion_figure, confusion_axis = plt.subplots(figsize=(18, 16))
    confusion = np.asarray(metrics["confusion_matrix"])
    image = confusion_axis.imshow(confusion, interpolation="nearest", cmap="Blues")
    confusion_figure.colorbar(image, ax=confusion_axis, fraction=0.046, pad=0.04)
    confusion_axis.set(
        title="PlantVillage grouped held-out test confusion matrix (exact duplicates excluded)",
        xlabel="Predicted class",
        ylabel="True class",
    )
    confusion_axis.set_xticks(np.arange(len(classes)), labels=classes, rotation=90, fontsize=6)
    confusion_axis.set_yticks(np.arange(len(classes)), labels=classes, fontsize=6)
    confusion_figure.tight_layout()
    confusion_figure.savefig(MODEL_DIR / "plant_disease_confusion_matrix.png", dpi=200)
    plt.close(confusion_figure)

    split_report = {
        "status": "evaluated",
        "evaluation_scope": "same-source PlantVillage grouped holdout; not external-source or field-photo validation",
        "dataset_revision": saved_report["dataset"]["revision"],
        "seed": seed,
        "grouping_method": "filename-inferred leaf-map groups with image-specific fallback IDs; SHA-256 exact-image audit applied to fit, validation, and test partitions",
        "source_manifest_images": {
            "published_train": len(records["source_train"]),
            "published_test": len(records["source_test"]),
            "combined": len(records["source_train"]) + len(records["source_test"])
        },
        "partition_counts": {
            "model_training_images": len(model_train_records),
            "validation_candidates": duplicate_audit["validation_candidates_hashed"],
            "validation_images_used_for_calibration": len(validation_records),
            "original_grouped_test_candidates": len(records["test"]),
            "eligible_test_images": len(test_records)
        },
        "class_distribution": {
            "model_training": dict(sorted(Counter(row["class_name"] for row in model_train_records).items())),
            "validation_used_for_calibration": dict(sorted(Counter(row["class_name"] for row in validation_records).items())),
            "eligible_test": dict(sorted(Counter(row["class_name"] for row in test_records).items()))
        },
        "filename_group_overlap": {
            "training_test": len(train_groups.intersection(test_groups)),
            "validation_test": len(validation_groups.intersection(test_groups))
        },
        "exact_image_hash_audit": duplicate_audit,
        "limitations": [
            "Filename-derived leaf IDs are heuristic and do not prove biological leaf identity.",
            "Exact-byte hashes do not identify resized, recompressed, augmented, or otherwise related images.",
            "All eligible images come from PlantVillage; this is not external-source or field-photo validation."
        ]
    }
    SPLIT_REPORT_PATH.write_text(json.dumps(split_report, indent=2), encoding="utf-8")

    previous_test_count = saved_report.get("training", {}).get(
        "independent_test_images", len(records["test"])
    )
    previous_metrics = saved_report.get("independent_test_metrics")
    saved_report["evaluation_scope"] = "PlantVillage same-source grouped held-out image classification; not field or external-source validation."
    saved_report["split_method"].update({
        "independent_test": "One held-out fold from 5-fold StratifiedGroupKFold over both published color manifests; byte-identical images overlapping model training or validation are excluded from test metrics.",
        "grouping_method": "filename-derived leaf-map groups and image-specific fallback IDs, with a SHA-256 exact-image audit",
        "train_leaf_groups": len({row["leaf_id"] for row in model_train_records}),
        "validation_leaf_groups": len({row["leaf_id"] for row in validation_records}),
        "independent_test_leaf_groups": len(test_groups),
        "train_validation_leaf_overlap": 0,
        "train_test_leaf_overlap": len(train_groups.intersection(test_groups)),
        "published_train_test_leaf_overlap": records["source_manifest_group_overlap"],
        "exact_image_audit": SPLIT_REPORT_PATH.name
    })
    saved_report["training"].update({
        "train_images": len(model_train_records),
        "validation_images": duplicate_audit["validation_candidates_hashed"],
        "independent_test_images": len(test_records),
    })
    if previous_metrics:
        saved_report["pre_exact_duplicate_audit_evaluation"] = {
            "test_images": previous_test_count,
            "accuracy": previous_metrics["accuracy"],
            "macro_f1": previous_metrics["classification_report"]["macro avg"]["f1-score"],
            "weighted_f1": previous_metrics["classification_report"]["weighted avg"]["f1-score"],
            "status": "preserved historical result; exact byte duplicates were not excluded"
        }
    saved_report["previous_dataset_level_evaluation"] = saved_report.get(
        "previous_dataset_level_evaluation",
        {
            "test_images": 10861,
            "accuracy": 0.9348126323542952,
            "macro_precision": 0.9125656182191398,
            "macro_recall": 0.9277687730604184,
            "macro_f1": 0.9167295754460978,
        }
    )
    saved_report["exact_duplicate_audit"] = duplicate_audit
    saved_report["model_sha256"] = model_sha256
    saved_report["independent_test_metrics"] = metrics
    saved_report["fallback_audit"] = fallback_audit
    saved_report["calibration"] = calibration_report
    saved_report["reliability_diagram"] = "plant_disease_reliability_diagram.png"
    saved_report["confusion_matrix_visualization"] = "plant_disease_confusion_matrix.png"
    saved_report["split_report"] = SPLIT_REPORT_PATH.name
    (REPORT_PATH).write_text(json.dumps(saved_report, indent=2), encoding="utf-8")

    print(json.dumps({
        "evaluation_scope": saved_report["evaluation_scope"],
        "test_images": len(test_records),
        "test_images_excluded_for_exact_duplicates": (
            duplicate_audit["test_records_excluded_for_training_overlap"]
            + duplicate_audit["test_records_excluded_for_validation_overlap"]
            + duplicate_audit["test_duplicate_records_excluded"]
            + duplicate_audit["conflicting_test_records_excluded"]
        ),
        "class_count": len(classes),
        "accuracy": metrics["accuracy"],
        "macro_avg": metrics["classification_report"]["macro avg"],
        "weighted_avg": metrics["classification_report"]["weighted avg"],
        "train_leaf_group_overlap_with_test": len(train_groups.intersection(test_groups)),
        "validation_test_leaf_group_overlap": len(validation_groups.intersection(test_groups)),
        "train_test_exact_image_hash_overlap": 0,
        "validation_test_exact_image_hash_overlap": 0,
        "training_images": len(model_train_records),
        "validation_images_used_for_calibration": len(validation_records),
        "temperature": temperature,
        "confidence_threshold": confidence_threshold,
        "uncalibrated_test_ece": uncalibrated_calibration["ece"],
        "calibrated_test_ece": calibrated_calibration["ece"],
        "uncalibrated_test_brier_score": calibration_report["uncalibrated_test_brier_score"],
        "calibrated_test_brier_score": calibration_report["calibrated_test_brier_score"],
        "model_modified": False,
    }, indent=2))


if __name__ == "__main__":
    main()
