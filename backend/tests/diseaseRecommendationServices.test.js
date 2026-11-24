const test = require('node:test');
const assert = require('node:assert/strict');
const { assessDiseaseRisk, validateObservations } = require('../services/diseaseRiskService');
const { getOrganicTreatments } = require('../services/organicTreatmentService');
const {
  UNSUPPORTED_CROP_SELECTION,
  assessCropCompatibility,
  validateSelectedCrop
} = require('../services/diseaseCropCompatibilityService');
const { getChemicalRecommendations } = require('../services/pesticideRecommendationService');
const { generateAssistantResponse } = require('../services/aiService');
const {
  isOfficialRegistrationUrl,
  isProductVerified,
  validatePesticideProduct
} = require('../services/pesticideCatalogService');
const {
  getStaleReason,
  isDuplicate,
  isValidStoredPriceListing,
  matchesApprovedPackSize,
  toPublicListing,
  validatePriceListing
} = require('../services/pesticidePriceService');
const scanController = require('../controllers/scanController');

const threshold = 0.6;
const observation = (symptomsSpreading, affectedPlants) => ({
  symptomsSpreading,
  affectedPlants,
  visibleSymptoms: ['spots']
});
const prediction = (className = 'Apple___Apple_scab', overrides = {}) => ({
  predictedClass: className,
  confidence: 0.9,
  isUncertain: false,
  confidenceThreshold: threshold,
  ...overrides
});

test('high-confidence healthy class leaves field risk unassessed when observations are absent', () => {
  const result = assessDiseaseRisk(prediction('Apple___healthy'));
  assert.equal(result.risk_level, 'UNASSESSED');
  assert.equal(result.is_uncertain, false);
  assert.match(result.risk_reason, /field observations were not provided/i);
  assert.match(result.recommended_action, /Continue monitoring/i);
  assert.equal(result.confidence, 0.9);
});

test('healthy class can report low observation-based concern only when observations show no symptoms', () => {
  const result = assessDiseaseRisk(prediction('Apple___healthy', {
    observations: {
      symptomsSpreading: 'no',
      affectedPlants: 'less_10',
      visibleSymptoms: []
    }
  }));
  assert.equal(result.risk_level, 'LOW');
  assert.match(result.risk_reason, /healthy class/i);
});

test('conflicting farmer observations prevent a healthy class from being reported as low risk', () => {
  const result = assessDiseaseRisk(prediction('Apple___healthy', {
    observations: observation('yes', 'more_30')
  }));
  assert.equal(result.risk_level, 'UNASSESSED');
  assert.match(result.risk_reason, /conflict/i);
});

test('risk categories follow reported affected-plant range and spread, not model confidence', () => {
  const high = assessDiseaseRisk(prediction('Apple___Apple_scab', {
    confidence: 0.99,
    observations: observation('yes', 'more_30')
  }));
  const medium = assessDiseaseRisk(prediction('Apple___Apple_scab', {
    observations: observation('no', '10_30')
  }));
  const low = assessDiseaseRisk(prediction('Apple___Apple_scab', {
    observations: observation('no', 'less_10')
  }));

  assert.equal(high.risk_level, 'HIGH');
  assert.equal(medium.risk_level, 'MEDIUM');
  assert.equal(low.risk_level, 'LOW');
  assert.equal(low.confidence, 0.9);
  assert.match(high.assessment_limitations.join(' '), /not a validated/i);
});

test('low confidence, missing prediction, and missing observations stay unassessed', () => {
  const uncertain = assessDiseaseRisk(prediction('Apple___Apple_scab', {
    confidence: 0.434,
    isUncertain: true,
    observations: observation('yes', 'more_30')
  }));
  const missingObservation = assessDiseaseRisk(prediction());
  const missingPrediction = assessDiseaseRisk({});

  assert.equal(uncertain.risk_level, 'UNASSESSED');
  assert.equal(uncertain.is_uncertain, true);
  assert.equal(missingObservation.risk_level, 'UNASSESSED');
  assert.equal(missingPrediction.risk_level, 'UNASSESSED');
});

test('unmapped class risk remains unassessed even with farmer observations', () => {
  const result = assessDiseaseRisk(prediction('Tomato___Unrecognized', {
    observations: observation('yes', 'more_30')
  }));
  assert.equal(result.risk_level, 'UNASSESSED');
  assert.equal(result.is_uncertain, true);
  assert.match(result.risk_reason, /not in the exact supported class registry/i);
});

test('a raw 43.4% score remains uncertain even if its calibrated score is higher', () => {
  const result = assessDiseaseRisk(prediction('Apple___Apple_scab', {
    confidence: 0.434,
    calibratedConfidence: 0.7,
    confidenceThreshold: 0.572,
    isUncertain: true,
    observations: observation('yes', 'more_30')
  }));

  assert.equal(result.risk_level, 'UNASSESSED');
  assert.equal(result.is_uncertain, true);
  assert.equal(result.confidence, 0.434);
  assert.equal(result.calibrated_confidence, 0.7);
});

test('observation validation rejects malformed values and normalizes duplicate symptoms', () => {
  assert.match(validateObservations('{bad json').error, /valid JSON/);
  assert.match(validateObservations({ symptomsSpreading: 'maybe' }).error, /symptomsSpreading/);
  const result = validateObservations({
    symptomsSpreading: 'no',
    affectedPlants: 'less_10',
    visibleSymptoms: ['spots', 'spots']
  });
  assert.deepEqual(result.observations.visibleSymptoms, ['spots']);
});

test('farmer crop selection must match the model class before disease-specific advice is allowed', () => {
  const matched = assessCropCompatibility('Apple___Apple_scab', 'Apple');
  const mismatch = assessCropCompatibility('Apple___Apple_scab', 'Tomato');
  const unsupported = assessCropCompatibility('Apple___Apple_scab', UNSUPPORTED_CROP_SELECTION);
  const notSelected = assessCropCompatibility('Apple___Apple_scab', null);

  assert.equal(validateSelectedCrop('Tomato').selectedCrop, 'Tomato');
  assert.match(validateSelectedCrop('Not a crop').error, /supported crop/);
  assert.equal(matched.status, 'matched');
  assert.equal(matched.disease_specific_recommendations_allowed, true);
  assert.equal(mismatch.status, 'mismatch');
  assert.equal(mismatch.disease_specific_recommendations_allowed, false);
  assert.equal(unsupported.status, 'unsupported_crop');
  assert.equal(unsupported.disease_specific_recommendations_allowed, false);
  assert.equal(notSelected.status, 'not_selected');
});

test('organic recommendation is disease-mapped, sourced, and makes no certification or cure claim', () => {
  const result = getOrganicTreatments('Apple___Apple_scab', false);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].target_disease, 'Apple scab');
  assert.equal(result.recommendations[0].verification_status, 'source_verified');
  assert.match(result.recommendations[0].limitations, /does not confirm|does not.*guarantee/i);
  assert.doesNotMatch(JSON.stringify(result), /certified organic/i);
  assert.equal(getOrganicTreatments('Potato___Late_blight', false).recommendations.length, 0);
  assert.equal(getOrganicTreatments('Apple___Apple_scab', true).recommendations.length, 1);
});

test('strawberry leaf-scorch educational guidance remains available for uncertain results', () => {
  const result = getOrganicTreatments('Strawberry___Leaf_scorch', false);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].target_crop, 'Strawberry');
  assert.equal(result.recommendations[0].target_disease, 'Leaf scorch');
  assert.equal(result.recommendations[0].verification_status, 'source_verified');
  assert.equal(
    result.recommendations[0].source_url,
    'https://pnwhandbooks.org/plantdisease/host-disease/strawberry-fragaria-spp-leaf-scorch'
  );
  assert.match(result.recommendations[0].limitations, /regional|does not confirm/i);
  assert.match(result.recommendations[0].limitations, /No pesticide efficacy or organic certification is claimed/i);
  const uncertain = getOrganicTreatments('Strawberry___Leaf_scorch', true);
  assert.equal(uncertain.recommendations.length, 1);
  assert.equal(uncertain.recommendations[0].guidance_scope, 'possible_disease_educational');
  assert.equal(uncertain.recommendations[0].application_allowed, false);
});

test('chemical products require verified crop and disease label mappings', async () => {
  const unsupported = await getChemicalRecommendations({
    crop: 'Apple',
    predictedClass: 'Apple___Apple_scab',
    isUncertain: false,
    riskLevel: 'MEDIUM'
  });
  assert.deepEqual(unsupported.recommendations, []);
  assert.match(unsupported.message, /No matching verified pesticide registration/i);

  const product = {
    productId: 'verified-product',
    brandName: 'Verified label product',
    manufacturer: 'Manufacturer',
    activeIngredient: 'Ingredient',
    formulation: 'Formulation',
    concentration: 'label value',
    targetClasses: ['Apple___Apple_scab'],
    packSizes: [{ value: 250, unit: 'ml' }],
    targetCrops: ['Apple'],
    targetDiseases: ['Apple_scab'],
    registrationVerification: 'verified',
    labelVerification: 'verified',
    registrationSourceUrl: 'https://ppqs.gov.in/registration',
    labelSourceUrl: 'https://manufacturer.example/label',
    registrationInformation: 'Reviewed registration reference',
    approvedLabelInformation: 'Reviewed label',
    safetyInformation: 'Follow approved label directions.',
    verifiedBy: 'Agronomist',
    lastVerifiedAt: new Date().toISOString(),
    active: true
  };
  const verified = await getChemicalRecommendations({
    crop: 'Apple',
    predictedClass: 'Apple___Apple_scab',
    isUncertain: false,
    riskLevel: 'MEDIUM'
  }, [product]);
  assert.equal(verified.recommendations.length, 1);
  assert.match(verified.recommendations[0].application_dosage, /unavailable/i);
  const futureVerified = await getChemicalRecommendations({
    crop: 'Apple',
    predictedClass: 'Apple___Apple_scab',
    isUncertain: false,
    riskLevel: 'MEDIUM'
  }, [{ ...product, lastVerifiedAt: new Date(Date.now() + 86400000).toISOString() }]);
  assert.deepEqual(futureVerified.recommendations, []);
  const expiredVerification = await getChemicalRecommendations({
    crop: 'Apple',
    predictedClass: 'Apple___Apple_scab',
    isUncertain: false,
    riskLevel: 'MEDIUM'
  }, [{ ...product, lastVerifiedAt: '2020-01-01T00:00:00Z' }]);
  assert.deepEqual(expiredVerification.recommendations, []);
  const uncertainProduct = await getChemicalRecommendations({
    crop: 'Apple',
    predictedClass: 'Apple___Apple_scab',
    isUncertain: true,
    riskLevel: 'UNASSESSED'
  }, [product]);
  assert.equal(uncertainProduct.status, 'RESTRICTED');
  assert.equal(uncertainProduct.recommendations.length, 1);
  assert.equal(uncertainProduct.recommendations[0].application_dosage, null);
  assert.match(uncertainProduct.recommendations[0].use_restriction, /Not recommended for application/);
  const lowRisk = await getChemicalRecommendations({
    crop: 'Apple',
    predictedClass: 'Apple___Apple_scab',
    isUncertain: false,
    riskLevel: 'LOW'
  }, [product]);
  assert.equal(lowRisk.status, 'RESTRICTED');
  assert.equal(lowRisk.recommendations[0].application_dosage, null);

  const mismatchedCrop = await getChemicalRecommendations({
    crop: 'Tomato',
    predictedClass: 'Apple___Apple_scab',
    isUncertain: false,
    riskLevel: 'HIGH'
  }, [product]);
  assert.equal(mismatchedCrop.status, 'NOT_AVAILABLE');
  assert.deepEqual(mismatchedCrop.recommendations, []);

  const healthyClass = await getChemicalRecommendations({
    crop: 'Apple',
    predictedClass: 'Apple___healthy',
    isUncertain: false,
    riskLevel: 'HIGH'
  }, [product]);
  assert.equal(healthyClass.status, 'NOT_AVAILABLE');
  assert.deepEqual(healthyClass.recommendations, []);
});

test('pesticide catalogue requires an official registration source and reviewed label data', () => {
  const product = {
    productId: 'item-1',
    brandName: 'Brand',
    manufacturer: 'Maker',
    activeIngredient: 'Ingredient',
    formulation: 'Formulation',
    concentration: 'label value',
    targetClasses: ['Apple___Apple_scab'],
    packSizes: [{ value: 250, unit: 'ml' }],
    registrationInformation: 'Reviewed official registration record',
    registrationSourceUrl: 'https://ppqs.gov.in/records/item-1.pdf',
    registrationVerification: 'verified',
    labelSourceUrl: 'https://maker.example/label.pdf',
    labelVerification: 'verified',
    approvedLabelInformation: 'Reviewed approved crop and target label',
    safetyInformation: 'Follow the approved label.',
    verifiedBy: 'Agronomist',
    lastVerifiedAt: new Date().toISOString(),
    active: true
  };
  assert.equal(validatePesticideProduct(product).error, undefined);
  assert.match(validatePesticideProduct({
    ...product,
    registrationSourceUrl: 'https://example.com/fake-registration'
  }).error, /official PPQS/);
  assert.match(validatePesticideProduct({
    ...product,
    registrationVerification: 'pending',
    approvedDosage: 'unverified dosage'
  }).error, /Dosage may be stored only/);
  assert.match(validatePesticideProduct({
    ...product,
    registrationInformation: ''
  }).error, /registrationInformation is required/);
  assert.match(validatePesticideProduct({
    ...product,
    targetClasses: ['Apple___healthy']
  }).error, /exact supported PlantVillage class labels/);
  assert.equal(isOfficialRegistrationUrl(product.registrationSourceUrl), true);
  assert.equal(isOfficialRegistrationUrl('https://example.com/record'), false);
  assert.equal(isProductVerified(product), true);
  assert.equal(isProductVerified({ ...product, lastVerifiedAt: '2020-01-01' }), false);
  assert.equal(matchesApprovedPackSize(product, { packSize: 250, packUnit: 'ml' }), true);
  assert.equal(matchesApprovedPackSize(product, { packSize: 250, packUnit: 'g' }), false);
});

test('pricing validation distinguishes live retailer feed from administrator records', () => {
  const valid = {
    productId: 'verified-product',
    brandName: 'Brand',
    activeIngredient: 'Ingredient',
    formulation: 'Formulation',
    packSize: 250,
    packUnit: 'ml',
    price: 250,
    currency: 'INR',
    seller: 'Licensed retailer',
    location: { state: 'Karnataka', district: 'Mysuru', town: 'Mysuru' },
    priceType: 'live_retail',
    sourceType: 'retailer_feed',
    availabilityStatus: 'available',
    sourceUrl: 'https://retailer.example/product',
    verifiedAt: '2026-01-01T00:00:00Z'
  };
  assert.ok(validatePriceListing(valid).listing);
  assert.match(validatePriceListing({ ...valid, price: -1 }).error, /positive/);
  assert.match(validatePriceListing({ ...valid, currency: 'USD' }).error, /INR/);
  assert.match(validatePriceListing({ ...valid, sourceType: 'administrator' }).error, /cannot be classified as live/);
  assert.match(validatePriceListing({ ...valid, sourceUrl: '' }).error, /sourceUrl/);
  assert.match(validatePriceListing({
    ...valid,
    priceType: 'historical_government',
    sourceType: 'government',
    year: 2024,
    sourceUrl: 'https://retailer.example/history'
  }).error, /Indian government source/);
  assert.ok(validatePriceListing({
    ...valid,
    priceType: 'administrator_manual',
    sourceType: 'administrator'
  }).listing);
});

test('stale, malformed, and duplicate price records are not treated as current prices', () => {
  const listing = {
    id: 'listing-1',
    productId: 'product-1',
    brandName: 'Brand',
    activeIngredient: 'Ingredient',
    formulation: 'Formulation',
    packSize: 100,
    packUnit: 'ml',
    price: 100,
    currency: 'INR',
    seller: 'Seller',
    location: { state: 'State', district: 'District', town: 'Town' },
    priceType: 'live_retail',
    sourceType: 'retailer_feed',
    availabilityStatus: 'available',
    sourceUrl: 'https://retailer.example/item',
    verifiedAt: new Date('2025-01-01T00:00:00Z'),
    lastUpdatedAt: new Date('2025-01-01T00:00:00Z')
  };
  assert.match(getStaleReason(listing, new Date('2025-01-10T00:00:00Z')), /older than 7 days/);
  assert.equal(toPublicListing(listing, new Date('2025-01-10T00:00:00Z')).price, null);
  assert.equal(isValidStoredPriceListing(listing, new Date('2025-01-02T00:00:00Z')), true);
  assert.equal(isValidStoredPriceListing({ ...listing, price: -1 }, new Date('2025-01-02T00:00:00Z')), false);
  assert.equal(isValidStoredPriceListing({ ...listing, lastUpdatedAt: undefined }, new Date('2025-01-02T00:00:00Z')), false);
  assert.equal(isDuplicate(listing, { ...listing }), true);
  assert.equal(isDuplicate(listing, { ...listing, packUnit: 'g' }), false);
});

test('administrator API fails closed when credentials or verified product data are absent', async () => {
  const previousToken = process.env.PESTICIDE_PRICE_ADMIN_TOKEN;
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  try {
    delete process.env.PESTICIDE_PRICE_ADMIN_TOKEN;
    await scanController.createPesticideProduct({ body: {} }, response);
    assert.equal(response.statusCode, 503);

    process.env.PESTICIDE_PRICE_ADMIN_TOKEN = 'x'.repeat(32);
    response.statusCode = 200;
    await scanController.createPesticideProduct({
      get: () => 'Bearer wrong-token',
      body: {}
    }, response);
    assert.equal(response.statusCode, 401);

    response.statusCode = 200;
    await scanController.createPesticideProduct({
      get: () => `Bearer ${process.env.PESTICIDE_PRICE_ADMIN_TOKEN}`,
      body: {}
    }, response);
    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /productId is required/);
  } finally {
    if (previousToken === undefined) delete process.env.PESTICIDE_PRICE_ADMIN_TOKEN;
    else process.env.PESTICIDE_PRICE_ADMIN_TOKEN = previousToken;
  }
});

test('crop assistant only reports stored risk, treatment, product, and price evidence', async () => {
  const context = {
    disease: 'Apple — Apple scab',
    severity: 'unassessed',
    confidence: 0.91,
    scanId: 'scan-1',
    riskAssessment: { risk_level: 'MEDIUM', risk_reason: 'Farmer reported 10-30% affected.' },
    organicTreatments: { recommendations: [], message: 'No verified organic treatment recommendation is currently available for this disease.' },
    chemicalRecommendations: { recommendations: [], message: 'No verified registered pesticide recommendation is available for this crop and disease.' },
    pesticidePrices: []
  };
  assert.match((await generateAssistantResponse(context, 'Why is disease risk medium?')).answer, /10-30%/);
  assert.match((await generateAssistantResponse(context, 'What organic treatment can I use?')).answer, /No verified organic/);
  assert.match((await generateAssistantResponse(context, 'What are the pesticide prices?')).answer, /Current market price unavailable/);
  assert.match((await generateAssistantResponse(context, 'Which pesticide product?')).answer, /No verified registered pesticide/);
});
