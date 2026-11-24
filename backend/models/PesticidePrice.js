const mongoose = require('mongoose');

const pesticidePriceSchema = new mongoose.Schema({
  productId: { type: String, required: true, trim: true },
  brandName: { type: String, required: true, trim: true },
  activeIngredient: { type: String, required: true, trim: true },
  formulation: { type: String, required: true, trim: true },
  packSize: { type: Number, required: true, min: 0 },
  packUnit: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['INR'], required: true },
  seller: { type: String, required: true, trim: true },
  location: {
    state: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    town: { type: String, required: true, trim: true }
  },
  priceType: { type: String, enum: ['live_retail', 'manufacturer_mrp', 'historical_government', 'administrator_manual'], required: true },
  sourceType: { type: String, enum: ['administrator', 'retailer_feed', 'manufacturer', 'government'], required: true },
  availabilityStatus: { type: String, enum: ['available', 'unavailable', 'unknown'], default: 'unknown' },
  sourceUrl: { type: String, required: true },
  verifiedAt: { type: Date, required: true },
  lastUpdatedAt: { type: Date, required: true },
  year: { type: Number, min: 1900, max: 9999 },
  expiresAt: { type: Date }
}, { timestamps: true });

pesticidePriceSchema.index({
  productId: 1,
  packSize: 1,
  packUnit: 1,
  seller: 1,
  'location.state': 1,
  'location.district': 1,
  'location.town': 1,
  priceType: 1,
  year: 1
}, { unique: true });

module.exports = mongoose.models.PesticidePrice || mongoose.model('PesticidePrice', pesticidePriceSchema);
