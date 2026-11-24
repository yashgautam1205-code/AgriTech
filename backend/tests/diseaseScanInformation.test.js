const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeImage } = require('../services/aiService');
const { getOrganicTreatments } = require('../services/organicTreatmentService');
const { getChemicalRecommendations } = require('../services/pesticideRecommendationService');
const { getDiseaseGuidance } = require('../services/diseaseGuidance');
const { getDiseaseClassMetadata, getDiseaseClassRecords } = require('../services/diseaseClassRegistry');
const modelLabels = require('../../ml_service/models/plant_disease_labels.json');
const { getKnowledgeCoverage } = require('../services/diseaseGuidance');

const strawberryClass = 'Strawberry___Leaf_scorch';
const verifiedProduct = {
  productId: 'strawberry-leaf-scorch-reference',
  brandName: 'Verified reference product',
  manufacturer: 'Example manufacturer',
  activeIngredient: 'Example active ingredient',
  formulation: 'WG',
  concentration: 'label value',
  targetClasses: [strawberryClass],
  packSizes: [{ value: 100, unit: 'g' }],
  registrationInformation: 'Reviewed registration record',
  registrationSourceUrl: 'https://ppqs.gov.in/records/strawberry',
  registrationVerification: 'verified',
  labelSourceUrl: 'https://manufacturer.example/approved-label',
  labelVerification: 'verified',
  approvedLabelInformation: 'Reviewed crop and target label',
  approvedDosage: 'Use only according to the approved label.',
  safetyInformation: 'Follow the approved label.',
  verifiedBy: 'Agronomist',
  lastVerifiedAt: new Date().toISOString(),
  active: true
};
const verifiedPrice = {
  id: 'price-1',
  product_id: verifiedProduct.productId,
  brand_name: verifiedProduct.brandName,
  active_ingredient: verifiedProduct.activeIngredient,
  formulation: verifiedProduct.formulation,
  pack_size: { value: 100, unit: 'g' },
  price: { amount: 250, currency: 'INR' },
  seller: 'Licensed retailer',
  location: { state: 'Karnataka', district: 'Mysuru', town: 'Mysuru' },
  price_type: 'Live retail price',
  price_type_code: 'live_retail',
  source_type: 'retailer_feed',
  availability_status: 'available',
  last_updated_at: new Date().toISOString(),
  source_url: 'https://retailer.example/product'
};

function fakePrediction(overrides = {}) {
  const topPrediction = overrides.top_prediction || strawberryClass;
  const [crop, disease] = topPrediction.split('___');
  return {
    top_prediction: topPrediction,
    crop,
    disease: disease.replace(/_/g, ' '),
    status: 'uncertain',
    confidence: 0.43,
    calibrated_confidence: 0.49,
    confidence_threshold: 0.6,
    calibration_status: 'applied',
    ...overrides
  };
}

function scanServices(prediction, options = {}) {
  return {
    predictDisease: async () => prediction,
    getDiseaseGuidance: (className, status, sourceOptions) => options.guidanceTimeout
      ? Promise.reject(new Error('agricultural source request timed out'))
      : getDiseaseGuidance(
        className,
        status,
        options.sourceStatus ? { ...sourceOptions, sourceStatus: options.sourceStatus } : sourceOptions
      ),
    getOrganicTreatments,
    getChemicalRecommendations: request => getChemicalRecommendations(
      request,
      options.products === undefined ? [verifiedProduct] : options.products
    ),
    listPesticidePrices: async ({ productIds }) => ({
      status: options.priceStatus || 'AVAILABLE',
      listings: options.prices === undefined
        ? [verifiedPrice].filter(item => productIds.includes(item.product_id))
        : options.prices.filter(item => productIds.includes(item.product_id))
    }),
    fetchWeatherForecast: options.fetchWeatherForecast || (async () => ({
      status: 'available',
      informationStatus: 'AVAILABLE',
      source: 'Test forecast provider',
      summary: 'Forecast loaded',
      forecast: [{ day: 'Tuesday, November 24', tempMin: 17, tempMax: 25, precipitationMm: 2, advice: 'Avoid irrigation before forecast rain.' }]
    }))
  };
}

async function analyze(prediction, options = {}) {
  const observations = options.observations === undefined ? {
    symptomsSpreading: 'yes',
    affectedPlants: '10_30',
    visibleSymptoms: ['spots']
  } : options.observations;
  const selectedCrop = Object.prototype.hasOwnProperty.call(options, 'selectedCrop')
    ? options.selectedCrop
    : 'Strawberry';
  return analyzeImage(
    'unused-test-image.jpg',
    12.3,
    76.6,
    'en',
    'image/jpeg',
    observations,
    selectedCrop,
    scanServices(prediction, options)
  );
}

test('all PlantVillage labels have unique exact canonical mappings', () => {
  const records = getDiseaseClassRecords();
  assert.equal(records.length, modelLabels.classes.length);
  assert.deepEqual(new Set(records.map(record => record.className)), new Set(modelLabels.classes));
  assert.equal(getDiseaseClassMetadata('Tomato___Late_blight').diseaseId, 'late_blight');
  assert.equal(getDiseaseClassMetadata('Tomato___Late_blight').cropId, 'tomato');
  assert.equal(getDiseaseClassMetadata('Tomato___Early_blight').condition, 'diseased');
  assert.equal(getDiseaseClassMetadata('Potato___healthy').condition, 'healthy');
  assert.equal(getDiseaseClassMetadata('Tomato___late_blight'), null);
  assert.deepEqual(getKnowledgeCoverage(), {
    mappedClasses: 38,
    diseaseSpecificRecordCount: 3,
    healthyClassCount: 12,
    diseaseSpecificClasses: [
      'Apple___Apple_scab',
      'Strawberry___Leaf_scorch',
      'Tomato___Early_blight'
    ]
  });
});

test('every counted disease-specific knowledge record has a source and review date', () => {
  for (const className of getKnowledgeCoverage().diseaseSpecificClasses) {
    const record = getDiseaseGuidance(className, 'prediction');
    assert.equal(record.status, 'AVAILABLE', className);
    assert.equal(record.verificationStatus, 'source_verified', className);
    assert.match(record.lastReviewedAt, /^\d{4}-\d{2}-\d{2}$/, className);
    assert.ok(record.references.some(reference => /^https:\/\//.test(reference.url)), className);
  }
});

test('tomato early blight has source-reviewed disease and cultural guidance', async () => {
  const result = await analyze(fakePrediction({
    top_prediction: 'Tomato___Early_blight',
    status: 'prediction',
    confidence: 0.9,
    confidence_threshold: 0.6
  }), { selectedCrop: 'Tomato' });

  assert.equal(result.canonicalCropId, 'tomato');
  assert.equal(result.canonicalDiseaseId, 'early_blight');
  assert.equal(result.diseaseInfo.status, 'AVAILABLE');
  assert.equal(result.diseaseInfo.scientificName, 'Alternaria solani');
  assert.equal(result.diseaseInfo.lastReviewedAt, '2026-11-24');
  assert.ok(result.diseaseInfo.causes.length > 0);
  assert.ok(result.diseaseInfo.spreadInformation.length > 0);
  assert.equal(result.organicTreatments.recommendations.length, 1);
  assert.equal(result.organicTreatments.recommendations[0].verification_status, 'source_verified');
  assert.equal(result.chemicalRecommendations.recommendations.length, 0);
  assert.equal(result.pesticidePriceStatus, 'NOT_AVAILABLE');
});

test('tomato late and potato early/late blight map exactly without invented disease facts', async () => {
  const cases = [
    ['Tomato___Late_blight', 'Tomato', 'tomato', 'late_blight'],
    ['Potato___Early_blight', 'Potato', 'potato', 'early_blight'],
    ['Potato___Late_blight', 'Potato', 'potato', 'late_blight']
  ];

  for (const [className, crop, canonicalCropId, canonicalDiseaseId] of cases) {
    const [modelCrop, modelDisease] = className.split('___');
    const result = await analyze(fakePrediction({
      top_prediction: className,
      crop: modelCrop,
      disease: modelDisease.replace(/_/g, ' '),
      status: 'prediction',
      confidence: 0.9
    }), { selectedCrop: crop });

    assert.equal(result.canonicalCropId, canonicalCropId);
    assert.equal(result.canonicalDiseaseId, canonicalDiseaseId);
    assert.equal(result.diseaseInfo.classMappingStatus, 'AVAILABLE');
    assert.equal(result.diseaseInfo.knowledgeCoverage, 'CLASS_MAPPING_ONLY');
    assert.equal(result.diseaseInfo.status, 'NOT_AVAILABLE');
    assert.equal(result.diseaseInfo.description, null);
    assert.match(result.diseaseInfo.message, /no reviewed disease-specific knowledge/i);
    assert.ok(result.diseaseInfo.followUp.length > 0);
    assert.equal(result.organicTreatments.recommendations.length, 0);
    assert.match(result.organicTreatments.message, /seek local KVK/i);
    assert.equal(result.chemicalRecommendations.recommendations.length, 0);
    assert.equal(result.pesticidePriceStatus, 'NOT_AVAILABLE');
  }
});

test('healthy class shows healthy guidance and leaves field risk unassessed without observations', async () => {
  const result = await analyze(fakePrediction({
    top_prediction: 'Tomato___healthy',
    crop: 'Tomato',
    disease: 'healthy',
    status: 'prediction',
    confidence: 0.95
  }), { selectedCrop: 'Tomato', observations: null });

  assert.equal(result.diseaseInfo.classificationType, 'healthy');
  assert.equal(result.diseaseInfo.knowledgeCoverage, 'healthy_class_guidance');
  assert.match(result.diseaseInfo.description, /does not prove/i);
  assert.equal(result.riskAssessment.risk_level, 'UNASSESSED');
  assert.equal(result.organicTreatments.status, 'AVAILABLE');
  assert.equal(result.chemicalRecommendations.recommendations.length, 0);
});

test('low confidence, missing farmer crop, and unrecognized identifiers fail closed', async () => {
  const lowConfidence = await analyze(fakePrediction({
    top_prediction: 'Tomato___Early_blight',
    crop: 'Tomato',
    disease: 'Early blight',
    status: 'uncertain',
    confidence: 0.3
  }), { selectedCrop: null });
  assert.equal(lowConfidence.cropSelection.status, 'not_selected');
  assert.equal(lowConfidence.predictionStatus, 'UNCERTAIN');
  assert.equal(lowConfidence.riskAssessment.risk_level, 'UNASSESSED');
  assert.equal(lowConfidence.chemicalRecommendations.recommendations.length, 0);

  const unknown = await analyze(fakePrediction({
    top_prediction: 'Tomato___Late_blight ',
    crop: 'Tomato',
    disease: 'Late blight',
    status: 'prediction',
    confidence: 0.95
  }), { selectedCrop: 'Tomato' });
  assert.equal(unknown.classMappingStatus, 'NOT_AVAILABLE');
  assert.equal(unknown.diseaseInfo.knowledgeCoverage, 'NONE');
  assert.equal(unknown.riskAssessment.risk_level, 'UNASSESSED');
  assert.equal(unknown.chemicalRecommendations.recommendations.length, 0);
});

function assertDiseaseEducation(result) {
  assert.equal(result.cropId, 'Strawberry');
  assert.equal(result.diseaseId, 'Leaf_scorch');
  assert.equal(result.possibleDiseaseName, 'Strawberry — Leaf scorch');
  assert.ok(result.diseaseInfo.scientificName);
  assert.ok(result.diseaseInfo.symptoms.length > 0);
  assert.ok(result.diseaseInfo.developmentConditions.length > 0);
  assert.ok(result.diseaseInfo.references.some(reference => reference.url.includes('pnwhandbooks.org')));
  assert.ok(result.organicTreatments.recommendations.length > 0);
  assert.ok(result.diseaseInfo.preventiveMeasures.length > 0);
  assert.ok(result.diseaseInfo.followUp.length > 0);
  assert.equal(result.weatherForecast.informationStatus, 'AVAILABLE');
}

test('high-confidence Strawberry scan returns the complete available report', async () => {
  const result = await analyze(fakePrediction({
    status: 'prediction',
    confidence: 0.91,
    calibrated_confidence: 0.93
  }));
  assertDiseaseEducation(result);
  assert.equal(result.riskAssessment.risk_level, 'MEDIUM');
  assert.equal(result.chemicalRecommendations.status, 'AVAILABLE');
  assert.equal(result.chemicalRecommendations.recommendations[0].application_dosage, verifiedProduct.approvedDosage);
  assert.equal(result.pesticidePriceStatus, 'AVAILABLE');
  assert.equal(result.pesticidePrices.length, 1);
});

test('low-confidence Strawberry scan returns education, references, products, prices, and unassessed risk', async () => {
  const result = await analyze(fakePrediction());
  assertDiseaseEducation(result);
  assert.equal(result.riskAssessment.risk_level, 'UNASSESSED');
  assert.equal(result.diseaseInfo.matchLabel, 'Possible disease match — not confirmed.');
  assert.equal(result.organicTreatments.status, 'PARTIAL');
  assert.equal(result.organicTreatments.recommendations[0].application_allowed, false);
  assert.equal(result.chemicalRecommendations.status, 'RESTRICTED');
  assert.equal(result.chemicalRecommendations.recommendations[0].application_dosage, null);
  assert.equal(result.chemicalRecommendations.recommendations[0].pre_harvest_interval, null);
  assert.match(result.chemicalRecommendations.message, /Not recommended for application/);
  assert.equal(result.pesticidePrices[0].informational_only, true);
  assert.equal(result.pesticidePriceStatus, 'AVAILABLE');
});

test('low-confidence Strawberry top match with an Apple selection keeps education and blocks application', async () => {
  const result = await analyze(fakePrediction(), { selectedCrop: 'Apple' });
  assertDiseaseEducation(result);
  assert.equal(result.cropSelection.status, 'mismatch');
  assert.equal(result.riskAssessment.risk_level, 'UNASSESSED');
  assert.equal(result.chemicalRecommendations.status, 'RESTRICTED');
  assert.equal(result.chemicalRecommendations.recommendations[0].application_dosage, null);
  assert.equal(result.organicTreatments.recommendations.length, 1);
});

test('supported disease class without a knowledge record returns an explicit unavailable state', async () => {
  const result = await analyze(fakePrediction({
    top_prediction: 'Grape___Black_rot',
    crop: 'Grape',
    disease: 'Black rot'
  }), { selectedCrop: 'Strawberry', products: [] });
  assert.equal(result.diseaseInfo.status, 'NOT_AVAILABLE');
  assert.equal(result.diseaseInfo.symptoms.length, 0);
  assert.match(result.diseaseInfo.message, /no reviewed disease-specific knowledge record/i);
  assert.equal(result.organicTreatments.status, 'NOT_AVAILABLE');
  assert.equal(result.pesticidePriceStatus, 'NOT_AVAILABLE');
});

test('agricultural source timeout preserves cached guidance and marks it partial', async () => {
  const result = await analyze(fakePrediction(), { guidanceTimeout: true });
  assert.equal(result.diseaseInfo.status, 'PARTIAL');
  assert.equal(result.diseaseInfo.sourceStatus, 'SOURCE_UNAVAILABLE');
  assert.ok(result.diseaseInfo.symptoms.length > 0);
  assert.ok(result.diseaseInfo.references.length > 0);
  assert.match(result.diseaseInfo.message, /locally reviewed/);
});

test('missing verified pesticide registration does not produce product advice', async () => {
  const result = await analyze(fakePrediction(), { products: [] });
  assert.equal(result.chemicalRecommendations.status, 'NOT_AVAILABLE');
  assert.deepEqual(result.chemicalRecommendations.recommendations, []);
  assert.match(result.chemicalRecommendations.message, /No matching verified pesticide/);
});

test('verified product with no matching price record reports price unavailable', async () => {
  const result = await analyze(fakePrediction(), { prices: [] });
  assert.equal(result.chemicalRecommendations.status, 'RESTRICTED');
  assert.equal(result.pesticidePriceStatus, 'NOT_AVAILABLE');
  assert.deepEqual(result.pesticidePrices, []);
  assert.match(result.pesticidePriceMessage, /No verified price record/);
});

test('weather source failure does not block disease education or report construction', async () => {
  const result = await analyze(fakePrediction(), {
    fetchWeatherForecast: async () => { throw new Error('weather provider timeout'); }
  });
  assertDiseaseEducation({ ...result, weatherForecast: { informationStatus: 'AVAILABLE' } });
  assert.equal(result.weatherForecast.informationStatus, 'SOURCE_UNAVAILABLE');
  assert.equal(result.weatherForecast.forecast.length, 0);
  assert.match(result.weatherForecast.summary, /no forecast was substituted/);
});
