# AgriTech Hackathon Readiness Report

## Executive summary

The existing application now demonstrates three connected workflows: saved-model crop suitability, saved-model plant disease classification, and explainable irrigation/crop-management guidance. End-to-end browser tests verified real user inputs flowing through Express to the ML/recommendation services. This is a working prototype, not a field-validated decision system.

| Requirement | Status | Verified scope |
|---|---|---|
| Agricultural data | **Partial** | Crop recommendation dataset and live Open-Meteo weather are integrated. Soil values are user-entered; there is no verified measured-soil dataset or connected soil sensor. |
| Crop suitability ML | **Implemented; dataset-level evaluation** | Saved Random Forest pipeline predicts 22 crop classes; Express-to-FastAPI and UI paths tested. No yield model. |
| Plant disease classification | **Implemented; dataset-level evaluation** | Saved MobileNetV2 classifies 38 PlantVillage classes; a real uploaded test image was processed through Express and FastAPI. No field-photo validation. |
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
- Dataset: 54,305 listed PlantVillage color images, pinned Hugging Face revision `9e97599868962bd0079b8db4b7f1efa9185fa1e7`; dataset card declares **CC BY-SA 3.0**. Published manifests had 227 inferred leaf-group overlaps; the generated train/validation/test partitions were group-separated.
- Partition sizes: **10,843 train / 6,923 validation / 10,861 held-out test images**. Held-out dataset-level results: **93.48% accuracy**; macro precision/recall/F1 **91.26% / 92.78% / 91.67%**; weighted precision/recall/F1 **93.93% / 93.48% / 93.57%**.
- Browser E2E uploaded a real held-out healthy Raspberry image; the service returned `Raspberry___healthy` with confidence `0.9997`. This validates the pipeline, not generalization to field photos. PlantVillage has controlled backgrounds; confidence is not calibrated and unsupported plants can be misclassified.
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
| Formal backend Node tests (`npm test`) | **15 passed** |
| FastAPI crop and disease tests | **16 passed** (one Starlette/AnyIO deprecation warning) |
| Playwright E2E | **4 passed**: crop model input/result, real disease upload, irrigation input/source, language/TTS |
| Frontend production build | **Passed** |
| Crop evaluation-only script | Reproduced 100% row-split and 99.45% grouped accuracy; serialized model SHA-256 unchanged |
| Disease evaluation-only script | Recomputed all 10,861 held-out images; aggregate results matched saved report |
| Express crop metadata endpoint | **200** with the serialized model's 22 supported classes |
| Live Open-Meteo check | **Available**, three forecast days for supplied coordinates |
| Shop and scheme API checks | No verified shops returned; schemes identify themselves as curated static references |
| Frontend npm audit | **0 vulnerabilities** |
| Backend production dependency audit | **0 vulnerabilities** with dev dependencies omitted |
| Backend full npm audit | **2 moderate dev-only advisories** involving `nodemon` / `minimatch`; review before deployment |
| Python dependency audit | Not run: `pip-audit` was unavailable in the environment |
| MongoDB persistence | Not verified: no local MongoDB service was available; JSON fallback was used |

The irrigation E2E test initially raced the asynchronous crop-model metadata request. The test now waits for the `GET /api/crop/model-info` response before selecting a crop; all four browser tests then passed.

An unfiltered `node --test` also discovers legacy root-level manual scripts: two passed, one timed out, and one received HTTP 415 because its 1 × 1 PNG fixture is correctly rejected by the upload validator. These are not part of the formal `backend/tests/*.test.js` suite; `npm test` now runs only the maintained suite.

### Service lifecycle and persistence

- Vite, Express, the crop FastAPI service, and the disease FastAPI service all started successfully. Logs recorded successful health/model-info requests, crop predictions, disease predictions, and irrigation E2E requests; invalid disease image requests returned validation errors as expected.
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
