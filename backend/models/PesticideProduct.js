const mongoose = require('mongoose');

const pesticideProductSchema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true, trim: true },
  brandName: { type: String, required: true, trim: true },
  manufacturer: { type: String, required: true, trim: true },
  activeIngredient: { type: String, required: true, trim: true },
  formulation: { type: String, required: true, trim: true },
  concentration: { type: String, required: true, trim: true },
  targetClasses: { type: [String], required: true },
  targetCrops: { type: [String], required: true },
  targetDiseases: { type: [String], required: true },
  packSizes: { type: [{ value: { type: Number, min: 0 }, unit: { type: String } }], required: true },
  registrationInformation: { type: String, required: true },
  registrationSourceUrl: { type: String, required: true },
  registrationVerification: { type: String, enum: ['pending', 'verified'], required: true },
  labelSourceUrl: { type: String, required: true },
  labelVerification: { type: String, enum: ['pending', 'verified'], required: true },
  approvedLabelInformation: { type: String, required: true },
  approvedDosage: { type: String },
  preHarvestInterval: { type: String },
  reEntryInterval: { type: String },
  safetyInformation: { type: String, required: true },
  verifiedBy: { type: String, required: true },
  lastVerifiedAt: { type: Date, required: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.PesticideProduct || mongoose.model('PesticideProduct', pesticideProductSchema);
