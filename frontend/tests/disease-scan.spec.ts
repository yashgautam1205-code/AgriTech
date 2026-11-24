import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const TEST_IMAGE = process.env.PLANTVILLAGE_TEST_IMAGE;

test('real PlantVillage image reaches the disease classifier through Express', async ({ page }) => {
  test.skip(!TEST_IMAGE, 'Set PLANTVILLAGE_TEST_IMAGE to a local PlantVillage image.');

  await page.goto(APP_URL);
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
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  expect(result.diseaseInfo.references.length).toBeGreaterThan(0);
  expect(result.weatherForecast.status).toBe('unavailable');
  expect(result.weatherForecast.forecast).toEqual([]);

  await expect(page.getByRole('img', { name: 'preview' })).toBeVisible();
  await expect(page.getByText(/Confidence:/)).toBeVisible();
  if (result.detectionStatus === 'uncertain') {
    await expect(page.getByRole('status')).toContainText('model is uncertain');
  } else {
    await expect(page.getByRole('heading', { name: result.disease, exact: true })).toBeVisible();
  }
});
