# Multilingual Repair Report

## Architecture checked

- React 18 + Vite frontend.
- Express backend with MongoDB/local JSON persistence.
- Separate crop and disease FastAPI model services.
- Global locale module: `frontend/src/i18n.js`.
- Disease scan response assembly: `backend/controllers/scanController.js`.
- Dynamic translation route: `POST /api/translate`.

## Repaired

- Replaced the locale tables with valid UTF-8 dictionaries and removed inherited English values from partial locale resources.
- English, Hindi, and Kannada now have all 138 current English UI keys. These three locales are not marked partial.
- Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati, and Punjabi have explicit translations for the common controls, but remain partial. Their selectors say “(partial)” and the UI displays a missing-translation notice. Missing keys use visible English fallback rather than being represented as complete translations.
- Confirmed the language selector updates i18next and React immediately, persists under `agritech-language`, and restores the selected language on reload.
- Verified the documented Sarvam Translate API contract: `POST https://api.sarvam.ai/translate`, documented language codes, `translated_text` response field, and Mayura's 1,000-character input maximum. Requests no longer include the undocumented `enable_preprocessing` field.
- Added timeout bounds, response validation, unique-text deduplication, bounded in-memory caching, number/unit protection, and original-text fallback on errors.
- The disease scan handler now translates selected user-facing prose in a cloned response. It does not change stored data, model predictions, status/enum fields, confidence, IDs, scientific-name fields, product identifiers, or numeric/unit fields.
- The Sarvam key remains backend-only.

## Files repaired or added

- `frontend/src/i18n.js`
- `frontend/src/App.jsx`
- `frontend/src/translationService.js`
- `frontend/src/components/ResultCard.jsx`
- `frontend/tests/e2e.spec.ts`
- `backend/services/translationService.js`
- `backend/controllers/scanController.js`
- `backend/tests/translationService.test.js`
- `MULTILINGUAL_IMPLEMENTATION_REPORT.md`

The existing route import and `POST /api/translate` registration were checked and retained.

Other multilingual integration files from the earlier implementation were retained and checked: `backend/routes/scanRoutes.js`, `backend/.env.example`, `frontend/src/components/AssistantChat.jsx`, `frontend/src/components/CameraUpload.jsx`, `frontend/src/components/CropRecommendation.jsx`, `frontend/src/components/CropManagementRecommendation.jsx`, and the frontend package manifests.

## Language coverage

Registered language codes: English (`en`), Kannada (`kn`), Hindi (`hi`), Tamil (`ta`), Telugu (`te`), Malayalam (`ml`), Marathi (`mr`), Bengali (`bn`), Gujarati (`gu`), and Punjabi (`pa`).

Complete static UI dictionaries: English, Hindi, Kannada. The other seven locales are explicitly partial. Sarvam can translate supported dynamic prose when configured, but does not fill the missing static UI labels automatically.

## Sarvam configuration

Set these in `backend/.env`:

```text
SARVAM_API_KEY=
SARVAM_TRANSLATE_URL=https://api.sarvam.ai/translate
SARVAM_TRANSLATE_MODEL=mayura:v1
SARVAM_TRANSLATE_TIMEOUT_MS=15000
```

With no API key or an API failure, the source text is returned. Sarvam was not called against a live account during validation because no credential was configured.

API reference: [Sarvam Text Translation](https://docs.sarvam.ai/api-reference/text/translate-text).

## Validation results

- Changed backend JavaScript syntax checks: passed.
- Locale UTF-8, duplicate-key, and key-coverage checks: passed; Hindi and Kannada each cover all 138 English keys.
- Focused Sarvam service tests: 2 passed.
- Full backend suite: 40 passed, 0 failed.
- Frontend production build: passed; output was directed outside the repository.
- Playwright language-switch and reload-persistence test: 1 passed.

## Remaining limitations

- Static translations are incomplete for Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati, and Punjabi; the app marks those locales partial.
- Several result labels and tables remain hardcoded English in `frontend/src/components/ResultCard.jsx`.
- Some irrigation input labels, dropdown options, and result explanations remain hardcoded English in `frontend/src/components/CropManagementRecommendation.jsx`.
- Some shop, location, and scheme status text remains hardcoded English in `frontend/src/App.jsx`; assistant and history components also retain a few English fallback strings.
- The scan response is translated at scan time. Language switching afterward dynamically refreshes the risk/weather fields currently localized by the result component; other already-rendered scan prose may remain in the scan-time language.
- Browser speech recognition/synthesis is used; Sarvam Saaras/Bulbul voice APIs are not integrated. Actual regional voice availability depends on the browser and device.
- Dynamic translation behavior was verified with mocked API responses and fallback tests, not with live Sarvam credentials.
