const axios = require('axios');

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const ML_SERVICE_TIMEOUT_MS = Number.parseInt(process.env.ML_SERVICE_TIMEOUT_MS || '10000', 10);

async function predictCrop(features) {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/predict-crop`, features, {
      timeout: ML_SERVICE_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' }
    });
    return response.data;
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      throw new Error('ML_CROP_TIMEOUT');
    }
    if (err.response) {
      if (err.response.status >= 500) throw new Error('ML_SERVICE_UNAVAILABLE');
      if (err.response.status === 422) throw new Error('INVALID_ML_INPUT');
      throw new Error('ML_SERVICE_ERROR');
    }
    throw new Error('ML_SERVICE_UNAVAILABLE');
  }
}

async function getCropModelInfo() {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/model-info`, {
      timeout: ML_SERVICE_TIMEOUT_MS
    });
    return response.data;
  } catch (err) {
    throw new Error('ML_SERVICE_UNAVAILABLE');
  }
}

module.exports = { predictCrop, getCropModelInfo };
