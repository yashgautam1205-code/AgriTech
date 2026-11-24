# Plant Disease MobileNetV2 Model Card

## Intended use and scope

This is a closed-set 38-class PlantVillage leaf-image classifier. It is not a
universal crop-identification system, confirmed field diagnosis, disease-severity
model, or substitute for local agricultural extension advice. A class passing
the configured threshold is labeled `CONFIRMED_BY_MODEL` only in the sense that
the model passed its image-score cutoff.

## Model and artifacts

- Architecture: ImageNet-pretrained MobileNetV2, 160 x 160 RGB input
- Preprocessing: TensorFlow RGB decode, resize to 160 x 160, MobileNetV2
  `preprocess_input`; serving uses the same decoder and preprocessing path as
  training and evaluation
- Production weights: `plant_disease_mobilenetv2.keras` (preserved; not retrained
  for the duplicate audit)
- Class-index order: `plant_disease_labels.json`
- Evaluation: `plant_disease_evaluation.json`
- Split/duplicate audit: `plant_disease_split_report.json`
- Calibration and validation threshold: `plant_disease_calibration.json`
- Confusion matrix and reliability diagram:
  `plant_disease_confusion_matrix.png`,
  `plant_disease_reliability_diagram.png`

## Data provenance and split

The source is PlantVillage color images at Hugging Face revision
`9e97599868962bd0079b8db4b7f1efa9185fa1e7`. The dataset card declares CC BY-SA
3.0; the upstream PlantVillage GitHub repository does not publish license
metadata. Review attribution and share-alike requirements before redistribution.
The source manifests list 54,305 records across 38 classes (43,596 train and
10,709 test). The dataset uses controlled backgrounds and is not representative
of field conditions.

Filename-derived leaf IDs are heuristic. Unresolved filenames use image-specific
singleton IDs, which do not prove physical leaf independence. A SHA-256 audit
found 14 duplicate records within the published train manifest, 2 within the
published test manifest, 5 exact-content hashes crossing the published
manifests, and 8 crossing the prior grouped training pool/test partition. Of
those, 1 exact duplicate was in model fit data and 2 were in validation data.
The corrected report excludes all test duplicates overlapping fit or validation
and deduplicates repeated test images: 6 records were excluded from the original
10,862 held-out candidates. No exact hashes or inferred group IDs overlap across
the final fit/calibration/test partitions. Hashing cannot detect recompressed,
resized, augmented, or biologically related images.

## Evaluation

The preserved production model was evaluated without retraining on 10,856
eligible same-source grouped PlantVillage test images:

- Accuracy: **94.11%**
- Macro precision / recall / F1: **92.03% / 93.82% / 92.67%**
- Weighted precision / recall / F1: **94.44% / 94.11% / 94.18%**
- Fit images reconstructed from the training metadata: **10,841**
- Validation images used for calibration: **6,924**
- Test candidates / excluded exact-duplicate records / evaluated: **10,862 /
  6 / 10,856**

Per-class precision, recall, F1, support, and confusion matrix are in
`plant_disease_evaluation.json`. The lowest F1 classes include
`Potato___healthy` (precision 56.14%, recall 100%, F1 71.91%; support 32),
`Tomato___Early_blight` (71.78% / 72.50% / 72.14%; support 200), and
`Tomato___Target_Spot` (82.68% / 74.73% / 78.50%; support 281). Class supports
are imbalanced (32 to 1,101 eligible test images).
`Strawberry___Leaf_scorch` has 99.08% precision, 97.30% recall, and 98.18% F1
on 222 same-source test images. Its six errors were predicted as Tomato
late blight (three), Grape Esca, Grape leaf blight, and Tomato early
blight (one each). This does not establish accuracy on field photos.

This evaluation is same-source held-out image classification, not
source-independent validation. No external disease-image dataset or field-photo
validation is present. The 94.11% result does not establish farm or field
accuracy. No independent expert review of all labels was performed.

## Confidence calibration and rejection threshold

Temperature scaling is fitted on grouped validation outputs after exact-content
overlap checks. For this saved model, temperature is **0.73647**. On the eligible
test set:

- Expected Calibration Error: **0.04277 raw**, **0.00649 temperature-scaled**
- Multiclass Brier score: **0.09485 raw**, **0.08947 temperature-scaled**

The raw-softmax rejection threshold is selected from validation only, with a
minimum raw score of 0.60, at least 95% validation top-1 precision, and at least
50% validation coverage. The selected threshold is **0.60045**, with 96.62%
validation precision and 90.22% coverage. Inference applies the threshold to
the raw score; the calibrated score is returned separately and does not turn a
below-threshold raw score into a confirmed prediction. A raw score of 43.4%
remains `UNCERTAIN`.

The reported uploaded Strawberry image replayed through the original serving
decoder at 43.38% raw confidence, with `Strawberry___Leaf_scorch` as the top
class. After aligning serving with the TensorFlow training/evaluation decoder,
the same image scored 42.88% raw and 48.58% temperature-scaled; both remain
below the 0.60045 raw-score threshold. This single unlabelled field/extension
photo is not a validation sample and does not contradict or validate the
same-source class metrics.

Calibration and threshold results describe this PlantVillage split only. The API
checks model and label-map SHA-256 hashes before applying calibration; stale or
missing calibration is reported as unavailable. Neither score is a verified
probability of correctness on farmer field photos.

## Known gaps and limitations

- No field-photo, external-source, or farm-trial validation.
- No trained alternative architecture comparison was performed. The current
  production model was preserved rather than replaced based on test results.
- The future MobileNetV2 training path now supports training-only geometric
  augmentation, class weights, validation-based learning-rate reduction, and
  exact-image grouping/deduplication. These changes have not been used to train
  new production weights.
- Per-class results remain uneven; see the classes above and the full report.
- A closed-set model may confidently misclassify unsupported crops or images.
- Model confidence is not disease severity or an outbreak risk estimate.
- Human verification of every dataset label and biological leaf identity is not
  available.
