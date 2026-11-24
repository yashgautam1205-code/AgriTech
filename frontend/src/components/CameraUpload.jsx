import React, { useRef, useState } from 'react'
import axios from 'axios'

const SUPPORTED_CROPS = [
  'Apple',
  'Blueberry',
  'Cherry_(including_sour)',
  'Corn_(maize)',
  'Grape',
  'Orange',
  'Peach',
  'Pepper,_bell',
  'Potato',
  'Raspberry',
  'Soybean',
  'Squash',
  'Strawberry',
  'Tomato'
]

export default function CameraUpload({ onResult, onScanStart, onError, langStrings, coords, userId, lang }) {
  const fileRef = useRef()
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedCrop, setSelectedCrop] = useState('')
  const [observations, setObservations] = useState({
    symptomsSpreading: 'unsure',
    affectedPlants: 'unsure',
    visibleSymptoms: []
  })

  function toggleSymptom(symptom) {
    setObservations(current => ({
      ...current,
      visibleSymptoms: current.visibleSymptoms.includes(symptom)
        ? current.visibleSymptoms.filter(value => value !== symptom)
        : [...current.visibleSymptoms, symptom]
    }))
  }

  function reportError(message) {
    setErrorMessage(message)
    onError?.(message)
  }

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
    onScanStart?.()
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reportError(langStrings.imageUploadError)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      reportError(langStrings.imageTooLarge)
      return
    }

    setLoading(true)
    try {
      const form = new FormData()
      form.append('image', file)
      form.append('userId', userId || 'anonymous')
      form.append('lang', lang || 'en')
      form.append('observations', JSON.stringify(observations))
      if (selectedCrop) form.append('selectedCrop', selectedCrop)
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
      const message =
        status === 413
          ? langStrings.imageTooLarge
          : status === 415
          ? langStrings.imageUploadError
          : (
        data?.message ||
        (status === 503 || status === 504
          ? langStrings.diseaseUnavailable
          : langStrings.uploadFailed)
      )
      reportError(message)
      if (fileRef.current) {
        fileRef.current.value = ''
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        {langStrings.cropSelectionPrompt}
        <select
          value={selectedCrop}
          onChange={event => setSelectedCrop(event.target.value)}
          className="mt-1 block w-full rounded border p-2"
          data-testid="crop-selection"
        >
          <option value="">{langStrings.notSelected}</option>
          {SUPPORTED_CROPS.map(crop => <option key={crop} value={crop}>{crop.replace(/_/g, ' ')}</option>)}
          <option value="__unsupported__">{langStrings.otherCrop}</option>
        </select>
      </label>
      <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
        <legend className="px-1 font-semibold">{langStrings.optionalObservations}</legend>
        <label className="block text-sm">
          {langStrings.symptomsSpreading}
          <select
            value={observations.symptomsSpreading}
            onChange={event => setObservations(current => ({ ...current, symptomsSpreading: event.target.value }))}
            className="mt-1 block w-full rounded border p-2"
            data-testid="symptoms-spreading"
          >
            <option value="unsure">{langStrings.unsure}</option>
            <option value="yes">{langStrings.yes}</option>
            <option value="no">{langStrings.no}</option>
          </select>
        </label>
        <label className="block text-sm">
          {langStrings.affectedPlants}
          <select
            value={observations.affectedPlants}
            onChange={event => setObservations(current => ({ ...current, affectedPlants: event.target.value }))}
            className="mt-1 block w-full rounded border p-2"
            data-testid="affected-plants"
          >
            <option value="unsure">Unsure</option>
            <option value="less_10">Less than 10%</option>
            <option value="10_30">10-30%</option>
            <option value="more_30">More than 30%</option>
          </select>
        </label>
        <div>
          <p className="text-sm">{langStrings.visibleSymptoms}</p>
          <div className="mt-1 flex flex-wrap gap-3">
            {[
              ['spots', langStrings.spots],
              ['yellowing', langStrings.yellowing],
              ['wilting', langStrings.wilting],
              ['leaf_drying', langStrings.leafDrying],
              ['mold', langStrings.mold],
              ['other', langStrings.other]
            ].map(([value, label]) => (
              <label key={value} className="inline-flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={observations.visibleSymptoms.includes(value)}
                  onChange={() => toggleSymptom(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">These reports support a simple triage only; they are not a validated diagnosis or severity scale.</p>
      </fieldset>
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
      {loading && <div className="text-center" role="status">{langStrings.uploading}</div>}
      {errorMessage && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{errorMessage}</div>}
    </div>
  )
}
