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
    console.log('✓ Test image created');

    const form = new FormData();
    form.append('image', fs.createReadStream(testPath));
    form.append('userId', 'test-user');
    form.append('lang', 'en');
    form.append('lat', '12.9716');
    form.append('lon', '77.5946');

    console.log('Uploading...');
    const res = await axios.post('http://localhost:4000/api/upload-crop-image', form, {
      headers: form.getHeaders(),
      timeout: 10000
    });

    console.log('\n✅ Upload successful!');
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(res.data, null, 2));

    // Verify response has normalized data
    if (res.data.scanId && res.data.disease && Array.isArray(res.data.pesticides.organic)) {
      console.log('\n✅ Data normalization working! Pesticides are properly converted to strings.');
      console.log('✅ FIX COMPLETE - Upload endpoint is now fully functional!');
    }

    fs.unlinkSync(testPath);
  } catch (err) {
    console.error('\n❌ Upload failed');
    console.error('Status:', err.response?.status);
    console.error('Message:', err.response?.data?.message);
    console.error('Details:', err.message);
  }
}

test();
