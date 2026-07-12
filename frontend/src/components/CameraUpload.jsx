import React, { useRef, useState } from 'react'
import axios from 'axios'

export default function CameraUpload({ onResult, langStrings, coords, userId, lang }) {
  const fileRef = useRef()
  const [loading, setLoading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    await uploadFile(file)
    // Reset input so the same file can be selected again if needed
    if (fileRef.current) {
      fileRef.current.value = ''
    }
  }

  async function uploadFile(file) {
    setLoading(true)
    try {
      const form = new FormData()
      form.append('image', file)
      form.append('userId', userId || 'anonymous')
      form.append('lang', lang || 'en')
      if (coords) {
        form.append('lat', String(coords.lat))
        form.append('lon', String(coords.lon))
      }
      // Use Vite env `VITE_API_BASE` if provided, otherwise use relative path.
      // This avoids hardcoding `localhost` which breaks when opening the app from other devices.
      const API_BASE = import.meta.env.VITE_API_BASE || ''
      const uploadUrl = `${API_BASE}/api/upload-crop-image`

      // Prevent mixed-content requests from HTTPS pages to an HTTP backend
      if (window.location.protocol === 'https:' && uploadUrl.startsWith('http:')) {
        throw new Error('MixedContent: cannot request http resource from https page. Use an https backend or set VITE_API_BASE to an https URL.')
      }

      const res = await axios.post(uploadUrl, form)
      // provide a client-side preview URL so the result image appears crisp
      const previewUrl = URL.createObjectURL(file)
      onResult({ ...res.data, previewUrl })
    } catch (err) {
      console.error(err)
      // Show detailed error so user/developer can see server status and body
      const status = err?.response?.status
      const data = err?.response?.data
      const msg = data?.message || data || err.message || 'Upload failed'
      console.error('Upload error details:', { status, data })

      // Network error (no response) vs server error
      if (!err.response) {
        alert(`Upload failed: Network error. Check that the backend is reachable from this device and that the upload URL is correct (VITE_API_BASE).\n\nDetails: ${err.message}`)
      } else {
        alert(`Upload failed${status ? ' (status ' + status + ')' : ''}: ${JSON.stringify(msg)}`)
      }
      if (fileRef.current) {
        fileRef.current.value = ''
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">{langStrings.uploadImage}</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="w-full"
          data-testid="file-input"
        />
      </label>
      <button
        onClick={() => fileRef.current && fileRef.current.click()}
        className="w-full bg-green-600 text-white py-3 rounded-lg text-lg font-semibold"
        data-testid="scan-button"
      >
        {langStrings.scanButton}
      </button>
      {loading && <div className="text-center">Uploading...</div>}
    </div>
  )
}
