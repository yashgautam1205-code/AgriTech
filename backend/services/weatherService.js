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

function weatherAdvice(condition) {
  if (/rain|drizzle|shower|thunderstorm/i.test(condition)) {
    return 'Avoid spraying during rain, wait for a dry window.'
  }
  if (/snow|fog|overcast/i.test(condition)) {
    return 'Keep the field ventilated and wait for better weather before treatment.'
  }
  return 'Good day for treatment; spray in the morning if possible.'
}

function formatDay(dateString, timezone) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
}

async function fetchWeatherForecast(lat, lon) {
  const defaultCoords = { lat: 12.9716, lon: 77.5946 };
  const latitude = Number.isFinite(lat) ? lat : defaultCoords.lat;
  const longitude = Number.isFinite(lon) ? lon : defaultCoords.lon;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`;

    const response = await axios.get(url, { timeout: 5000 });
    const data = response.data;
    const daily = data.daily || {};
    const days = daily.time || [];

    if (!days.length) {
      return buildFallbackForecast(latitude, longitude);
    }

    const forecast = days.slice(0, 3).map((day, index) => {
      const code = daily.weathercode?.[index];
      const condition = weatherCodeMap[code] || 'Unknown';
      return {
        day: formatDay(day, data.timezone || 'UTC'),
        condition,
        tempMin: daily.temperature_2m_min?.[index] ?? null,
        tempMax: daily.temperature_2m_max?.[index] ?? null,
        advice: weatherAdvice(condition)
      };
    });

    return {
      summary: `Weather forecast loaded for ${latitude.toFixed(2)}, ${longitude.toFixed(2)}.`,
      forecast
    };
  } catch (err) {
    console.warn('Weather API error (continuing with fallback forecast):', err.message);
    return buildFallbackForecast(latitude, longitude);
  }
}

function buildFallbackForecast(latitude, longitude) {
  const today = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const forecasts = [0, 1, 2].map((offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const dayName = dayNames[date.getDay()];
    const condition = offset === 0 ? 'Partly cloudy' : offset === 1 ? 'Light rain' : 'Sunny';
    return {
      day: dayName,
      condition,
      tempMin: 20 + offset * 1.5,
      tempMax: 28 + offset * 1.5,
      advice: weatherAdvice(condition)
    };
  });

  return {
    summary: `Weather service unavailable; using a general forecast for ${latitude.toFixed(2)}, ${longitude.toFixed(2)}.`,
    forecast: forecasts
  };
}

module.exports = { fetchWeatherForecast };