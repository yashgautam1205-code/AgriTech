const stages = new Set(['establishment', 'vegetative', 'flowering', 'fruiting', 'maturation']);
const soilTypes = new Set(['sandy', 'loamy', 'clayey', 'unknown']);
const moistureConditions = new Set(['dry', 'adequate', 'wet', 'unknown']);

const cropCoefficients = {
  apple: { initial: 0.6, mid: 0.95, end: 0.75, basis: 'FAO-56 apples/pears, no ground cover, no frost assumption.' },
  banana: { initial: 0.5, mid: 1.1, end: 1.0, basis: 'FAO-56 banana, first-year stand.' },
  blackgram: { initial: 0.4, mid: 1.15, end: 0.35, basis: 'FAO-56 dry beans and pulses group; proxy for black gram.' },
  chickpea: { initial: 0.4, mid: 1.0, end: 0.35, basis: 'FAO-56 chickpea.' },
  coconut: { initial: 0.95, mid: 1.0, end: 1.0, basis: 'FAO-56 palm trees; generic palm proxy.' },
  coffee: { initial: 0.9, mid: 0.95, end: 0.95, basis: 'FAO-56 coffee with bare soil cover.' },
  cotton: { initial: 0.35, mid: 1.175, end: 0.6, basis: 'FAO-56 cotton ranges represented by their midpoints.' },
  grapes: { initial: 0.3, mid: 0.85, end: 0.45, basis: 'FAO-56 table/raisin grapes.' },
  kidneybeans: { initial: 0.4, mid: 1.15, end: 0.35, basis: 'FAO-56 dry beans and pulses group.' },
  lentil: { initial: 0.4, mid: 1.1, end: 0.3, basis: 'FAO-56 lentil.' },
  maize: { initial: 0.3, mid: 1.2, end: 0.475, basis: 'FAO-56 field maize; midpoint of the listed end-season range.' },
  mungbean: { initial: 0.4, mid: 1.05, end: 0.475, basis: 'FAO-56 green gram.' },
  muskmelon: { initial: 0.5, mid: 1.05, end: 0.75, basis: 'FAO-56 sweet melons.' },
  orange: { initial: 0.65, mid: 0.6, end: 0.65, basis: 'FAO-56 citrus with 50% canopy and bare soil assumption.' },
  pigeonpeas: { initial: 0.4, mid: 1.15, end: 0.35, basis: 'FAO-56 dry beans and pulses group; proxy for pigeon pea.' },
  rice: { initial: 1.05, mid: 1.2, end: 0.75, basis: 'FAO-56 rice; does not model paddy flooding, seepage or percolation.' },
  watermelon: { initial: 0.4, mid: 1.0, end: 0.75, basis: 'FAO-56 watermelon.' }
};

const optionalRanges = {
  soilMoisturePercent: [0, 100],
  temperatureC: [-20, 60],
  humidityPercent: [0, 100],
  recentRainfallMm: [0, 1000],
  forecastRainfallMm: [0, 1000],
  N: [0, 300],
  P: [0, 300],
  K: [0, 300],
  ph: [0, 14],
  latitude: [-90, 90],
  longitude: [-180, 180]
};

function validateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be an object.' };
  }
  if (typeof body.crop !== 'string' || !/^[a-zA-Z][a-zA-Z -]{0,59}$/.test(body.crop.trim())) {
    return { error: 'Crop must be a non-empty crop name of at most 60 letters.' };
  }
  if (!stages.has(body.growthStage)) {
    return { error: `growthStage must be one of: ${Array.from(stages).join(', ')}.` };
  }
  if (body.soilType !== undefined && !soilTypes.has(body.soilType)) {
    return { error: 'soilType must be sandy, loamy, clayey, or unknown.' };
  }
  if (body.moistureCondition !== undefined && !moistureConditions.has(body.moistureCondition)) {
    return { error: 'moistureCondition must be dry, adequate, wet, or unknown.' };
  }
  for (const [name, [minimum, maximum]] of Object.entries(optionalRanges)) {
    if (body[name] === undefined || body[name] === null || body[name] === '') continue;
    const value = typeof body[name] === 'string' ? Number(body[name]) : body[name];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      return { error: `${name} must be a number from ${minimum} to ${maximum}.` };
    }
  }
  const hasLatitude = body.latitude !== undefined && body.latitude !== null && body.latitude !== '';
  const hasLongitude = body.longitude !== undefined && body.longitude !== null && body.longitude !== '';
  if (hasLatitude !== hasLongitude) {
    return { error: 'latitude and longitude must be provided together.' };
  }
  const input = { ...body, crop: body.crop.trim() };
  if (!hasLatitude) {
    delete input.latitude;
    delete input.longitude;
  }
  return { input };
}

function coefficientForStage(crop, stage) {
  const coefficients = cropCoefficients[crop.toLowerCase().replace(/[\s-]/g, '')];
  if (!coefficients) return null;
  const kc = stage === 'establishment'
    ? coefficients.initial
    : stage === 'vegetative'
      ? (coefficients.initial + coefficients.mid) / 2
      : stage === 'maturation'
        ? coefficients.end
        : coefficients.mid;
  return { kc, basis: coefficients.basis };
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function recommendCropManagement(input, weather) {
  const cropDemandCoefficient = coefficientForStage(input.crop, input.growthStage);
  const forecast = weather && weather.status === 'available' ? weather.forecast : null;
  const rainfallSeries = forecast && forecast.precipitationMm;
  const referenceEtSeries = forecast && forecast.referenceEvapotranspirationMm;
  const hasRainForecast = Boolean(
    rainfallSeries && rainfallSeries.length && rainfallSeries.every(item => item.value !== null)
  );
  const hasEtForecast = Boolean(
    referenceEtSeries && referenceEtSeries.length && referenceEtSeries.every(item => item.value !== null)
  );
  const forecastRainfallMm = input.forecastRainfallMm !== undefined && input.forecastRainfallMm !== ''
    ? Number(input.forecastRainfallMm)
    : hasRainForecast
      ? rainfallSeries.reduce((sum, item) => sum + (item.value || 0), 0)
      : null;
  const forecastRainfallSource = input.forecastRainfallMm !== undefined && input.forecastRainfallMm !== ''
    ? 'user-entered'
    : hasRainForecast ? 'Open-Meteo forecast' : null;
  const cropEtMm = cropDemandCoefficient && hasEtForecast
    ? referenceEtSeries.reduce((sum, item) => sum + (
        item.value === null ? 0 : item.value * cropDemandCoefficient.kc
      ), 0)
    : null;
  const moisture = input.moistureCondition || 'unknown';
  const rationale = [];
  let action;
  let recommendation;

  if (moisture === 'wet') {
    action = 'hold';
    recommendation = 'Hold irrigation for now and reassess after the soil drains.';
    rationale.push('The user reports wet soil; adding water may increase waterlogging or runoff risk.');
  } else if (moisture === 'adequate') {
    action = 'reassess';
    recommendation = 'No immediate irrigation is indicated by the reported soil condition; recheck the root zone on your local schedule.';
    rationale.push('The user reports adequate soil moisture. This is a field observation, not a sensor-derived threshold.');
  } else if (
    moisture === 'dry' &&
    forecastRainfallMm !== null &&
    forecastRainfallMm > 0 &&
    (cropEtMm === null || forecastRainfallMm >= cropEtMm)
  ) {
    action = 'inspect_after_rain';
    recommendation = cropEtMm === null
      ? 'Rain is forecast, but crop water demand could not be estimated. Recheck soil after rain; if the crop is already stressed, do not delay needed irrigation based on forecast alone.'
      : 'Rain is forecast at least equal to the modeled crop evapotranspiration for this period. Recheck soil after rain; if the crop is already stressed, do not delay needed irrigation based on forecast alone.';
    rationale.push(cropEtMm === null
      ? `Rainfall (${forecastRainfallMm.toFixed(1)} mm) is forecast, but no comparable ETc estimate is available; forecast rain is not assumed to be fully effective.`
      : `Three-day gross forecast rainfall (${forecastRainfallMm.toFixed(1)} mm) is compared with modeled ETc (${cropEtMm.toFixed(1)} mm); this is not effective-rainfall or root-zone water-balance accounting.`);
  } else if (moisture === 'dry') {
    action = 'irrigation_may_be_needed';
    recommendation = 'The user reports dry soil, so irrigation may be needed soon. Follow the locally calibrated crop and soil schedule; this service does not prescribe a water volume.';
    rationale.push('Dryness is based on the user-selected field observation, not a universal moisture percentage threshold.');
    if (forecastRainfallMm !== null && forecastRainfallMm > 0) {
      rationale.push(`Rain is forecast (${forecastRainfallMm.toFixed(1)} mm over the forecast period) and may partly offset demand; its effective amount depends on local soil, runoff and rainfall intensity.`);
    }
  } else {
    action = 'inspect';
    recommendation = 'Check root-zone moisture before deciding whether to irrigate; available inputs are insufficient to infer soil water status.';
    rationale.push(input.soilMoisturePercent !== undefined && input.soilMoisturePercent !== ''
      ? 'A numeric moisture reading was recorded but cannot be classified without sensor calibration and soil water capacity/wilting-point data.'
      : 'No dry/adequate/wet field observation or calibrated moisture trigger was provided.');
  }

  if (forecastRainfallMm !== null && forecastRainfallSource) {
    rationale.push(`Forecast rainfall source: ${forecastRainfallSource}. Forecast totals are not treated as guaranteed or fully effective rainfall.`);
  }
  if (input.recentRainfallMm !== undefined && input.recentRainfallMm !== '') {
    rationale.push(`Recent rainfall entered by the user: ${Number(input.recentRainfallMm).toFixed(1)} mm; it is not subtracted from demand because effective rainfall is site-specific.`);
  }
  if (input.soilType && input.soilType !== 'unknown') {
    rationale.push(`Soil type (${input.soilType}) is user-entered context; no field-capacity or irrigation trigger is inferred from texture alone.`);
  }
  if (cropDemandCoefficient) {
    rationale.push(`FAO-56 crop coefficient for ${input.crop} at ${input.growthStage}: Kc ${cropDemandCoefficient.kc.toFixed(2)}. ${cropDemandCoefficient.basis}`);
  } else {
    rationale.push(`No crop coefficient was found for ${input.crop}; no crop-specific evapotranspiration estimate is returned.`);
  }
  if (!hasEtForecast) {
    rationale.push('FAO-56 ETc cannot be estimated without live FAO reference evapotranspiration; temperature and humidity alone are insufficient.');
  }
  if (input.temperatureC !== undefined || input.humidityPercent !== undefined) {
    rationale.push('Manually entered temperature/humidity are shown as context; they are not substituted for FAO reference evapotranspiration.');
  }

  const nutrients = ['N', 'P', 'K', 'ph'];
  const suppliedNutrients = Object.fromEntries(
    nutrients.filter(name => input[name] !== undefined && input[name] !== '')
      .map(name => [name, Number(input[name])])
  );
  const missingNutrients = nutrients.filter(name => suppliedNutrients[name] === undefined);
  const weatherWarnings = [];
  if (!weather || weather.status !== 'available') {
    weatherWarnings.push('Live weather data is unavailable; confirm local rainfall and weather before scheduling irrigation.');
  } else if (forecastRainfallMm !== null && forecastRainfallMm > 0) {
    weatherWarnings.push('Rain is forecast; totals are uncertain and are not assumed to be fully effective in the root zone.');
  }
  if (cropEtMm === null) {
    weatherWarnings.push('Crop water demand could not be estimated for this crop/stage and available weather data.');
  }
  const management = {
    crop: input.crop,
    growthStage: input.growthStage,
    waterConservation: [
      'Avoid irrigating wet soil and avoid runoff; apply water to the crop root zone using locally appropriate methods.',
      'Use crop- and soil-appropriate surface cover where agronomically suitable, and reassess moisture after forecast rain.'
    ],
    weatherWarnings,
    nutrientAssessment: {
      suppliedValues: suppliedNutrients,
      source: Object.keys(suppliedNutrients).length ? 'user-entered soil measurements' : 'unavailable',
      missing: missingNutrients,
      guidance: Object.keys(suppliedNutrients).length
        ? 'Values are recorded, not interpreted as deficiencies: units, sampling depth, laboratory method and crop-specific thresholds are not established here. Use a current soil-test report and local extension recommendation; no fertilizer rate is prescribed.'
        : 'Soil nutrient measurements are unavailable. Obtain a soil test before deciding on fertilizer; no fertilizer rate is prescribed.'
    }
  };

  const missingInputs = [];
  if (moisture === 'unknown') missingInputs.push('root-zone moisture condition or calibrated trigger');
  if (forecastRainfallMm === null) missingInputs.push('forecast rainfall');
  if (cropEtMm === null) missingInputs.push('crop evapotranspiration estimate');
  if (missingNutrients.length) missingInputs.push(`soil nutrients: ${missingNutrients.join(', ')}`);

  return {
    recommendation: { action, text: recommendation, rationale },
    cropDemand: {
      cropCoefficient: cropDemandCoefficient ? cropDemandCoefficient.kc : null,
      estimatedCropEvapotranspirationMm: cropEtMm === null ? null : Number(cropEtMm.toFixed(2)),
      periodDays: cropEtMm === null ? null : referenceEtSeries.length,
      method: 'ETc = Kc × FAO reference ET0; standard-condition estimate, not an irrigation volume.'
    },
    weather: {
      status: weather && weather.status === 'available' ? 'available' : 'unavailable',
      source: weather && weather.status === 'available' ? weather.source : null,
      reason: weather && weather.status === 'unavailable'
        ? weather.reason || 'Live weather data is unavailable.'
        : null,
      current: weather && weather.status === 'available' ? weather.current : null,
      forecast: forecast || null,
      forecastRainfallMm: forecastRainfallMm === null ? null : Number(forecastRainfallMm.toFixed(2)),
      forecastRainfallSource
    },
    inputs: {
      crop: input.crop,
      growthStage: input.growthStage,
      soilType: input.soilType || null,
      moistureCondition: moisture,
      soilMoisturePercent: finite(input.soilMoisturePercent === undefined || input.soilMoisturePercent === '' ? null : Number(input.soilMoisturePercent)),
      moistureSource: input.moistureCondition && input.moistureCondition !== 'unknown'
        ? 'user-entered observation'
        : input.soilMoisturePercent !== undefined && input.soilMoisturePercent !== ''
          ? 'user-entered reading; uncalibrated'
          : 'unavailable',
      temperatureC: finite(input.temperatureC === undefined || input.temperatureC === '' ? null : Number(input.temperatureC)),
      humidityPercent: finite(input.humidityPercent === undefined || input.humidityPercent === '' ? null : Number(input.humidityPercent)),
      recentRainfallMm: finite(input.recentRainfallMm === undefined || input.recentRainfallMm === '' ? null : Number(input.recentRainfallMm)),
      nutrients: suppliedNutrients
    },
    management,
    missingInputs,
    uncertainty: [
      'Qualitative, rule-based guidance; not a validated irrigation scheduling model.',
      'FAO-56 coefficients are standard-condition references and may not represent local cultivar, canopy, climate or management.',
      'No root depth, field capacity, wilting point, sensor calibration, runoff or effective-rainfall estimate is available.'
    ]
  };
}

module.exports = { validateInput, recommendCropManagement, cropCoefficients };
