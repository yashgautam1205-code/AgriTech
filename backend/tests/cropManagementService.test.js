const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const {
  validateInput,
  recommendCropManagement
} = require('../services/cropManagementService');
const { fetchIrrigationWeather } = require('../services/agricultureWeatherService');

const dryInput = {
  crop: 'maize',
  growthStage: 'fruiting',
  moistureCondition: 'dry',
  soilMoisturePercent: 18,
  soilType: 'sandy',
  recentRainfallMm: 0,
  forecastRainfallMm: 0
};

function weather({ rain = [0, 0, 0], et0 = [4, 4, 4] } = {}) {
  return {
    status: 'available',
    source: 'Open-Meteo',
    current: { temperatureC: 31, humidityPercent: 42, windSpeedKmh: 12 },
    forecast: {
      precipitationMm: rain.map(value => ({ value })),
      referenceEvapotranspirationMm: et0.map(value => ({ value }))
    }
  };
}

test('dry soil with no forecast rain recommends irrigation without inventing a volume', () => {
  const result = recommendCropManagement(dryInput, weather());
  assert.equal(result.recommendation.action, 'irrigation_may_be_needed');
  assert.equal(result.cropDemand.cropCoefficient, 1.2);
  assert.equal(result.cropDemand.estimatedCropEvapotranspirationMm, 14.4);
  assert.equal(result.inputs.moistureSource, 'user-entered observation');
  assert.match(result.recommendation.text, /does not prescribe a water volume/);
});

test('wet soil defers irrigation regardless of dry numeric moisture field', () => {
  const result = recommendCropManagement({
    ...dryInput,
    moistureCondition: 'wet'
  }, weather({ rain: [8, 8, 8] }));
  assert.equal(result.recommendation.action, 'hold');
});

test('forecast rainfall at least equal to modeled ETc causes a recheck, not a guarantee', () => {
  const input = { ...dryInput, forecastRainfallMm: undefined };
  const result = recommendCropManagement(input, weather({ rain: [6, 6, 6] }));
  assert.equal(result.recommendation.action, 'inspect_after_rain');
  assert.ok(result.recommendation.rationale.some(text => text.includes('not effective-rainfall')));
});

test('numeric moisture without a field condition is not classified using a universal threshold', () => {
  const result = recommendCropManagement({
    ...dryInput,
    moistureCondition: 'unknown'
  }, { status: 'unavailable' });
  assert.equal(result.recommendation.action, 'inspect');
  assert.equal(result.cropDemand.estimatedCropEvapotranspirationMm, null);
  assert.ok(result.missingInputs.includes('root-zone moisture condition or calibrated trigger'));
});

test('unsupported crops do not receive fabricated crop coefficients', () => {
  const result = recommendCropManagement({
    ...dryInput,
    crop: 'jute'
  }, weather());
  assert.equal(result.cropDemand.cropCoefficient, null);
  assert.equal(result.cropDemand.estimatedCropEvapotranspirationMm, null);
});

test('rain is not ignored when a crop has no documented coefficient', () => {
  const result = recommendCropManagement({
    ...dryInput,
    crop: 'jute',
    forecastRainfallMm: 12
  }, { status: 'unavailable' });
  assert.equal(result.recommendation.action, 'inspect_after_rain');
  assert.match(result.recommendation.text, /water demand could not be estimated/);
});

test('nutrient values are reported without deficiency or dosage claims', () => {
  const result = recommendCropManagement({
    ...dryInput,
    N: 90,
    P: 42,
    K: 43,
    ph: 6.5
  }, weather());
  assert.deepEqual(result.management.nutrientAssessment.suppliedValues, {
    N: 90, P: 42, K: 43, ph: 6.5
  });
  assert.match(result.management.nutrientAssessment.guidance, /no fertilizer rate is prescribed/);
});

test('request validation rejects invalid ranges and incomplete coordinates', () => {
  assert.match(validateInput({ ...dryInput, soilMoisturePercent: 101 }).error, /soilMoisturePercent/);
  assert.match(validateInput({ ...dryInput, growthStage: 'seedling-ish' }).error, /growthStage/);
  assert.match(validateInput({ ...dryInput, latitude: 12 }).error, /provided together/);
  assert.equal(validateInput({ ...dryInput, latitude: null, longitude: null }).input.latitude, undefined);
});

test('live weather response is mapped to sourced fields', async () => {
  const client = {
    get: async (url, options) => {
      assert.equal(url, 'https://api.open-meteo.com/v1/forecast');
      assert.equal(options.timeout, 5000);
      return {
        data: {
          timezone: 'Asia/Kolkata',
          current: {
            time: '2026-11-23T12:00',
            temperature_2m: 30,
            relative_humidity_2m: 40,
            wind_speed_10m: 10
          },
          daily: {
            time: ['2026-11-24'],
            temperature_2m_max: [32],
            temperature_2m_min: [21],
            precipitation_sum: [5],
            et0_fao_evapotranspiration: [4],
            wind_speed_10m_max: [18]
          }
        }
      };
    }
  };
  const result = await fetchIrrigationWeather(12, 77, client);
  assert.equal(result.source, 'Open-Meteo');
  assert.equal(result.current.humidityPercent, 40);
  assert.deepEqual(result.forecast.precipitationMm, [{ day: '2026-11-24', value: 5 }]);
});

test('weather API failure is explicitly unavailable with no synthetic forecast', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await fetchIrrigationWeather(12, 77, {
      get: async () => { throw new Error('offline'); }
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.forecast, undefined);
  } finally {
    console.warn = originalWarn;
  }
});
