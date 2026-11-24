import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const TEST_IMAGE = process.env.PLANTVILLAGE_TEST_IMAGE;
const TEST_CROP = process.env.DISEASE_TEST_CROP;

test('real leaf image reaches the disease classifier through Express', async ({ page }) => {
  test.skip(!TEST_IMAGE, 'Set PLANTVILLAGE_TEST_IMAGE to a local image.');

  await page.goto(APP_URL);
  const imageParts = TEST_IMAGE!.split(/[\\/]/);
  const selectedCrop = TEST_CROP || imageParts[imageParts.length - 2].split('___')[0];
  await page.getByTestId('crop-selection').selectOption(selectedCrop);
  await page.getByTestId('symptoms-spreading').selectOption('yes');
  await page.getByTestId('affected-plants').selectOption('more_30');
  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/api/upload-crop-image') &&
    response.request().method() === 'POST'
  );
  await page.getByTestId('file-input').setInputFiles(TEST_IMAGE!);

  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(['prediction', 'uncertain']).toContain(result.detectionStatus);
  expect(result.predictedClass).toContain('___');
  expect(result.cropSelection.source).toBe('farmer');
  expect(['matched', 'mismatch']).toContain(result.cropSelection.status);
  if (result.cropSelection.status === 'mismatch') {
    expect(result.cropSelection.disease_specific_recommendations_allowed).toBe(false);
    expect(result.chemicalRecommendations.status).toBe('RESTRICTED');
    expect(result.chemicalRecommendations.recommendations.every(product => product.application_dosage == null)).toBe(true);
  }
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  expect(result.diseaseInfo.references.length).toBeGreaterThan(0);
  expect(result.riskAssessment.predicted_class).toBe(result.predictedClass);
  expect(result.riskAssessment.confidence).toBe(result.confidence);
  expect(['LOW', 'MEDIUM', 'HIGH', 'UNASSESSED']).toContain(result.riskAssessment.risk_level);
  expect(result.riskAssessment.farmer_observations.symptomsSpreading).toBe('yes');
  expect(result.riskAssessment.farmer_observations.affectedPlants).toBe('more_30');
  if (result.detectionStatus === 'uncertain') {
    expect(result.riskAssessment.risk_level).toBe('UNASSESSED');
  } else if (result.detectionStatus === 'prediction' && !result.predictedClass.includes('healthy')) {
    expect(result.riskAssessment.risk_level).toBe('HIGH');
  }
  expect(result.organicTreatments.recommendations).toBeInstanceOf(Array);
  expect(result.chemicalRecommendations.recommendations).toBeInstanceOf(Array);
  expect(result.pesticidePrices).toBeInstanceOf(Array);

  await expect(page.getByRole('img', { name: 'Scanned leaf image' })).toBeVisible();
  await expect(page.getByText(/Raw model score:/)).toBeVisible();
  await expect(page.getByTestId('disease-risk')).toBeVisible();
  await expect(page.getByTestId('disease-information')).toBeVisible();
  await expect(page.getByTestId('organic-treatments')).toBeVisible();
  await expect(page.getByTestId('prevention-follow-up')).toBeVisible();
  await expect(page.getByTestId('chemical-recommendations')).toBeVisible();
  await expect(page.getByTestId('pesticide-prices')).toBeVisible();
  await expect(page.getByTestId('weather-forecast')).toBeVisible();
  if (result.detectionStatus === 'uncertain') {
    await expect(page.getByTestId('prediction-status')).toContainText('Possible disease match — not confirmed.');
    await expect(page.getByTestId('disease-information')).toContainText('Educational information about the possible disease');
    await expect(page.getByTestId('organic-treatments')).toContainText('confirm the diagnosis before disease-specific action');
    await expect(page.getByTestId('chemical-recommendations')).toContainText('Not recommended for application');
    await expect(page.getByTestId('prevention-follow-up')).toContainText('Seek local confirmation');
    expect(result.riskAssessment.risk_level).toBe('UNASSESSED');
    expect(result.chemicalRecommendations.recommendations.every(product => product.application_dosage == null)).toBe(true);
    expect(result.pesticidePrices.every(listing => listing.informational_only)).toBe(true);
  } else {
    await expect(page.getByRole('heading', { name: result.disease, exact: true })).toBeVisible();
    await expect(page.getByTestId('organic-treatments')).toBeVisible();
    await expect(page.getByTestId('chemical-recommendations')).toBeVisible();
    await expect(page.getByTestId('pesticide-prices')).toBeVisible();
  }
});

test('renders crop, disease, confidence, and healthy or uncertain class status', async ({ page }) => {
  const cases = [
    {
      result: {
        disease: 'Potato — Early blight',
        crop: 'Potato',
        classMetadata: { condition: 'diseased', cropName: 'Potato', diseaseName: 'Early blight' },
        possibleDiseaseName: 'Potato — Early blight',
        predictionStatus: 'CONFIRMED_BY_MODEL',
        detectionStatus: 'prediction',
        classMappingStatus: 'AVAILABLE',
        confidence: 0.9651,
        riskAssessment: { is_uncertain: false, risk_level: 'UNASSESSED', assessment_limitations: [] },
        cropSelection: { status: 'not_selected', explanation: '', disease_specific_recommendations_allowed: true },
        diseaseInfo: { status: 'NOT_AVAILABLE', message: 'No reviewed disease record is available.' },
        organicTreatments: { status: 'NOT_AVAILABLE', recommendations: [] },
        chemicalRecommendations: { status: 'NOT_AVAILABLE', recommendations: [] },
        pesticidePrices: [],
        pesticidePriceStatus: 'NOT_AVAILABLE',
        treatments: [],
        affordableAlternatives: [],
        weatherForecast: { status: 'unavailable', forecast: [] },
        lang: 'en',
        contentLanguage: 'en'
      },
      expectedCrop: 'Potato',
      expectedDisease: 'Early blight',
      expectedStatus: 'Diseased class'
    },
    {
      result: {
        disease: 'Tomato — Healthy',
        crop: 'Tomato',
        classMetadata: { condition: 'healthy', cropName: 'Tomato', diseaseName: 'Healthy' },
        possibleDiseaseName: 'Tomato — Healthy',
        predictionStatus: 'CONFIRMED_BY_MODEL',
        detectionStatus: 'prediction',
        classMappingStatus: 'AVAILABLE',
        confidence: 0.9439,
        riskAssessment: { is_uncertain: false, risk_level: 'UNASSESSED', assessment_limitations: [] },
        cropSelection: { status: 'not_selected', explanation: '', disease_specific_recommendations_allowed: true },
        diseaseInfo: { status: 'NOT_AVAILABLE', message: 'No reviewed disease record is available.' },
        organicTreatments: { status: 'NOT_AVAILABLE', recommendations: [] },
        chemicalRecommendations: { status: 'NOT_AVAILABLE', recommendations: [] },
        pesticidePrices: [],
        pesticidePriceStatus: 'NOT_AVAILABLE',
        treatments: [],
        affordableAlternatives: [],
        weatherForecast: { status: 'unavailable', forecast: [] },
        lang: 'en',
        contentLanguage: 'en'
      },
      expectedCrop: 'Tomato',
      expectedDisease: 'Healthy',
      expectedStatus: 'Healthy class'
    },
    {
      result: {
        disease: 'Uncertain',
        crop: 'Tomato',
        classMetadata: { condition: 'diseased', cropName: 'Tomato', diseaseName: 'Early blight' },
        possibleDiseaseName: 'Tomato — Early blight',
        predictionStatus: 'UNCERTAIN',
        detectionStatus: 'uncertain',
        classMappingStatus: 'AVAILABLE',
        confidence: 0.5455,
        riskAssessment: { is_uncertain: true, risk_level: 'UNASSESSED', assessment_limitations: [] },
        cropSelection: { status: 'not_selected', explanation: '', disease_specific_recommendations_allowed: false },
        diseaseInfo: { status: 'NOT_AVAILABLE', message: 'No reviewed disease record is available.' },
        organicTreatments: { status: 'NOT_AVAILABLE', recommendations: [] },
        chemicalRecommendations: { status: 'RESTRICTED', recommendations: [] },
        pesticidePrices: [],
        pesticidePriceStatus: 'NOT_AVAILABLE',
        treatments: [],
        affordableAlternatives: [],
        weatherForecast: { status: 'unavailable', forecast: [] },
        lang: 'en',
        contentLanguage: 'en'
      },
      expectedCrop: 'Tomato',
      expectedDisease: 'Early blight',
      expectedStatus: 'Possible disease match — not confirmed.'
    }
  ];

  let response = cases[0].result;
  await page.route('**/api/upload-crop-image', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
  );
  await page.goto(APP_URL);

  for (const [index, testCase] of cases.entries()) {
    response = testCase.result;
    await page.getByTestId('file-input').setInputFiles({
      name: `scan-${index}.jpg`,
      mimeType: 'image/jpeg',
      buffer: Buffer.from('mock upload')
    });
    await expect(page.getByTestId('prediction-details')).toContainText(testCase.expectedCrop);
    await expect(page.getByTestId('prediction-details')).toContainText(testCase.expectedDisease);
    await expect(page.getByTestId('classification-status')).toContainText(testCase.expectedStatus);
    await expect(page.getByText(`Raw model score: ${(testCase.result.confidence * 100).toFixed(1)}%`)).toBeVisible();
  }
});

test('localizes classifier crop and disease names when scan prose already matches the selected language', async ({ page }) => {
  const response = {
    disease: 'ಆಲೂಗಡ್ಡೆ — ಆರಂಭಿಕ ಅಂಗಮಾರಿ',
    crop: 'Potato',
    classMetadata: { condition: 'diseased', cropName: 'Potato', diseaseName: 'Early blight' },
    possibleDiseaseName: 'ಆಲೂಗಡ್ಡೆ — ಆರಂಭಿಕ ಅಂಗಮಾರಿ',
    predictionStatus: 'CONFIRMED_BY_MODEL',
    detectionStatus: 'prediction',
    classMappingStatus: 'AVAILABLE',
    confidence: 0.9651,
    riskAssessment: { is_uncertain: false, risk_level: 'UNASSESSED', assessment_limitations: [] },
    cropSelection: { status: 'not_selected', explanation: '', disease_specific_recommendations_allowed: true },
    diseaseInfo: { status: 'NOT_AVAILABLE', message: 'ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ.' },
    organicTreatments: { status: 'NOT_AVAILABLE', recommendations: [] },
    chemicalRecommendations: { status: 'NOT_AVAILABLE', recommendations: [] },
    pesticidePrices: [],
    pesticidePriceStatus: 'NOT_AVAILABLE',
    treatments: [],
    affordableAlternatives: [],
    weatherForecast: { status: 'unavailable', forecast: [] },
    lang: 'kn',
    contentLanguage: 'kn'
  };

  await page.route('**/api/upload-crop-image', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
  );
  await page.route('**/api/translate', async route => {
    const request = route.request().postDataJSON();
    const texts = Array.isArray(request.text) ? request.text : [request.text];
    const translations = texts.map(text => ({
      Potato: 'ಆಲೂಗಡ್ಡೆ',
      'Early blight': 'ಆರಂಭಿಕ ಅಂಗಮಾರಿ'
    }[text] || text));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lang: 'kn', translations, translatedText: translations[0] })
    });
  });
  await page.goto(APP_URL);
  await page.getByTestId('language-select').selectOption('kn');
  await page.getByTestId('file-input').setInputFiles({
    name: 'potato.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('mock upload')
  });

  await expect(page.getByTestId('prediction-details')).toContainText('ಆಲೂಗಡ್ಡೆ');
  await expect(page.getByTestId('prediction-details')).toContainText('ಆರಂಭಿಕ ಅಂಗಮಾರಿ');
});

test('shows invalid-image and disease-service errors in the results section', async ({ page }) => {
  let status = 415;
  await page.route('**/api/upload-crop-image', route => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      message: status === 415
        ? 'Upload a valid JPEG, PNG, or WebP leaf image.'
        : 'Disease identification is temporarily unavailable.'
    })
  }));
  await page.goto(APP_URL);
  await expect(page.getByTestId('results-empty-state')).toBeVisible();

  await page.getByTestId('file-input').setInputFiles({
    name: 'unsupported.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not a real image')
  });
  await expect(page.getByTestId('scan-error')).toContainText('Choose a JPEG, PNG, or WebP leaf image.');
  await expect(page.getByTestId('file-input')).toHaveValue('');

  status = 503;
  await page.getByTestId('file-input').setInputFiles({
    name: 'service-unavailable.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('mock upload')
  });
  await expect(page.getByTestId('scan-error')).toContainText('Disease identification is temporarily unavailable.');
});
