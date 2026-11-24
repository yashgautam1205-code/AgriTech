# AgriTech Express API

## Setup

1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm install`.
3. Start with `npm run dev` or `npm start`.

The API listens on port 4000 by default. MongoDB persistence is optional for local demonstrations: when MongoDB is unavailable, scan/chat data uses JSON files under `backend/data/`. This fallback is single-process local persistence, not a production database.

## Routes

- `GET /api/health`
- `POST /api/upload-crop-image` — multipart field `image`; JPEG, PNG or WebP, max 10 MB.
- `POST /api/crop/predict` and `GET /api/crop/model-info` — forwards to the crop FastAPI service.
- `POST /api/agriculture/irrigation/recommend` — validates field inputs and optionally requests live weather.
- `POST /api/assistant`, `GET /api/assistant/history/:scanId`, `GET /api/assistant/history/user/:userId`
- `GET /api/history/:userId`
- `GET /api/nearby-shops` — returns explicitly verified shop records only.
- `GET /api/government-schemes` — returns curated static reference links, not a live feed.

## Service configuration

See `.env.example` for `MONGODB_URI`, upload directory, crop/disease ML URLs and request timeouts. Disease and crop services are independent FastAPI processes. The frontend's Vite dev server proxies `/api` to this backend.

## Limitations

- There is no authentication or authorization. User IDs supplied by clients are not identity verification; do not expose this API or history routes publicly with personal data.
- CORS is currently open for development. Configure a production origin allowlist before deployment.
- MongoDB-backed persistence could not be verified where no MongoDB service is available. The local JSON fallback does not provide multi-process safety or durable cloud storage.
- Uploaded images are stored under the configured upload directory and served by the backend; add retention/access controls before production deployment.
- `services/aiService.js` uses the real disease classifier for image inference, while assistant text is deterministic rule-based guidance—not an LLM.
