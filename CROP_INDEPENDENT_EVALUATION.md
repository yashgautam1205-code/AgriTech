# Crop Model Independent Evaluation

## Result: PARTIAL — independent evaluation is blocked

The existing crop model was audited and candidate public datasets were reviewed. No source met all three requirements needed to make an external score meaningful:

1. Verifiable independence from the training records.
2. The same seven measurements with compatible units and definitions.
3. Crop labels with the same suitability/recommendation meaning and supported classes.

Therefore the saved model was **not run on an incompatible dataset**. No external metrics, per-class scores, or confusion matrix were generated. The fifth hackathon requirement remains **PARTIAL**, not complete.

Machine-readable findings are in [`ml_service/models/crop_external_test_report.json`](./ml_service/models/crop_external_test_report.json).

## Model and training-data audit

The saved artifact `ml_service/models/crop_suitability.joblib` is a scikit-learn `Pipeline` with `preprocess` and `classifier` steps. The classifier is a `RandomForestClassifier`; the preprocessing step standardizes the seven numeric columns. The API and training code use this feature order:

| Feature | Training source definition | Observed training range |
|---|---|---:|
| `N` | Nitrogen content ratio; source gives no physical unit | 0–140 |
| `P` | Phosphorus content ratio; source gives no physical unit | 5–145 |
| `K` | Potassium content ratio; source gives no physical unit | 5–205 |
| `temperature` | Degrees Celsius; measurement period/protocol unspecified | 8.83–43.68 |
| `humidity` | Relative humidity (%) | 14.26–99.98 |
| `ph` | Soil pH | 3.50–9.94 |
| `rainfall` | Millimeters; accumulation period unspecified | 20.21–298.56 |

The training file is the 2,200-row, 22-class [`Crop Recommendation Dataset`](https://www.kaggle.com/datasets/atharvaingle/crop-recommendation-dataset), version 1, publisher-declared Apache 2.0. It has 100 rows per class. Its publisher says the data was built by augmenting rainfall, climate, and fertilizer data available for India, but provides no row-level provenance IDs, augmentation lineage, or full collection protocol. Its `label` is presented as a suitable/recommended crop.

The original row-split result (100% accuracy on 330 held-out rows) and five-fold exact-feature-vector grouped result (99.45% accuracy) remain unchanged. Both are dataset-level results; exact-vector grouping does not establish upstream/source independence.

## Existing held-out and grouped-CV evaluation

The training script's existing stratified split is 1,540 training / 330 validation / 330 test rows. The saved pipeline fits preprocessing and the Random Forest on the 1,540 training rows only; its 330-row test score is held out from fitting, but the split is row-based and has no provenance grouping.

The evaluation script also performs five-fold `StratifiedGroupKFold` using exact equality across the seven feature values. The stored report records 2,200 rows and 2,200 unique feature vectors (zero exact duplicate rows), so **all 2,200 groups are singletons**. Each fold uses 1,760 fit rows and 440 test rows with all 22 classes present. It clones the entire saved scikit-learn pipeline, fits that clone on each fold's training rows, and predicts the fold's held-out rows. The StandardScaler is therefore fitted within the training partition for each fold. Every row receives an out-of-fold prediction once.

This is valid **same-source, sample-level out-of-fold evaluation**. The word “grouped” here only guarantees that an exactly identical feature vector is not in both sides of a fold. It does not group samples related by upstream augmentation, farm, source dataset, site, season, or collection event.

The CSV has no source IDs or augmentation lineage. Similarity thresholds over continuous measurements would be arbitrary without documented measurement precision, units for N/P/K, and collection provenance; they could join distinct conditions or miss related augmented records. The dataset therefore cannot support a defensible related-source group assignment.

### Separate grouped holdout decision

No separate holdout was generated. With exact-vector groups, a new stratified holdout would simply repartition the same 2,200 singleton rows. The existing five-fold evaluation already gives out-of-fold predictions for every row, and all rows have already participated in that evaluation; a second random partition would not create a new untouched source or resolve provenance. Reporting another score would be redundant and could be mistaken for stronger independence.

**Final verdict: PARTIAL — same-source grouped cross-validation is available, but a defensible source/related-sample grouped holdout and independent-source test are not verified.** Do not mark the official independent-test-data requirement complete based on these dataset-level results.

## Public candidate review

### Candidate with 20,000 rows: `crops-npk data set`

Kaggle publisher `javakhan`, version 1 (2025-02-15), declares an MIT license. The page describes 20,000 “sensor” records and lists N, P, K, temperature, humidity, pH, rainfall, soil type, variety, and crop. The source CSV was downloaded to a temporary audit directory and profiled; it was not copied into the repository.

| Crop label | Rows | In model classes? |
|---|---:|---|
| Wheat | 3,390 | No |
| Potato | 3,362 | No |
| Maize | 3,352 | Yes |
| Tomato | 3,344 | No |
| Sugarcane | 3,284 | No |
| Rice | 3,268 | Yes |

The file has 20,000 rows, no missing values, and no exact duplicate full rows. Exact comparison of the seven raw numeric feature values found zero exact feature-vector matches and zero exact labeled-row matches against the training CSV. This does **not** prove independence: the publisher provides no source institution, locations, dates, sampling protocol, sensor calibration, or row lineage. The page's real-world/sensor claim cannot be independently verified.

Compatibility also fails:

- N/P/K are specified in mg/kg, but the training source only says nutrient “ratio”; no scientifically supported conversion is documented.
- The candidate describes rainfall as annual, while the training source does not define the rainfall accumulation period.
- The candidate target is crop type grown, not a documented suitability/recommendation outcome.
- Only 6,620 rows have supported class names (Maize and Rice); 13,380 rows have unsupported classes. The 6,620 are still not scoreable because source semantics and units remain unresolved.

All 20,000 candidate rows were excluded. No values were transformed, labels forced, or model predictions generated.

The candidate's raw feature means differ from the training file. This is only a descriptive screen because the units/periods are not comparable:

| Feature | Training mean | Candidate mean | Candidate rows outside training observed min/max |
|---|---:|---:|---:|
| N | 50.55 | 77.22 | 1,355 |
| P | 53.36 | 47.48 | 0 |
| K | 48.15 | 55.16 | 0 |
| Temperature | 25.62 | 27.42 | 725 |
| Humidity | 71.48 | 64.90 | 9 |
| pH | 6.47 | 6.50 | 0 |
| Rainfall | 103.46 | 211.12 | 5,361 |

These counts must not be interpreted as measured covariate shift until feature units and sampling windows are documented. The nearly even class counts in the candidate also do not establish representativeness.

### Kaggle mirrors of the training dataset

Two other similarly named Kaggle datasets were downloaded and compared:

- [`aksahaha/crop-recommendation`](https://www.kaggle.com/datasets/aksahaha/crop-recommendation), version 1; publisher license says “Data files © Original Authors”.
- [`varshitanalluri/crop-recommendation-dataset`](https://www.kaggle.com/datasets/varshitanalluri/crop-recommendation-dataset), version 1; publisher-declared MIT.

Each has 2,200 rows and the same 22 balanced class names. After normalizing column names and label casing, **1,474 of 2,200 feature-and-label rows in each mirror exactly match the local training data**. This disproves independence for those rows; the remaining rows have no independent collection provenance and are not accepted as an external test set.

### Other candidates rejected

- [`NPK Soil Nutrient Dataset on Horticulture Land`](https://www.kaggle.com/datasets/muhammadaryadiwa/npk-soil-nutrient-dataset-on-horticulture-land) claims measurements from Padang, Indonesia, but its metadata does not specify a clear reusable license. Its described temperature and humidity are soil temperature/moisture, rainfall is absent, and its Chili/Cucumber/Bok Choy labels are unsupported and not shown to mean suitability.
- [`Crop Yield and Environmental Factors (2014–2023)`](https://www.kaggle.com/datasets/madhankumar789/crop-yield-and-environmental-factors-2014-2023) is publisher-declared CC BY-SA 4.0, but its publisher explicitly says it is synthetic. Synthetic evaluation records are disallowed.
- A Crossref-indexed 2023 paper, [“Sustainable Crop Recommendation System Using Soil NPK Sensor”](https://doi.org/10.1051/e3sconf/202343001100), cites the same Atharva Ingle Kaggle CSV as its crop recommendation CSV reference; it does not provide a separate independent evaluation dataset.

## Evaluation counts and metrics

| Measure | Result |
|---|---:|
| Qualified independent datasets | 0 |
| Candidate rows profiled in detail | 20,000 |
| Candidate rows submitted to the model | 0 |
| External samples evaluated | 0 |
| Detailed-candidate rows not used | 20,000 |
| Supported crop-name rows in detailed candidate, but still excluded | 6,620 |
| Unsupported crop-name rows | 13,380 |
| Accuracy / macro and weighted precision, recall, F1 | **Not computed** |
| Per-class metrics | **Not computed** |
| External confusion matrix | **Not generated** |

These are not zero-valued performance metrics: there was no valid evaluation sample. A confusion matrix for the existing grouped cross-validation remains at `ml_service/models/crop_suitability_grouped_confusion_matrix.png`; it is not an external-test confusion matrix.

## Reproducibility and model integrity

- Audited the saved pipeline, feature order, class mapping, training CSV, existing evaluator, and model card.
- Profiled the public 20,000-row candidate and compared raw numeric vectors and labels against the local training CSV.
- Compared both 2,200-row Kaggle mirrors by exact feature-and-label row values.
- Loaded the existing serialized pipeline to inspect its steps/features/classes. No `.fit`, `.fit_predict`, or training script was run.
- Rechecked the local CSV and stored CV report: 2,200 singleton exact-vector groups; each existing fold has 1,760 training and 440 held-out rows.
- Did not create a redundant holdout or regenerate existing evaluation artifacts.
- Verified the saved model SHA-256 before and after the audit: `521571C952060145443803C1FE31C2EC531C1F4139EADA5CB95CAB59A94FBA5C` (unchanged).
- No changes were made to `crop_service.py`, the prediction API, or the serialized model.
- Crop FastAPI regression tests: `python -m pytest -q test_crop_service.py` — **11 passed**, one Starlette/AnyIO deprecation warning.
- Parsed the report as JSON and asserted its blocked status, zero evaluated samples, null metrics, absent confusion matrix, and unchanged model hash — **passed**.

## What would complete the requirement

Obtain a documented external dataset with traceable collection/source metadata, clear reuse permission, the same seven feature definitions and units (or a validated conversion), and labels that genuinely mean crop suitability for supported classes. Preserve source IDs and remove any training overlap before running the saved pipeline. Until that is available, the model's reported results remain dataset-level only; they are not independent-source, farm, or field-trial accuracy.
