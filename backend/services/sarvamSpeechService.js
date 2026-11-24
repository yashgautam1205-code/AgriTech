const axios = require('axios');
const FormData = require('form-data');

const languageCodes = {
  en: 'en-IN',
  hi: 'hi-IN',
  kn: 'kn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  ml: 'ml-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
  pa: 'pa-IN'
};

const speakers = {
  en: 'simran_en_customer',
  hi: 'shubh_hi_customer',
  kn: 'chaitra_kn_conversation',
  ta: 'gokul_ta_narration',
  te: 'kavitha_te_conversation',
  ml: 'shubh_enhi_ads',
  mr: 'ritu_mr_narration',
  bn: 'roopa_bn_conversational',
  gu: 'pooja_gu_conversational',
  pa: 'anand_pa_conversation'
};

function getApiKey() {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    const error = new Error('Sarvam speech services are not configured.');
    error.status = 503;
    throw error;
  }
  return apiKey;
}

function getTimeoutMs() {
  const configured = Number.parseInt(process.env.SARVAM_SPEECH_TIMEOUT_MS || '20000', 10);
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 1000), 30000) : 20000;
}

async function transcribeAudio(file, language = 'unknown') {
  const apiKey = getApiKey();
  const form = new FormData();
  form.append('file', file.buffer, {
    filename: file.originalname,
    contentType: file.mimetype
  });
  form.append('model', 'saaras:v4');
  form.append('mode', 'transcribe');
  form.append('language_code', languageCodes[language] || 'unknown');

  const response = await axios.post('https://api.sarvam.ai/speech-to-text', form, {
    headers: {
      ...form.getHeaders(),
      'api-subscription-key': apiKey
    },
    timeout: getTimeoutMs(),
    maxBodyLength: 10 * 1024 * 1024
  });

  if (typeof response.data?.transcript !== 'string' || !response.data.transcript.trim()) {
    throw new Error('Sarvam speech-to-text response did not contain a transcript.');
  }
  return {
    transcript: response.data.transcript,
    detectedLanguage: response.data.language_code || null,
    languageProbability: response.data.language_probability ?? null
  };
}

async function synthesizeSpeech(text, language) {
  const apiKey = getApiKey();
  const languageCode = languageCodes[language];
  const speaker = speakers[language];
  if (!languageCode || !speaker) {
    const error = new Error('Speech synthesis is not available for the selected language.');
    error.status = 422;
    throw error;
  }

  const response = await axios.post('https://api.sarvam.ai/text-to-speech', {
    text,
    language_code: languageCode,
    model: 'bulbul:v4-flash',
    speaker,
    output_audio_codec: 'wav'
  }, {
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json'
    },
    timeout: getTimeoutMs()
  });

  const audio = response.data?.audios?.[0];
  if (typeof audio !== 'string' || !audio.trim()) {
    throw new Error('Sarvam text-to-speech response did not contain audio.');
  }
  return {
    audioBase64: audio,
    mimeType: 'audio/wav',
    requestId: response.data.request_id || null
  };
}

module.exports = { transcribeAudio, synthesizeSpeech, languageCodes, speakers };
