import React, { useEffect, useState } from 'react'
import axios from 'axios'

const numericFields = [
  { name: 'soilMoisturePercent', label: 'Soil moisture reading (%)', min: 0, max: 100 },
  { name: 'temperatureC', label: 'Temperature (°C) — manual', min: -20, max: 60 },
  { name: 'humidityPercent', label: 'Humidity (%) — manual', min: 0, max: 100 },
  { name: 'recentRainfallMm', label: 'Rainfall in last 24 hours (mm) — manual', min: 0, max: 1000 },
  { name: 'forecastRainfallMm', label: 'Forecast rainfall, next 3 days (mm) — manual override', min: 0, max: 1000 },
  { name: 'N', label: 'Nitrogen (N) — soil test', min: 0, max: 300 },
  { name: 'P', label: 'Phosphorus (P) — soil test', min: 0, max: 300 },
  { name: 'K', label: 'Potassium (K) — soil test', min: 0, max: 300 },
  { name: 'ph', label: 'Soil pH — soil test', min: 0, max: 14 }
]

const initialValues = {
  crop: '',
  growthStage: 'vegetative',
  soilType: 'unknown',
  moistureCondition: 'unknown',
  soilMoisturePercent: '',
  temperatureC: '',
  humidityPercent: '',
  recentRainfallMm: '',
  forecastRainfallMm: '',
  N: '',
  P: '',
  K: '',
  ph: ''
}

function cardClass(isDark) {
  return `${isDark ? 'bg-slate-900/90 border-slate-700 text-slate-100' : 'bg-white/90 border-slate-200 text-slate-900'} rounded-[32px] border p-6 shadow-xl`
}

export default function CropManagementRecommendation({ isDark, coords }) {
  const [values, setValues] = useState(initialValues)
  const [crops, setCrops] = useState([])
  const [cropLoadMessage, setCropLoadMessage] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const API_BASE = import.meta.env.VITE_API_BASE || ''
    axios.get(`${API_BASE}/api/crop/model-info`, { timeout: 10000 })
      .then(response => {
        const supported = response.data?.supported_crops
        if (!Array.isArray(supported) || supported.length === 0) {
          throw new Error('Crop model did not return its supported crop list.')
        }
        if (!active) return
        setCrops(supported)
        setValues(previous => ({
          ...previous,
          crop: supported.includes(previous.crop) ? previous.crop : supported[0]
        }))
      })
      .catch(() => {
        if (active) setCropLoadMessage('Crop list unavailable; enter the crop name manually.')
      })
    return () => { active = false }
  }, [])

  function update(name, value) {
    setValues(previous => ({ ...previous, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setResult(null)
    if (!values.crop.trim()) {
      setError('Select or enter a crop.')
      return
    }

    const body = {
      crop: values.crop,
      growthStage: values.growthStage,
      soilType: values.soilType,
      moistureCondition: values.moistureCondition
    }
    for (const field of numericFields) {
      const value = values[field.name]
      if (value === '') continue
      const number = Number(value)
      if (!Number.isFinite(number) || number < field.min || number > field.max) {
        setError(`${field.label} must be between ${field.min} and ${field.max}.`)
        return
      }
      body[field.name] = number
    }
    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) {
      body.latitude = coords.lat
      body.longitude = coords.lon
    }

    setLoading(true)
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || ''
      const response = await axios.post(`${API_BASE}/api/agriculture/irrigation/recommend`, body, {
        timeout: 12000
      })
      setResult(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to prepare a recommendation. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fieldClass = `mt-1 w-full rounded-xl border p-3 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`

  return (
    <section className={cardClass(isDark)} aria-labelledby="crop-management-title">
      <h2 id="crop-management-title" className="text-xl font-semibold">Irrigation & crop management</h2>
      <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
        Uses your field observations and, when location is available, a live Open-Meteo forecast. No simulated sensor readings are used.
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">
          Crop
          {crops.length > 0 ? (
            <select aria-label="Crop" value={values.crop} onChange={event => update('crop', event.target.value)} className={fieldClass}>
              {crops.map(crop => <option key={crop} value={crop}>{crop}</option>)}
            </select>
          ) : (
            <input aria-label="Crop" value={values.crop} onChange={event => update('crop', event.target.value)} className={fieldClass} maxLength={60} />
          )}
          {cropLoadMessage && <span className="mt-1 block text-xs text-amber-600">{cropLoadMessage}</span>}
        </label>

        <label className="text-sm font-medium">
          Growth stage
          <select aria-label="Growth stage" value={values.growthStage} onChange={event => update('growthStage', event.target.value)} className={fieldClass}>
            <option value="establishment">Establishment</option>
            <option value="vegetative">Vegetative / development</option>
            <option value="flowering">Flowering</option>
            <option value="fruiting">Fruiting / mid-season</option>
            <option value="maturation">Maturation / late-season</option>
          </select>
        </label>

        <label className="text-sm font-medium">
          Soil type — manual
          <select aria-label="Soil type" value={values.soilType} onChange={event => update('soilType', event.target.value)} className={fieldClass}>
            <option value="unknown">Unknown / not entered</option>
            <option value="sandy">Sandy</option>
            <option value="loamy">Loamy</option>
            <option value="clayey">Clayey</option>
          </select>
        </label>

        <label className="text-sm font-medium">
          Soil moisture condition — field observation
          <select aria-label="Soil moisture condition" value={values.moistureCondition} onChange={event => update('moistureCondition', event.target.value)} className={fieldClass}>
            <option value="unknown">Not checked</option>
            <option value="dry">Dry</option>
            <option value="adequate">Adequate</option>
            <option value="wet">Wet</option>
          </select>
        </label>

        {numericFields.map(field => (
          <label key={field.name} className="text-sm font-medium">
            {field.label}
            <input
              aria-label={field.label}
              type="number"
              min={field.min}
              max={field.max}
              step="any"
              value={values[field.name]}
              onChange={event => update(field.name, event.target.value)}
              className={fieldClass}
            />
          </label>
        ))}

        <div className="sm:col-span-2 lg:col-span-3">
          <p className={`mb-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Soil moisture, soil type, recent rainfall, and soil-test readings are user-entered. The numeric moisture reading is not treated as calibrated without soil-specific capacity data. A manual forecast value overrides the live forecast rainfall total.
          </p>
          <button
            type="submit"
            disabled={loading}
            data-testid="irrigation-submit"
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Preparing recommendation…' : 'Get irrigation and management guidance'}
          </button>
        </div>
      </form>

      {loading && <p className="mt-4 text-sm" role="status">Checking inputs and available weather forecast…</p>}
      {error && <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}</div>}

      {result && (
        <div className="mt-5 space-y-4" data-testid="irrigation-result">
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Rule-based recommendation: {result.recommendation.action.replace(/_/g, ' ')}</p>
            <p className="mt-2 font-semibold">{result.recommendation.text}</p>
            <h3 className="mt-3 font-semibold">Why</h3>
            <ul className="ml-5 list-disc text-sm">
              {result.recommendation.rationale.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </section>

          <section className={`rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
            <h3 className="font-semibold">Weather data sources</h3>
            <p className="mt-1 text-sm">
              Live service: {result.weather.status === 'available' ? `${result.weather.source} forecast` : 'unavailable'}
              {result.weather.forecastRainfallMm !== null && ` · forecast rainfall ${result.weather.forecastRainfallMm} mm (${result.weather.forecastRainfallSource})`}
            </p>
            {result.weather.reason && <p className="text-xs text-amber-700">{result.weather.reason}</p>}
            {result.weather.status === 'available' && result.weather.current && (
              <p className="mt-1 text-sm">
                Current live weather: {result.weather.current.temperatureC ?? '—'}°C, humidity {result.weather.current.humidityPercent ?? '—'}%, wind {result.weather.current.windSpeedKmh ?? '—'} km/h.
              </p>
            )}
            {result.weather.forecast?.precipitationMm?.map((day, index) => {
              const maximum = result.weather.forecast.temperatureMaxC?.[index]?.value
              const minimum = result.weather.forecast.temperatureMinC?.[index]?.value
              const wind = result.weather.forecast.windSpeedMaxKmh?.[index]?.value
              return (
                <p key={day.day} className="text-xs">
                  {day.day}: {minimum ?? '—'}–{maximum ?? '—'}°C, rainfall {day.value === null ? 'unavailable' : `${day.value} mm`}, wind max {wind ?? '—'} km/h (forecast)
                </p>
              )
            })}
            <p className="mt-2 text-sm">
              Standard-condition crop ETc estimate: {result.cropDemand.estimatedCropEvapotranspirationMm === null
                ? 'unavailable'
                : `${result.cropDemand.estimatedCropEvapotranspirationMm} mm over ${result.cropDemand.periodDays} forecast days`}
              {result.cropDemand.cropCoefficient !== null && ` · Kc ${result.cropDemand.cropCoefficient}`}
            </p>
            <p className="mt-1 text-xs text-slate-500">{result.cropDemand.method}</p>
          </section>

          <section className={`rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
            <h3 className="font-semibold">Crop management</h3>
            {result.management.weatherWarnings?.length > 0 && (
              <ul className="ml-5 mt-2 list-disc text-sm text-amber-700">
                {result.management.weatherWarnings.map(item => <li key={item}>{item}</li>)}
              </ul>
            )}
            <ul className="ml-5 mt-2 list-disc text-sm">
              {result.management.waterConservation.map(item => <li key={item}>{item}</li>)}
            </ul>
            <h4 className="mt-3 text-sm font-semibold">Soil nutrient assessment</h4>
            <p className="text-sm">{result.management.nutrientAssessment.guidance}</p>
            {Object.keys(result.management.nutrientAssessment.suppliedValues).length > 0 && (
              <p className="mt-1 text-xs">Entered values: {Object.entries(result.management.nutrientAssessment.suppliedValues).map(([name, value]) => `${name} ${value}`).join(' · ')}</p>
            )}
          </section>

          {result.missingInputs.length > 0 && (
            <p className="text-xs text-amber-700">Unavailable inputs: {result.missingInputs.join('; ')}.</p>
          )}
          <ul className="ml-5 list-disc text-xs text-slate-500">
            {result.uncertainty.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
    </section>
  )
}
