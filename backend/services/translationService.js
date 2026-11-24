const axios = require('axios');

const cache = new Map();
const supportedTargets = new Set(['en', 'kn', 'hi', 'ta', 'te', 'ml', 'mr', 'bn', 'gu', 'pa']);
const MAX_CACHE_ENTRIES = 2000;
const MAX_INPUT_LENGTH = 1000;
const MAX_TRANSLATION_CONCURRENCY = 5;

function sarvamCode(lang) {
  const map = {
    en: 'en-IN',
    kn: 'kn-IN',
    hi: 'hi-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    ml: 'ml-IN',
    mr: 'mr-IN',
    bn: 'bn-IN',
    gu: 'gu-IN',
    pa: 'pa-IN'
  };
  return map[lang];
}

function getTimeoutMs() {
  const configured = Number.parseInt(process.env.SARVAM_TRANSLATE_TIMEOUT_MS || '15000', 10);
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 1000), 30000) : 15000;
}

function splitForTranslation(text) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > MAX_INPUT_LENGTH) {
    let splitAt = remaining.lastIndexOf(' ', MAX_INPUT_LENGTH);
    if (splitAt < MAX_INPUT_LENGTH / 2) splitAt = MAX_INPUT_LENGTH;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function protectTechnicalValues(text) {
  const protectedValues = [];
  const pattern = /AGRIKEEPPRESERVE[A-Z0-9]+TOKEN|\d+(?:[.,]\d+)*(?:\s*(?:%|°\s?[CF]|mm|cm|m|km|ml|l|mg|g|ppm|km\/h|m\/s|kg\/ha|l\/ha|g\/L|mg\/L|ha|acre|days?|hours?|minutes?|seconds?))?|\b(?:mm|cm|km|ml|ppm|ha|acre|days?|hours?|minutes?|seconds?)\b|°\s?[CF]/g;
  const protectedText = text.replace(pattern, value => {
    const marker = `AGRIKEEP${protectedValues.length}TOKEN`;
    protectedValues.push(value);
    return marker;
  });
  return { protectedText, protectedValues };
}

async function translateChunk(text, target, source, apiKey, model) {
  const response = await axios.post(
    process.env.SARVAM_TRANSLATE_URL || 'https://api.sarvam.ai/translate',
    {
      input: text,
      source_language_code: sarvamCode(source) || 'en-IN',
      target_language_code: sarvamCode(target),
      model,
      mode: 'formal',
      numerals_format: 'international'
    },
    {
      timeout: getTimeoutMs(),
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json'
      }
    }
  );

  const translated = response.data?.translated_text;
  if (typeof translated !== 'string' || !translated.trim()) {
    throw new Error('Sarvam response did not contain translated_text');
  }
  return translated;
}

async function translateText(text, targetLanguage = 'en', sourceLanguage = 'en') {
  if (typeof text !== 'string' || !text.trim()) return text;
  if (!supportedTargets.has(targetLanguage) || !supportedTargets.has(sourceLanguage)) return text;
  if (targetLanguage === sourceLanguage) return text;

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return text;

  const model = process.env.SARVAM_TRANSLATE_MODEL || 'mayura:v1';
  const cacheKey = `${model}:${sourceLanguage}:${targetLanguage}:${text}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const { protectedText, protectedValues } = protectTechnicalValues(text);
    const chunks = splitForTranslation(protectedText);
    const translatedChunks = [];
    for (const chunk of chunks) {
      translatedChunks.push(await translateChunk(chunk, targetLanguage, sourceLanguage, apiKey, model));
    }
    let translated = translatedChunks.join(' ');
    for (let index = 0; index < protectedValues.length; index += 1) {
      const marker = `AGRIKEEP${index}TOKEN`;
      if (translated.split(marker).length !== 2) return text;
      translated = translated.replace(marker, protectedValues[index]);
    }
    if (/AGRIKEEP\d+TOKEN/.test(translated)) return text;
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, translated);
    return translated;
  } catch (error) {
    console.warn('Sarvam translation fallback:', error.response?.status || error.message);
    return text;
  }
}

async function translateUniqueTexts(texts, targetLanguage) {
  const unique = [...new Set(texts.filter(text => typeof text === 'string' && text.trim()))];
  const translated = new Map();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < unique.length) {
      const index = nextIndex++;
      const sourceText = unique[index];
      translated.set(sourceText, await translateText(sourceText, targetLanguage, 'en'));
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_TRANSLATION_CONCURRENCY, unique.length) },
    () => worker()
  );
  await Promise.all(workers);
  return translated;
}

async function localizeScanResponse(sourceResponse, targetLanguage = 'en') {
  if (!sourceResponse || targetLanguage === 'en' || !supportedTargets.has(targetLanguage)) {
    return sourceResponse;
  }

  const response = JSON.parse(JSON.stringify(sourceResponse));
  const textValues = [];
  const collectField = (object, key) => {
    if (typeof object?.[key] === 'string' && object[key].trim()) {
      textValues.push(preserveScientificNames(object[key]));
    }
  };
  const collectArray = (object, key) => {
    if (Array.isArray(object?.[key])) {
      object[key].forEach(value => {
        if (typeof value === 'string' && value.trim()) textValues.push(preserveScientificNames(value));
      });
    }
  };
  const diseaseInfo = response.diseaseInfo;
  const scientificNames = [...new Set(
    typeof diseaseInfo?.scientificName === 'string' && diseaseInfo.scientificName.trim()
      ? [diseaseInfo.scientificName]
      : []
  )];
  const scientificNameMarkers = new Map(
    scientificNames.map((name, index) => [name, `AGRIKEEPPRESERVE${index}TOKEN`])
  );
  const preserveScientificNames = text => scientificNames.reduce(
    (value, name) => value.split(name).join(scientificNameMarkers.get(name)),
    text
  );
  const restoreScientificNames = text => [...scientificNameMarkers].reduce(
    (value, [name, marker]) => value.split(marker).join(name),
    text
  );
  const cropSelection = response.cropSelection;
  const riskAssessment = response.riskAssessment;
  const organicTreatments = response.organicTreatments;
  const chemicalRecommendations = response.chemicalRecommendations;
  const weatherForecast = response.weatherForecast;

  collectField(response, 'disease');
  collectField(response, 'possibleDiseaseName');
  collectArray(response, 'treatments');
  collectField(response, 'pesticidePriceMessage');

  for (const key of ['description', 'guidanceDisclaimer', 'message']) collectField(diseaseInfo, key);
  for (const key of ['causes', 'symptoms', 'developmentConditions', 'spreadInformation', 'preventiveMeasures', 'followUp']) {
    collectArray(diseaseInfo, key);
  }
  if (Array.isArray(diseaseInfo?.references)) {
    diseaseInfo.references.forEach(reference => collectField(reference, 'title'));
  }

  for (const key of ['risk_reason', 'recommended_action']) collectField(riskAssessment, key);
  collectArray(riskAssessment, 'assessment_limitations');
  collectField(cropSelection, 'explanation');
  collectField(organicTreatments, 'message');
  if (Array.isArray(organicTreatments?.recommendations)) {
    organicTreatments.recommendations.forEach(item => {
      for (const key of ['name', 'category', 'description', 'application_guidance', 'safety_information', 'limitations', 'use_restriction']) {
        collectField(item, key);
      }
      collectArray(item, 'prevention_practices');
    });
  }

  collectField(chemicalRecommendations, 'message');
  if (Array.isArray(chemicalRecommendations?.recommendations)) {
    chemicalRecommendations.recommendations.forEach(product => {
      for (const key of [
        'use_restriction', 'safety_information', 'registration_information',
        'approved_label_information', 'application_dosage', 'pre_harvest_interval',
        're_entry_interval'
      ]) {
        collectField(product, key);
      }
    });
  }

  if (Array.isArray(response.pesticidePrices)) {
    response.pesticidePrices.forEach(listing => {
      collectField(listing, 'price_type');
      collectField(listing, 'stale_reason');
    });
  }

  collectField(weatherForecast, 'summary');
  if (Array.isArray(weatherForecast?.forecast)) {
    weatherForecast.forecast.forEach(item => {
      collectField(item, 'condition');
      collectField(item, 'advice');
    });
  }

  const translated = await translateUniqueTexts(textValues, targetLanguage);
  const replaceField = (object, key) => {
    if (typeof object?.[key] === 'string') {
      const protectedText = preserveScientificNames(object[key]);
      if (translated.has(protectedText)) {
        object[key] = restoreScientificNames(translated.get(protectedText));
      }
    }
  };
  const replaceArray = (object, key) => {
    if (Array.isArray(object?.[key])) {
      object[key] = object[key].map(value => {
        if (typeof value !== 'string') return value;
        const protectedText = preserveScientificNames(value);
        return translated.has(protectedText)
          ? restoreScientificNames(translated.get(protectedText))
          : value;
      });
    }
  };

  replaceArray(response, 'treatments');
  replaceField(response, 'pesticidePriceMessage');
  replaceField(response, 'disease');
  replaceField(response, 'possibleDiseaseName');
  for (const key of ['description', 'guidanceDisclaimer', 'message']) replaceField(diseaseInfo, key);
  for (const key of ['causes', 'symptoms', 'developmentConditions', 'spreadInformation', 'preventiveMeasures', 'followUp']) {
    replaceArray(diseaseInfo, key);
  }
  if (Array.isArray(diseaseInfo?.references)) diseaseInfo.references.forEach(reference => replaceField(reference, 'title'));
  for (const key of ['risk_reason', 'recommended_action']) replaceField(riskAssessment, key);
  replaceArray(riskAssessment, 'assessment_limitations');
  replaceField(cropSelection, 'explanation');
  replaceField(organicTreatments, 'message');
  if (Array.isArray(organicTreatments?.recommendations)) {
    organicTreatments.recommendations.forEach(item => {
      for (const key of ['name', 'category', 'description', 'application_guidance', 'safety_information', 'limitations', 'use_restriction']) {
        replaceField(item, key);
      }
      replaceArray(item, 'prevention_practices');
    });
  }
  replaceField(chemicalRecommendations, 'message');
  if (Array.isArray(chemicalRecommendations?.recommendations)) {
    chemicalRecommendations.recommendations.forEach(product => {
      for (const key of [
        'use_restriction', 'safety_information', 'registration_information',
        'approved_label_information', 'application_dosage', 'pre_harvest_interval',
        're_entry_interval'
      ]) {
        replaceField(product, key);
      }
    });
  }

  if (Array.isArray(response.pesticidePrices)) {
    response.pesticidePrices.forEach(listing => {
      replaceField(listing, 'price_type');
      replaceField(listing, 'stale_reason');
    });
  }
  replaceField(weatherForecast, 'summary');
  if (Array.isArray(weatherForecast?.forecast)) {
    weatherForecast.forecast.forEach(item => {
      replaceField(item, 'condition');
      replaceField(item, 'advice');
    });
  }

  return response;
}

module.exports = {
  translateText,
  localizeScanResponse,
  supportedTargets
};
