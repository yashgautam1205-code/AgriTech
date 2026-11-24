import React, { useState } from 'react'
import axios from 'axios'

const fields = [
  { name: 'N', label: 'Nitrogen (N)', min: 0, max: 300, step: 1, placeholder: '0-300' },
  { name: 'P', label: 'Phosphorus (P)', min: 0, max: 300, step: 1, placeholder: '0-300' },
  { name: 'K', label: 'Potassium (K)', min: 0, max: 300, step: 1, placeholder: '0-300' },
  { name: 'temperature', label: 'Temperature (°C)', min: -20, max: 60, step: 'any', placeholder: '-20-60' },
  { name: 'humidity', label: 'Humidity (%)', min: 0, max: 100, step: 'any', placeholder: '0-100' },
  { name: 'ph', label: 'Soil pH', min: 0, max: 14, step: 'any', placeholder: '0-14' },
  { name: 'rainfall', label: 'Rainfall (mm)', min: 0, max: 5000, step: 'any', placeholder: '0-5000' }
]

export default function CropRecommendation({ isDark }) {
  const [values, setValues] = useState({
    N: '',
    P: '',
    K: '',
    temperature: '',
    humidity: '',
    ph: '',
    rainfall: ''
  })
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function updateValue(name, value) {
    setValues(previous => ({ ...previous, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setPrediction(null)

    for (const field of fields) {
      const value = values[field.name]
      if (value === '') {
        setError(`Enter ${field.label}.`)
        return
      }
      const number = Number(value)
      if (!Number.isFinite(number) || number < field.min || number > field.max) {
        setError(`${field.label} must be between ${field.min} and ${field.max}.`)
        return
      }
    }

    setLoading(true)
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || ''
      const response = await axios.post(`${API_BASE}/api/crop/predict`, values, {
        timeout: 15000
      })
      setPrediction(response.data)
    } catch (err) {
      const message = err.response?.data?.message
      setError(message || 'Unable to generate a crop recommendation. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={`${isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-white/90 border-slate-200'} rounded-[32px] border p-6 shadow-xl`}>
      <h2 className="text-xl font-semibold">Crop suitability recommendation</h2>
      <p className={`mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
        Enter measured or observed soil and weather values. Values are used by the trained Random Forest model.
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map(field => (
          <label key={field.name} className="text-sm font-medium">
            {field.label}
            <input
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              value={values[field.name]}
              placeholder={field.placeholder}
              onChange={event => updateValue(field.name, event.target.value)}
              className={`mt-2 w-full p-3 rounded-xl border ${isDark ? 'bg-slate-800 text-white border-slate-700' : 'bg-white text-slate-900 border-slate-300'}`}
            />
          </label>
        ))}
        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Generating recommendation…' : 'Recommend suitable crops'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          {error}
        </div>
      )}

      {prediction && (
        <div className={`mt-5 rounded-3xl border p-5 ${isDark ? 'border-emerald-800 bg-slate-800' : 'border-emerald-200 bg-emerald-50'}`}>
          <p className="text-sm text-slate-500">Model recommendation</p>
          <h3 className="mt-1 text-3xl font-bold text-emerald-600">{prediction.recommended_crop}</h3>
          <p className="mt-2 text-sm">Model confidence: {(prediction.confidence * 100).toFixed(1)}%</p>
          <p className="mt-2 text-xs text-slate-500">
            Confidence is a model probability, not a guaranteed agricultural outcome.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {prediction.probabilities.slice(0, 5).map(item => (
              <div key={item.crop} className={`${isDark ? 'bg-slate-900' : 'bg-white'} rounded-xl border p-3`}>
                <div className="flex justify-between gap-3 text-sm font-medium">
                  <span>{item.crop}</span>
                  <span>{(item.probability * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
