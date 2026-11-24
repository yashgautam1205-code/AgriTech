import numpy as np

from evaluate_disease_model import (
    apply_temperature,
    multiclass_brier_score,
    select_confidence_threshold,
    temperature_scale,
)


def test_temperature_scaling_preserves_class_order_and_normalizes_probabilities():
    probabilities = np.asarray([[0.7, 0.2, 0.1], [0.1, 0.3, 0.6]])
    scaled = apply_temperature(probabilities, 0.8)

    assert np.allclose(scaled.sum(axis=1), 1.0)
    assert np.array_equal(scaled.argmax(axis=1), probabilities.argmax(axis=1))
    assert np.all(scaled.max(axis=1) > probabilities.max(axis=1))


def test_temperature_fit_uses_only_the_supplied_validation_targets():
    probabilities = np.asarray([
        [0.8, 0.2],
        [0.7, 0.3],
        [0.3, 0.7],
        [0.4, 0.6],
    ])
    truth = np.asarray([0, 0, 1, 1])

    temperature = temperature_scale(probabilities, truth)

    assert 0.05 <= temperature <= 20.0


def test_validation_threshold_requires_precision_and_minimum_coverage():
    probabilities = np.asarray([
        [0.98, 0.02],
        [0.96, 0.04],
        [0.70, 0.30],
        [0.40, 0.60],
    ])
    truth = np.asarray([0, 0, 1, 1])

    threshold = select_confidence_threshold(
        probabilities,
        truth,
        minimum_precision=0.95,
        minimum_coverage=0.50,
    )

    assert threshold["status"] == "selected"
    assert threshold["value"] == 0.96
    assert threshold["validation_precision"] == 1.0
    assert threshold["validation_coverage"] == 0.5


def test_brier_score_is_zero_for_perfect_probabilities():
    probabilities = np.asarray([[1.0, 0.0], [0.0, 1.0]])

    assert multiclass_brier_score(probabilities, np.asarray([0, 1])) == 0.0
