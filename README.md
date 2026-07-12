AI Crop Doctor

Folders:
- backend: Express API, MongoDB, Multer, mock AI service
- frontend: Vite + React + Tailwind frontend

Quick start:

Backend:

```powershell
cd backend
npm install
copy .env.example .env
# edit .env if needed
npm run dev
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open the frontend URL shown by Vite and test scanning.

Environment & persistence

- `MONGODB_URI` or `MONGO_URI` — MongoDB connection string (example: `mongodb://localhost:27017/ai-crop-doctor`). If set, chat history and scans will persist in MongoDB.
- If MongoDB is not available, the backend will still start and save scans/chat history locally under `backend/data/`.
- `UPLOAD_DIR` — directory for image uploads (default `uploads`).

Run notes

1. Backend

```powershell
cd backend
npm install
# set MONGO_URI if you want persistence:
# $env:MONGO_URI = 'mongodb://localhost:27017/cropdoctor'
npm run dev
```

2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

API endpoints

- `POST /api/upload-crop-image` — upload image and run detection
- `POST /api/assistant` — ask question to assistant (body: `{ disease, question, scanId?, crop?, lat?, lon? }`)
- `GET /api/assistant/history/:scanId` — fetch persisted chat messages for a scan

Notes

- The assistant currently uses a simple rule-based generator in `backend/services/aiService.js`. Replace with an LLM integration for richer replies.
- Chat history requires `MONGO_URI` and a running MongoDB instance.
