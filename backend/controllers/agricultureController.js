const { fetchIrrigationWeather } = require('../services/agricultureWeatherService');
const {
  validateInput,
  recommendCropManagement
} = require('../services/cropManagementService');

async function recommendIrrigation(req, res) {
  const { input, error } = validateInput(req.body);
  if (error) {
    return res.status(400).json({ message: error });
  }

  const weather = input.latitude !== undefined
    ? await fetchIrrigationWeather(Number(input.latitude), Number(input.longitude))
    : { status: 'unavailable', source: null, reason: 'Location was not provided.' };
  return res.json(recommendCropManagement(input, weather));
}

module.exports = { recommendIrrigation };
