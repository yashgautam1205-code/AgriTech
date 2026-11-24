import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

test.describe('Language -> TTS', () => {
  test('language selection updates the dashboard and persists after reload', async ({ page }) => {
    await page.goto(APP_URL);
    await page.selectOption('[data-testid="language-select"]', 'kn');

    await expect(page.getByText('ಬೆಳೆ ವೈದ್ಯ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್')).toBeVisible();
    await page.reload();

    await expect(page.getByTestId('language-select')).toHaveValue('kn');
    await expect(page.getByText('ಬೆಳೆ ವೈದ್ಯ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್')).toBeVisible();
  });

  test('select language and speak triggers speechSynthesis with matching lang', async ({ page }) => {
    await page.route('**/api/speech/synthesize', route =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'unavailable' }) })
    );
    // stub speechSynthesis to capture utterances
    await page.addInitScript(() => {
      window.__utterances = [];
      const orig = window.speechSynthesis && window.speechSynthesis.speak;
      if (window.speechSynthesis) {
        window.speechSynthesis.speak = (u) => {
          try {
            window.__utterances.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name });
          } catch (e) { window.__utterances.push({ error: String(e) }); }
        };
      }
    });

    await page.goto(APP_URL);
    // choose Hindi (hi)
    await page.selectOption('[data-testid="language-select"]', 'hi');

    // call the exposed test speak helper with a sample result
    await page.evaluate(() => {
      if (window.__aiCropSpeak) {
        window.__aiCropSpeak({ disease: 'टेस्ट', severity: 'low', treatments: ['A','B'] });
      }
    });

    // read captured utterances
    await expect.poll(() => page.evaluate(() => (window.__utterances || []).length)).toBeGreaterThan(0);
    const utterances = await page.evaluate(() => window.__utterances || []);
    // there should be at least one utterance
    expect(utterances.length).toBeGreaterThan(0);
    // the lang should be set to a hindi locale or at least contain 'hi'
    const first = utterances[0];
    expect(String(first.lang || '').toLowerCase()).toContain('hi');
  });

  test('unsupported Sarvam speech language leaves browser audio disabled', async ({ page }) => {
    await page.route('**/api/speech/synthesize', route =>
      route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ message: 'unsupported' }) })
    );
    await page.addInitScript(() => {
      window.__utterances = [];
      if (window.speechSynthesis) {
        window.speechSynthesis.speak = () => window.__utterances.push('unexpected');
      }
    });

    await page.goto(APP_URL);
    await page.selectOption('[data-testid="language-select"]', 'hi');
    const speechResponse = page.waitForResponse(response =>
      response.url().includes('/api/speech/synthesize') && response.request().method() === 'POST'
    );
    await page.evaluate(() => window.__aiCropSpeak?.({ disease: 'टेस्ट', severity: 'low', treatments: ['A', 'B'] }));
    expect((await speechResponse).status()).toBe(422);
    expect(await page.evaluate(() => window.__utterances)).toEqual([]);
  });

  test('irrigation labels switch immediately without changing submitted enum values', async ({ page }) => {
    await page.goto(APP_URL);
    await page.selectOption('[data-testid="language-select"]', 'hi');

    const growthStage = page.getByLabel('विकास की अवस्था');
    await expect(growthStage).toHaveValue('vegetative');
    const soilType = page.getByLabel('मिट्टी का प्रकार — स्वयं दर्ज करें');
    await soilType.selectOption('sandy');
    await expect(soilType).toHaveValue('sandy');

    await page.selectOption('[data-testid="language-select"]', 'ta');
    const translatedSoilType = page.getByLabel('மண் வகை — கைமுறையாக');
    await expect(translatedSoilType).toHaveValue('sandy');
    await expect(translatedSoilType.locator('option[value="sandy"]')).toHaveText('மணற்பாங்கான மண்');
  });
});

test('crop recommendation submits real model features', async ({ page }) => {
  await page.goto(APP_URL);

  await page.getByLabel('Nitrogen (N)', { exact: true }).fill('90');
  await page.getByLabel('Phosphorus (P)', { exact: true }).fill('42');
  await page.getByLabel('Potassium (K)', { exact: true }).fill('43');
  await page.getByLabel('Temperature (°C)', { exact: true }).fill('20.88');
  await page.getByLabel('Humidity (%)', { exact: true }).fill('82');
  await page.getByLabel('Soil pH', { exact: true }).fill('6.5');
  await page.getByLabel('Rainfall (mm)', { exact: true }).fill('202.94');

  const predictionResponse = page.waitForResponse(response =>
    response.url().includes('/api/crop/predict') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Recommend suitable crops' }).click();
  const response = await predictionResponse;
  expect(response.status()).toBe(200);
  await expect(page.getByText('rice', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Model confidence:/)).toBeVisible();
});

test('irrigation guidance uses field inputs and shows their source', async ({ page }) => {
  const modelInfoPromise = page.waitForResponse(response =>
    response.url().includes('/api/crop/model-info') &&
    response.request().method() === 'GET'
  );
  await page.goto(APP_URL);
  expect((await modelInfoPromise).status()).toBe(200);

  await page.getByLabel('Crop', { exact: true }).selectOption('maize');
  await page.getByLabel('Growth stage').selectOption('fruiting');
  await page.getByLabel('Soil moisture condition').selectOption('dry');
  await page.getByLabel('Soil moisture reading (%)').fill('18');
  await page.getByLabel(/Forecast rainfall, next 3 days/).fill('0');
  await page.getByLabel('Nitrogen (N) — soil test').fill('90');
  await page.getByLabel('Phosphorus (P) — soil test').fill('42');
  await page.getByLabel('Potassium (K) — soil test').fill('43');

  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/api/agriculture/irrigation/recommend') &&
    response.request().method() === 'POST'
  );
  await page.getByTestId('irrigation-submit').click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.inputs.moistureCondition).toBe('dry');
  expect(body.inputs.moistureSource).toBe('user-entered observation');
  expect(body.weather.forecastRainfallSource).toBe('user-entered');
  expect(body.management.nutrientAssessment.suppliedValues.N).toBe(90);
  await expect(page.getByTestId('irrigation-result')).toContainText('user reports dry soil');
  await expect(page.getByTestId('irrigation-result')).toContainText('no fertilizer rate is prescribed');
});
