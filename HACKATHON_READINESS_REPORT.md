# AgriTech Hackathon Readiness Report

## Executive summary

The existing application demonstrates three workflows: saved-model crop suitability, saved-model plant disease classification, and explainable irrigation/crop-management guidance. The current Playwright suite exercises crop recommendation, irrigation, and real-image disease scans. This is a working prototype, not a field-validated decision system.

| Requirement | Status | Verified scope |
|---|---|---|
| Agricultural data | **Partial** | Crop recommendation dataset and live Open-Meteo weather are integrated. Soil values are user-entered; there is no verified measured-soil dataset or connected soil sensor. |
| Crop suitability ML | **Implemented; dataset-level evaluation** | Saved Random Forest pipeline predicts 22 crop classes; Express-to-FastAPI and UI paths tested. No yield model. |
| Plant disease classification | **Implemented; same-source grouped evaluation** | Saved MobileNetV2 classifies 38 PlantVillage classes. Exact-image leakage was audited and duplicate test records excluded; no external-source or field-photo validation. |
| Irrigation and crop management | **Prototype implemented** | User inputs and optional live forecast drive a transparent, qualitative rule-based response. It is not a calibrated irrigation schedule; no fertilizer rates are prescribed. |
| Independent evaluation | **Partial — source-independent test not verified** | Existing five-fold CV holds out rows per fold but exact-vector groups are all singletons; source/augmentation groups are unavailable. Public candidates were audited and rejected. No external metrics are claimed. |

## Architecture and integrations

```text
React + Vite dashboard
    | /api (development proxy)
    v
Node.js + Express
    |-- crop prediction and model info --> FastAPI crop service (8000)
    |                                      scikit-learn Random Forest
    |-- image upload/classification -----> FastAPI disease service (8001)
    |                                      TensorFlow/Keras MobileNetV2
    |-- irrigation recommendations ------> rule-based service + Open-Meteo
    |-- persistence ----------------------> MongoDB or local JSON fallback
```

- `frontend/src/`: dashboard and React components; `frontend/tests/`: Playwright E2E tests.
- `backend/routes/`, `controllers/`, `services/`, and `models/`: Express APIs, integrations, and persistence.
- `ml_service/`: FastAPI apps, training/evaluation scripts, model metadata, and tests. Model weights and downloaded datasets are local artifacts, not source-controlled deliverables.
- External integrations: Open-Meteo forecast API; Hugging Face PlantVillage dataset; Kaggle Crop Recommendation Dataset. Government schemes are static curated links. No LLM, identity provider, verified shop feed, or live government feed is connected.

## Feature and data findings

### Crop suitability

- The serialized `RandomForestClassifier` uses ordered inputs `N`, `P`, `K`, `temperature`, `humidity`, `ph`, `rainfall` and returns crop scores for 22 classes.
- Dataset: 2,200 rows, 100 per class, from the Crop Recommendation Dataset (Kaggle; dataset page reports Apache 2.0). The dataset is assembled/augmented for India-focused recommendations; it does not include soil type, organic carbon, source IDs, or field/site metadata.
- Saved row-split score: **100% accuracy** on 330 held-out rows. This row split cannot demonstrate source independence.
- Five-fold `StratifiedGroupKFold` by exact feature vector: **99.45%** out-of-fold accuracy. Macro precision/recall/F1: **99.47% / 99.45% / 99.45%**; weighted precision/recall/F1: **99.47% / 99.45% / 99.45%**. Fold accuracies: **99.55%, 99.55%, 99.32%, 99.77%, 99.09%**.
- Exact feature vectors were used as groups because the source file has no sample identifiers; all 2,200 vectors are unique. This prevents identical vectors crossing folds, but cannot establish independence of upstream samples. No source-independent or field validation exists.
- Each CV fold fits a cloned preprocessing/model pipeline on 1,760 rows and tests on 440 rows; each of the 2,200 rows receives one out-of-fold prediction. This is same-source sample-level evaluation, not a locked independent-source test. No new holdout was added because all exact-vector groups are singletons and re-splitting the same data would be redundant.
- Per-class results and confusion matrices: `ml_service/models/crop_suitability_report.json`, `crop_suitability_grouped_confusion_matrix.png`.

#### Independent external evaluation

The fifth challenge requirement remains **PARTIAL**. The search found no dataset whose source independence, seven feature definitions/units, and crop-suitability labels could all be verified. Two Kaggle mirrors shared 1,474 of 2,200 exact feature-and-label rows with the training CSV. A separate 20,000-row Kaggle candidate had zero exact raw-vector matches, but provenance was not substantiated, N/P/K units differed or were undocumented in training, and its target described crops grown rather than crop suitability. Of the candidate labels, 6,620 matched supported classes and 13,380 did not; none were scored.

External samples evaluated: **0**. Accuracy, precision, recall, F1, per-class metrics, and an external confusion matrix are **not computed/generated**. See `CROP_INDEPENDENT_EVALUATION.md` and `ml_service/models/crop_external_test_report.json`. The saved model was not retrained or modified.

### Plant disease

- Saved ImageNet-initialized **MobileNetV2**, 160 × 160 RGB input, 38 softmax classes (healthy and diseased).
- Dataset: 54,305 listed PlantVillage color images, pinned Hugging Face revision `9e97599868962bd0079b8db4b7f1efa9185fa1e7`; dataset card declares **CC BY-SA 3.0**. The legacy filename method reported 227 overlaps. The corrected split has zero inferred group/hash overlap, but filename IDs and singleton fallbacks do not establish biological independence. The current report lists 2,634 fallback records in held-out test and 2,676 in the full published-test manifest; the previously cited 2,639 count is unreconciled.
- Preserved model fit: **10,841 train / 6,924 validation images**; original grouped holdout test was 10,862 images. Same-source grouped test after exact-content exclusions: **10,856 images**, **94.11% accuracy**; macro precision/recall/F1 **92.03% / 93.82% / 92.67%**; weighted precision/recall/F1 **94.44% / 94.11% / 94.18%**.
- SHA-256 audit found 14 duplicate records within the published train manifest, 2 within test, 5 exact hashes across published manifests, and 8 across the prior grouped training pool/test partition. Of those, one was in model fit and two in validation; three additional repeated test copies were excluded. Six test records were excluded total. Future training now groups and deduplicates exact-image hashes before splitting.
- Filename-derived leaf IDs remain heuristic. No exact hashes overlap among the corrected fit/calibration/test sets; this still does not establish biological independence. The results are same-source PlantVillage only.
- Validation-fitted temperature scaling (T = **0.73647**) changed test ECE from **0.04277** to **0.00649** and multiclass Brier score from **0.09485** to **0.08947**. The raw-score threshold (**0.60045**) was selected on validation at 96.62% precision / 90.22% coverage. These are dataset-level calibration results, not field calibration.
- Serving now uses the same TensorFlow RGB decoder, resize, and MobileNetV2 preprocessing as training/evaluation. The reported Strawberry photo scored **42.88% raw / 48.58% temperature-scaled** through the updated FastAPI source and remains uncertain; its diagnosis is not independently verified. Strawberry leaf-scorch test metrics are **99.08% precision / 97.30% recall / 98.18% F1** on 222 same-source images; six misses were mostly predicted as Tomato late blight (3), with one each to Grape Esca, Grape leaf blight, and Tomato early blight.
- Lowest-F1 classes include Potato healthy (F1 **71.91%**, support 32), Tomato early blight (F1 **72.14%**, support 200), and Tomato target spot (F1 **78.50%**, support 281). An alternative architecture comparison and expert review of labels were not performed.
- Source-backed Strawberry cultural guidance now covers reducing leaf wetness, with regional limitations cited from the Pacific Northwest Plant Disease Management Handbook. The pesticide product and price catalogues remain empty: no Strawberry leaf-scorch-specific Indian registration plus approved label, or verified price feed, was established.
- Scan results now retain educational information for the possible top-class match regardless of confidence. Disease knowledge, management, pesticide references, prices, and weather carry explicit availability/restriction states; uncertain diagnoses remain `UNASSESSED` and never receive pesticide dosage/application advice.
- Real-image React-to-Express-to-FastAPI Playwright scans passed for the uploaded Strawberry photo and a PlantVillage Tomato image. The currently running FastAPI process was started without `--reload`, so it still uses the previous decoder until restarted; the updated FastAPI source was separately exercised through TestClient. Confidence and calibration are supported only on the grouped PlantVillage split; unsupported plants can still be misclassified.
- Classwise metrics and confusion matrix: `ml_service/models/plant_disease_evaluation.json`, `plant_disease_confusion_matrix.png`. Review share-alike and attribution obligations before redistributing data or derivatives.

### Weather, irrigation, and crop management

- Open-Meteo is called only with supplied coordinates; live weather was verified available for a test location with a three-day forecast. Missing coordinates/provider failure are reported as unavailable; no default location or synthetic weather is substituted.
- The irrigation service combines crop/stage, farmer-reported soil moisture/type, rainfall, optional soil-test values, and forecast data. Where FAO-56 crop coefficients and Open-Meteo ET0 are available, it computes an ETc indicator (`Kc × ET0`) and explains its qualitative guidance.
- ETc is not a water volume or guaranteed crop need. Forecast precipitation is not effective rainfall; runoff, root-zone storage, and drainage are not modeled. Manual humidity/temperature do not replace the required ET0 inputs. The result is not a validated scheduling model.
- Nutrient inputs are assessed conservatively; the system does not prescribe fertilizer rates. The dashboard does not simulate or ingest sensor readings.

### Separate Wokwi hardware simulation

A Wokwi project exists at `C:\Hardware simulation\irrigation system\`, outside the AgriTech Git repository. Its diagram contains an ESP32, potentiometer moisture proxy, DHT22, LCD, relay, and LED. The sketch maps the potentiometer ADC value to an uncalibrated 0-100% moisture display and locally toggles the relay/LED at a 40% threshold; the relay represents a pump and no real pump is connected. No Wi-Fi, MQTT, HTTP, or dashboard/API telemetry path is present, so this is not connected IoT functionality and does not provide real sensor measurements.

The sketch sets both dry and wet thresholds to 40%, although a comment says the off threshold is 45% and describes hysteresis. Thus the current threshold values do not implement hysteresis. This separate simulation was inspected but not modified or compiled as part of this AgriTech repository's tests.

## API surface

**Express (`http://localhost:4000`)**

- `GET /api/health`
- `POST /api/crop/predict`; `GET /api/crop/model-info`
- `POST /api/upload-crop-image` (multipart field `image`; JPEG/PNG/WebP; 10 MB limit)
- `POST /api/agriculture/irrigation/recommend`
- Assistant/history routes, `GET /api/nearby-shops`, and `GET /api/government-schemes`

**FastAPI crop service (`http://localhost:8000`)**: `GET /health`, `GET /model-info`, `POST /predict-crop`.

**FastAPI disease service (`http://localhost:8001`)**: `GET /health`, `GET /model-info`, `POST /predict-disease` (raw image bytes).

## Verification performed

| Check | Result |
|---|---|
| Backend Node tests (`npm test`) | **30 passed** |
| FastAPI disease inference/evaluation/training tests | **15 passed**; final evaluation artifact tests **4 passed** (one upstream Starlette/AnyIO deprecation warning) |
| Playwright E2E | **4 passed**: language/TTS, crop recommendation, irrigation, and real-image disease scan |
| Frontend production build | **Passed** |
| Disease evaluation-only script | Recomputed 10,856 eligible held-out images; accuracy **94.11%**; `model_modified: false` |
| Updated disease preprocessing and direct inference | TensorFlow decoder/preprocessing tensors match training exactly; real Strawberry and Tomato images returned predictions through FastAPI TestClient |
| Current React-to-Express-to-FastAPI E2E | **Passed** for real Strawberry and Tomato images using the running services; FastAPI on port 8001 needs restart to load the decoder change |
| Express crop metadata endpoint | **200** with the serialized model's 22 supported classes; full browser crop recommendation test passed |
| Weather/irrigation browser checks | **Passed**; disease results retain the weather panel independently of uncertainty |
| Shop and scheme API checks | No verified shops returned; schemes identify themselves as curated static references |
| Frontend npm audit | **0 vulnerabilities** |
| Backend production dependency audit | **0 vulnerabilities** with dev dependencies omitted |
| Backend full npm audit | **2 moderate dev-only advisories** involving `nodemon` / `minimatch`; review before deployment |
| Python dependency audit | Not run: `pip-audit` was unavailable in the environment |
| MongoDB persistence | Not verified: no local MongoDB service was available; JSON fallback was used |

An earlier irrigation E2E test raced the asynchronous crop-model metadata request; the test was updated to wait for `GET /api/crop/model-info`. The earlier four-test pass predates the latest disease UI/API changes and must not be interpreted as verification of those changes.

An unfiltered `node --test` also discovers legacy root-level manual scripts: two passed, one timed out, and one received HTTP 415 because its 1 × 1 PNG fixture is correctly rejected by the upload validator. These are not part of the formal `backend/tests/*.test.js` suite; `npm test` now runs only the maintained suite.

### Service lifecycle and persistence

- In earlier verification, Vite, Express, crop FastAPI, and disease FastAPI started successfully and served health/model-info, predictions, and irrigation requests. During the latest check, the existing service on port 8001 was running older loaded code without calibration response fields; the current disease source was verified separately on port 8011. The updated React-to-service flow has not been rerun.
- The four local services were stopped intentionally after testing with explicit process IDs. The harness later reported exit code `-1` for those stopped sessions; these are intentional shutdowns, not application crashes or failed tests.
- MongoDB connection attempts failed with `ECONNREFUSED`. The application used its local JSON fallback; MongoDB-backed persistence and functionality remain **unverified**, not passed.

## Security, reliability, and readiness limitations

1. **Authentication/authorization are absent.** Client-supplied user IDs are not identity. Do not expose history or personal data publicly without access control.
2. **CORS is open for development.** Configure an explicit production origin allowlist.
3. **Uploaded images are served from the backend upload directory** without production retention/access controls. Add private storage, authorization, retention limits, and cleanup policy.
4. **JSON persistence is single-process demo storage**, not concurrency-safe or a production database. MongoDB behavior still needs an integration test in an environment with MongoDB.
5. **No source-independent crop evaluation or farm/field validation.** Crop and disease metrics are dataset-level and must not be presented as field accuracy.
6. **Agronomic coverage is limited.** No authoritative measured soil dataset is integrated; no fertilizer rates, yield prediction, calibrated irrigation schedule, or connected real sensor/IoT input exists. A separate Wokwi simulator is not integrated with this application.
7. **External directory/feed data are not live.** The current checkout has no verified shop directory; government information is static reference links.
8. **Dependency posture is not fully clean.** Two moderate backend development-dependency advisories remain; Python dependency vulnerability scanning was not completed.
9. **External weather service availability is variable.** Missing/error states are surfaced, but live API behavior depends on network/provider uptime.

## Reproducible local demo

Install dependencies and prepare local model/data artifacts according to [README.md](./README.md). Start each service in its own PowerShell terminal:

```powershell
cd C:\AgriTech\backend
npm run dev
```

```powershell
cd C:\AgriTech\ml_service
python -m uvicorn crop_service:app --host 127.0.0.1 --port 8000
```

```powershell
cd C:\AgriTech\ml_service
python -m uvicorn disease_service:app --host 127.0.0.1 --port 8001
```

```powershell
cd C:\AgriTech\frontend
npm run dev
```

To re-run checks:

```powershell
cd C:\AgriTech\backend
npm test
cd C:\AgriTech\ml_service
python -m pytest -q
cd C:\AgriTech\frontend
npm run build
npm run test:e2e
```

For the disease E2E test, set `PLANTVILLAGE_TEST_IMAGE` to an existing image in the prepared PlantVillage dataset. For actual live weather in the irrigation flow, provide valid coordinates; otherwise the response correctly indicates weather is unavailable. Use farmer-observed values and label them as such—do not imply they are sensor measurements.

## Demo checklist and judge-facing explanation

- Demonstrate a crop recommendation using entered N/P/K, pH, temperature, humidity, and rainfall; show the API result and explain that probabilities are model scores, not farm guarantees.
- Upload a real PlantVillage test image through the dashboard; show the image preview, predicted class, confidence/uncertainty state, and the 38-class limitation.
- Demonstrate irrigation guidance with a chosen crop/stage, observed moisture, and rainfall forecast. Show the explanation and source labels; identify missing or unavailable inputs.
- Show the saved evaluation reports and explain grouped dataset-level testing. State plainly that there is no independent farm/field validation.
- Do not demonstrate sample shops, fabricated sensors, fake weather, fertilizer dosage, yield predictions, or the assistant as an LLM.
