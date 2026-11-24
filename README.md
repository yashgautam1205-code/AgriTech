## AgriTech

AgriTech is an existing React agriculture dashboard with three separate intelligence workflows: Random Forest crop suitability, MobileNetV2 leaf-image classification, and transparent rule-based irrigation guidance. Predictions are decision support, not guaranteed farm outcomes or substitutes for local extension advice.

See [HACKATHON_READINESS_REPORT.md](./HACKATHON_READINESS_REPORT.md) for verified feature status, evaluation results, end-to-end checks, security limitations, and a demo checklist.

### Architecture

```text
React + Vite dashboard
        | /api (Vite development proxy)
        v
Node.js + Express API -------- MongoDB (optional; local JSON fallback)
        |                       |
        | crop/disease HTTP     | scan/chat persistence
        v
FastAPI crop service (8000)    FastAPI disease service (8001)
  scikit-learn pipeline          TensorFlow/Keras MobileNetV2
        |
        +-- Open-Meteo weather (when location is provided)
```

### Start the complete application locally

Install Node dependencies once:

```powershell
cd C:\AgriTech\backend
npm install
Copy-Item .env.example .env
cd C:\AgriTech\frontend
npm install
cd C:\AgriTech\ml_service
python -m pip install -r requirements.txt
```

Ensure the local model files and datasets exist as described below, then start each service in its own PowerShell terminal:

```powershell
# Terminal 1: Express API
cd C:\AgriTech\backend
npm run dev
```

```powershell
# Terminal 2: Crop model API
cd C:\AgriTech\ml_service
python -m uvicorn crop_service:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 3: Disease model API
cd C:\AgriTech\ml_service
python -m uvicorn disease_service:app --host 127.0.0.1 --port 8001
```

```powershell
# Terminal 4: React dashboard
cd C:\AgriTech\frontend
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). MongoDB is optional for local demo use: when it is unavailable, the backend uses local JSON persistence for scans/chat. That fallback is not multi-process or production-grade storage. Crop and disease inference require their local serialized model artifacts; a missing service/model reports unavailable instead of returning a mock prediction.

### Windows PowerShell startup guide

Use separate PowerShell terminals and start them in this order:

```powershell
# Terminal 1 - Express backend, port 4000
cd C:\AgriTech\backend
Copy-Item .env.example .env -ErrorAction SilentlyContinue
npm install
npm start
```

The backend is healthy at `http://127.0.0.1:4000/api/health`.

```powershell
# Terminal 2 - Crop FastAPI, port 8000
cd C:\AgriTech\ml_service
python -m pip install -r requirements.txt
python -m uvicorn crop_service:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 3 - Disease FastAPI, port 8001
cd C:\AgriTech\ml_service
python -m uvicorn disease_service:app --host 127.0.0.1 --port 8001
```

```powershell
# Terminal 4 - React/Vite, port 5173
cd C:\AgriTech\frontend
npm install
npm run dev -- --host 127.0.0.1
```

The repository uses these loopback addresses for local startup:

- Crop FastAPI: `ML_SERVICE_URL=http://127.0.0.1:8000`
- Disease FastAPI: `DISEASE_ML_SERVICE_URL=http://127.0.0.1:8001`
- Express: `PORT=4000`
- Vite proxy: `http://127.0.0.1:4000`

Local MongoDB is expected at `mongodb://127.0.0.1:27017/ai-crop-doctor` only when a Windows MongoDB service/installation is available. MongoDB Atlas can instead be supplied through `MONGODB_URI=mongodb+srv://...` in `backend/.env`. MongoDB is optional; without a reachable server, Express deliberately continues and uses local JSON fallback persistence.

### Environment and persistence

- `MONGODB_URI` or `MONGO_URI`: optional MongoDB connection string.
- `PORT`: Express port, default `4000`.
- `UPLOAD_DIR`: image upload directory, default `uploads`.
- `ML_SERVICE_URL` / `ML_SERVICE_TIMEOUT_MS`: crop FastAPI URL/timeout.
- `DISEASE_ML_SERVICE_URL` / `DISEASE_ML_TIMEOUT_MS`: disease FastAPI URL/timeout.
- No frontend secret or API key is required. The current backend has no authentication; do not expose user history or uploaded images publicly without adding access controls.

### API endpoints

- `POST /api/upload-crop-image` — multipart `image` upload for disease classification.
- `POST /api/crop/predict`; `GET /api/crop/model-info`.
- `POST /api/agriculture/irrigation/recommend`.
- `POST /api/assistant`; `GET /api/assistant/history/:scanId`; `GET /api/assistant/history/user/:userId`.
- `GET /api/history/:userId`; `GET /api/nearby-shops`; `GET /api/government-schemes`; `GET /api/health`.

The assistant is deterministic rule-based code, not an LLM. Government-program entries are static reference links, not a live feed. Nearby shop results are hidden unless explicitly verified records are supplied.

Notes

- The assistant currently uses a simple rule-based generator in `backend/services/aiService.js`. Replace with an LLM integration for richer replies.
- Chat history uses MongoDB when configured and available; otherwise the local JSON fallback is single-process demo storage.

## Crop suitability ML service

The crop model is a saved scikit-learn `RandomForestClassifier` pipeline. FastAPI loads the pipeline once and reuses it for inference.

- Pipeline: `ml_service/models/crop_suitability.joblib`
- Evaluation: `ml_service/models/crop_suitability_report.json`
- Confusion matrix: `ml_service/models/crop_suitability_confusion_matrix.png`
- Grouped evaluation matrix: `ml_service/models/crop_suitability_grouped_confusion_matrix.png`
- Feature order: `N`, `P`, `K`, `temperature`, `humidity`, `ph`, `rainfall`
- Dataset: Crop Recommendation Dataset, Apache 2.0
- Original row-split accuracy: 100% on 330 held-out CSV rows (dataset-level; source independence unverified)
- Five-fold `StratifiedGroupKFold` accuracy: 99.45% out-of-fold (dataset-level)
- Grouped-CV macro precision / recall / F1: 99.47% / 99.45% / 99.45%
- Grouped-CV weighted precision / recall / F1: 99.47% / 99.45% / 99.45%
- Fold accuracy: 99.55%, 99.55%, 99.32%, 99.77%, 99.09%

Exact feature-vector grouping was used because the source CSV has no sample IDs; all 2,200 feature vectors are unique, so each row is a singleton group. Five-fold evaluation fits a cloned preprocessing/model pipeline on 1,760 rows and predicts 440 held-out rows per fold; every row receives an out-of-fold prediction once. This prevents exact duplicate vectors crossing folds but does not verify independence of related upstream augmented/source samples. No new single holdout was created because it would repartition the same singleton rows and add no independent source. These remain dataset-level results, not field-trial accuracy or real-world validation. Per-class metrics and confusion counts are in `ml_service/models/crop_suitability_report.json`.

### Independent external evaluation status: PARTIAL

The existing five-fold grouped CV is same-source out-of-fold evaluation, but its 2,200 exact-vector groups are all singletons; no source IDs or augmentation lineage support a defensible related-sample grouping. A separate holdout would be a redundant repartition, not an independent source. The external-data audit also found no dataset with verifiable provenance, compatible measurement units, and a crop-suitability target matching the model. Kaggle mirrors shared 1,474 exact feature-and-label rows with the training CSV; a separate 20,000-row candidate had unresolved N/P/K units and crop-grown rather than suitability labels. No external predictions or metrics were generated. The report and candidate audit are in [`CROP_INDEPENDENT_EVALUATION.md`](./CROP_INDEPENDENT_EVALUATION.md) and [`crop_external_test_report.json`](./ml_service/models/crop_external_test_report.json). The hackathon's independent-test requirement remains partial.

The model probability is an estimate, not a guaranteed agricultural outcome.

To reproduce training and the dataset-level evaluations after preparing the CSV:

```powershell
cd C:\AgriTech\ml_service
python train_crop_model.py
python evaluate_crop_model.py
```

Training replaces the local crop model and report. Run the evaluation command afterward to recreate the original row-split score and the five-fold exact-feature-vector grouped evaluation using temporary model copies. The evaluator does not overwrite the saved model.

### Start the ML service

```powershell
cd C:\AgriTech\ml_service
python -m pip install -r requirements.txt
python -m uvicorn crop_service:app --host 127.0.0.1 --port 8000
```

FastAPI documentation is available at `http://localhost:8000/docs`.

### Valid input ranges

| Feature | Range |
|---|---|
| N | 0-300 |
| P | 0-300 |
| K | 0-300 |
| temperature | -20 to 60 °C |
| humidity | 0-100% |
| pH | 0-14 |
| rainfall | 0-5000 mm |

### Prediction example

```powershell
$body = @{
  N = 90
  P = 42
  K = 43
  temperature = 20.88
  humidity = 82
  ph = 6.5
  rainfall = 202.94
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri http://localhost:8000/predict-crop `
  -ContentType "application/json" `
  -Body $body
```

The response contains `recommended_crop`, `confidence`, ranked `probabilities`, `input_features`, model metadata and feature order.

ML endpoints:

- `GET /health`
- `GET /model-info`
- `POST /predict-crop`

### Express integration

Set in `backend/.env`:

```text
ML_SERVICE_URL=http://127.0.0.1:8000
ML_SERVICE_TIMEOUT_MS=10000
```

Express endpoints:

- `POST /api/crop/predict`
- `GET /api/crop/model-info`

Express validates inputs, applies a timeout and hides internal ML service errors from API users.

### Test the crop ML service

```powershell
cd C:\AgriTech\ml_service
python -m pytest test_crop_service.py -q
```

## Plant disease image classification

The disease scan route sends the uploaded image to a separate FastAPI MobileNetV2 service. It does not choose a disease at random. The inference service requires the trained model and label map; until those artifacts are generated and the service reports `model_available: true`, disease scans are unavailable rather than replaced by mock predictions.

### Dataset provenance and preparation

- Dataset: [PlantVillage via Hugging Face](https://huggingface.co/datasets/mohanty/PlantVillage), pinned to revision `9e97599868962bd0079b8db4b7f1efa9185fa1e7`.
- The dataset card declares **CC BY-SA 3.0**. The upstream PlantVillage GitHub repository does not publish license metadata; confirm attribution and share-alike obligations before redistributing data or derived artifacts.
- The pinned card describes 54,306 images and 38 classes (including healthy leaves). Its published color train/test manifests sum to 54,305 entries; the downloader and training report record the actual manifest and image counts and must be treated as authoritative for this checkout.
- The publisher supplies `color_train.txt`, `color_test.txt`, and a leaf map. The original fallback-inclusive heuristic reported **227 filename leaf-group overlaps** across the published manifests. These filename-derived IDs are heuristic and do not establish biological leaf identity; unresolved filenames use image-specific singleton IDs.
- PlantVillage images have controlled backgrounds. Dataset-level test results do not establish field-photo accuracy or real-world diagnosis.

The downloader fetches roughly 2.2 GB of archive data and extracts it under an ignored data directory:

```powershell
cd C:\AgriTech\ml_service
python download_plantvillage.py
```

Train the classifier after dataset preparation. This uses ImageNet-pretrained MobileNetV2 with 160 × 160 RGB input, MobileNetV2 preprocessing, a 38-class softmax head, and a leaf-grouped held-out test fold generated from both published color manifests:

```powershell
cd C:\AgriTech\ml_service
python train_disease_model.py --head-epochs 3 --fine-tune-epochs 0 --max-per-class 300
```

The preserved production weights were trained for three classification-head epochs with the ImageNet MobileNetV2 base frozen; fine-tuning was disabled. The original model fit used 10,841 capped training images and 6,924 validation images. The source manifests list 43,596 train and 10,709 test records (54,305 total, 38 classes). Filename-derived groups are heuristic; unresolved records use image-specific singleton IDs.

An exact-byte SHA-256 audit found 14 duplicate records within the published train manifest, 2 within the published test manifest, and 5 hashes shared across the manifests. Eight exact hashes crossed the prior grouped training pool and test partition; one was present in the model's actual fit data and two in its validation data. Six test records were excluded from the corrected evaluation: one exact match to model training, two exact matches to validation, and three repeated exact test images. The future training pipeline now joins and deduplicates exact-image hashes before its group split. This detects byte-identical copies only; it cannot establish biological leaf independence or detect resized/recompressed variants.

**Corrected same-source grouped evaluation:** 10,856 eligible held-out images, accuracy **94.11%**; macro precision/recall/F1 **92.03% / 93.82% / 92.67%**; weighted precision/recall/F1 **94.44% / 94.11% / 94.18%**. The preserved model was not retrained. The evaluation has zero filename-group overlap and zero exact image-hash overlap between fit, calibration, and eligible test records. It remains PlantVillage-only; the test set is not an external source or field-photo validation.

Temperature scaling (`T=0.73647`) was fitted only on 6,924 validation images. On the untouched eligible test records, ECE changed from **0.04277** to **0.00649** and multiclass Brier score from **0.09485** to **0.08947**. The confidence rejection threshold is selected from validation raw-softmax scores: **0.60045**, meeting 96.62% validation top-1 precision at 90.22% coverage. Inference returns both the raw score and a PlantVillage-calibrated score; the status threshold is applied to raw confidence, so a 43.4% raw score remains uncertain. Calibration and threshold performance do not establish field-photo reliability.

Serving now uses the same TensorFlow RGB decoder, resize, and MobileNetV2 preprocessing as training/evaluation. The reported uploaded Strawberry photo scored 42.88% raw and 48.58% temperature-scaled after alignment, so it remains uncertain. This single image has no verified field diagnosis and is not an independent evaluation set.

No genuinely independent, compatible external disease-image dataset is present. No second architecture was trained or compared; the requested EfficientNet/alternative comparison remains **not verified**. The future MobileNetV2 training path now includes training-only augmentation, class weighting, validation-based learning-rate reduction, and exact-image grouping, but these training changes have not been used to replace or retrain the preserved model. The model card and full report are `ml_service/models/DISEASE_MODEL_CARD.md` and `ml_service/models/plant_disease_evaluation.json`; `plant_disease_split_report.json` records exclusions and distributions.

The training run saves `models/plant_disease_mobilenetv2.keras`, `models/plant_disease_labels.json`, `models/plant_disease_evaluation.json`, and `models/plant_disease_confusion_matrix.png`. The generated model file is ignored by Git; the model must exist locally before enabling inference. Results are dataset-level only—not field-trial accuracy or real-world validation.

Recompute the saved model's held-out metrics without retraining:

```powershell
cd C:\AgriTech\ml_service
python evaluate_disease_model.py
```

This reloads the serialized model and labels, reconstructs the original grouped fit/validation partitions, hashes the image bytes, excludes exact duplicates from calibration/test scoring, and regenerates the evaluation, calibration, confusion matrix, and split report without retraining.

### Start and connect the disease service

Install the existing ML requirements, then start this service separately from the crop service:

```powershell
cd C:\AgriTech\ml_service
python -m pip install -r requirements.txt
python -m uvicorn disease_service:app --host 127.0.0.1 --port 8001
```

Set these backend environment variables (also listed in `backend/.env.example`):

```text
DISEASE_ML_SERVICE_URL=http://127.0.0.1:8001
DISEASE_ML_TIMEOUT_MS=30000
```

The inference API accepts raw image bytes, not a JSON body:

- `GET /health` — reports whether the saved model loaded.
- `GET /model-info` — lists the architecture, input size, supported classes, raw-score threshold and calibration status/source.
- `POST /predict-disease` — accepts raw JPEG, PNG or WebP bytes, up to 10 MB and at least 64 × 64 pixels.

Example request:

```powershell
Invoke-WebRequest -Method Post `
  -Uri http://127.0.0.1:8001/predict-disease `
  -ContentType "image/jpeg" `
  -InFile .\leaf.jpg
```

The response includes the top class, raw softmax confidence (`confidence` and `raw_confidence`), PlantVillage-calibrated confidence when the calibration artifact matches the model and label-map hashes, ranked raw/calibrated class scores, threshold source, and `status` (`prediction` or `uncertain`). The validated raw-score threshold is loaded from the evaluation artifact unless `DISEASE_CONFIDENCE_THRESHOLD` overrides it. This is not an out-of-distribution detector; unsupported field plants can still receive a confident but incorrect closed-set result.

The existing Express upload endpoint remains `POST /api/upload-crop-image`. It accepts a multipart `image` field (JPEG/PNG/WebP, up to 10 MB), forwards it to the disease service, and returns a user-safe error if the service or model is unavailable. The response retains the original disease, confidence, treatment and weather fields and adds risk, sourced non-chemical guidance, verified-product recommendations and market-price fields.

The Express response includes `predictionStatus` (`CONFIRMED_BY_MODEL`, `UNCERTAIN`, `UNSUPPORTED_CROP`, or `INVALID_IMAGE`) and the legacy `detectionStatus`; it also includes `cropSelection`, `confidence` (raw softmax), `calibratedConfidence` when matching calibration metadata is available, `confidenceThreshold`, and `calibrationStatus`. A `detectionStatus` of `uncertain` suppresses a forced predicted class. `CONFIRMED_BY_MODEL` means the raw score passed its PlantVillage-validation threshold, not that a field diagnosis is confirmed.

Disease model tests require both the prepared dataset and trained model:

```powershell
cd C:\AgriTech\ml_service
python -m pytest -q test_disease_service.py test_disease_evaluation.py test_disease_training_pipeline.py test_crop_service.py
```

To run the browser upload test, start the frontend, Express backend, crop service on port 8000, and disease service on port 8001. Set `PLANTVILLAGE_TEST_IMAGE` to an image path from the prepared PlantVillage dataset, then run:

```powershell
cd C:\AgriTech\frontend
$env:PLANTVILLAGE_TEST_IMAGE = 'C:\AgriTech\ml_service\data\plantvillage\images\raw\color\Tomato___healthy\some-image.JPG'
npx playwright test tests/disease-scan.spec.ts
```

The classifier remains limited to PlantVillage's closed 38 classes. It does not identify arbitrary crops. The returned calibrated score and threshold are validated only on the documented PlantVillage split; there is no field-photo or external-source validation.

## Disease risk, treatments and pesticide prices

The scan request accepts an optional multipart `observations` JSON value:

- `symptomsSpreading`: `yes`, `no`, or `unsure`
- `affectedPlants`: `less_10`, `10_30`, `more_30`, or `unsure`
- `visibleSymptoms`: zero or more of `spots`, `yellowing`, `wilting`, `leaf_drying`, `mold`, `other`

The upload form also allows an optional farmer crop selection. When the selected crop conflicts with the model's class crop, or the crop is not supported, the response marks the classification `UNCERTAIN` or `UNSUPPORTED_CROP` and blocks disease-specific application recommendations. It still retrieves educational information for the model's top class. `CONFIRMED_BY_MODEL` means only that the model score passed its threshold; it is not a confirmed field diagnosis. Invalid image uploads return `predictionStatus: INVALID_IMAGE`.

The response includes the possible class's `cropId`, `diseaseId`, symptoms, description, scientific name where sourced, disease-development conditions, prevention, follow-up, and references. Knowledge comes from locally reviewed records; a source lookup failure reports `PARTIAL`/`SOURCE_UNAVAILABLE` while retaining cached facts. Each information section has an availability status. An unlisted class reports `NOT_AVAILABLE` rather than fabricated disease details.

The response's `riskAssessment` keeps model confidence separate from `risk_level` and includes `predicted_class`, `is_uncertain`, `risk_reason`, `recommended_action`, `assessment_limitations`, and farmer-reported observations. A low-confidence or crop-mismatched result is `UNASSESSED`; observations are displayed as farmer reports and are not diagnosis. Confidence is not disease severity.

Non-chemical guidance is deliberately limited to disease/source pairs with a referenced source. Current entries include **Apple scab** cultural leaf-litter/leaf-wetness management from [Utah State University Extension](https://extension.usu.edu/planthealth/ipm/notes_ag/fruit-apple-scab), and **Strawberry leaf scorch** practices to reduce leaf wetness from the [Pacific Northwest Plant Disease Management Handbook](https://pnwhandbooks.org/plantdisease/host-disease/strawberry-fragaria-spp-leaf-scorch). The Strawberry advice is regional cultural guidance; adapt it to local conditions. Neither entry is a product application, cure claim, or organic certification. On uncertain scans, matching non-chemical information remains visible as educational possible-disease guidance; confirm the diagnosis before disease-specific action.

The product catalogue is initially empty (`backend/data/pesticide-products.json`). A chemical product is returned only when an administrator has reviewed both a crop/disease-matched class label and the product registration/label sources, marked both verification states `verified`, and verified the entry within the previous year. The [PPQS/CIB&RC Registered Products page](https://ppqs.gov.in/divisions/cib-rc/registered-products) publishes registration lists (the latest list reviewed here was dated 31 March 2026), and the [Pesticides Recommendation for Crops page](https://ppqs.gov.in/farmercorner/pesticides-recommendation-crops?language_content_entity=en) is an official reference. No Strawberry leaf-scorch-specific Indian registration and approved label were verified, so no product or price record has been added. Verified class-matched records may appear as reference-only on uncertain/mismatched scans, with application dosage and frequency suppressed and an explicit restriction. Registration references must use the official PPQS/CIB&RC domain; the exact product label reference and safety information are stored per product. The system does not automatically verify the truth of an administrator's review.

No live retailer price API or imported government price dataset is configured, and no product or price records are seeded. The data.gov.in catalogue was not accessible from the research environment, so no historical price dataset or API could be verified for integration. Current prices therefore remain unavailable until verified product records and sourced price records are entered. Live retail, manufacturer MRP, historical government, and administrator-maintained price types are represented separately. An administrator-maintained price is never labeled live; live retail records require a retailer feed source, expire for display after seven days, and cannot be created through the manual admin route. Historical prices require a year and an Indian government source URL, and are always labeled historical.

Price/catalogue endpoints:

- `GET /api/pesticide-prices?state=...&district=...&town=...` — returns non-stale price listings only for products with currently verified registration and label records. The farmer must provide a location; none is inferred.
- `GET /api/admin/pesticide-products` — administrator listing of pesticide catalogue records.
- `POST /api/admin/pesticide-products`, `PUT /api/admin/pesticide-products/:productId` — create/update a reviewed product catalogue record.
- `POST /api/admin/pesticide-prices`, `PUT /api/admin/pesticide-prices/:id` — create/update a price record.

All `/api/admin/*` routes require `Authorization: Bearer <token>` and a configured `PESTICIDE_PRICE_ADMIN_TOKEN` of at least 32 characters. Records use MongoDB when connected and `backend/data/pesticide-products.json` / `backend/data/pesticide-prices.json` otherwise. JSON fallback is single-process local persistence. Provide only official source links and actual verification timestamps; do not enter guessed registration, price, stock or seller data.

For administrator onboarding, copy the exact crop/disease labels from `ml_service/models/plant_disease_labels.json` into `targetClasses`. Supply the PPQS registration reference, approved-label source, reviewed pack sizes, reviewer, review date, safety information, and crop-specific label details. Then add sourced price records whose pack size/unit match the verified catalogue and whose location identifies exact state/district/town. A manually maintained retail listing uses `priceType: "administrator_manual"`; it cannot be marked `live_retail`.

## Irrigation and crop-management guidance

The Express endpoint `POST /api/agriculture/irrigation/recommend` combines field inputs with the existing location-based weather service. It does not call or change either trained model. Crop choices in the dashboard are loaded from the existing crop model's `/api/crop/model-info`; if that service is unavailable, the form allows a crop name but returns no unsupported crop coefficient.

### Data sources and inputs

- **Live forecast/current weather:** [Open-Meteo Forecast API](https://open-meteo.com/en/docs) (`current` temperature, relative humidity and wind; 3-day daily temperature, precipitation, wind and FAO reference ET0), only when valid latitude and longitude are provided. API failures and missing location are returned as unavailable; no synthetic forecast replaces them.
- **User-entered field observations:** crop and stage, soil type, dry/adequate/wet moisture condition, optional moisture percentage, recent 24-hour rainfall, and optional forecast rainfall total. A manually entered forecast total takes precedence over the live forecast total and is labeled accordingly.
- **User-entered soil-test values:** optional N, P, K and pH. The existing crop suitability dataset is not a calibrated fertilizer recommendation dataset; no deficiency threshold or fertilizer rate is inferred.
- **Dashboard sensor readings:** none are simulated or imported. Moisture and other field values come from user input; a numeric moisture value is not calibrated or silently classified by the service.

A separate Wokwi ESP32 irrigation simulation exists outside this repository. It uses a potentiometer as a moisture proxy and a DHT22 for simulated temperature/humidity, with local LCD/LED/relay outputs. It has no network/API connection to this dashboard, and the relay does not operate a real pump.

### Method and assumptions

For crops with a mapped FAO-56 coefficient and when live FAO reference ET0 is available, the service estimates a **standard-condition crop evapotranspiration indicator**, `ETc = Kc × ET0`. Stage-specific initial/mid/end coefficients are based on [FAO Irrigation and Drainage Paper 56, Chapter 6, Table 12](https://www.fao.org/4/x0490e/x0490e0b.htm); the reference relationship is described in [Chapter 5](https://www.fao.org/4/x0490e/x0490e0a.htm). During the development stage the service uses a simple midpoint between initial and mid-season Kc. Several crop entries are explicitly labeled group/crop proxies or conditions (for example bare soil, canopy, or first-year banana); no coefficient is emitted for unsupported crops.

ETc is **not** an irrigation volume or a guarantee of crop water need. The transparent qualitative rule also uses the farmer-selected moisture condition and compares gross forecast rainfall with modeled ETc where both exist. Forecast precipitation is not treated as effective rainfall: runoff, rainfall intensity, root-zone storage, and field drainage are unknown. With dry soil and expected rain, the recommendation is to reassess after rainfall unless the crop is already stressed. With missing/un-calibrated moisture, it asks the user to inspect the root zone instead of inventing a trigger.

The method does not compute FAO Penman–Monteith ET0 from manual temperature/humidity: required radiation, wind and additional weather inputs and local calibration are not available. Soil texture alone is not used as a numeric irrigation trigger. Recommendations are qualitative, not a validated irrigation scheduling model.

### API example

```json
{
  "crop": "maize",
  "growthStage": "fruiting",
  "soilType": "sandy",
  "moistureCondition": "dry",
  "soilMoisturePercent": 18,
  "recentRainfallMm": 0,
  "forecastRainfallMm": 0,
  "N": 90,
  "P": 42,
  "K": 43,
  "ph": 6.5,
  "latitude": 12.97,
  "longitude": 77.59
}
```

`growthStage` accepts `establishment`, `vegetative`, `flowering`, `fruiting`, or `maturation`. Coordinates are optional but must be supplied together. The response includes a qualitative action and rationale, input/source labels, live weather if available, missing inputs, nutrient caveats and uncertainty notes. Invalid fields return HTTP 400. Existing crop endpoints `/api/crop/predict` and `/api/crop/model-info` and disease scan routes are unchanged.

Government-scheme entries are curated static links, not refreshed government data. Shop listings are returned only when explicitly marked verified; this checkout contains no verified directory and will show an empty state instead of sample shops.

### Tests

```powershell
cd C:\AgriTech\backend
npm test tests\cropManagementService.test.js
```

The frontend irrigation flow is covered in `frontend/tests/e2e.spec.ts`; run it with the existing backend, crop ML service and Vite frontend as described above.
