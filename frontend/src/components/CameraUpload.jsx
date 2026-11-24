import React, { useRef, useState } from 'react'
import axios from 'axios'

export default function CameraUpload({ onResult, langStrings, coords, userId, lang }) {
  const fileRef = useRef()
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

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
    setErrorMessage('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMessage('Choose a JPEG, PNG, or WebP leaf image.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Image must be 10 MB or smaller.')
      return
    }

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

      const res = await axios.post(uploadUrl, form, { timeout: 45000 })
      // provide a client-side preview URL so the result image appears crisp
      const previewUrl = URL.createObjectURL(file)
      onResult({ ...res.data, previewUrl })
    } catch (err) {
      const status = err?.response?.status
      const data = err?.response?.data
      setErrorMessage(
        data?.message ||
        (status === 503 || status === 504
          ? 'Disease identification is unavailable right now. Please try again later.'
          : 'Upload failed. Check your connection and try a supported leaf image.')
      )
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
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={handleFile}
          className="w-full"
          data-testid="file-input"
        />
      </label>
      <button
        onClick={() => fileRef.current && fileRef.current.click()}
        disabled={loading}
        className="w-full bg-green-600 text-white py-3 rounded-lg text-lg font-semibold"
        data-testid="scan-button"
      >
        {langStrings.scanButton}
      </button>
      {loading && <div className="text-center" role="status">Uploading and identifying the leaf image...</div>}
      {errorMessage && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{errorMessage}</div>}
    </div>
  )
}
