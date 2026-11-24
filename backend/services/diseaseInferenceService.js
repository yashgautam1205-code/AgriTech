const axios = require('axios');
const fs = require('fs');

const DISEASE_ML_URL = (process.env.DISEASE_ML_SERVICE_URL || 'http://localhost:8001').replace(/\/+$/, '');
const TIMEOUT_MS = Number.parseInt(process.env.DISEASE_ML_TIMEOUT_MS || '30000', 10);

async function predictDisease(filePath, contentType) {
  try {
    const response = await axios.post(
      `${DISEASE_ML_URL}/predict-disease`,
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
      throw new Error('DISEASE_ML_TIMEOUT');
    }
    if (err.response && [400, 413, 415, 422].includes(err.response.status)) {
      throw new Error('INVALID_DISEASE_IMAGE');
    }
    console.error('Disease ML service request failed:', err.code || err.message);
    throw new Error('DISEASE_ML_UNAVAILABLE');
  }
}

module.exports = { predictDisease };
