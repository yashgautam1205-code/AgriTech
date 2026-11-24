const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { translateText, localizeScanResponse } = require('../services/translationService');

test('Sarvam translation uses the documented API contract and preserves scan data', async () => {
  const previousKey = process.env.SARVAM_API_KEY;
  const previousTimeout = process.env.SARVAM_TRANSLATE_TIMEOUT_MS;
  const originalPost = axios.post;
  const requests = [];
  process.env.SARVAM_API_KEY = 'test-key';
  process.env.SARVAM_TRANSLATE_TIMEOUT_MS = '12000';
  axios.post = async (url, body, options) => {
    requests.push({ url, body, options });
    return { data: { translated_text: `localized ${body.input}` } };
  };

  try {
    const translated = await translateText('Rainfall is 12 mm.', 'hi', 'en');
    assert.equal(translated, 'localized Rainfall is 12 mm.');
    assert.equal(await translateText('Rainfall is 12 mm.', 'hi', 'en'), translated);
    assert.equal(requests.length, 1, 'repeated text should use the translation cache');
    assert.equal(requests[0].url, 'https://api.sarvam.ai/translate');
    assert.equal(requests[0].body.source_language_code, 'en-IN');
    assert.equal(requests[0].body.target_language_code, 'hi-IN');
    assert.equal(requests[0].body.model, 'mayura:v1');
    assert.equal(requests[0].body.mode, 'formal');
    assert.equal(requests[0].body.numerals_format, 'international');
    assert.equal('enable_preprocessing' in requests[0].body, false);
    assert.equal(requests[0].options.timeout, 12000);
    assert.equal(requests[0].options.headers['api-subscription-key'], 'test-key');

    const original = {
      disease: 'Tomato — Late Blight',
      possibleDiseaseName: 'Tomato — Late blight',
      diseaseId: 'late_blight',
      confidence: 0.923,
      scanId: 'scan-123',
      diseaseInfo: {
        scientificName: 'Phytophthora infestans',
        description: 'Disease description by Phytophthora infestans.',
        causes: ['Disease cause'],
        symptoms: ['Leaf symptoms'],
        spreadInformation: ['Spread information']
      },
      riskAssessment: {
        risk_level: 'HIGH',
        risk_reason: 'Risk affects 10-30% of plants.',
        farmer_observations: { affectedPlants: '10_30' }
      },
      weatherForecast: {
        forecast: [{ day: 'Monday', precipitationMm: 12, advice: 'Weather advice' }]
      },
      organicTreatments: {
        recommendations: [{
          name: 'Remove infected leaves',
          product_id: 'keep-this-id',
          category: 'cultural',
          description: 'Remove infected leaves.'
        }]
      },
      chemicalRecommendations: {
        recommendations: [{
          product_id: 'product-42',
          brand_name: 'Brand name',
          active_ingredient: 'Active ingredient',
          application_dosage: '2 ml per 1 L water.',
          pre_harvest_interval: 'Wait 7 days before harvest.'
        }]
      },
      pesticidePrices: [{
        product_id: 'product-42',
        price: { amount: 125, currency: 'INR' },
        price_type: 'Historical reference price (2024)',
        price_type_code: 'historical_government',
        stale_reason: 'Price record has expired.'
      }]
    };
    const localized = await localizeScanResponse(original, 'kn');

    assert.notEqual(localized, original);
    assert.match(localized.disease, /^localized /);
    assert.match(localized.possibleDiseaseName, /^localized /);
    assert.equal(localized.diseaseId, original.diseaseId);
    assert.equal(localized.confidence, original.confidence);
    assert.equal(localized.scanId, original.scanId);
    assert.equal(localized.diseaseInfo.scientificName, original.diseaseInfo.scientificName);
    assert.equal(localized.riskAssessment.risk_level, original.riskAssessment.risk_level);
    assert.equal(localized.riskAssessment.farmer_observations.affectedPlants, '10_30');
    assert.equal(localized.weatherForecast.forecast[0].precipitationMm, 12);
    assert.match(localized.diseaseInfo.description, /^localized /);
    assert.ok(localized.diseaseInfo.description.includes('Phytophthora infestans'));
    assert.match(localized.diseaseInfo.causes[0], /^localized /);
    assert.match(localized.diseaseInfo.spreadInformation[0], /^localized /);
    assert.match(localized.riskAssessment.risk_reason, /^localized /);
    assert.match(localized.riskAssessment.risk_reason, /10-30%/);
    assert.match(localized.weatherForecast.forecast[0].advice, /^localized /);
    assert.match(localized.organicTreatments.recommendations[0].name, /^localized /);
    assert.equal(localized.organicTreatments.recommendations[0].product_id, 'keep-this-id');
    assert.match(localized.chemicalRecommendations.recommendations[0].application_dosage, /^localized /);
    assert.match(localized.chemicalRecommendations.recommendations[0].pre_harvest_interval, /^localized /);
    assert.equal(localized.chemicalRecommendations.recommendations[0].product_id, 'product-42');
    assert.equal(localized.chemicalRecommendations.recommendations[0].active_ingredient, 'Active ingredient');
    assert.equal(localized.pesticidePrices[0].product_id, 'product-42');
    assert.deepEqual(localized.pesticidePrices[0].price, { amount: 125, currency: 'INR' });
    assert.equal(localized.pesticidePrices[0].price_type_code, 'historical_government');
    assert.match(localized.pesticidePrices[0].price_type, /^localized /);
    assert.match(localized.pesticidePrices[0].stale_reason, /^localized /);
    assert.equal(original.diseaseInfo.description, 'Disease description by Phytophthora infestans.');
  } finally {
    axios.post = originalPost;
    if (previousKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = previousKey;
    if (previousTimeout === undefined) delete process.env.SARVAM_TRANSLATE_TIMEOUT_MS;
    else process.env.SARVAM_TRANSLATE_TIMEOUT_MS = previousTimeout;
  }
});

test('translation returns the source text when Sarvam is unavailable', async () => {
  const previousKey = process.env.SARVAM_API_KEY;
  const originalPost = axios.post;
  process.env.SARVAM_API_KEY = 'test-key';
  axios.post = async () => {
    throw new Error('test timeout');
  };

  try {
    assert.equal(await translateText('Keep this value 5 mm.', 'ta', 'en'), 'Keep this value 5 mm.');
  } finally {
    axios.post = originalPost;
    if (previousKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = previousKey;
  }
});
