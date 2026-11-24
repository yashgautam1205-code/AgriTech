const axios = require('axios');
const fs = require('fs');

const DISEASE_ML_URL = (process.env.DISEASE_ML_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
const TIMEOUT_MS = Number.parseInt(process.env.DISEASE_ML_TIMEOUT_MS || '30000', 10);

async function getDiseaseServiceHealth() {
  try {
    const response = await axios.get(`${DISEASE_ML_URL}/health`, { timeout: 5000 });
    return {
      available: response.data?.model_available === true,
      status: response.status,
      modelAvailable: response.data?.model_available === true
    };
  } catch (err) {
    return {
      available: false,
      status: err.response?.status || null,
      modelAvailable: false,
      errorCode: err.code || null
    };
  }
}

async function predictDisease(filePath, contentType) {
  const endpoint = `${DISEASE_ML_URL}/predict-disease`;
  try {
    const response = await axios.post(
      endpoint,
      fs.createReadStream(filePath),
      {
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Content-Length': fs.statSync(filePath).size
        },
        maxBodyLength: 10 * 1024 * 1024
      }
    );
    return response.data;
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      console.error('Disease ML timeout', { endpoint, timeoutMs: TIMEOUT_MS });
      throw new Error('DISEASE_ML_TIMEOUT');
    }
    if (err.response && [400, 413, 415, 422].includes(err.response.status)) {
      console.warn('Disease ML rejected image', {
        endpoint,
        status: err.response.status,
        message: err.response.data?.detail || 'Invalid upload'
      });
      throw new Error('INVALID_DISEASE_IMAGE');
    }
    if (err.response?.status === 503) {
      const detail = String(err.response.data?.detail || '').toLowerCase();
      if (detail.includes('model') && detail.includes('unavailable')) {
        console.error('Disease ML model unavailable', { endpoint, status: 503 });
        throw new Error('DISEASE_MODEL_NOT_LOADED');
      }
      console.error('Disease ML prediction failed', { endpoint, status: 503 });
      throw new Error('DISEASE_ML_PREDICTION_FAILED');
    }
    console.error('Disease ML service request failed', {
      endpoint,
      code: err.code || null,
      status: err.response?.status || null,
      message: err.message
    });
    throw new Error('DISEASE_ML_UNAVAILABLE');
  }
}

module.exports = { predictDisease, getDiseaseServiceHealth };
