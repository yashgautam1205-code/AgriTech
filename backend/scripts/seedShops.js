const mongoose = require('mongoose');
const Shop = require('../models/Shop');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ai-crop-doctor';

async function seedShops() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing shops
    await Shop.deleteMany({});
    console.log('Cleared existing shops');

    // Sample pesticide shops around Bangalore area
    const sampleShops = [
      {
        name: 'Green Farm Store',
        address: 'Market Road, Village',
        city: 'Bangalore',
        state: 'Karnataka',
        postalCode: '560001',
        phone: '080-1234-5678',
        email: 'info@greenfarmbg.com',
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716] // [longitude, latitude]
        },
        sellsChemical: true,
        sellsOrganic: true,
        description: 'Premium chemical and organic pesticides for all crops',
        operatingHours: {
          monday: '9:00 AM - 6:00 PM',
          tuesday: '9:00 AM - 6:00 PM',
          wednesday: '9:00 AM - 6:00 PM',
          thursday: '9:00 AM - 6:00 PM',
          friday: '9:00 AM - 6:00 PM',
          saturday: '10:00 AM - 4:00 PM',
          sunday: 'Closed'
        },
        verified: true
      },
      {
        name: 'Rural Pesticide Mart',
        address: 'Main Bazar',
        city: 'Bangalore',
        state: 'Karnataka',
        postalCode: '560002',
        phone: '080-9876-5432',
        email: 'contact@ruralpesticide.com',
        location: {
          type: 'Point',
          coordinates: [77.6050, 12.9750]
        },
        sellsChemical: true,
        sellsOrganic: false,
        description: 'Specialized in chemical pesticides and fungicides',
        operatingHours: {
          monday: '8:00 AM - 7:00 PM',
          tuesday: '8:00 AM - 7:00 PM',
          wednesday: '8:00 AM - 7:00 PM',
          thursday: '8:00 AM - 7:00 PM',
          friday: '8:00 AM - 7:00 PM',
          saturday: '8:00 AM - 5:00 PM',
          sunday: '9:00 AM - 1:00 PM'
        },
        verified: true
      },
      {
        name: 'Organic Agri Center',
        address: 'Station Road',
        city: 'Bangalore',
        state: 'Karnataka',
        postalCode: '560003',
        phone: '080-5566-7788',
        email: 'sales@organicagri.com',
        location: {
          type: 'Point',
          coordinates: [77.5850, 12.9680]
        },
        sellsChemical: false,
        sellsOrganic: true,
        description: 'Certified organic pesticides and bio-fertilizers',
        operatingHours: {
          monday: '9:30 AM - 5:30 PM',
          tuesday: '9:30 AM - 5:30 PM',
          wednesday: '9:30 AM - 5:30 PM',
          thursday: '9:30 AM - 5:30 PM',
          friday: '9:30 AM - 5:30 PM',
          saturday: '10:00 AM - 3:00 PM',
          sunday: 'Closed'
        },
        verified: true
      },
      {
        name: 'AgriTech Solutions',
        address: 'Whitefield, Tech Park',
        city: 'Bangalore',
        state: 'Karnataka',
        postalCode: '560066',
        phone: '080-2222-3333',
        email: 'sales@agritech.com',
        location: {
          type: 'Point',
          coordinates: [77.6400, 13.0010]
        },
        sellsChemical: true,
        sellsOrganic: true,
        description: 'Modern agricultural chemicals and organic alternatives',
        operatingHours: {
          monday: '8:00 AM - 8:00 PM',
          tuesday: '8:00 AM - 8:00 PM',
          wednesday: '8:00 AM - 8:00 PM',
          thursday: '8:00 AM - 8:00 PM',
          friday: '8:00 AM - 8:00 PM',
          saturday: '9:00 AM - 6:00 PM',
          sunday: '10:00 AM - 4:00 PM'
        },
        verified: true
      },
      {
        name: 'Village Agro Store',
        address: 'Outer Ring Road',
        city: 'Bangalore',
        state: 'Karnataka',
        postalCode: '560045',
        phone: '080-4444-5555',
        email: 'info@villageagro.com',
        location: {
          type: 'Point',
          coordinates: [77.5500, 12.9500]
        },
        sellsChemical: true,
        sellsOrganic: false,
        description: 'Budget-friendly pesticides and agricultural supplies',
        operatingHours: {
          monday: '7:00 AM - 9:00 PM',
          tuesday: '7:00 AM - 9:00 PM',
          wednesday: '7:00 AM - 9:00 PM',
          thursday: '7:00 AM - 9:00 PM',
          friday: '7:00 AM - 9:00 PM',
          saturday: '7:00 AM - 7:00 PM',
          sunday: '9:00 AM - 6:00 PM'
        },
        verified: true
      }
    ];

    await Shop.insertMany(sampleShops);
    console.log('✓ Seeded 5 sample shops');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
}

seedShops();
