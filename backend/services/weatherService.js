const axios = require('axios');

const weatherCodeMap = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Snow',
  73: 'Heavy snow',
  80: 'Rain showers',
  81: 'Heavy rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail'
};

function weatherAdvice(condition, precipitationMm) {
  if ((Number.isFinite(precipitationMm) && precipitationMm > 0) ||
      /rain|drizzle|shower|thunderstorm/i.test(condition)) {
    return 'Avoid spraying during rain; check the product label and local extension guidance.'
  }
  if (/snow|fog|overcast/i.test(condition)) {
    return 'Check local conditions and product-label weather restrictions before treatment.'
  }
  return 'Check the product label and local conditions before considering treatment.'
}

function formatDay(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return String(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function unavailableForecast(reason) {
  return {
    status: 'unavailable',
    informationStatus: 'SOURCE_UNAVAILABLE',
    source: 'Open-Meteo',
    fetchedAt: null,
    summary: reason,
    forecast: []
  };
}

async function fetchWeatherForecast(lat, lon, httpClient = axios) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return {
      ...unavailableForecast('Location was not provided; live weather is unavailable.'),
      informationStatus: 'NOT_AVAILABLE'
    };
  }

  try {
    const response = await httpClient.get('https://api.open-meteo.com/v1/forecast', {
      timeout: 5000,
      params: {
        latitude: lat,
        longitude: lon,
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
        forecast_days: 3,
        timezone: 'auto'
      }
    });
    const data = response.data;
    const daily = data.daily || {};
    const days = daily.time || [];

    if (!days.length) {
      return unavailableForecast('Weather provider returned no forecast.');
    }

    const forecast = days.slice(0, 3).map((day, index) => {
      const code = daily.weather_code?.[index];
      const condition = weatherCodeMap[code] || 'Unknown';
      const precipitationMm = Number.isFinite(daily.precipitation_sum?.[index])
        ? daily.precipitation_sum[index]
        : null;
      return {
        day: formatDay(day),
        condition,
        tempMin: daily.temperature_2m_min?.[index] ?? null,
        tempMax: daily.temperature_2m_max?.[index] ?? null,
        precipitationMm,
        advice: weatherAdvice(condition, precipitationMm)
      };
    });

    return {
      status: 'available',
      informationStatus: 'AVAILABLE',
      source: 'Open-Meteo',
      fetchedAt: new Date().toISOString(),
      timezone: data.timezone || 'UTC',
      summary: `Live Open-Meteo forecast loaded for ${lat.toFixed(2)}, ${lon.toFixed(2)}.`,
      forecast
    };
  } catch (err) {
    console.warn('Weather API unavailable:', err.code || err.message);
    return unavailableForecast('Live weather is unavailable; no forecast was substituted.');
  }
}

module.exports = { fetchWeatherForecast };