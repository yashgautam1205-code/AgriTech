# AgriTech Express API

## Setup

1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm install`.
3. Start with `npm run dev` or `npm start`.

The API listens on port 4000 by default. MongoDB persistence is optional for local demonstrations: when MongoDB is unavailable, scan/chat data uses JSON files under `backend/data/`. This fallback is single-process local persistence, not a production database.

## Routes

- `GET /api/health`
- `POST /api/upload-crop-image` — multipart field `image`; JPEG, PNG or WebP, max 10 MB. Optional `selectedCrop` accepts a crop in the disease model's 38-class label map or `__unsupported__`; optional `observations` contains farmer-reported symptoms/spread.
- `POST /api/crop/predict` and `GET /api/crop/model-info` — forwards to the crop FastAPI service.
- `POST /api/agriculture/irrigation/recommend` — validates field inputs and optionally requests live weather.
- `POST /api/assistant`, `GET /api/assistant/history/:scanId`, `GET /api/assistant/history/user/:userId`
- `POST /api/speech/transcribe` — Saaras v4; multipart field `audio`, supported audio MIME types, maximum 10 MB, and 28-second browser recordings.
- `POST /api/speech/synthesize` — Bulbul v4 Flash; JSON `{ "text": "...", "language": "kn" }`, up to 2,500 characters.
- `GET /api/history/:userId`
- `GET /api/nearby-shops` — returns explicitly verified shop records only.
- `GET /api/government-schemes` — returns curated static reference links, not a live feed.
- `GET /api/pesticide-prices` — location-filtered, non-stale prices for products with verified registration and labels.
- `GET /api/admin/pesticide-products`, `POST /api/admin/pesticide-products`, `PUT /api/admin/pesticide-products/:productId` — token-protected product catalogue administration.
- `POST /api/admin/pesticide-prices`, `PUT /api/admin/pesticide-prices/:id` — token-protected price administration.

## Service configuration

See `.env.example` for `MONGODB_URI`, upload directory, crop/disease ML URLs and request timeouts. `SARVAM_API_KEY` and `SARVAM_SPEECH_TIMEOUT_MS` are backend-only; the key is never sent to the frontend. Speech routes use Sarvam Saaras v4 and Bulbul v4 Flash when configured. Disease and crop services are independent FastAPI processes. The frontend's Vite dev server proxies `/api` to `http://127.0.0.1:4000`.

Use `127.0.0.1` instead of `localhost` for local ML and MongoDB loopback connections on Windows. The default MongoDB URI is `mongodb://127.0.0.1:27017/ai-crop-doctor`. A reachable MongoDB Atlas URI can be assigned to `MONGODB_URI` as an alternative.

## Limitations

- There is no authentication or authorization. User IDs supplied by clients are not identity verification; do not expose this API or history routes publicly with personal data.
- CORS is currently open for development. Configure a production origin allowlist before deployment.
- MongoDB-backed persistence could not be verified where no MongoDB service is available. The local JSON fallback does not provide multi-process safety or durable cloud storage.
- Uploaded images are stored under the configured upload directory and served by the backend; add retention/access controls before production deployment.
- `services/aiService.js` uses the real disease classifier for image inference, while assistant text is deterministic rule-based guidance—not an LLM.
- Disease risk is a conservative farmer-observation triage, not a validated severity model. Image confidence and risk level are separate. No verified disease-specific risk map is configured.
- The source-linked organic/non-chemical catalogue covers Apple scab and Strawberry leaf scorch cultural practices. Strawberry guidance is from the Pacific Northwest Plant Disease Management Handbook; it is regional cultural advice, not a product application, cure, or organic-certification claim.
- `data/pesticide-products.json` and `data/pesticide-prices.json` start empty. There is no live retailer pricing API or loaded government historical price dataset. The app will not invent products/prices.
- The disease result distinguishes `predictionStatus` (`CONFIRMED_BY_MODEL`, `UNCERTAIN`, `UNSUPPORTED_CROP`, or `INVALID_IMAGE`) from the legacy `detectionStatus`. A farmer/model crop mismatch blocks disease-specific treatments and pesticide recommendations. `CONFIRMED_BY_MODEL` means only that the image score passed its threshold, not a confirmed field diagnosis.
- Uncertain scans still return educational information for the top model class: reviewed disease facts, sourced cultural guidance, prevention/follow-up, matching verified product references, matching prices, and weather. Disease risk remains `UNASSESSED`; verified products are reference-only and do not include application guidance when diagnosis or crop identity is uncertain.
- Disease knowledge is served from locally reviewed source-linked records. `AVAILABLE`, `PARTIAL`, `NOT_AVAILABLE`, `SOURCE_UNAVAILABLE`, and `RESTRICTED` communicate record/source state; a failed lookup falls back to local knowledge when available rather than omitting it.
- Disease inference preserves `confidence` as the raw softmax score and returns a separate `calibratedConfidence` only when temperature-scaling metadata matches the model and label-map SHA-256. The raw-score threshold is validation-selected; calibration and threshold evidence are PlantVillage-split-only.
- Disease-scan Open-Meteo forecasts expose the provider's actual calendar dates, timezone, precipitation, and fetch timestamp. If coordinates or weather are unavailable, the response explicitly reports that state and does not fabricate a forecast.
- An administrator token of at least 32 random characters (`PESTICIDE_PRICE_ADMIN_TOKEN`) is required for catalogue and price writes. Product records require a PPQS registration source, a label source, exact model class labels, and a human reviewer. This app stores the attestation and source URLs; it does not independently authenticate the review.
- Live retail prices are accepted only from a retailer-feed source and become stale after seven days. Manual prices are explicitly labeled administrator-maintained; historical government prices require a year and remain labeled historical. MongoDB persistence and fallback JSON behavior should be tested in the deployment environment.
- Saaras REST transcription accepts audio up to 30 seconds; browser recordings stop at 28 seconds. The backend additionally caps uploads at 10 MB and filters MIME types. Longer files are not split or batch-transcribed. Bulbul playback is capped at 2,500 characters; if Sarvam is unavailable the frontend falls back to browser speech.
