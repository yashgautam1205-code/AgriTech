const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchWeatherForecast } = require('../services/weatherService');

test('missing or invalid coordinates return unavailable weather without a default location', async () => {
  let requested = false;
  const client = {
    get: async () => {
      requested = true;
      throw new Error('must not request weather');
    }
  };

  const missing = await fetchWeatherForecast(undefined, undefined, client);
  const invalid = await fetchWeatherForecast(91, 77, client);

  assert.equal(missing.status, 'unavailable');
  assert.deepEqual(missing.forecast, []);
  assert.equal(missing.fetchedAt, null);
  assert.equal(invalid.status, 'unavailable');
  assert.equal(requested, false);
});

test('live weather is identified as sourced and mapped from the provider response', async () => {
  const client = {
    get: async (url, options) => {
      assert.equal(url, 'https://api.open-meteo.com/v1/forecast');
      assert.equal(options.timeout, 5000);
      assert.equal(options.params.latitude, 12);
      assert.match(options.params.daily, /precipitation_sum/);
      return {
        data: {
          timezone: 'Asia/Kolkata',
          daily: {
            time: ['2026-11-24'],
            weather_code: [61],
            temperature_2m_min: [21],
            temperature_2m_max: [32],
            precipitation_sum: [4.5]
          }
        }
      };
    }
  };

  const result = await fetchWeatherForecast(12, 77, client);
  assert.equal(result.status, 'available');
  assert.equal(result.source, 'Open-Meteo');
  assert.equal(result.forecast[0].day, 'Tuesday, November 24, 2026');
  assert.equal(result.forecast[0].condition, 'Slight rain');
  assert.equal(result.forecast[0].tempMin, 21);
  assert.equal(result.forecast[0].precipitationMm, 4.5);
  assert.match(result.forecast[0].advice, /Avoid spraying during rain/);
  assert.equal(result.timezone, 'Asia/Kolkata');
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
});

test('provider failures are reported as unavailable instead of synthetic forecasts', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await fetchWeatherForecast(12, 77, {
      get: async () => { throw new Error('offline'); }
    });
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.forecast, []);
    assert.equal(result.fetchedAt, null);
    assert.match(result.summary, /no forecast was substituted/);
  } finally {
    console.warn = originalWarn;
  }
});
