const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const Shop = require('../models/Shop');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ai-crop-doctor';
const SOURCE_PATH = path.join(__dirname, '..', 'data', 'shops.json');

async function seedShops() {
  const entries = JSON.parse(await fs.readFile(SOURCE_PATH, 'utf8'));
  if (!Array.isArray(entries)) {
    throw new Error('Shop source must be a JSON array.');
  }
  const verifiedEntries = entries.filter(entry => entry.verified === true);
  if (verifiedEntries.length === 0) {
    console.log('No explicitly verified shop listings to import; no database changes made.');
    return;
  }

  await mongoose.connect(MONGO_URI);
  for (const entry of verifiedEntries) {
    const coordinates = entry.location && entry.location.coordinates
      ? entry.location.coordinates
      : [Number(entry.lon), Number(entry.lat)];
    if (
      typeof entry.name !== 'string' ||
      typeof entry.address !== 'string' ||
      typeof entry.city !== 'string' ||
      typeof entry.state !== 'string' ||
      typeof entry.phone !== 'string' ||
      coordinates.length !== 2 ||
      !coordinates.every(Number.isFinite) ||
      Math.abs(coordinates[0]) > 180 ||
      Math.abs(coordinates[1]) > 90
    ) {
      throw new Error(`Invalid verified shop record: ${entry.name || 'unnamed entry'}`);
    }

    await Shop.updateOne(
      { name: entry.name, phone: entry.phone },
      {
        $set: {
          name: entry.name,
          address: entry.address,
          city: entry.city,
          state: entry.state,
          postalCode: entry.postalCode,
          phone: entry.phone,
          email: entry.email,
          location: { type: 'Point', coordinates },
          sellsChemical: Boolean(entry.sellsChemical),
          sellsOrganic: Boolean(entry.sellsOrganic),
          description: entry.description,
          operatingHours: entry.operatingHours,
          verified: true
        }
      },
      { upsert: true }
    );
  }
  console.log(`Imported ${verifiedEntries.length} explicitly verified shop listings.`);
}

seedShops()
  .catch(error => {
    console.error('Shop import failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
