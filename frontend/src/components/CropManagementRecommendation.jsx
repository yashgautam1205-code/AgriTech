import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { t } from '../i18n'
import { translateDynamicText, translateDynamicTexts } from '../translationService'

const numericFields = [
  { name: 'soilMoisturePercent', labelKey: 'inputMoisture', min: 0, max: 100 },
  { name: 'temperatureC', labelKey: 'inputTemperature', min: -20, max: 60 },
  { name: 'humidityPercent', labelKey: 'inputHumidity', min: 0, max: 100 },
  { name: 'recentRainfallMm', labelKey: 'inputRecentRain', min: 0, max: 1000 },
  { name: 'forecastRainfallMm', labelKey: 'inputForecastRain', min: 0, max: 1000 },
  { name: 'N', labelKey: 'inputNitrogen', min: 0, max: 300 },
  { name: 'P', labelKey: 'inputPhosphorus', min: 0, max: 300 },
  { name: 'K', labelKey: 'inputPotassium', min: 0, max: 300 },
  { name: 'ph', labelKey: 'inputPH', min: 0, max: 14 }
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

export default function CropManagementRecommendation({ isDark, coords, lang = 'en' }) {
  const langStrings = t(lang)
  const [values, setValues] = useState(initialValues)
  const [crops, setCrops] = useState([])
  const [localizedCrops, setLocalizedCrops] = useState([])
  const [cropLoadFailed, setCropLoadFailed] = useState(false)
  const [result, setResult] = useState(null)
  const [localizedResult, setLocalizedResult] = useState(null)
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
        setLocalizedCrops(supported)
        setValues(previous => ({
          ...previous,
          crop: supported.includes(previous.crop) ? previous.crop : supported[0]
        }))
      })
      .catch(() => {
        if (active) setCropLoadFailed(true)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    async function localizeCrops() {
      if (lang === 'en') {
        setLocalizedCrops(crops)
        return
      }
      const translated = await translateDynamicTexts(crops, lang)
      if (active) setLocalizedCrops(translated)
    }
    localizeCrops()
    return () => { active = false }
  }, [crops, lang])

  useEffect(() => {
    let active = true
    async function localizeResult() {
      setLocalizedResult(null)
      if (!result || lang === 'en') {
        setLocalizedResult(result)
        return
      }
      const rationale = result.recommendation?.rationale || []
      const weatherWarnings = result.management?.weatherWarnings || []
      const waterConservation = result.management?.waterConservation || []
      const missingInputs = result.missingInputs || []
      const uncertainty = result.uncertainty || []
      const texts = [
        result.recommendation?.text || '',
        ...rationale,
        result.weather?.reason || '',
        ...weatherWarnings,
        ...waterConservation,
        result.management?.nutrientAssessment?.guidance || '',
        result.cropDemand?.method || '',
        ...missingInputs,
        ...uncertainty
      ]
      const translated = await translateDynamicTexts(texts, lang)
      if (!active) return
      let index = 0
      const recommendationText = translated[index++]
      const localizedRationale = rationale.map(() => translated[index++])
      const weatherReason = translated[index++]
      const localizedWarnings = weatherWarnings.map(() => translated[index++])
      const localizedConservation = waterConservation.map(() => translated[index++])
      const nutrientGuidance = translated[index++]
      const cropDemandMethod = translated[index++]
      const localizedMissingInputs = missingInputs.map(() => translated[index++])
      const localizedUncertainty = uncertainty.map(() => translated[index++])
      setLocalizedResult({
        ...result,
        recommendation: { ...result.recommendation, text: recommendationText, rationale: localizedRationale },
        weather: { ...result.weather, reason: weatherReason },
        management: {
          ...result.management,
          weatherWarnings: localizedWarnings,
          waterConservation: localizedConservation,
          nutrientAssessment: {
            ...result.management.nutrientAssessment,
            guidance: nutrientGuidance
          }
        },
        cropDemand: { ...result.cropDemand, method: cropDemandMethod },
        missingInputs: localizedMissingInputs,
        uncertainty: localizedUncertainty
      })
    }
    localizeResult()
    return () => { active = false }
  }, [result, lang])

  function update(name, value) {
    setValues(previous => ({ ...previous, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setResult(null)
    setLocalizedResult(null)
    if (!values.crop.trim()) {
      setError(langStrings.selectOrEnterCrop)
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
        setError(`${langStrings[field.labelKey]}: ${langStrings.valueMustBeBetween} ${field.min} ${langStrings.and} ${field.max}.`)
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
      setError(await translateDynamicText(
        requestError.response?.data?.message || langStrings.recommendationFailed,
        lang
      ))
    } finally {
      setLoading(false)
    }
  }

  const fieldClass = `mt-1 w-full rounded-xl border p-3 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`
  const displayedResult = localizedResult || result

  return (
    <section className={cardClass(isDark)} aria-labelledby="crop-management-title">
      <h2 id="crop-management-title" className="text-xl font-semibold">{langStrings.cropManagementTitle}</h2>
      <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
        {langStrings.cropManagementHelp}
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">
          {langStrings.irrigationCrop}
          {crops.length > 0 ? (
            <select aria-label={langStrings.irrigationCrop} value={values.crop} onChange={event => update('crop', event.target.value)} className={fieldClass}>
              {crops.map((crop, index) => <option key={crop} value={crop}>{localizedCrops[index] || crop}</option>)}
            </select>
          ) : (
            <input aria-label={langStrings.irrigationCrop} value={values.crop} onChange={event => update('crop', event.target.value)} className={fieldClass} maxLength={60} />
          )}
          {cropLoadFailed && <span className="mt-1 block text-xs text-amber-600">{langStrings.cropListUnavailable}</span>}
        </label>

        <label className="text-sm font-medium">
          {langStrings.irrigationGrowthStage}
          <select aria-label={langStrings.irrigationGrowthStage} value={values.growthStage} onChange={event => update('growthStage', event.target.value)} className={fieldClass}>
            <option value="establishment">{langStrings.stageEstablishment}</option>
            <option value="vegetative">{langStrings.stageVegetative}</option>
            <option value="flowering">{langStrings.stageFlowering}</option>
            <option value="fruiting">{langStrings.stageFruiting}</option>
            <option value="maturation">{langStrings.stageMaturation}</option>
          </select>
        </label>

        <label className="text-sm font-medium">
          {langStrings.soilTypeManual}
          <select aria-label={langStrings.soilTypeManual} value={values.soilType} onChange={event => update('soilType', event.target.value)} className={fieldClass}>
            <option value="unknown">{langStrings.soilUnknown}</option>
            <option value="sandy">{langStrings.soilSandy}</option>
            <option value="loamy">{langStrings.soilLoamy}</option>
            <option value="clayey">{langStrings.soilClayey}</option>
          </select>
        </label>

        <label className="text-sm font-medium">
          {langStrings.moistureField}
          <select aria-label={langStrings.moistureField} value={values.moistureCondition} onChange={event => update('moistureCondition', event.target.value)} className={fieldClass}>
            <option value="unknown">{langStrings.moistureNotChecked}</option>
            <option value="dry">{langStrings.moistureDry}</option>
            <option value="adequate">{langStrings.moistureAdequate}</option>
            <option value="wet">{langStrings.moistureWet}</option>
          </select>
        </label>

        {numericFields.map(field => (
          <label key={field.name} className="text-sm font-medium">
            {langStrings[field.labelKey]}
            <input
              aria-label={langStrings[field.labelKey]}
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
            {langStrings.irrigationNote}
          </p>
          <button
            type="submit"
            disabled={loading}
            data-testid="irrigation-submit"
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? langStrings.preparingRecommendation : langStrings.getManagementGuidance}
          </button>
        </div>
      </form>

      {loading && <p className="mt-4 text-sm" role="status">{langStrings.checkingForecast}</p>}
      {error && <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}</div>}

      {displayedResult && (
        <div className="mt-5 space-y-4" data-testid="irrigation-result">
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{langStrings.ruleBasedRecommendation}: {langStrings[{
              hold: 'actionHold',
              reassess: 'actionReassess',
              inspect_after_rain: 'actionInspectAfterRain',
              irrigation_may_be_needed: 'actionIrrigationNeeded',
              inspect: 'actionInspect'
            }[displayedResult.recommendation.action] || 'actionInspect']}</p>
            <p className="mt-2 font-semibold">{displayedResult.recommendation.text}</p>
            <h3 className="mt-3 font-semibold">{langStrings.irrigationWhy}</h3>
            <ul className="ml-5 list-disc text-sm">
              {displayedResult.recommendation.rationale.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </section>

          <section className={`rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
            <h3 className="font-semibold">{langStrings.weatherDataSourcesTitle}</h3>
            <p className="mt-1 text-sm">
              {langStrings.liveService}: {displayedResult.weather.status === 'available' ? `${displayedResult.weather.source} ${langStrings.forecast}` : langStrings.unavailable}
              {displayedResult.weather.forecastRainfallMm !== null && ` · ${langStrings.rainfall} ${displayedResult.weather.forecastRainfallMm} mm (${displayedResult.weather.forecastRainfallSource})`}
            </p>
            {displayedResult.weather.reason && <p className="text-xs text-amber-700">{displayedResult.weather.reason}</p>}
            {displayedResult.weather.status === 'available' && displayedResult.weather.current && (
              <p className="mt-1 text-sm">
                {langStrings.currentWeather}: {displayedResult.weather.current.temperatureC ?? '—'}°C, {langStrings.humidity} {displayedResult.weather.current.humidityPercent ?? '—'}%, {langStrings.wind} {displayedResult.weather.current.windSpeedKmh ?? '—'} km/h.
              </p>
            )}
            {displayedResult.weather.forecast?.precipitationMm?.map((day, index) => {
              const maximum = displayedResult.weather.forecast.temperatureMaxC?.[index]?.value
              const minimum = displayedResult.weather.forecast.temperatureMinC?.[index]?.value
              const wind = displayedResult.weather.forecast.windSpeedMaxKmh?.[index]?.value
              return (
                <p key={day.day} className="text-xs">
                  {day.day}: {minimum ?? '—'}–{maximum ?? '—'}°C, {langStrings.rainfall} {day.value === null ? langStrings.unavailable : `${day.value} mm`}, {langStrings.wind} max {wind ?? '—'} km/h ({langStrings.forecast})
                </p>
              )
            })}
            <p className="mt-2 text-sm">
              {langStrings.standardEtc}: {displayedResult.cropDemand.estimatedCropEvapotranspirationMm === null
                ? langStrings.unavailable
                : `${displayedResult.cropDemand.estimatedCropEvapotranspirationMm} mm ${langStrings.over} ${displayedResult.cropDemand.periodDays} ${langStrings.etcDays}`}
              {displayedResult.cropDemand.cropCoefficient !== null && ` · ${langStrings.cropCoefficient} Kc ${displayedResult.cropDemand.cropCoefficient}`}
            </p>
            <p className="mt-1 text-xs text-slate-500">{displayedResult.cropDemand.method}</p>
          </section>

          <section className={`rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
            <h3 className="font-semibold">{langStrings.cropManagementSection}</h3>
            {displayedResult.management.weatherWarnings?.length > 0 && (
              <ul className="ml-5 mt-2 list-disc text-sm text-amber-700">
                {displayedResult.management.weatherWarnings.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            )}
            <ul className="ml-5 mt-2 list-disc text-sm">
              {displayedResult.management.waterConservation.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
            <h4 className="mt-3 text-sm font-semibold">{langStrings.nutrientAssessment}</h4>
            <p className="text-sm">{displayedResult.management.nutrientAssessment.guidance}</p>
            {Object.keys(displayedResult.management.nutrientAssessment.suppliedValues).length > 0 && (
              <p className="mt-1 text-xs">{langStrings.enteredValues}: {Object.entries(displayedResult.management.nutrientAssessment.suppliedValues).map(([name, value]) => `${name} ${value}`).join(' · ')}</p>
            )}
          </section>

          {displayedResult.missingInputs.length > 0 && (
            <p className="text-xs text-amber-700">{langStrings.unavailableInputsLabel}: {displayedResult.missingInputs.join('; ')}.</p>
          )}
          <ul className="ml-5 list-disc text-xs text-slate-500">
            {displayedResult.uncertainty.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
      )}
    </section>
  )
}
