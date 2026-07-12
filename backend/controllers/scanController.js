const path = require('path');
const { analyzeImage, generateAssistantResponse } = require('../services/aiService');
const persistence = require('../services/persistence');
const govSchemeService = require('../services/governmentSchemeService');
const Shop = require('../models/Shop');

async function uploadCropImage(req, res) {
  try {
    const file = req.file;
    if (!file || !file.path) {
      return res.status(400).json({ message: 'No image provided or upload failed' });
    }

    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const filePath = file.path;
    const lat = parseFloat(req.body.lat);
    const lon = parseFloat(req.body.lon);
    const aiResult = await analyzeImage(filePath, lat, lon, String(req.body.lang || 'en'));

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
      lang: req.body.lang || 'en'
    });

    // Optimize response for rural users: simple short sentences
    const response = {
      disease: aiResult.disease,
      severity: aiResult.severity,
      treatments: aiResult.treatments,
      pesticides: normalizePesticides(aiResult.pesticides),
      affordableAlternatives: normalizeAlternatives(aiResult.affordableAlternatives),
      weatherForecast: aiResult.weatherForecast,
      voiceText: aiResult.voiceText,
      confidence: aiResult.confidence,
      scanId: scan._id
    };

    res.json(response);
  } catch (err) {
    console.error('Upload error:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      errors: err.errors ? Object.keys(err.errors).map(k => `${k}: ${err.errors[k].message}`) : undefined
    });
    res.status(500).json({ message: err.message || 'Server error', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
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
      severity: it.severity,
      treatments: it.treatments.slice(0,2),
      pesticides: it.pesticides,
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
  res.json({ status: 'ok', message: 'API healthy' });
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
      severity: stored.severity || 'medium',
      treatments: stored.treatments || [],
      pesticides: stored.pesticides || {},
      affordableAlternatives: stored.affordableAlternatives || [],
      weatherForecast: stored.weatherForecast || {},
      confidence: stored.confidence || 0.5,
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
    const schemes = govSchemeService.getDailyGovernmentSchemes();
    res.json(schemes);
  } catch (err) {
    console.error('getGovernmentSchemes error', err);
    res.status(500).json({ message: 'Server error fetching government schemes' });
  }
}

module.exports = { uploadCropImage, getHistory, health, assistantReply, getChatHistory, getUserChatHistory, getNearbyShops, getGovernmentSchemes };
