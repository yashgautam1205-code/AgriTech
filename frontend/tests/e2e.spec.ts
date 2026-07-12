import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

test.describe('Language -> TTS', () => {
  test('select language and speak triggers speechSynthesis with matching lang', async ({ page }) => {
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
    const utterances = await page.evaluate(() => window.__utterances || []);
    // there should be at least one utterance
    expect(utterances.length).toBeGreaterThan(0);
    // the lang should be set to a hindi locale or at least contain 'hi'
    const first = utterances[0];
    expect(String(first.lang || '').toLowerCase()).toContain('hi');
  });
});
