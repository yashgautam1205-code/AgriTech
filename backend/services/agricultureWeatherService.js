const axios = require('axios');

const API_URL = 'https://api.open-meteo.com/v1/forecast';

async function fetchIrrigationWeather(latitude, longitude, httpClient = axios) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { status: 'unavailable', source: null, reason: 'Location was not provided.' };
  }

  try {
    const response = await httpClient.get(API_URL, {
      timeout: 5000,
      params: {
        latitude,
        longitude,
        current: 'temperature_2m,relative_humidity_2m,wind_speed_10m',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_speed_10m_max',
        forecast_days: 3,
        timezone: 'auto'
      }
    });
    const data = response.data || {};
    const times = data.daily && Array.isArray(data.daily.time) ? data.daily.time : [];
    if (!times.length) {
      return { status: 'unavailable', source: null, reason: 'Weather provider returned no forecast.' };
    }

    const values = (name) => {
      const source = data.daily && data.daily[name];
      return times.map((day, index) => ({
        day,
        value: Array.isArray(source) && Number.isFinite(source[index]) ? source[index] : null
      }));
    };

    return {
      status: 'available',
      source: 'Open-Meteo',
      timezone: data.timezone || null,
      current: data.current ? {
        time: data.current.time || null,
        temperatureC: Number.isFinite(data.current.temperature_2m) ? data.current.temperature_2m : null,
        humidityPercent: Number.isFinite(data.current.relative_humidity_2m) ? data.current.relative_humidity_2m : null,
        windSpeedKmh: Number.isFinite(data.current.wind_speed_10m) ? data.current.wind_speed_10m : null
      } : null,
      forecast: {
        temperatureMaxC: values('temperature_2m_max'),
        temperatureMinC: values('temperature_2m_min'),
        precipitationMm: values('precipitation_sum'),
        referenceEvapotranspirationMm: values('et0_fao_evapotranspiration'),
        windSpeedMaxKmh: values('wind_speed_10m_max')
      }
    };
  } catch (error) {
    console.warn('Irrigation weather request failed:', error.code || error.message);
    return { status: 'unavailable', source: null, reason: 'Live weather forecast is unavailable.' };
  }
}

module.exports = { fetchIrrigationWeather };
