const path = require('path');
const { analyzeImage, generateAssistantResponse } = require('../services/aiService');
const persistence = require('../services/persistence');
const govSchemeService = require('../services/governmentSchemeService');
const Shop = require('../models/Shop');
const cropPredictionService = require('../services/cropPredictionService');
const { getDiseaseServiceHealth } = require('../services/diseaseInferenceService');
const { validateObservations } = require('../services/diseaseRiskService');
const { validateSelectedCrop } = require('../services/diseaseCropCompatibilityService');
const pesticidePriceService = require('../services/pesticidePriceService');
const pesticideCatalogService = require('../services/pesticideCatalogService');
const crypto = require('crypto');
const { translateText, localizeScanResponse } = require('../services/translationService');
const sarvamSpeechService = require('../services/sarvamSpeechService');

function validateCropFeatures(body) {
  const ranges = {
    N: [0, 300],
    P: [0, 300],
    K: [0, 300],
    temperature: [-20, 60],
    humidity: [0, 100],
    ph: [0, 14],
    rainfall: [0, 5000]
  };
  const features = {};

  for (const [name, [minimum, maximum]] of Object.entries(ranges)) {
    const value = typeof body[name] === 'string' ? Number(body[name]) : body[name];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      return { error: `Invalid ${name}: expected a number from ${minimum} to ${maximum}` };
    }
    features[name] = value;
  }

  return { features };
}

async function predictCrop(req, res) {
  const { features, error } = validateCropFeatures(req.body || {});
  if (error) {
    return res.status(400).json({ message: error });
  }

  try {
    const prediction = await cropPredictionService.predictCrop(features);
    return res.json(prediction);
  } catch (err) {
    console.error('Crop prediction service error:', err.message);
    if (err.message === 'ML_CROP_TIMEOUT') {
      return res.status(504).json({ message: 'Crop recommendation service timed out. Please try again.' });
    }
    return res.status(503).json({ message: 'Crop recommendation is temporarily unavailable. Please try again later.' });
  }
}

async function getCropModelInfo(req, res) {
  try {
    const info = await cropPredictionService.getCropModelInfo();
    return res.json(info);
  } catch (err) {
    console.error('Crop model-info service error:', err.message);
    return res.status(503).json({ message: 'Model information is temporarily unavailable.' });
  }
}

async function uploadCropImage(req, res) {
  try {
    const file = req.file;
    if (!file || !file.path) {
      return res.status(400).json({ message: 'No image provided or upload failed' });
    }

    const { observations, error: observationsError } = validateObservations((req.body || {}).observations);
    if (observationsError) {
      return res.status(400).json({ message: observationsError });
    }
    const { selectedCrop, error: cropError } = validateSelectedCrop((req.body || {}).selectedCrop);
    if (cropError) {
      return res.status(400).json({ message: cropError });
    }

    const filePath = file.path;
    const lat = parseFloat(req.body.lat);
    const lon = parseFloat(req.body.lon);
    let aiResult;
    try {
      aiResult = await analyzeImage(
        filePath,
        lat,
        lon,
        String(req.body.lang || 'en'),
        file.mimetype,
        observations,
        selectedCrop
      );
    } catch (err) {
      if (err.message === 'INVALID_DISEASE_IMAGE') {
        return res.status(415).json({
          predictionStatus: 'INVALID_IMAGE',
          message: 'Upload a valid JPEG, PNG, or WebP leaf image (at least 64 × 64 pixels).'
        });
      }
      if (err.message === 'DISEASE_ML_TIMEOUT') {
        return res.status(504).json({ message: 'Disease identification timed out. Please try again.' });
      }
      if (err.message === 'DISEASE_ML_UNAVAILABLE') {
        return res.status(503).json({ message: 'Disease identification is temporarily unavailable.' });
      }
      if (err.message === 'DISEASE_MODEL_NOT_LOADED') {
        return res.status(503).json({ message: 'Disease model is not loaded. Please restart the disease service.' });
      }
      if (err.message === 'DISEASE_ML_PREDICTION_FAILED') {
        return res.status(503).json({ message: 'Disease identification failed while processing the image. Please try again.' });
      }
      throw err;
    }

    // Normalize pesticides: keep cost info for chemical, extract names for organic
    const normalizePesticides = (pesticides) => {
      if (!pesticides) return { organic: [], chemical: [] };
      return {
        organic: Array.isArray(pesticides.organic)
          ? pesticides.organic.map(p => typeof p === 'string' ? p : p.name || String(p))
          : [],
        chemical: Array.isArray(pesticides.chemical)
          ? pesticides.chemical.map(p => {
              if (typeof p === 'string') return { name: p, cost: null };
              return { name: p.name || String(p), cost: p.cost || null };
            })
          : []
      };
    };

    // Normalize affordableAlternatives: extract names from objects
    const normalizeAlternatives = (alts) => {
      if (!Array.isArray(alts)) return [];
      return alts.map(alt => typeof alt === 'string' ? alt : alt.name || String(alt));
    };

    const scan = await persistence.saveScan({
      userId: req.body.userId || 'anonymous',
      disease: aiResult.disease,
      severity: aiResult.severity,
      treatments: aiResult.treatments,
      pesticides: normalizePesticides(aiResult.pesticides),
      affordableAlternatives: normalizeAlternatives(aiResult.affordableAlternatives),
      weatherForecast: aiResult.weatherForecast,
      voiceText: aiResult.voiceText,
      confidence: aiResult.confidence,
      imagePath: filePath,
      crop: aiResult.crop,
      cropId: aiResult.cropId,
      diseaseId: aiResult.diseaseId,
      canonicalCropId: aiResult.canonicalCropId,
      canonicalDiseaseId: aiResult.canonicalDiseaseId,
      classMappingStatus: aiResult.classMappingStatus,
      classMetadata: aiResult.classMetadata,
      possibleDiseaseName: aiResult.possibleDiseaseName,
      cropSelection: aiResult.cropSelection,
      predictedClass: aiResult.predictedClass,
      predictionStatus: aiResult.predictionStatus,
      detectionStatus: aiResult.detectionStatus,
      calibratedConfidence: aiResult.calibratedConfidence,
      confidenceThreshold: aiResult.confidenceThreshold,
      calibrationStatus: aiResult.calibrationStatus,
      diseaseInfo: aiResult.diseaseInfo,
      riskAssessment: aiResult.riskAssessment,
      organicTreatments: aiResult.organicTreatments,
      chemicalRecommendations: aiResult.chemicalRecommendations,
      pesticidePrices: aiResult.pesticidePrices,
      pesticidePriceStatus: aiResult.pesticidePriceStatus,
      pesticidePriceMessage: aiResult.pesticidePriceMessage,
      lang: req.body.lang || 'en'
    });

    // Optimize response for rural users: simple short sentences
    const response = {
      disease: aiResult.disease,
      crop: aiResult.crop,
      cropId: aiResult.cropId,
      diseaseId: aiResult.diseaseId,
      canonicalCropId: aiResult.canonicalCropId,
      canonicalDiseaseId: aiResult.canonicalDiseaseId,
      classMappingStatus: aiResult.classMappingStatus,
      classMetadata: aiResult.classMetadata,
      possibleDiseaseName: aiResult.possibleDiseaseName,
      cropSelection: aiResult.cropSelection,
      predictedClass: aiResult.predictedClass,
      predictionStatus: aiResult.predictionStatus,
      detectionStatus: aiResult.detectionStatus,
      topPrediction: aiResult.topPrediction,
      diseaseInfo: aiResult.diseaseInfo,
      riskAssessment: aiResult.riskAssessment,
      organicTreatments: aiResult.organicTreatments,
      chemicalRecommendations: aiResult.chemicalRecommendations,
      pesticidePrices: aiResult.pesticidePrices,
      pesticidePriceStatus: aiResult.pesticidePriceStatus,
      pesticidePriceMessage: aiResult.pesticidePriceMessage,
      severity: aiResult.severity,
      treatments: aiResult.treatments,
      pesticides: normalizePesticides(aiResult.pesticides),
      affordableAlternatives: normalizeAlternatives(aiResult.affordableAlternatives),
      weatherForecast: aiResult.weatherForecast,
      voiceText: aiResult.voiceText,
      confidence: aiResult.confidence,
      calibratedConfidence: aiResult.calibratedConfidence,
      confidenceThreshold: aiResult.confidenceThreshold,
      calibrationStatus: aiResult.calibrationStatus,
      scanId: scan._id
    };

    const localizedResponse = await localizeScanResponse(response, String(req.body.lang || 'en'));
    localizedResponse.lang = String(req.body.lang || 'en');
    localizedResponse.contentLanguage = String(req.body.lang || 'en');
    res.json(localizedResponse);
  } catch (err) {
    console.error('Upload error:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      errors: err.errors ? Object.keys(err.errors).map(k => `${k}: ${err.errors[k].message}`) : undefined
    });
    res.status(500).json({ message: 'Image processing failed. Please try another image.' });
  }
}

async function translateUserText(req, res) {
  const lang = typeof req.body?.lang === 'string' ? req.body.lang : 'en';
  const source = typeof req.body?.source === 'string' ? req.body.source : 'en';
  const input = req.body?.text;
  if (typeof input !== 'string' && !Array.isArray(input)) {
    return res.status(400).json({ message: 'text must be a string or an array of strings' });
  }

  try {
    if (Array.isArray(input)) {
      const texts = await Promise.all(input.map(value =>
        typeof value === 'string' ? translateText(value, lang, source) : ''
      ));
      return res.json({ lang, translations: texts });
    }
    return res.json({ lang, translatedText: await translateText(input, lang, source) });
  } catch (error) {
    console.warn('Dynamic translation request failed:', error.message);
    if (Array.isArray(input)) {
      return res.json({
        lang,
        translations: input.map(value => typeof value === 'string' ? value : '')
      });
    }
    return res.json({ lang, translatedText: input });
  }
}

async function transcribeSpeech(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ message: 'Audio recording is required.' });
  if (!file.size || !file.buffer?.length) {
    return res.status(400).json({ message: 'Audio recording is empty.' });
  }

  const autoDetect = req.body?.autoDetect === 'true';
  const language = req.body?.language;
  if (!autoDetect && !sarvamSpeechService.languageCodes[language]) {
    return res.status(400).json({ message: 'A supported language is required for speech recognition.' });
  }

  try {
    const transcription = await sarvamSpeechService.transcribeAudio(file, autoDetect ? 'unknown' : language);
    return res.json(transcription);
  } catch (error) {
    console.warn('Sarvam speech recognition failed:', error.response?.status || error.message);
    return res.status(error.status || 503).json({
      message: error.status === 503
        ? error.message
        : 'Speech recognition is temporarily unavailable. You can still type your question.'
    });
  }
}

async function synthesizeSpeech(req, res) {
  const { text, language } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 2500) {
    return res.status(400).json({ message: 'Speech text must contain between 1 and 2500 characters.' });
  }
  if (!sarvamSpeechService.languageCodes[language]) {
    return res.status(422).json({ message: 'Speech synthesis is not available for the selected language.' });
  }

  try {
    return res.json(await sarvamSpeechService.synthesizeSpeech(text, language));
  } catch (error) {
    console.warn('Sarvam speech synthesis failed:', error.response?.status || error.message);
    return res.status(error.status || 503).json({
      message: error.status === 503
        ? error.message
        : 'Speech playback is temporarily unavailable.'
    });
  }
}

function isAuthorizedPriceAdministrator(req) {
const configuredToken = process.env.PESTICIDE_PRICE_ADMIN_TOKEN;
const provided = req.get('authorization') || '';
if (!configuredToken || configuredToken.length < 32 || !provided.startsWith('Bearer ')) return false;
const candidate = Buffer.from(provided.slice(7));
const expected = Buffer.from(configuredToken);
return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

async function getPesticidePrices(req, res) {
const filters = {};
for (const key of ['productId', 'state', 'district', 'town']) {
  if (req.query[key] !== undefined) {
    if (typeof req.query[key] !== 'string' || !req.query[key].trim()) {
      return res.status(400).json({ message: `Invalid ${key} filter` });
      }
    filters[key] = req.query[key].trim();
    }
}

const listings = await pesticidePriceService.listPesticidePrices(filters);
const hasCurrentPrices = listings.some(item => !item.stale && item.price);
res.json({
  pricing_status: hasCurrentPrices ? 'available' : 'unavailable',
  location_specific: Boolean(filters.state && filters.district && filters.town),
  listings: listings.slice(0, 100),
  message: hasCurrentPrices
    ? null
    : 'Current market price unavailable. Check with a licensed agricultural retailer.'
});
}

async function createPesticidePrice(req, res) {
if (!process.env.PESTICIDE_PRICE_ADMIN_TOKEN || process.env.PESTICIDE_PRICE_ADMIN_TOKEN.length < 32) {
  return res.status(503).json({ message: 'Administrator pricing is not configured.' });
}
if (!isAuthorizedPriceAdministrator(req)) {
  return res.status(401).json({ message: 'Administrator authorization required.' });
}

const result = await pesticidePriceService.createPesticidePrice({
  ...req.body,
  sourceType: 'administrator'
});
if (result.error) {
  return res.status(400).json({ message: result.error });
  }
res.status(201).json({ listing: result.listing });
}

async function updatePesticidePrice(req, res) {
if (!process.env.PESTICIDE_PRICE_ADMIN_TOKEN || process.env.PESTICIDE_PRICE_ADMIN_TOKEN.length < 32) {
  return res.status(503).json({ message: 'Administrator pricing is not configured.' });
}
if (!isAuthorizedPriceAdministrator(req)) {
  return res.status(401).json({ message: 'Administrator authorization required.' });
}

const result = await pesticidePriceService.updatePesticidePrice(req.params.id, {
  ...req.body,
  sourceType: 'administrator'
});
if (result.error) {
  const status = result.error === 'Price listing not found' ? 404 : 400;
  return res.status(status).json({ message: result.error });
}
res.json({ listing: result.listing });
}

async function listPesticideProducts(req, res) {
if (!process.env.PESTICIDE_PRICE_ADMIN_TOKEN || process.env.PESTICIDE_PRICE_ADMIN_TOKEN.length < 32) {
  return res.status(503).json({ message: 'Administrator pesticide catalogue is not configured.' });
}
if (!isAuthorizedPriceAdministrator(req)) {
  return res.status(401).json({ message: 'Administrator authorization required.' });
}
const products = await pesticideCatalogService.listPesticideProducts();
res.json({ products });
}

async function createPesticideProduct(req, res) {
if (!process.env.PESTICIDE_PRICE_ADMIN_TOKEN || process.env.PESTICIDE_PRICE_ADMIN_TOKEN.length < 32) {
  return res.status(503).json({ message: 'Administrator pesticide catalogue is not configured.' });
}
if (!isAuthorizedPriceAdministrator(req)) {
  return res.status(401).json({ message: 'Administrator authorization required.' });
}
const result = await pesticideCatalogService.createPesticideProduct(req.body);
if (result.error) return res.status(400).json({ message: result.error });
res.status(201).json({ product: result.product });
}

async function updatePesticideProduct(req, res) {
if (!process.env.PESTICIDE_PRICE_ADMIN_TOKEN || process.env.PESTICIDE_PRICE_ADMIN_TOKEN.length < 32) {
  return res.status(503).json({ message: 'Administrator pesticide catalogue is not configured.' });
}
if (!isAuthorizedPriceAdministrator(req)) {
  return res.status(401).json({ message: 'Administrator authorization required.' });
}
const result = await pesticideCatalogService.updatePesticideProduct(req.params.productId, req.body);
if (result.error) {
  return res.status(result.error === 'Pesticide product not found' ? 404 : 400).json({ message: result.error });
}
res.json({ product: result.product });
}

async function getHistory(req, res) {
  try {
    const userId = req.params.userId || 'anonymous';
    let items = [];
    try {
      items = await persistence.findScansByUser(userId);
    } catch (e) {
      console.warn('Warning: could not fetch history', e && e.message);
      items = [];
    }
    // Simplify items
    const out = items.map(it => ({
      id: it._id,
      disease: it.disease,
      crop: it.crop,
      cropId: it.cropId,
      diseaseId: it.diseaseId,
      possibleDiseaseName: it.possibleDiseaseName,
      cropSelection: it.cropSelection,
      predictedClass: it.predictedClass,
      predictionStatus: it.predictionStatus,
      detectionStatus: it.detectionStatus,
      diseaseInfo: it.diseaseInfo,
      confidence: it.confidence,
      calibratedConfidence: it.calibratedConfidence,
      confidenceThreshold: it.confidenceThreshold,
      calibrationStatus: it.calibrationStatus,
      severity: it.severity,
      treatments: (it.treatments || []).slice(0, 2),
      pesticides: it.pesticides,
      riskAssessment: it.riskAssessment,
      organicTreatments: it.organicTreatments,
      chemicalRecommendations: it.chemicalRecommendations,
      pesticidePrices: it.pesticidePrices,
      pesticidePriceStatus: it.pesticidePriceStatus,
      pesticidePriceMessage: it.pesticidePriceMessage,
      imagePath: it.imagePath,
      date: it.createdAt
    }));
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function health(req, res) {
  const diseaseService = await getDiseaseServiceHealth();
  res.json({
    status: 'ok',
    message: 'API healthy',
    diseaseService: {
      available: diseaseService.available,
      modelAvailable: diseaseService.modelAvailable,
      statusCode: diseaseService.status
    }
  });
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

async function assistantReply(req, res) {
  try {
    const { disease, question, crop, scanId, userId, lang } = req.body || {};
    const lat = parseFloat(req.body?.lat);
    const lon = parseFloat(req.body?.lon);

    if (!disease) return res.status(400).json({ message: 'Missing disease in request' });

    // Try to enrich with stored scan if available
    let stored = {};
    if (scanId) {
      try {
        const doc = await persistence.findScanById(scanId);
        if (doc) stored = doc;
      } catch (e) {
        // ignore persistence errors and proceed with provided data
        console.warn('Could not load scan', e && e.message);
      }
    }

    const context = {
      disease: disease || stored.disease,
      severity: stored.severity || 'unassessed',
      treatments: stored.treatments || [],
      pesticides: stored.pesticides || {},
      affordableAlternatives: stored.affordableAlternatives || [],
      weatherForecast: stored.weatherForecast || {},
      confidence: stored.confidence || 0.5,
      riskAssessment: stored.riskAssessment,
      organicTreatments: stored.organicTreatments,
      chemicalRecommendations: stored.chemicalRecommendations,
      pesticidePrices: stored.pesticidePrices || [],
      scanId: scanId || stored._id,
      crop,
      lat,
      lon,
      userId: userId || stored.userId || 'anonymous',
      lang: lang || stored.lang || 'en'
    };

    const reply = await generateAssistantResponse(context, question || 'general advice');

    // persist user question and bot reply for history
    try {
      if (question) {
        await persistence.saveChatMessage({ scanId: context.scanId, userId: context.userId, lang: context.lang, from: 'user', text: question });
      }
      await persistence.saveChatMessage({ scanId: context.scanId, userId: context.userId, lang: context.lang, from: 'bot', text: reply.answer });
    } catch (e) {
      console.warn('Could not save chat message', e && e.message);
    }

    res.json(reply);
  } catch (err) {
    console.error('assistantReply error', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getChatHistory(req, res) {
  try {
    const scanId = req.params.scanId;
    if (!scanId) return res.status(400).json({ message: 'Missing scanId' });
    let items = [];
    try {
      items = await persistence.findChatByScanId(scanId);
    } catch (e) {
      console.warn('Could not fetch chat history', e && e.message);
      items = [];
    }
    res.json(items.map(it => ({ from: it.from, text: it.text, createdAt: it.createdAt })));
  } catch (err) {
    console.error('getChatHistory error', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getUserChatHistory(req, res) {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ message: 'Missing userId' });
    let items = [];
    try {
      items = await persistence.findChatByUser(userId);
    } catch (e) {
      console.warn('Could not fetch user chat history', e && e.message);
      items = [];
    }
    res.json(items.map(it => ({ scanId: it.scanId, from: it.from, text: it.text, createdAt: it.createdAt, lang: it.lang })));
  } catch (err) {
    console.error('getUserChatHistory error', err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getNearbyShops(req, res) {
  try {
    const { lat, lon, radius = 15, sellsChemical = true } = req.query;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const radiusKm = parseFloat(radius);
    const isChemical = sellsChemical === 'true' || sellsChemical === true;

    if (lat === undefined || lon === undefined || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return res.status(400).json({ message: 'Missing or invalid latitude and longitude' });
    }

    if (Number.isNaN(radiusKm) || radiusKm <= 0) {
      return res.status(400).json({ message: 'Invalid radius value' });
    }

    let shops = [];

    // Try MongoDB first
    if (require('../config/db').state.connected) {
      try {
        const query = {
          verified: true,
          location: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [longitude, latitude]
              },
              $maxDistance: radiusKm * 1000
            }
          }
        };

        if (isChemical) {
          query.sellsChemical = true;
        }

        const dbShops = await Shop.find(query).limit(20);

        shops = dbShops.map(shop => {
          const distanceKm = calculateDistanceKm(latitude, longitude, shop.location.coordinates[1], shop.location.coordinates[0]);

          return {
            _id: shop._id,
            name: shop.name,
            address: shop.address,
            city: shop.city,
            phone: shop.phone,
            lat: shop.location.coordinates[1],
            lon: shop.location.coordinates[0],
            distance: distanceKm,
            sellsChemical: shop.sellsChemical,
            sellsOrganic: shop.sellsOrganic,
            description: shop.description,
            operatingHours: shop.operatingHours,
            email: shop.email
          };
        }).sort((a, b) => a.distance - b.distance);
      } catch (err) {
        console.warn('MongoDB query failed, falling back to JSON persistence:', err.message);
        // Fall through to JSON persistence
      }
    }

    // Fallback to JSON persistence if MongoDB unavailable or no shops found
    if (shops.length === 0) {
      shops = await persistence.findNearbyShops(latitude, longitude, radiusKm, isChemical);
    }

    res.json(shops);
  } catch (err) {
    console.error('getNearbyShops error', err);
    res.status(500).json({ message: 'Server error fetching shops' });
  }
}

async function getGovernmentSchemes(req, res) {
  try {
    const schemes = govSchemeService.getGovernmentSchemeReferences();
    res.json(schemes);
  } catch (err) {
    console.error('getGovernmentSchemes error', err);
    res.status(500).json({ message: 'Server error fetching government schemes' });
  }
}

module.exports = {
  uploadCropImage,
  getHistory,
  health,
  assistantReply,
  translateUserText,
  transcribeSpeech,
  synthesizeSpeech,
  getChatHistory,
  getUserChatHistory,
  getNearbyShops,
  getGovernmentSchemes,
  predictCrop,
  getCropModelInfo,
  getPesticidePrices,
  createPesticidePrice,
  updatePesticidePrice,
  listPesticideProducts,
  createPesticideProduct,
  updatePesticideProduct
};
