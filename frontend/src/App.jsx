import React, { useState, useEffect, useRef } from 'react'
import CameraUpload from './components/CameraUpload'
import ResultCard from './components/ResultCard'
import AssistantChat from './components/AssistantChat'
import UserHistory from './components/UserHistory'
import CropRecommendation from './components/CropRecommendation'
import CropManagementRecommendation from './components/CropManagementRecommendation'
import { t, setAppLanguage, languageNames, getTranslationCoverage } from './i18n'
import axios from 'axios'
import { translateDynamicText } from './translationService'

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return (R * c).toFixed(1)
}

function getChemicalShopsByDistance(shops, coords) {
  return shops
    .filter(shop => shop.sellsChemical)
    .map(shop => ({
      ...shop,
      distance: shop.distance != null
        ? Number(shop.distance)
        : Number(calculateDistance(coords.lat, coords.lon, shop.lat, shop.lon))
    }))
    .sort((a, b) => a.distance - b.distance)
}

function getChemicalShopsWithinRadius(shops, coords, maxKm = 15) {
  return getChemicalShopsByDistance(shops, coords).filter(shop => shop.distance <= maxKm)
}

export default function App() {
  const [lang, setLang] = useState(() => {
    const storedLanguage = localStorage.getItem('agritech-language')
    return languageNames[storedLanguage] ? storedLanguage : 'en'
  })
  const [userId, setUserId] = useState('')
  const [bgColor, setBgColor] = useState('white')
  const [voices, setVoices] = useState([])
  const [coords, setCoords] = useState(null)
  const [locationStatus, setLocationStatus] = useState('pending')
  const [permissionState, setPermissionState] = useState('prompt')
  const [shops, setShops] = useState([])
  const [shopsLoading, setShopsLoading] = useState(false)
  const [shopsLoadError, setShopsLoadError] = useState(false)
  const [governmentSchemes, setGovernmentSchemes] = useState([])
  const [localizedSchemes, setLocalizedSchemes] = useState([])
  const [govSchemesLoading, setGovSchemesLoading] = useState(false)
  const [searchRadius, setSearchRadius] = useState(15)
  const locationWatchId = useRef(null)
  const chemicalShops = coords ? getChemicalShopsByDistance(shops, coords) : []
  const nearbyChemicalShops = coords ? chemicalShops.filter(shop => shop.distance <= searchRadius) : []
  const exactLocationNote = coords ? `Exact search location: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` : null
  const langStrings = t(lang)
  const translationCoverage = getTranslationCoverage(lang)
  const [result, setResult] = useState(null)
  const [scanError, setScanError] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatResult, setChatResult] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const isDark = bgColor === 'black'

  useEffect(() => {
    setAppLanguage(lang)
  }, [])

  useEffect(() => {
    let active = true
    async function localizeSchemes() {
      const translated = await Promise.all(governmentSchemes.map(async scheme => ({
        ...scheme,
        title: await translateDynamicText(scheme.title, lang),
        description: await translateDynamicText(scheme.description, lang),
        benefit: await translateDynamicText(scheme.benefit, lang),
        category: await translateDynamicText(scheme.category, lang)
      })))
      if (active) setLocalizedSchemes(translated)
    }
    localizeSchemes()
    return () => { active = false }
  }, [governmentSchemes, lang])

  useEffect(() => {
    document.body.classList.remove('theme-white', 'theme-black')
    document.body.classList.add(`theme-${bgColor}`)
  }, [bgColor])

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported')
      return
    }

    checkLocationPermission()

    return () => {
      if (locationWatchId.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchId.current)
      }
    }
  }, [])

  async function checkLocationPermission() {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported')
      return
    }

    setLocationStatus('pending')
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' })
        setPermissionState(status.state)
        status.onchange = () => {
          setPermissionState(status.state)
          if (status.state === 'granted') {
            requestLocationPermission()
          }
        }
      } catch (e) {
        // ignore unsupported permissions API
      }
    }

    requestLocationPermission()
  }

  function requestLocationPermission() {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported')
      return
    }

    setLocationStatus('pending')
    if (locationWatchId.current !== null) {
      navigator.geolocation.clearWatch(locationWatchId.current)
      locationWatchId.current = null
    }

    locationWatchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lon: position.coords.longitude })
        setLocationStatus('available')
        setPermissionState('granted')
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setPermissionState('denied')
          setLocationStatus('denied')
        } else {
          setLocationStatus('denied')
        }
        if (locationWatchId.current !== null) {
          navigator.geolocation.clearWatch(locationWatchId.current)
          locationWatchId.current = null
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    )
  }

  function handleResult(data) {
    if (!data) return
    setScanError('')
    setResult({ ...data, lang, sourceLang: data.lang || lang })
  }

  function handleScanStart() {
    setResult(null)
    setScanError('')
  }

  function handleScanError(message) {
    setResult(null)
    setScanError(message)
  }

  useEffect(() => {
    if (result) {
      setResult(prev => ({ ...prev, lang }))
    }
  }, [lang])

  // Fetch nearby shops from backend API when coordinates change
  useEffect(() => {
    if (coords) {
      setShopsLoading(true)
      const fetchShops = async () => {
        setShopsLoadError(false)
        try {
          const API_BASE = import.meta.env.VITE_API_BASE || ''
          const url = `${API_BASE}/api/nearby-shops`
          console.log('📍 Fetching nearby shops from:', url, 'with coords:', coords)
          const response = await axios.get(url, {
            params: {
              lat: coords.lat,
              lon: coords.lon,
              radius: searchRadius,
              sellsChemical: true
            }
          })
          console.log('✅ Shops fetched successfully:', response.data.length, 'shops')
          if (response.data && response.data.length > 0) {
            setShops(response.data)
          } else {
            setShops([])
          }
        } catch (err) {
          console.error('❌ Failed to fetch shops from API:', err.message)
          setShops([])
          setShopsLoadError(true)
        } finally {
          setShopsLoading(false)
        }
      }
      fetchShops()
    }
  }, [coords, searchRadius])

  useEffect(() => {
    setGovSchemesLoading(true)
    const fetchGovernmentSchemes = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE || ''
        const response = await axios.get(`${API_BASE}/api/government-schemes`)
        if (response.data?.schemes) {
          setGovernmentSchemes(response.data.schemes)
        } else {
          setGovernmentSchemes([])
        }
      } catch (err) {
        console.error('Failed to fetch government schemes', err)
        setGovernmentSchemes([])
      } finally {
        setGovSchemesLoading(false)
      }
    }

    fetchGovernmentSchemes()
  }, [])

  function openChat(result, initialQuestion) {
    // allow opening chat with an optional initial question (used by Schedule)
    const payload = { ...(result || {}), initialQuestion, lang }
    setChatResult(payload)
    setChatOpen(true)
  }

  function closeChat() {
    setChatOpen(false)
    setChatResult(null)
  }

  function getCurrentPosition(options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error('Geolocation unsupported'))
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, options)
    })
  }

  async function openMap(shop) {
    if (!shop) {
      if (coords && coords.lat && coords.lon) {
        window.open(`https://www.google.com/maps/search/pesticide+shop+near+me/@${coords.lat},${coords.lon},14z`, '_blank')
        return
      }

      if (navigator.geolocation) {
        try {
          const position = await getCurrentPosition()
          const currentCoords = { lat: position.coords.latitude, lon: position.coords.longitude }
          setCoords(currentCoords)
          setLocationStatus('available')
          setPermissionState('granted')
          window.open(`https://www.google.com/maps/search/pesticide+shop+near+me/@${currentCoords.lat},${currentCoords.lon},14z`, '_blank')
          return
        } catch {
          // fallback below
        }
      }

      window.open('https://www.google.com/maps/search/pesticide+shop+near+me', '_blank')
      return
    }

    let originCoords = coords
    if ((!originCoords || !originCoords.lat || !originCoords.lon) && navigator.geolocation) {
      try {
        const position = await getCurrentPosition()
        originCoords = { lat: position.coords.latitude, lon: position.coords.longitude }
        setCoords(originCoords)
        setLocationStatus('available')
        setPermissionState('granted')
      } catch {
        originCoords = null
      }
    }

    const q = encodeURIComponent(`${shop.name} ${shop.address}`.trim())
    if (originCoords && originCoords.lat && originCoords.lon) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${originCoords.lat},${originCoords.lon}&destination=${shop.lat},${shop.lon}&travelmode=driving&q=${q}`
      window.open(url, '_blank')
    } else {
      const url = `https://www.google.com/maps/search/?api=1&query=${q}`
      window.open(url, '_blank')
    }
  }

  function localizeSeverity(severity) {
    if (severity === 'high') return langStrings.severityHigh || severity
    if (severity === 'medium') return langStrings.severityMedium || severity
    return langStrings.severityLow || severity
  }

  useEffect(() => {
    // Populate available speechSynthesis voices
    function loadVoices() {
      const v = window.speechSynthesis.getVoices()
      if (v && v.length) setVoices(v)
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [])

  function selectVoiceForLang(langCode) {
    // prefer exact match, then startsWith, then default
    const map = {
      hi: ['hi-IN', 'hi'],
      kn: ['kn-IN', 'kn'],
      mr: ['mr-IN', 'mr'],
      ta: ['ta-IN', 'ta'],
      te: ['te-IN', 'te'],
      bn: ['bn-IN', 'bn'],
      ml: ['ml-IN', 'ml'],
      gu: ['gu-IN', 'gu'],
      pa: ['pa-IN', 'pa'],
      en: ['en-US', 'en']
    }
    const prefs = map[langCode] || map.en
    if (!voices || voices.length === 0) return null
    // list available for debug
    console.info('Speech voices available:', voices.map(v => ({ name: v.name, lang: v.lang })))

    // 1) exact lang match
    let v = voices.find(x => x.lang && prefs.includes(x.lang))
    // 2) startsWith match
    if (!v) v = voices.find(x => x.lang && prefs.some(p => x.lang.toLowerCase().startsWith(p.toLowerCase())))
    // 3) name contains common provider keywords for English
    if (!v && langCode === 'en') {
      v = voices.find(x => /google|microsoft|amazon|zira|ryan|alloy/i.test(x.name)) || voices[0]
    }
    // 4) fallback: try any voice whose lang starts with primary language code
    if (!v) {
      const primary = prefs[0].split('-')[0]
      v = voices.find(x => x.lang && x.lang.toLowerCase().startsWith(primary))
    }
    console.info('Selected voice for', langCode, v && { name: v.name, lang: v.lang })
    return v || null
  }

  function getLocalizedVoiceText(result) {
    if (!result) return ''
    const treatments = result.treatments.slice(0, 2).join(', ')
    const diseaseName = getLocalizedDiseaseName(result.disease)
    let text = langStrings.voiceTextTemplate
      .replace('{disease}', diseaseName)
      .replace('{severity}', localizeSeverity(result.severity))
      .replace('{treatments}', treatments)

    if (result.affordableAlternatives && result.affordableAlternatives.length) {
      const alt = result.affordableAlternatives[0]
      if (langStrings.voiceTextAlternative) {
        text += ' ' + langStrings.voiceTextAlternative.replace('{alternative}', alt)
      }
    }
    return text
  }

  function getLocalizedDiseaseName(disease) {
    const diseaseKey = {
      'Late Blight': 'diseaseLateBlight',
      'Powdery Mildew': 'diseasePowderyMildew',
      'Bacterial Spot': 'diseaseBacterialSpot'
    }[disease]

    return diseaseKey ? langStrings[diseaseKey] || disease : disease
  }

  async function speak(result) {
    if (!result) return
    const text = typeof result === 'string'
      ? result
      : ((result.voiceText && result.lang === lang) ? result.voiceText : getLocalizedVoiceText(result))
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || ''
      const response = await axios.post(`${API_BASE}/api/speech/synthesize`, { text, language: lang }, {
        timeout: 25000
      })
      if (response.data?.audioBase64 && response.data?.mimeType) {
        const audio = new Audio(`data:${response.data.mimeType};base64,${response.data.audioBase64}`)
        await audio.play()
        return
      }
      throw new Error('Speech service returned no playable audio.')
    } catch (error) {
      console.warn('Sarvam speech playback unavailable; using browser speech:', error.response?.status || error.message)
      if (error.response?.status === 422) return
    }

    const msg = new SpeechSynthesisUtterance(text)
    msg.lang = lang === 'hi'
      ? 'hi-IN'
      : lang === 'kn'
      ? 'kn-IN'
      : lang === 'mr'
      ? 'mr-IN'
      : lang === 'ta'
      ? 'ta-IN'
      : lang === 'te'
      ? 'te-IN'
      : lang === 'bn'
      ? 'bn-IN'
      : lang === 'ml'
      ? 'ml-IN'
      : lang === 'gu'
      ? 'gu-IN'
      : lang === 'pa'
      ? 'pa-IN'
      : 'en-US'
    // set a selected voice if available for better quality
    const voice = selectVoiceForLang(lang)
    if (voice) msg.voice = voice
    // tune rate/pitch for clearer output
    msg.rate = 0.95
    msg.pitch = 1
    msg.volume = 1
    window.speechSynthesis.speak(msg)
  }

  // Expose a test helper to allow e2e tests to call the speak function directly.
  // This is only used by automated tests and does not affect normal runtime behavior.
  if (typeof window !== 'undefined') {
    // attach on a namespaced property to avoid collisions
    window.__aiCropSpeak = (r) => speak(r)
  }

  const dashboardStats = [
    { label: langStrings.scans, value: result ? '1' : '0', color: 'emerald' },
    { label: langStrings.detected, value: result ? result.disease : langStrings.noScanYet, color: 'amber' },
    { label: langStrings.risk, value: result ? localizeSeverity(result.severity) : '—', color: 'rose' }
  ]

  return (
    <div className={`min-h-screen w-full p-4 ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <div className="mx-auto max-w-full">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{langStrings.dashboardEyebrow}</p>
            <h1 className="mt-2 text-4xl font-bold">{langStrings.appTitle}</h1>
            <p className={`mt-2 max-w-2xl ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{langStrings.dashboardSubtitle}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className={`${isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-white/95 border-slate-200'} rounded-3xl border p-5 shadow-lg`}>
              <p className="text-sm text-slate-400">{langStrings.language}</p>
              <select
                data-testid="language-select"
                value={lang}
                onChange={e => {
                  const selected = setAppLanguage(e.target.value)
                  setLang(selected)
                  document.documentElement.lang = selected
                }}
                className={`mt-2 w-full p-3 rounded-lg transition border shadow-sm ${bgColor === 'black' ? 'bg-slate-900 text-white border-slate-700' : 'bg-white text-slate-900 border-slate-300'}`}
              >
                {Object.entries(languageNames).map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
              {translationCoverage.missing.length > 0 && (
                <p className="mt-2 text-xs text-amber-600">{langStrings.translationCoverageWarning}</p>
              )}
            </div>
            <div className={`${isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-white/95 border-slate-200'} rounded-3xl border p-5 shadow-lg`}>
              <p className="text-sm text-slate-400">{langStrings.chooseBackground}</p>
              <div className="mt-3 flex gap-3">
                <button type="button" onClick={() => setBgColor('white')} className={`flex-1 rounded-xl px-4 py-3 border text-sm font-semibold transition ${bgColor === 'white' ? 'bg-white text-slate-900 border-slate-300' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                  {langStrings.white}
                </button>
                <button type="button" onClick={() => setBgColor('black')} className={`flex-1 rounded-xl px-4 py-3 border text-sm font-semibold transition ${bgColor === 'black' ? 'bg-slate-900 text-white border-slate-700' : 'bg-slate-800 text-white/80 border-slate-700'}`}>
                  {langStrings.black}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[360px_1.2fr]">
          <aside className={`${isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-white/90 border-slate-200'} rounded-[32px] border p-6 shadow-xl`}> 
            <div className="mb-6">
              <h2 className="text-xl font-semibold">{langStrings.userIdLabel || 'User ID'}</h2>
              <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{langStrings.userIdHelp}</p>
              <input
                value={userId}
                onChange={e => setUserId(e.target.value)}
                className={`mt-4 w-full p-3 rounded-xl border ${isDark ? 'bg-slate-800 text-white border-slate-700 placeholder:text-slate-400' : 'bg-white text-slate-900 border-slate-300 placeholder:text-slate-500'}`}
                placeholder={langStrings.userIdPlaceholder || 'anonymous'}
              />
              <button onClick={() => setHistoryOpen(true)} className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 transition">{langStrings.viewHistory || 'View my history'}</button>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold">{langStrings.quickActions}</h3>
              <div className="mt-3 grid gap-3">
                <button onClick={() => requestLocationPermission()} className="w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium border-slate-300 bg-slate-50 text-slate-900">{langStrings.locationAvailable || 'Use location'}</button>
                <button onClick={openChat.bind(null, result)} disabled={!result} className="w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium border-slate-300 bg-emerald-50 text-emerald-900 disabled:opacity-40">{langStrings.askHelp || 'Ask the crop doctor'}</button>
              </div>
              <p className={`mt-3 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {locationStatus === 'available'
                  ? `${langStrings.liveLocation}: ${coords?.lat.toFixed(4)}, ${coords?.lon.toFixed(4)}`
                  : locationStatus === 'pending'
                  ? langStrings.requestingLocation
                  : locationStatus === 'denied'
                  ? langStrings.locationBlocked || 'Location access denied. Please enable location in browser settings.'
                  : langStrings.locationUnsupported || 'Geolocation not supported by this browser.'}
              </p>
              {locationStatus !== 'available' && (
                <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Allow location access to open maps from your current location, or click “Use location” to retry.
                </p>
              )}
            </div>

            <div className="mb-6 rounded-[32px] border p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{langStrings.governmentSchemesTitle || 'Government schemes for farmers'}</h3>
                <button
                  onClick={() => {
                    setGovSchemesLoading(true)
                    const API_BASE = import.meta.env.VITE_API_BASE || ''
                    axios.get(`${API_BASE}/api/government-schemes`)
                      .then(response => {
                        if (response.data?.schemes) {
                          setGovernmentSchemes(response.data.schemes)
                        } else {
                          setGovernmentSchemes([])
                        }
                      })
                      .catch(err => {
                        console.error('Failed to refresh government schemes', err)
                        setGovernmentSchemes([])
                      })
                      .finally(() => setGovSchemesLoading(false))
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  {langStrings.refreshSchemes || 'Refresh'}
                </button>
              </div>
              <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Curated reference links only—not a live government feed. Confirm current eligibility, availability, and application details on the official portal.</p>
              <div className="mt-4 space-y-3">
                {govSchemesLoading ? (
                  <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Loading schemes…</p>
                ) : governmentSchemes.length === 0 ? (
                  <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{langStrings.noSchemesFound || 'No schemes found right now.'}</p>
                ) : (
                  localizedSchemes.map((scheme) => (
                    <div key={scheme.id} className={`${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-900'} rounded-3xl border p-4`}>
                      <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{scheme.category}</p>
                      <h4 className="mt-2 text-lg font-semibold">{scheme.title}</h4>
                      <p className="mt-2 text-sm leading-6">{scheme.description}</p>
                      <p className="mt-3 text-sm font-medium text-emerald-600">{scheme.benefit}</p>
                      <a href={scheme.applyLink} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                        {langStrings.applyNow || 'Learn more'}
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-4">
              {dashboardStats.map((stat) => (
                <div key={stat.label} className={`${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'} rounded-3xl border p-4`}>
                  <p className="text-sm text-slate-400">{stat.label}</p>
                  <p className={`mt-2 text-2xl font-semibold ${stat.color === 'emerald' ? 'text-emerald-500' : stat.color === 'amber' ? 'text-amber-500' : 'text-rose-500'}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          </aside>

          <main className="space-y-6">
            <CropRecommendation isDark={isDark} lang={lang} />
            <CropManagementRecommendation isDark={isDark} coords={coords} lang={lang} />

            <section className={`${isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-white/90 border-slate-200'} rounded-[32px] border p-6 shadow-xl`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{langStrings.liveScanArea}</h2>
                  <p className={`mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{langStrings.liveScanHelp}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <button
                    onClick={() => {
                      const input = document.querySelector('[data-testid="file-input"]')
                      input && input.click()
                    }}
                    className="rounded-2xl bg-sky-50 px-4 py-3 text-slate-900 shadow-sm"
                  >
                    {langStrings.scanButton || 'Scan'}
                  </button>
                  <button
                    onClick={() => openChat(result)}
                    disabled={!result}
                    className="rounded-2xl bg-green-50 px-4 py-3 text-slate-900 shadow-sm disabled:opacity-40"
                  >
                    {langStrings.askHelp || 'Advice'}
                  </button>
                  <button
                    onClick={() => openChat(result, 'When should I spray?')}
                    disabled={!result}
                    className="rounded-2xl bg-orange-50 px-4 py-3 text-slate-900 shadow-sm disabled:opacity-40"
                  >
                    {langStrings.schedule || 'Schedule'}
                  </button>
                </div>
              </div>
              <div className="mt-6">
                <CameraUpload onResult={handleResult} onScanStart={handleScanStart} onError={handleScanError} langStrings={langStrings} coords={coords} userId={userId} lang={lang} />
              </div>
            </section>

            <section className={`${isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-white/90 border-slate-200'} rounded-[32px] border p-6 shadow-xl`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{langStrings.resultsTitle}</h2>
                  <p className={`mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{langStrings.resultsSubtitle || 'See disease details, treatment, and weather advice in one place.'}</p>
                </div>
                <button onClick={() => handleResult(result)} className={`${isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'} rounded-2xl px-4 py-2 text-sm`}>{langStrings.refresh}</button>
              </div>
              <div className="mt-6">
                {scanError
                  ? <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="scan-error">{scanError}</p>
                  : <ResultCard result={result} langStrings={langStrings} onSpeak={speak} onChat={openChat} onOpenMap={() => openMap()} isDark={isDark} lang={lang} />}
              </div>
            </section>

            {result && (
              <section className={`${isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-white/90 border-slate-200'} rounded-[32px] border p-6 shadow-xl`}>
                <h2 className="text-xl font-semibold">{langStrings.pesticideStores}</h2>
                <p className={`mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{langStrings.storesSubtitle || 'Local shops and support for treatment supplies.'}</p>
                <div className="mt-4">
                  {exactLocationNote && (
                    <div className={`mb-4 rounded-3xl border p-4 ${isDark ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
                      <p className="text-sm font-medium">{exactLocationNote}</p>
                      <p className="mt-1 text-xs text-slate-400">This exact GPS position is used to search for the nearest pesticide shops.</p>
                    </div>
                  )}
                {coords ? (
                  shopsLoading ? (
                    <p className="mb-4 text-sm" role="status">Loading verified shop listings…</p>
                  ) : shopsLoadError ? (
                    <p className="mb-4 text-sm" role="status">Verified shop listings are unavailable. No sample locations are shown.</p>
                  ) : nearbyChemicalShops.length > 0 ? (
                    <div className={`mb-4 rounded-3xl p-4 ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200 border' : 'bg-emerald-50 border-emerald-200 text-slate-900 border'}`}>
                      <p className="text-sm font-medium">Nearest chemical pesticide shop (within {searchRadius} km):</p>
                      <p className="mt-2 text-lg font-semibold">{nearbyChemicalShops[0].name}</p>
                      <p className="text-sm">{nearbyChemicalShops[0].address}</p>
                      <p className="text-sm font-medium text-emerald-600">{nearbyChemicalShops[0].distance.toFixed(1)} km away</p>
                      <p className="text-sm">{langStrings.call}: {nearbyChemicalShops[0].phone}</p>
                    </div>
                  ) : (
                    <div className={`mb-4 rounded-3xl p-4 ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200 border' : 'bg-yellow-50 border-yellow-200 text-slate-900 border'}`}>
                      <p className="text-sm font-medium">No chemical pesticide shops found within {searchRadius} km.</p>
                      <p className="text-sm mt-1">Would you like to increase the search radius?</p>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => setSearchRadius(25)} className="text-sm px-3 py-2 bg-emerald-600 text-white rounded">Search within 25 km</button>
                        <button onClick={() => setSearchRadius(50)} className="text-sm px-3 py-2 bg-amber-600 text-white rounded">Search within 50 km</button>
                        <button onClick={() => setSearchRadius(100)} className="text-sm px-3 py-2 bg-slate-100 rounded text-slate-900">Search within 100 km</button>
                        <button onClick={() => setSearchRadius(15)} className="text-sm px-3 py-2 bg-slate-200 rounded text-slate-900">Reset 15 km</button>
                      </div>
                    </div>
                  )
                ) : null}
                {!coords && <p className="mb-4 text-sm">Allow location access to search for verified shop listings. No sample locations are shown.</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  {(coords ? (nearbyChemicalShops.length > 0 ? nearbyChemicalShops : chemicalShops) : []).map((shop, index) => {
                    const hasCoords = coords && typeof coords.lat === 'number' && typeof coords.lon === 'number'
                    const distance = hasCoords
                      ? `${shop.distance != null ? shop.distance.toFixed(1) : calculateDistance(coords.lat, coords.lon, shop.lat, shop.lon)} km`
                      : (locationStatus === 'pending' ? 'Calculating...' : 'Distance not available')
                    return (
                      <div key={index} className={`${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-green-50 border-green-200 text-slate-900'} p-4 rounded-3xl border`}>
                        <h3 className="font-semibold">{shop.name}</h3>
                        <p className="text-sm mt-1">{shop.address}</p>
                        <p className="text-sm font-medium text-emerald-600">{distance}</p>
                        <p className="text-sm">{shop.sellsChemical ? 'Chemical pesticide seller' : 'Organic-only seller'}</p>
                        <p className="text-sm">{langStrings.call}: {shop.phone}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => openMap(shop)} className="text-sm px-3 py-2 bg-emerald-600 text-white rounded">{langStrings.openMap || 'Open map'}</button>
                          <a href={`tel:${shop.phone}`} className="text-sm px-3 py-2 bg-slate-100 rounded text-slate-900">{langStrings.call || 'Call'}</a>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              </section>
            )}
          </main>
        </div>
      </div>

      {chatOpen && chatResult && (
        <AssistantChat result={chatResult} coords={coords} onClose={closeChat} langStrings={langStrings} speak={speak} userId={userId} lang={lang} />
      )}
      {historyOpen && (
        <UserHistory userId={userId} onClose={() => setHistoryOpen(false)} langStrings={langStrings} />
      )}

      <footer className={`mt-6 text-sm text-center ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{langStrings.footer}</footer>
    </div>
  )
}
