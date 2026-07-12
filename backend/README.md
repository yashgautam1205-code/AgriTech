# AI Crop Doctor - Backend

Simple Express backend for AI Crop Doctor app.

Setup:

1. Copy `.env.example` to `.env` and edit `MONGODB_URI` and `PORT`.
2. Install dependencies: `npm install`.
3. Run: `npm run dev` (needs nodemon) or `npm start`.

Routes:

- POST `/api/upload-crop-image` - form-data `image` file, optional `userId`
- GET `/api/history/:userId`
- GET `/api/health`

Notes:
- `services/aiService.js` is a mock. Replace with real ML model or external API.
- Uploads saved to `uploads/` by default.
