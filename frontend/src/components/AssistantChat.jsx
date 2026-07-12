import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'

export default function AssistantChat({ result, coords, onClose, langStrings, speak, userId, lang }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef()

  const API_BASE = import.meta.env.VITE_API_BASE || ''

  useEffect(() => {
    if (!result) return
    // load persisted history if available, otherwise seed with brief summary
    async function loadHistory() {
      if (result.scanId) {
        try {
          const res = await axios.get(`${API_BASE}/api/assistant/history/${result.scanId}`)
          if (res.data && res.data.length) {
            setMessages(res.data.map(it => ({ from: it.from, text: it.text, createdAt: it.createdAt })))
            return
          }
        } catch (e) {
          console.warn('Could not load history', e && e.message)
        }
      }
      setMessages([
        { from: 'bot', text: `${langStrings.detected || 'Detected'} ${result.disease}. ${langStrings.severityLabel || 'Severity'}: ${result.severity}. ${langStrings.askHint || 'Ask me anything: why, risks, treatments, spray times, harvest, fertilizer.'}` }
      ])
      // if parent requested an initial question (e.g., schedule), send it
      if (result.initialQuestion) {
        setTimeout(() => {
          try {
            sendQuestion(result.initialQuestion)
          } catch (e) {
            console.warn('Could not send initial question', e)
          }
        }, 250)
      }
    }
    loadHistory()
  }, [result])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  async function sendQuestion(q) {
    if (!q || !result) return
    setLoading(true)
    const userMsg = { from: 'user', text: q }
    setMessages(m => [...m, userMsg])
    try {
      const payload = {
        disease: result.disease,
        question: q,
        crop: result.crop || '',
        scanId: result.scanId,
        lat: coords?.lat,
        lon: coords?.lon,
        userId: userId || 'anonymous',
        lang: lang || 'en'
      }
      const res = await axios.post(`${API_BASE}/api/assistant`, payload)
      const data = res.data
      const botMsg = { from: 'bot', text: data.answer || JSON.stringify(data) }
      setMessages(m => [...m, botMsg])
    } catch (err) {
      console.error('assistant error', err)
      setMessages(m => [...m, { from: 'bot', text: 'Sorry, could not reach assistant right now.' }])
    } finally {
      setLoading(false)
      setInput('')
    }
  }

  function exportMessages(e) {
    e.preventDefault()
    try {
      exportMessagesAsJSON(messages, userId)
    } catch (err) {
      console.error('export failed', err)
      // fallback: copy text
      const text = messages.map(m => `${m.from}: ${m.text}`).join('\n')
      navigator.clipboard && navigator.clipboard.writeText(text)
      alert(langStrings.exportCopied || 'Export copied to clipboard')
    }
  }

  function onSend(e) {
    e.preventDefault()
    if (!input.trim()) return
    sendQuestion(input.trim())
  }

  return (
    <div className="fixed left-0 right-0 bottom-0 max-w-md mx-auto p-4">
      <div className="bg-white p-3 rounded-t-xl shadow-lg border">
        <div className="flex items-center justify-between mb-2">
          <strong>{langStrings.cropDoctorTitle || 'Crop Doctor'}</strong>
          <div className="flex gap-2">
            <button onClick={() => sendQuestion('What should I do now?')} className="text-sm px-3 py-1 bg-emerald-100 rounded">{langStrings.quickAdvice || 'Quick advice'}</button>
            <button onClick={onClose} className="text-sm px-3 py-1 bg-gray-100 rounded">{langStrings.close || 'Close'}</button>
          </div>
        </div>
        <div ref={listRef} className="h-48 overflow-auto p-2 bg-slate-50 rounded mb-2">
          {messages.map((m, i) => (
            <div key={i} className={`mb-2 ${m.from === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`${m.from === 'user' ? 'inline-block bg-green-600 text-white' : 'inline-block bg-white text-slate-800'} px-3 py-2 rounded-lg inline-flex items-center gap-2`}>
                <span>{m.text}</span>
                {m.from === 'bot' && (
                  <div className="flex gap-1">
                    <button onClick={() => speak && speak(m.text)} className="text-xs px-2 py-1 bg-blue-100 rounded">{langStrings.speak || 'Speak'}</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={onSend} className="flex gap-2 items-center">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder={langStrings.askPlaceholder || 'Ask: why, what to do, spray time...'} className="flex-1 p-2 border rounded" />
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 rounded">{langStrings.send || 'Send'}</button>
          <button type="button" onClick={exportMessages} className="bg-gray-200 text-gray-800 px-3 py-1 rounded">{langStrings.export || 'Export'}</button>
        </form>
      </div>
    </div>
  )
}

function exportMessagesAsJSON(messages, userId) {
  const data = { userId, messages }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cropdoctor-chat-${userId || 'unknown'}.json`
  a.click()
  URL.revokeObjectURL(url)
}
