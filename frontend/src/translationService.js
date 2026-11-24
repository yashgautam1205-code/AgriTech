import axios from 'axios'

const cache = new Map()

export async function translateDynamicText(text, lang, source = 'en') {
  if (!text || lang === source) return text
  if (typeof text !== 'string') return text
  const key = `${source}:${lang}:${text}`
  if (cache.has(key)) return cache.get(key)

  try {
    const API_BASE = import.meta.env.VITE_API_BASE || ''
    const response = await axios.post(`${API_BASE}/api/translate`, {
      text,
      lang,
      source
    }, { timeout: 15000 })
    const translated = response.data?.translatedText || text
    cache.set(key, translated)
    return translated
  } catch {
    return text
  }
}

export async function translateDynamicTexts(texts, lang, source = 'en') {
  if (!Array.isArray(texts) || lang === source) return texts
  const unique = [...new Set(texts.filter(value => typeof value === 'string'))]
  if (!unique.length) return texts

  try {
    const API_BASE = import.meta.env.VITE_API_BASE || ''
    const response = await axios.post(`${API_BASE}/api/translate`, {
      text: unique,
      lang,
      source
    }, { timeout: 15000 })
    const translated = response.data?.translations || []
    const map = new Map(unique.map((text, index) => [text, translated[index] || text]))
    translated.forEach((value, index) => cache.set(`${source}:${lang}:${unique[index]}`, value))
    return texts.map(text => typeof text === 'string' ? map.get(text) || text : text)
  } catch {
    return texts
  }
}
