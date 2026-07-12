const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

async function test() {
  try {
    // Create test PNG
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
      0x42, 0x60, 0x82
    ]);
    
    const testPath = path.join(__dirname, 'test.png');
    fs.writeFileSync(testPath, pngBuffer);

    const form = new FormData();
    form.append('image', fs.createReadStream(testPath));
    form.append('userId', 'test-user');
    form.append('lang', 'en');
    form.append('lat', '12.9716');
    form.append('lon', '77.5946');

    const res = await axios.post('http://localhost:4000/api/upload-crop-image', form, {
      headers: form.getHeaders(),
      timeout: 10000
    });

    console.log('\n📊 DETAILED PESTICIDES RESPONSE:\n');
    console.log('Chemical Pesticides:');
    console.log(JSON.stringify(res.data.pesticides.chemical, null, 2));
    
    console.log('\n\nOrganic Pesticides:');
    console.log(JSON.stringify(res.data.pesticides.organic, null, 2));
    
    // Check if cost data is present
    if (res.data.pesticides.chemical.length > 0) {
      const firstChemical = res.data.pesticides.chemical[0];
      if (typeof firstChemical === 'object' && firstChemical.cost !== undefined) {
        console.log('\n✅ COST DATA IS PRESENT!');
        console.log(`Example: ${firstChemical.name} - Cost: ₹${firstChemical.cost}`);
      } else if (typeof firstChemical === 'string') {
        console.log('\n❌ COST DATA MISSING - chemical items are strings instead of objects');
      }
    }

    fs.unlinkSync(testPath);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

test();
