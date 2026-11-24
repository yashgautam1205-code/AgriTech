# Plant Disease System Audit

## Scope and evidence

This audit follows the existing React upload, Express route/controller, disease inference client, FastAPI inference service, model artifact, and disease-management services. It also checks the checked-in evaluation artifacts and current local dataset layout. It does not treat prior test summaries as new test results.

## End-to-end path

1. `frontend/src/components/CameraUpload.jsx` accepts JPEG, PNG, and WebP files up to 10 MB, sends multipart field `image`, and includes farmer observations and optional coordinates.
2. `backend/routes/scanRoutes.js` uses Multer to apply the upload-size and MIME checks. `backend/controllers/scanController.js` validates farmer observations and calls `analyzeImage`.
3. `backend/services/aiService.js` forwards the stored file through `backend/services/diseaseInferenceService.js` to `POST /predict-disease` on the configured disease FastAPI service.
4. `ml_service/disease_service.py` loads the existing model and labels at FastAPI startup, validates and decodes the uploaded image, converts it to RGB, resizes to 160 x 160, applies MobileNetV2 preprocessing, and returns the top class and top-five scores.
5. Express adds observation-based risk triage, available management guidance, verified-product lookup, weather status, and persistence. The result is displayed by `frontend/src/components/ResultCard.jsx`.

## Baseline findings before follow-up changes

### Model and evaluation

- The existing model is MobileNetV2 with 160 x 160 RGB input and 38 PlantVillage classes. `disease_service.py` checks the saved model input/output shapes against `plant_disease_labels.json`.
- The local PlantVillage source has 54,305 listed color images (43,596 published-train and 10,709 published-test records), pinned in the evaluation report to Hugging Face revision `9e97599868962bd0079b8db4b7f1efa9185fa1e7`. The dataset card declares CC BY-SA 3.0; this is not field data.
- At baseline, the report recorded 10,862 same-source grouped test images, 94.117% accuracy, macro F1 92.676%, and weighted F1 94.190%. These figures preceded the exact-image leakage audit below and are not the corrected results.
- `train_disease_model.py` creates filename/leaf-map group IDs and uses image-specific singleton IDs for unresolved filenames. The baseline report listed 2,638 fallback-group test records. The regenerated audit lists 2,634 unresolved-filename records in the current held-out test partition and 2,676 in the full published-test manifest; the previously cited 2,639 count is not reconciled to these artifacts. The complete fallback path list is retained in `plant_disease_fallback_audit.json`. Singleton IDs prevent ID overlap but do not establish biological leaf independence.
- The published-manifest grouping was heuristic: the prior legacy method reported 227 overlaps. The current report separates unresolved fallback IDs; that reduces mapped overlap but cannot prove biological independence. The original published manifests are retained.
- The baseline per-class report showed materially uneven results, including `Potato___healthy` F1 71.91% and `Tomato___Early_blight` F1 72.14%; see the corrected report below.
- At baseline, temperature scaling had ECE 0.04278 before and 0.00669 after scaling, while the production API returned raw softmax only and the 0.60 threshold was not recorded as validation-selected. These findings were addressed below; no comparison against another architecture was performed.
- At baseline, the training script lacked augmentation, class weighting, and learning-rate scheduling. The future training path was updated, but it has not been used to retrain or replace the production model.
- No independent field-photo or external-source disease dataset is present in the project. PlantVillage performance cannot establish field accuracy.

### Identification and recommendations

- The classifier is a closed-set disease/healthy leaf classifier, not a universal crop-identification model. Its crop name is parsed from the predicted PlantVillage class.
- Before changes, the upload form did not let a farmer confirm the crop. Treatment lookup trusted the predicted class crop without checking farmer-reported crop compatibility.
- Risk is a rule-based triage of farmer-reported spread and affected-plant range. It is not a validated severity or outbreak model; model confidence is kept separate.
- At baseline, source-linked non-chemical guidance covered Apple scab only. The checked-in pesticide catalogue and price files are empty; MongoDB contents were not confirmed. Product and price endpoints require reviewed metadata.
- The assistant is deterministic rule-based code, not an LLM. No disease-specific treatment claims should be inferred for classes without mapped sourced guidance.

### Weather, UI, and persistence

- Disease-scan weather is requested from Open-Meteo only when valid coordinates are supplied. Before changes, the disease forecast included weather code and minimum/maximum temperature but not precipitation, a fetch timestamp, or an actual calendar date (it displayed weekday names only).
- The React scan flow has upload validation, loading, user-safe errors, and a result view. Confidence was labeled simply “Confidence,” without distinguishing raw softmax score from dataset calibration or field reliability.
- MongoDB is optional and its persistence is not verified in the current environment; the app can use its local JSON fallback. There is no user authentication, so history endpoints are not suitable for exposure as a public production service.

## Follow-up changes

### Leakage-aware evaluation and confidence reporting

- The saved MobileNetV2 weights and original published manifests were preserved. Exact SHA-256 review found 14 repeated records in the published train manifest, 2 in test, 5 hashes shared across the published manifests, and 8 exact hashes crossing the former grouped fit pool and test partition. One hash had appeared in fit data and two in calibration data.
- The corrected same-source grouped report excludes six test records (fit/validation duplicates and repeated test copies) and evaluates the remaining 10,856 images. Accuracy is 94.11%; macro precision/recall/F1 is 92.03%/93.82%/92.67%; weighted precision/recall/F1 is 94.44%/94.11%/94.18%. Full per-class results and confusion matrix are in `ml_service/models/plant_disease_evaluation.json`.
- Future training now groups and deduplicates exact-image hashes before partitioning. Filename leaf IDs and image-specific fallback IDs remain heuristic; exact-byte hashing does not establish biological independence and misses transformed duplicates.
- Temperature scaling is fit on validation data only (T=0.73647). Test ECE is 0.04277 raw and 0.00649 scaled; Brier score is 0.09485 raw and 0.08947 scaled. A raw-score threshold of 0.60045 was selected on validation (96.62% precision, 90.22% coverage). The API returns raw and calibrated scores separately and applies the cutoff to raw confidence. Calibration is PlantVillage-split-only.

### Prediction and farmer guidance

- The upload form accepts optional farmer crop selection. Crop/model incompatibility blocks disease-specific organic and pesticide advice. API/UI statuses distinguish a model-threshold match, uncertainty, unsupported crop, and invalid image while retaining legacy fields.
- Organic guidance remains source-linked only for Apple scab; the pesticide catalogue and price lists are empty. No pesticide dose, price, or product is invented.
- Disease-scan weather now displays provider dates, timezone, precipitation, and retrieval time. Missing coordinates/provider failures remain explicitly unavailable.
- The future MobileNetV2 training path includes training-only augmentation, class weighting, validation-based learning-rate reduction, and exact-image grouping. No retraining was performed. No alternative architecture was trained or compared.

### Validation and remaining work

- The disease/crop ML tests passed (**25 tests**), backend tests passed (**29 tests**), and frontend production build passed in the last verification run. The updated Playwright end-to-end scan suite has **not** been rerun after these changes; no new full UI-to-model result is claimed here.
- During the final check, the existing service on port 8001 accepted a real Tomato healthy image and returned `Tomato___healthy` at raw confidence 0.96647, but its response omitted the newly added calibration fields. The current source was therefore started in isolation on port 8011: `/model-info` reported 38 classes, `calibration_status: applied`, and `confidence_threshold_source: grouped_validation`; real inference returned raw confidence 0.96647 and calibrated confidence 0.99375. That isolated process was intentionally stopped after verification.
- The frontend listener on port 5173 did not serve a page, while the other standard service ports were already occupied by running processes. They were not interrupted. Consequently, a current React-to-Express-to-FastAPI E2E scan was not verified; the earlier browser result is historical and does not cover the latest UI/API changes.
- No external-source or field-photo dataset is available in the repository. Dataset results do not establish farm performance. MongoDB persistence remains unverified where only JSON fallback was available.
- The model card is `ml_service/models/DISEASE_MODEL_CARD.md`; generated artifacts include `plant_disease_evaluation.json`, `plant_disease_calibration.json`, `plant_disease_split_report.json`, `plant_disease_fallback_audit.json`, and the confusion/reliability plots.

### Requested issue statuses

| Issue | Status | Evidence / boundary |
|---|---|---|
| Filename-inferred leaf identity | **PARTIAL** | IDs remain heuristic; filenames do not prove biological leaf identity. |
| 227 legacy inferred-group overlaps | **PASS** for group separation; **PARTIAL** for biological independence | Revised partitions separate group IDs and exact-image hashes; the original manifests and legacy audit are retained. The biological identities behind filename groups remain unknown. |
| Fallback-group record counts | **PARTIAL** | The regenerated audit reports 2,634 held-out-test fallback records and 2,676 in the published-test manifest. The earlier 2,639 figure is not reconciled to the current artifacts; all fallback paths are recorded. Singleton IDs do not establish separate physical leaves. |
| Dataset-level evaluation | **PASS** | Corrected same-source grouped holdout metrics and per-class/confusion artifacts were regenerated without retraining or test-set tuning. |
| Field-photo/external validation | **PARTIAL** | No compatible independent disease dataset or field-photo evaluation is available; no such performance is claimed. |
| Confidence calibration | **PASS** on the PlantVillage split; **UNVERIFIED** for field photos | Temperature/threshold are validation-fitted and test metrics improved; deployment-domain calibration is unknown. |
| Current React-to-Express-to-FastAPI scan | **UNVERIFIED** after the latest changes | Current model inference works on the isolated FastAPI source; active shared processes are stale and the frontend listener was unavailable. |
| Alternative architecture comparison | **UNVERIFIED** | No second architecture was trained or evaluated. |

## Multi-class scan UI follow-up (2026-11-24)

### Results display and failure states

- `CameraUpload.jsx` now reports local validation and API failures to the parent dashboard. Starting another scan clears stale results; invalid-image and service errors are also displayed in the results panel instead of leaving that panel blank.
- With no scan result, `ResultCard.jsx` shows a localized empty state. Mapped predictions display crop, disease/healthy class name, healthy/diseased classification status, and the raw model score separately. Low-confidence healthy predictions use a healthy-class uncertainty label, while disease matches remain explicitly unconfirmed.
- The crop-selection prompt, disease/status labels, and healthy/diseased classification labels are translated in all ten locale dictionaries. Class display names use the existing dynamic translation path; class identifiers, model outputs, scores, and healthy/diseased enums remain unchanged.
- Deterministic Playwright tests exercise a Potato diseased class, a Tomato healthy class, a low-confidence Tomato class, English-source class-name localization into Kannada, invalid-image responses, and a disease-service error. They mock the Express upload response and do not write scan or upload files.

### Live model smoke test

- The running model-info endpoint reported MobileNetV2, all 38 supported PlantVillage classes, a raw-confidence cutoff of `0.6004458666`, and a closed-set prediction scope.
- One local held-out image from `color_test.txt` was submitted directly to FastAPI for each of the 38 labels. All 38 requests returned a result and every class was represented in the exact class registry. The top class matched 36 samples; this small smoke test is not a model-accuracy estimate.
- Two samples were incorrectly classified above the threshold: `Potato___Late_blight` as `Tomato___Late_blight` at 0.7963, and `Tomato___Target_Spot` as `Tomato___Spider_mites Two-spotted_spider_mite` at 0.9590. Tomato early blight matched its expected top class but remained uncertain at 0.5455. These errors are preserved as model limitations; no prediction, threshold, or model weights were changed.
- Four additional held-out Tomato early-blight samples also returned the correct top class; three remained below threshold and one produced a confirmed prediction at 0.8320. Together, five tested Tomato early-blight images all had the expected top class, but only one exceeded the current threshold.
- A non-image body submitted with `image/jpeg` was rejected by the model API with HTTP 415.

### Validation and limitations

- Backend regression suite: **53 passed**. Locale completeness suite: **3 passed**, with **285/285** keys in each of ten locales. Frontend production build passed (588.51 kB minified JavaScript chunk warning). Focused Playwright disease scan suite: **3 passed, 1 skipped**; the real Express-upload case was skipped because no `PLANTVILLAGE_TEST_IMAGE` was configured. A full Playwright discovery run remains blocked by an existing named-export/CommonJS error in `e2e.spec.ts`.
- The real model smoke test used the local FastAPI endpoint directly. The React tests used mocked upload responses; a fresh complete React-to-Express-to-FastAPI upload was not run, to avoid changing persisted scans and uploads.
- The model is closed-set and can confidently assign an unrelated or out-of-domain image to one of the known classes. Without validated out-of-distribution detection, such an image cannot reliably be identified as unsupported. Low-confidence results are flagged; confident cross-class errors remain possible.
- Existing Tomato Early Blight detection remains mapped and returned the right top label for the selected test sample, but that sample's score was below the threshold and displayed as uncertain. The classifier was not retrained or modified.

## Disease-information pipeline follow-up (2026-11-24)

### Exact class mapping and reviewed knowledge

- `backend/services/diseaseClassRegistry.js` now contains one exact record for every model label. Automated checks compare the 38 records against `ml_service/models/plant_disease_labels.json`, reject duplicates, and verify that near-match/case-changed identifiers do not resolve. Each record includes the original class name, canonical crop and disease IDs, display names, and healthy/diseased status.
- Measured coverage is **38/38 class mappings**, including **12 healthy classes**. Disease-specific source-backed records cover **3/26 diseased classes**: Apple scab, Strawberry leaf scorch, and Tomato early blight. The other 23 diseased classes remain mapped but do not receive invented symptoms, causes, or disease-specific treatments.
- All 12 healthy classes receive explicitly labeled PlantVillage healthy-class education. The response warns that a healthy-labeled image match does not establish field health.
- The three disease records include cited sources, URLs, review dates, symptoms, supported causes/spread information, preventive measures, and local-diagnosis disclaimers. The Tomato early-blight details use the cited Tamil Nadu Agricultural University page; region-specific guidance is identified as such.
- Source-backed non-chemical guidance covers those same three disease classes. It makes no cure, pesticide-efficacy, or organic-certification claim. For mapped classes without a reviewed record, the API provides a meaningful no-record message and general advice to document symptoms and seek local extension confirmation.

### Product and price evidence

- Product lookup now requires an exact mapped diseased class and its exact model crop; healthy, mismatched, or unknown classes are blocked. Catalogue validation rejects healthy-class targets and requires a PPQS/CIB&RC registration source, a reviewed approved-label reference, and current verification metadata.
- The checked-in `pesticide-products.json` and `pesticide-prices.json` are empty. No product, registration number, dosage, pack price, or retailer is seeded. The previous public price endpoint check returned zero listings. The separate MongoDB read-only probe was unavailable, so MongoDB collections are **not** asserted to be empty.
- Prices remain dependent on a verified product and matching approved pack size. Without those records, the response explicitly reports that no matching verified product/price is available rather than substituting a sample or historical price.

### Scan response, UI, and risk

- The scan result now includes legacy model IDs and separate canonical IDs/class metadata without changing prediction values or confidence scores. Disease and crop matching remains exact; no approximate disease-name matching was introduced.
- `ResultCard.jsx` presents the possible-match warning, reviewed disease details and references, source review dates, general educational follow-up, and meaningful unavailable messages across all five existing information sections. Dynamic display localization includes disease labels and causes/spread text; the known scientific name is protected during both backend and client-triggered translation. Internal IDs, model outputs, numerical fields, and price/product identifiers remain unchanged.
- Image confidence remains distinct from farmer-observation risk. Missing observations leave field risk **UNASSESSED**, including for a healthy-class prediction. Unknown class identifiers also remain unassessed and cannot generate pesticide advice.

### Validation for this follow-up

- Backend suite: **53 passed, 0 failed** (`npm test` in `backend/`), including the missing-crop-selection status and source/review-date checks.
- Locale completeness at that follow-up: **3 passed**; all 10 locales contained **279/279** non-empty keys with matching placeholders and no duplicate locale keys or detected mojibake. The later multi-class UI follow-up raised coverage to 285/285.
- Frontend production build: **passed**. Vite reports a 581.22 kB minified JavaScript chunk over its 500 kB advisory threshold.
- Backend JavaScript syntax and `git diff --check`: **passed**.
- No model inference, file/image decode, upload, screenshot, live Sarvam call, or live MongoDB inspection was performed for this code-only follow-up. Playwright scan tests were not run because they exercise image uploads.

### Remaining limitations

- Verified disease-specific information is intentionally limited to 3 of 26 diseased classes; all remaining mapped classes show explicit education and local-confirmation guidance only.
- No verified pesticide catalogue records or market-price listings are available in the checked-in JSON data. Production MongoDB contents could not be inspected.
- Agricultural content has not received native-speaker or independent agronomist review for every region. TNAU/Utah State/Pacific Northwest references are regional and should be validated locally.
- No current end-to-end React-to-Express-to-model inference was performed for this change; the unchanged classifier was not retrained or replaced.
