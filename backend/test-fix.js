const http = require('http');
const fs = require('fs');
const path = require('path');

// Create a minimal valid PNG file
const pngBuffer = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
  0x42, 0x60, 0x82
]);

const testImagePath = path.join(__dirname, 'test-upload.png');
fs.writeFileSync(testImagePath, pngBuffer);
console.log('✓ Test PNG created');

// Prepare multipart form data
const boundary = '----FormBoundary' + Date.now();
const imageData = fs.readFileSync(testImagePath);
const body = [
  '--' + boundary,
  'Content-Disposition: form-data; name="image"; filename="test.png"',
  'Content-Type: image/png',
  '',
  imageData.toString('binary'),
  '--' + boundary,
  'Content-Disposition: form-data; name="userId"',
  '',
  'test-user',
  '--' + boundary,
  'Content-Disposition: form-data; name="lang"',
  '',
  'en',
  '--' + boundary,
  'Content-Disposition: form-data; name="lat"',
  '',
  '12.9716',
  '--' + boundary,
  'Content-Disposition: form-data; name="lon"',
  '',
  '77.5946',
  '--' + boundary + '--',
  ''
].join('\r\n');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/upload-crop-image',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': Buffer.byteLength(body)
  },
  timeout: 10000
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\n' + (res.statusCode === 200 ? '✅ SUCCESS!' : '❌ FAILED!'));
    console.log('Status:', res.statusCode);
    
    try {
      const parsed = JSON.parse(data);
      console.log('Response:', JSON.stringify(parsed, null, 2));
      
      if (res.statusCode === 200 && parsed.scanId && parsed.disease) {
        console.log('\n✅ Upload endpoint is working correctly!');
        console.log('✅ Data normalization is working!');
        process.exit(0);
      } else {
        console.log('\n⚠️  Unexpected response');
        process.exit(1);
      }
    } catch (e) {
      console.log('Response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Request failed:', err.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('❌ Request timeout');
  req.destroy();
  process.exit(1);
});

req.write(body, 'binary');
req.end();
