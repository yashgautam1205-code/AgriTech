# Crop Suitability Model Card

## Status

This model card is valid only after `train_crop_model.py` has run successfully and
`crop_suitability_report.json` contains genuine metrics.

## Task

Multiclass crop-suitability prediction from soil N-P-K, pH, temperature, humidity and rainfall.

## Algorithm

Scikit-learn `RandomForestClassifier` with numeric standardization inside a reproducible pipeline.

## Dataset-level evaluation

All reported results are dataset-level and must not be interpreted as field-trial accuracy or real-world validation.

The original stratified row split reports 100% accuracy on 330 held-out CSV rows. Re-evaluation reproduced this result, but the CSV has no provenance identifiers, so source-level independence cannot be established.

A five-fold `StratifiedGroupKFold` evaluation grouped exact feature vectors. All 2,200 feature vectors are unique, so each row became its own group. This prevents exact duplicate vectors from crossing folds, but cannot detect related samples created or collected upstream.

- Out-of-fold accuracy: 99.45%
- Macro precision / recall / F1: 99.47% / 99.45% / 99.45%
- Weighted precision / recall / F1: 99.47% / 99.45% / 99.45%
- Fold accuracy: 99.55%, 99.55%, 99.32%, 99.77%, 99.09%

Per-class metrics and confusion counts are recorded in `crop_suitability_report.json`.

The grouped evaluator fits a clone of the complete pipeline on 1,760 rows per fold and predicts 440 held-out rows; all 22 classes are present in each test fold and each row receives one out-of-fold prediction. Preprocessing is fitted only on the training partition. This is same-source sample-level cross-validation, not a locked test partition: exact-vector groups are singletons and source/augmentation identifiers are absent. A separate same-source holdout was not created because it would repartition these same rows and add no source independence.

## Independent-source evaluation

**Status: not completed; no qualified external evaluation dataset was identified.** Public candidates were checked for provenance, feature units/definitions, label meaning, class support, and exact overlap with the training CSV. Two Kaggle mirrors each shared 1,474 of 2,200 exact feature-and-label rows with the training data. A separate 20,000-row Kaggle dataset had zero exact raw-vector overlap but lacked verifiable collection provenance, specified N/P/K mg/kg while the training source specifies no unit, and labels crops grown rather than crop suitability. Only 6,620 of its labels matched supported model classes; these rows were not scored because the semantic/feature issues remain.

No external model predictions, metrics, per-class results, or confusion matrix were generated. The 100% original row-split result and 99.45% grouped cross-validation result remain dataset-level only; do not describe them as source-independent or field accuracy. The fifth requirement remains **PARTIAL**: same-source grouped CV exists, but no defensible source/related-sample holdout or independent-source evaluation has been verified. Details are in [`CROP_INDEPENDENT_EVALUATION.md`](../../CROP_INDEPENDENT_EVALUATION.md) and [`crop_external_test_report.json`](./crop_external_test_report.json).

## Training methodology

The original model was trained using a fixed-seed stratified row split:

- 70% training
- 15% validation
- 15% row-level held-out test

The test rows were not used for fitting. Their source-level independence is unverified.

## Dataset

See `../data/DATA_SOURCES.md`.

## Outputs

The API returns the top crops and probabilities produced by `predict_proba`.
These probabilities are model confidence estimates, not guaranteed agronomic success rates.

## Limitations

- The publisher describes the dataset as augmented/assembled from climate, rainfall, and fertilizer data, but provides no row-level provenance, source IDs, or augmentation timing.
- Exact duplicate scans found no duplicate feature vectors; this does not rule out related source samples.
- No qualifying independent external dataset or field-trial validation has been evaluated.
- Do not claim field-trial accuracy or real-world validation.
