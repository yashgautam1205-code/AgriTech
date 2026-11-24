import argparse
import json
import random
import re
from collections import Counter
from pathlib import Path

import numpy as np
import tensorflow as tf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import StratifiedGroupKFold


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "plantvillage"
IMAGE_ROOT = DATA_DIR / "images"
MODEL_DIR = ROOT / "models"
IMAGE_SIZE = (160, 160)
SEED = 42


def parse_leaf_id(relative_path: str, leaf_map: dict) -> str:
    parts = relative_path.replace("\\", "/").split("/")
    if len(parts) < 4:
        raise ValueError(f"Unexpected image path: {relative_path}")
    class_name, file_name = parts[2], parts[3]
    identifier = file_name.replace("_final_masked", "")
    if "___" in identifier:
        identifier = identifier.split("___")[-1]
    identifier = re.split(r"copy", identifier, maxsplit=1, flags=re.IGNORECASE)[0]
    identifier = re.sub(r"\.(jpg|jpeg|png)$", "", identifier, flags=re.IGNORECASE).strip()
    key = identifier.lower()
    suggestions = leaf_map.get(key, [])
    if len(suggestions) == 1:
        return f"{class_name}::{suggestions[0]}"
    for suggestion in suggestions:
        if class_name in suggestion:
            return f"{class_name}::{suggestion}"
    return f"{class_name}::fallback::{identifier}"


def load_records():
    train_paths = (DATA_DIR / "color_train.txt").read_text(encoding="utf-8").splitlines()
    test_paths = (DATA_DIR / "color_test.txt").read_text(encoding="utf-8").splitlines()
    leaf_map = json.loads((DATA_DIR / "leaf-map.json").read_text(encoding="utf-8"))
    paths_by_split = {"train": train_paths, "test": test_paths}

    classes = sorted(
        {
            path.replace("\\", "/").split("/")[2]
            for paths in paths_by_split.values()
            for path in paths
            if path.strip()
        }
    )
    if len(classes) != 38:
        raise ValueError(f"Expected 38 PlantVillage classes, found {len(classes)}")
    class_to_index = {name: index for index, name in enumerate(classes)}

    source_records = {}
    all_records = []
    for split_name, paths in paths_by_split.items():
        rows = []
        for relative_path in paths:
            relative_path = relative_path.strip()
            if not relative_path:
                continue
            normalized = relative_path.replace("\\", "/")
            parts = normalized.split("/")
            image_path = IMAGE_ROOT.joinpath(*parts)
            if not image_path.is_file():
                raise FileNotFoundError(image_path)
            row = {
                "path": str(image_path),
                "class_name": parts[2],
                "label": class_to_index[parts[2]],
                "leaf_id": parse_leaf_id(normalized, leaf_map),
                "source_split": split_name,
            }
            rows.append(row)
            all_records.append(row)
        source_records[split_name] = rows

    labels = np.asarray([row["label"] for row in all_records])
    groups = np.asarray([row["leaf_id"] for row in all_records])
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    train_indices, test_indices = next(
        splitter.split(np.zeros(len(labels)), labels, groups)
    )
    expected_labels = set(labels)
    if set(labels[train_indices]) != expected_labels or set(labels[test_indices]) != expected_labels:
        raise ValueError("Grouped train/test split does not contain every disease class")
    records = {
        "train": [all_records[index] for index in train_indices],
        "test": [all_records[index] for index in test_indices],
        "source_train": source_records["train"],
        "source_test": source_records["test"],
    }

    train_groups = {row["leaf_id"] for row in records["train"]}
    test_groups = {row["leaf_id"] for row in records["test"]}
    if train_groups.intersection(test_groups):
        raise ValueError("Leaf group leakage found between training and test")
    source_train_groups = {
        row["leaf_id"] for row in source_records["train"]
    }
    source_test_groups = {
        row["leaf_id"] for row in source_records["test"]
    }
    records["source_manifest_group_overlap"] = len(
        source_train_groups.intersection(source_test_groups)
    )
    return records, classes


def grouped_train_validation_split(train_records):
    labels = np.asarray([row["label"] for row in train_records])
    groups = np.asarray([row["leaf_id"] for row in train_records])
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    train_indices, validation_indices = next(
        splitter.split(np.zeros(len(labels)), labels, groups)
    )
    expected_labels = set(labels)
    if set(labels[train_indices]) != expected_labels or set(labels[validation_indices]) != expected_labels:
        raise ValueError("Grouped train/validation split does not contain every disease class")
    training = [train_records[index] for index in train_indices]
    validation = [train_records[index] for index in validation_indices]
    if {row["leaf_id"] for row in training} & {
        row["leaf_id"] for row in validation
    }:
        raise ValueError("Leaf group leakage found between training and validation")
    return training, validation


def cap_per_class(records, cap, seed):
    rng = random.Random(seed)
    selected = []
    buckets = {}
    for record in records:
        buckets.setdefault(record["label"], []).append(record)
    for label in sorted(buckets):
        bucket = buckets[label]
        rng.shuffle(bucket)
        selected.extend(bucket[:cap])
    return selected


def make_dataset(records, classes, training):
    paths = [row["path"] for row in records]
    labels = [row["label"] for row in records]
    dataset = tf.data.Dataset.from_tensor_slices((paths, labels))

    def load_image(path, label):
        contents = tf.io.read_file(path)
        image = tf.io.decode_image(contents, channels=3, expand_animations=False)
        image.set_shape([None, None, 3])
        image = tf.image.resize(image, IMAGE_SIZE)
        image = tf.keras.applications.mobilenet_v2.preprocess_input(image)
        return image, tf.one_hot(label, depth=len(classes))

    if training:
        dataset = dataset.shuffle(min(len(records), 8192), seed=SEED, reshuffle_each_iteration=True)
    return (
        dataset.map(load_image, num_parallel_calls=tf.data.AUTOTUNE)
        .batch(32)
        .prefetch(tf.data.AUTOTUNE)
    )


def build_model(class_count):
    base = tf.keras.applications.MobileNetV2(
        input_shape=(*IMAGE_SIZE, 3),
        include_top=False,
        weights="imagenet",
    )
    base.trainable = False
    inputs = tf.keras.Input(shape=(*IMAGE_SIZE, 3))
    features = base(inputs, training=False)
    features = tf.keras.layers.GlobalAveragePooling2D()(features)
    features = tf.keras.layers.Dropout(0.25)(features)
    outputs = tf.keras.layers.Dense(class_count, activation="softmax")(features)
    return tf.keras.Model(inputs, outputs), base


def evaluate(model, dataset, records, classes):
    probabilities = model.predict(dataset, verbose=1)
    predictions = probabilities.argmax(axis=1)
    truth = np.asarray([row["label"] for row in records])
    report = classification_report(
        truth,
        predictions,
        labels=list(range(len(classes))),
        target_names=classes,
        output_dict=True,
        zero_division=0,
    )
    return {
        "accuracy": float(accuracy_score(truth, predictions)),
        "classification_report": report,
        "confusion_matrix": confusion_matrix(
            truth, predictions, labels=list(range(len(classes)))
        ).tolist(),
    }


def train(max_per_class: int, head_epochs: int, fine_tune_epochs: int):
    tf.keras.utils.set_random_seed(SEED)
    records, classes = load_records()
    train_records, validation_records = grouped_train_validation_split(records["train"])
    train_records = cap_per_class(train_records, max_per_class, SEED)
    validation_records = cap_per_class(validation_records, max_per_class, SEED + 1)

    training_data = make_dataset(train_records, classes, training=True)
    validation_data = make_dataset(validation_records, classes, training=False)
    test_data = make_dataset(records["test"], classes, training=False)

    model, base = build_model(len(classes))
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=2, restore_best_weights=True
        )
    ]
    model.fit(
        training_data,
        validation_data=validation_data,
        epochs=head_epochs,
        callbacks=callbacks,
    )

    if fine_tune_epochs > 0:
        base.trainable = True
        for layer in base.layers[:-30]:
            layer.trainable = False
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
            loss="categorical_crossentropy",
            metrics=["accuracy"],
        )
        model.fit(
            training_data,
            validation_data=validation_data,
            epochs=fine_tune_epochs,
            callbacks=callbacks,
        )

    validation_metrics = evaluate(model, validation_data, validation_records, classes)
    test_metrics = evaluate(model, test_data, records["test"], classes)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    confusion_path = MODEL_DIR / "plant_disease_confusion_matrix.png"
    figure, axis = plt.subplots(figsize=(18, 16))
    matrix = np.asarray(test_metrics["confusion_matrix"])
    image = axis.imshow(matrix, interpolation="nearest", cmap="Blues")
    figure.colorbar(image, ax=axis, fraction=0.046, pad=0.04)
    axis.set(
        title="PlantVillage grouped independent test confusion matrix",
        xlabel="Predicted class",
        ylabel="True class",
    )
    axis.set_xticks(np.arange(len(classes)), labels=classes, rotation=90, fontsize=6)
    axis.set_yticks(np.arange(len(classes)), labels=classes, fontsize=6)
    figure.tight_layout()
    figure.savefig(confusion_path, dpi=200)
    plt.close(figure)
    model.save(MODEL_DIR / "plant_disease_mobilenetv2.keras")
    (MODEL_DIR / "plant_disease_labels.json").write_text(
        json.dumps(
            {
                "classes": classes,
                "input_size": list(IMAGE_SIZE),
                "architecture": "MobileNetV2",
                "dataset_revision": "mohanty/PlantVillage@9e97599868962bd0079b8db4b7f1efa9185fa1e7",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    train_counts = Counter(row["class_name"] for row in train_records)
    validation_counts = Counter(row["class_name"] for row in validation_records)
    test_counts = Counter(row["class_name"] for row in records["test"])
    report = {
        "status": "evaluated",
        "evaluation_scope": "PlantVillage dataset-level image classification; not field validation.",
        "dataset": {
            "name": "PlantVillage color images",
            "source": "https://huggingface.co/datasets/mohanty/PlantVillage",
            "revision": "9e97599868962bd0079b8db4b7f1efa9185fa1e7",
            "license_declared_by_dataset_card": "CC BY-SA 3.0",
            "total_source_images": len(records["train"]) + len(records["test"]),
            "class_count": len(classes),
            "class_names": classes,
            "source_train_images": len(records["source_train"]),
            "source_test_images": len(records["source_test"]),
            "source_train_counts": dict(sorted(Counter(row["class_name"] for row in records["source_train"]).items())),
            "source_test_counts": dict(sorted(Counter(row["class_name"] for row in records["source_test"]).items())),
        },
        "split_method": {
            "independent_test": "One held-out fold from 5-fold StratifiedGroupKFold over both published color manifests, grouped by inferred leaf_id. The published manifests share inferred leaf groups and are not used directly as independent splits.",
            "validation": "One fold of 5-fold StratifiedGroupKFold over the grouped training partition, grouped by leaf_id.",
            "train_leaf_groups": len({row["leaf_id"] for row in train_records}),
            "validation_leaf_groups": len({row["leaf_id"] for row in validation_records}),
            "independent_test_leaf_groups": len({row["leaf_id"] for row in records["test"]}),
            "train_validation_leaf_overlap": 0,
            "train_test_leaf_overlap": 0,
            "published_train_test_leaf_overlap": records["source_manifest_group_overlap"],
        },
        "training": {
            "architecture": "ImageNet-pretrained MobileNetV2, 160x160 RGB",
            "head_epochs_requested": head_epochs,
            "fine_tune_epochs_requested": fine_tune_epochs,
            "max_images_per_class_in_train_and_validation": max_per_class,
            "train_images": len(train_records),
            "validation_images": len(validation_records),
            "independent_test_images": len(records["test"]),
            "train_class_counts": dict(sorted(train_counts.items())),
            "validation_class_counts": dict(sorted(validation_counts.items())),
            "independent_test_class_counts": dict(sorted(test_counts.items())),
            "seed": SEED,
            "batch_size": 32,
        },
        "validation_metrics": validation_metrics,
        "independent_test_metrics": test_metrics,
        "confusion_matrix_visualization": confusion_path.name,
        "limitations": [
            "PlantVillage uses controlled-background leaf images; field photos may differ substantially.",
            "Predictions are limited to the supported dataset classes and do not establish diagnosis in real crops.",
            "The confidence threshold is not a calibrated probability of correctness.",
            "The dataset card declares CC BY-SA 3.0; the upstream GitHub repository does not publish license metadata. Review attribution/share-alike obligations before redistribution.",
        ],
    }
    (MODEL_DIR / "plant_disease_evaluation.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "classes": len(classes),
                "train_images": len(train_records),
                "validation_images": len(validation_records),
                "independent_test_images": len(records["test"]),
                "test_accuracy": test_metrics["accuracy"],
                "macro_f1": test_metrics["classification_report"]["macro avg"]["f1-score"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-per-class", type=int, default=300)
    parser.add_argument("--head-epochs", type=int, default=3)
    parser.add_argument("--fine-tune-epochs", type=int, default=2)
    args = parser.parse_args()
    train(args.max_per_class, args.head_epochs, args.fine_tune_epochs)
