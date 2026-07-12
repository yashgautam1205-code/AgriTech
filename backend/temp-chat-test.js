const axios = require('axios')
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')

async function main() {
  try {
    const buf = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
      0x42, 0x60, 0x82
    ])
    const tmpPath = path.join(__dirname, 'tmp-upload.png')
    fs.writeFileSync(tmpPath, buf)

    const form = new FormData()
    form.append('image', fs.createReadStream(tmpPath))
    form.append('userId', 'test-user-123')
    form.append('lang', 'en')
    form.append('lat', '12.9716')
    form.append('lon', '77.5946')

    const uploadRes = await axios.post('http://localhost:4000/api/upload-crop-image', form, {
      headers: form.getHeaders(),
      timeout: 20000
    })

    console.log('scanId', uploadRes.data.scanId)

    const assistantRes = await axios.post('http://localhost:4000/api/assistant', {
      disease: uploadRes.data.disease,
      question: 'What should I do?',
      scanId: uploadRes.data.scanId,
      userId: 'test-user-123',
      lang: 'en'
    }, { timeout: 20000 })

    console.log('assistant response', assistantRes.data.answer || JSON.stringify(assistantRes.data))

    const chats = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'chats.json'), 'utf8'))
    console.log('last chats', chats.slice(-4))
  } catch (err) {
    console.error(err.response ? err.response.data : err.message)
  }
}

main()
