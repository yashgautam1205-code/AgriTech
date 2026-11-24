import pytest

from train_disease_model import assign_split_groups, compute_class_weights


def test_exact_image_hashes_join_duplicate_paths_into_one_split_group(tmp_path):
    first = tmp_path / "first.jpg"
    duplicate = tmp_path / "duplicate.jpg"
    first.write_bytes(b"identical image content")
    duplicate.write_bytes(b"identical image content")
    records = [
        {"path": str(first), "leaf_id": "leaf-a", "class_name": "Apple___Apple_scab"},
        {"path": str(duplicate), "leaf_id": "leaf-b", "class_name": "Apple___Apple_scab"},
    ]

    audit = assign_split_groups(records, group_exact_images=True)

    assert records[0]["split_group"] == records[1]["split_group"]
    assert audit["duplicate_exact_image_groups"] == 1


def test_exact_duplicate_bytes_with_conflicting_labels_are_rejected(tmp_path):
    first = tmp_path / "first.jpg"
    duplicate = tmp_path / "duplicate.jpg"
    first.write_bytes(b"identical image content")
    duplicate.write_bytes(b"identical image content")
    records = [
        {"path": str(first), "leaf_id": "leaf-a", "class_name": "Apple___Apple_scab"},
        {"path": str(duplicate), "leaf_id": "leaf-b", "class_name": "Apple___healthy"},
    ]

    with pytest.raises(ValueError, match="conflicting disease labels"):
        assign_split_groups(records, group_exact_images=True)


def test_class_weights_balance_uneven_training_counts():
    records = [
        {"label": 0},
        {"label": 0},
        {"label": 1},
    ]

    weights = compute_class_weights(records, class_count=2)

    assert weights == {0: 0.75, 1: 1.5}


def test_class_weighting_rejects_missing_training_classes():
    with pytest.raises(ValueError, match="every class"):
        compute_class_weights([{"label": 0}], class_count=2)
