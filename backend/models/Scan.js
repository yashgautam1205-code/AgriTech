const mongoose = require('mongoose');

const ScanSchema = new mongoose.Schema({
  userId: { type: String, default: 'anonymous' },
  disease: { type: String, required: true },
  severity: { type: String, required: true },
  crop: { type: String },
  cropId: { type: String },
  diseaseId: { type: String },
  canonicalCropId: { type: String },
  canonicalDiseaseId: { type: String },
  classMappingStatus: { type: String, enum: ['AVAILABLE', 'NOT_AVAILABLE'] },
  classMetadata: { type: mongoose.Schema.Types.Mixed },
  cropSelection: { type: mongoose.Schema.Types.Mixed },
  possibleDiseaseName: { type: String },
  predictedClass: { type: String },
  predictionStatus: {
    type: String,
    enum: ['CONFIRMED_BY_MODEL', 'UNCERTAIN', 'UNSUPPORTED_CROP']
  },
  detectionStatus: { type: String, enum: ['prediction', 'uncertain'] },
  diseaseInfo: { type: mongoose.Schema.Types.Mixed },
  riskAssessment: { type: mongoose.Schema.Types.Mixed },
  organicTreatments: { type: mongoose.Schema.Types.Mixed },
  chemicalRecommendations: { type: mongoose.Schema.Types.Mixed },
  pesticidePrices: { type: [mongoose.Schema.Types.Mixed], default: [] },
  pesticidePriceStatus: { type: String },
  pesticidePriceMessage: { type: String },
  treatments: { type: [String], default: [] },
  pesticides: {
    organic: { type: [String], default: [] },
    chemical: [{
      name: { type: String },
      cost: { type: Number }
    }]
  },
  affordableAlternatives: { type: [String], default: [] },
  weatherForecast: {
    status: { type: String, enum: ['available', 'unavailable'] },
    informationStatus: { type: String, enum: ['AVAILABLE', 'PARTIAL', 'NOT_AVAILABLE', 'SOURCE_UNAVAILABLE', 'RESTRICTED'] },
    source: { type: String },
    summary: { type: String },
    fetchedAt: { type: Date },
    timezone: { type: String },
    forecast: { type: [{ day: String, condition: String, tempMin: Number, tempMax: Number, precipitationMm: Number, advice: String }], default: [] }
  },
  voiceText: { type: String },
  imagePath: { type: String },
  confidence: { type: Number, default: 0 },
  calibratedConfidence: { type: Number },
  confidenceThreshold: { type: Number },
  calibrationStatus: { type: String },
  lang: { type: String, default: 'en' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Scan', ScanSchema);
