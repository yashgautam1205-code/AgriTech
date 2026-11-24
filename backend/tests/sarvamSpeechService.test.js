const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const {
  transcribeAudio,
  synthesizeSpeech,
  languageCodes,
  speakers
} = require('../services/sarvamSpeechService');
const { transcribeSpeech, synthesizeSpeech: handleSpeechSynthesis } = require('../controllers/scanController');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('Saaras v4 transcription sends an audio multipart request with backend credentials', async () => {
  const previousKey = process.env.SARVAM_API_KEY;
  const originalPost = axios.post;
  process.env.SARVAM_API_KEY = 'test-secret';
  let request;
  axios.post = async (url, form, options) => {
    request = { url, form, options };
    return {
      data: { transcript: 'ನಮಸ್ಕಾರ', language_code: 'kn-IN', language_probability: 0.98 }
    };
  };

  try {
    const result = await transcribeAudio({
      buffer: Buffer.from('fake audio bytes'),
      originalname: 'question.webm',
      mimetype: 'audio/webm'
    }, 'kn');
    assert.deepEqual(result, {
      transcript: 'ನಮಸ್ಕಾರ',
      detectedLanguage: 'kn-IN',
      languageProbability: 0.98
    });
    assert.equal(request.url, 'https://api.sarvam.ai/speech-to-text');
    assert.equal(request.options.headers['api-subscription-key'], 'test-secret');
    assert.match(request.options.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.ok(request.form._streams.some(value => String(value).includes('saaras:v4')));
    assert.ok(request.form._streams.some(value => String(value).includes('kn-IN')));
  } finally {
    axios.post = originalPost;
    if (previousKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = previousKey;
  }
});

test('Saaras v4 can request automatic source-language detection', async () => {
  const previousKey = process.env.SARVAM_API_KEY;
  const originalPost = axios.post;
  process.env.SARVAM_API_KEY = 'test-secret';
  let request;
  axios.post = async (url, form) => {
    request = { url, form };
    return { data: { transcript: 'नमस्ते', language_code: 'hi-IN' } };
  };

  try {
    const result = await transcribeAudio({
      buffer: Buffer.from('fake audio bytes'),
      originalname: 'question.webm',
      mimetype: 'audio/webm'
    }, 'unknown');
    assert.equal(result.detectedLanguage, 'hi-IN');
    assert.ok(request.form._streams.some(value => String(value).includes('language_code')));
    assert.ok(request.form._streams.some(value => String(value).includes('unknown')));
  } finally {
    axios.post = originalPost;
    if (previousKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = previousKey;
  }
});

test('Bulbul v4 Flash sends selected language and a verified speaker then returns WAV audio', async () => {
  const previousKey = process.env.SARVAM_API_KEY;
  const originalPost = axios.post;
  process.env.SARVAM_API_KEY = 'test-secret';
  let request;
  axios.post = async (url, body, options) => {
    request = { url, body, options };
    return { data: { request_id: 'request-1', audios: ['d2F2'] } };
  };

  try {
    const result = await synthesizeSpeech('ಬೆಳೆ ಆರೋಗ್ಯವಾಗಿರಲಿ.', 'kn');
    assert.deepEqual(result, {
      audioBase64: 'd2F2',
      mimeType: 'audio/wav',
      requestId: 'request-1'
    });
    assert.equal(request.url, 'https://api.sarvam.ai/text-to-speech');
    assert.equal(request.body.language_code, languageCodes.kn);
    assert.equal(request.body.model, 'bulbul:v4-flash');
    assert.equal(request.body.speaker, speakers.kn);
    assert.equal(request.options.headers['api-subscription-key'], 'test-secret');
  } finally {
    axios.post = originalPost;
    if (previousKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = previousKey;
  }
});

test('speech services require backend credentials and do not invent provider output', async () => {
  const previousKey = process.env.SARVAM_API_KEY;
  const originalPost = axios.post;
  delete process.env.SARVAM_API_KEY;
  axios.post = async () => {
    throw new Error('must not call provider without credentials');
  };

  try {
    await assert.rejects(
      transcribeAudio({
        buffer: Buffer.from('fake audio bytes'),
        originalname: 'question.webm',
        mimetype: 'audio/webm'
      }, 'unknown'),
      { status: 503, message: 'Sarvam speech services are not configured.' }
    );
    assert.deepEqual(languageCodes, {
      en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN', ta: 'ta-IN', te: 'te-IN',
      ml: 'ml-IN', mr: 'mr-IN', bn: 'bn-IN', gu: 'gu-IN', pa: 'pa-IN'
    });

    test('speech controllers reject empty uploads and invalid synthesis requests', async () => {
      const emptyAudioResponse = responseRecorder();
      await transcribeSpeech({
        file: { size: 0, buffer: Buffer.alloc(0) },
        body: { language: 'en', autoDetect: 'false' }
      }, emptyAudioResponse);
      assert.equal(emptyAudioResponse.statusCode, 400);
      assert.equal(emptyAudioResponse.body.message, 'Audio recording is empty.');

      const oversizedTextResponse = responseRecorder();
      await handleSpeechSynthesis({
        body: { text: 'a'.repeat(2501), language: 'en' }
      }, oversizedTextResponse);
      assert.equal(oversizedTextResponse.statusCode, 400);

      const unsupportedLanguageResponse = responseRecorder();
      await handleSpeechSynthesis({
        body: { text: 'Hello', language: 'unsupported' }
      }, unsupportedLanguageResponse);
      assert.equal(unsupportedLanguageResponse.statusCode, 422);
    });
  } finally {
    axios.post = originalPost;
    if (previousKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = previousKey;
  }
});
