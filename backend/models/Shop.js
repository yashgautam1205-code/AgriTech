const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String },
    phone: { type: String, required: true },
    email: { type: String },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    },
    sellsChemical: { type: Boolean, default: true },
    sellsOrganic: { type: Boolean, default: false },
    description: { type: String },
    operatingHours: {
      monday: String,
      tuesday: String,
      wednesday: String,
      thursday: String,
      friday: String,
      saturday: String,
      sunday: String
    },
    verified: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Create geospatial index for location-based queries
shopSchema.index({ location: '2dsphere' });

const Shop = mongoose.model('Shop', shopSchema);

module.exports = Shop;
