const mongoose = require('mongoose');

const ScanSchema = new mongoose.Schema({
  userId: { type: String, default: 'anonymous' },
  disease: { type: String, required: true },
  severity: { type: String, required: true },
  crop: { type: String },
  predictedClass: { type: String },
  detectionStatus: { type: String, enum: ['prediction', 'uncertain'] },
  diseaseInfo: {
    description: String,
    symptoms: { type: [String], default: [] },
    treatments: { type: [String], default: [] },
    preventiveMeasures: { type: [String], default: [] },
    references: { type: [{ title: String, url: String }], default: [] },
    guidanceDisclaimer: String
  },
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
    source: { type: String },
    summary: { type: String },
    forecast: { type: [{ day: String, condition: String, tempMin: Number, tempMax: Number, advice: String }], default: [] }
  },
  voiceText: { type: String },
  imagePath: { type: String },
  confidence: { type: Number, default: 0 },
  lang: { type: String, default: 'en' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Scan', ScanSchema);
