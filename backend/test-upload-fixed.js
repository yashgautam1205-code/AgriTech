const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

async function testUpload() {
  try {
    // Create a test image file (simple PNG header)
    const testImagePath = path.join(__dirname, 'test-image.png');
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
      0x42, 0x60, 0x82
    ]);
    fs.writeFileSync(testImagePath, pngHeader);
    console.log('✓ Test image created');

    // Prepare form data
    const form = new FormData();
    form.append('image', fs.createReadStream(testImagePath));
    form.append('userId', 'test-user-123');
    form.append('lang', 'en');
    form.append('lat', '12.9716');
    form.append('lon', '77.5946');

    // Send request
    const response = await axios.post('http://localhost:4000/api/upload-crop-image', form, {
      headers: form.getHeaders(),
      timeout: 10000
    });

    console.log('✓ Upload successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));

    // Verify response structure
    if (response.data.scanId && response.data.disease) {
      console.log('\n✅ All tests passed! The upload is now working.');
    }

    // Cleanup
    fs.unlinkSync(testImagePath);
  } catch (error) {
    console.error('❌ Upload failed:', {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      error: error.response?.data?.error
    });
    process.exit(1);
  }
}

testUpload();
