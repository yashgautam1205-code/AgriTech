import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { translateDynamicText } from '../translationService'

export default function AssistantChat({ result, coords, onClose, langStrings, speak, userId, lang }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [autoDetectLanguage, setAutoDetectLanguage] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const listRef = useRef()
  const recorderRef = useRef(null)
  const audioStreamRef = useRef(null)
  const recordingTimerRef = useRef(null)

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

  useEffect(() => () => {
    if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    audioStreamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

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
      const answer = data.answer || JSON.stringify(data)
      const translatedAnswer = await translateDynamicText(answer, lang || 'en')
      const botMsg = { from: 'bot', text: translatedAnswer }
      setMessages(m => [...m, botMsg])
    } catch (err) {
      console.error('assistant error', err)
      setMessages(m => [...m, { from: 'bot', text: langStrings.assistantError }])
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

  function startBrowserVoiceInput() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setVoiceError(langStrings.speechRecognitionUnavailable)
      return
    }
    const recognition = new Recognition()
    recognition.lang = autoDetectLanguage ? '' : ({
      en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN', ta: 'ta-IN', te: 'te-IN',
      ml: 'ml-IN', mr: 'mr-IN', bn: 'bn-IN', gu: 'gu-IN', pa: 'pa-IN'
    }[lang] || 'en-IN')
    recognition.interimResults = false
    recognition.onstart = () => setRecording(true)
    recognition.onend = () => setRecording(false)
    recognition.onerror = () => {
      setRecording(false)
      setVoiceError(langStrings.speechInputFailed)
    }
    recognition.onresult = event => {
      const transcript = event.results?.[0]?.[0]?.transcript
      if (transcript) {
        setInput(transcript)
        setVoiceError('')
      }
    }
    recognition.start()
  }

  async function startVoiceInput() {
    setVoiceError('')
    if (recorderRef.current?.state === 'recording') {
      window.clearTimeout(recordingTimerRef.current)
      recorderRef.current.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      startBrowserVoiceInput()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = stream
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find(type => window.MediaRecorder.isTypeSupported(type))
      const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      recorderRef.current = recorder
      recorder.ondataavailable = event => {
        if (event.data?.size) chunks.push(event.data)
      }
      recorder.onerror = () => {
        setRecording(false)
        setVoiceError(langStrings.speechInputFailed)
        stream.getTracks().forEach(track => track.stop())
      }
      recorder.onstop = async () => {
        setRecording(false)
        stream.getTracks().forEach(track => track.stop())
        audioStreamRef.current = null
        if (!chunks.length) return

        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const formData = new FormData()
        const extension = audio.type.includes('ogg') ? 'ogg' : audio.type.includes('mp4') ? 'mp4' : 'webm'
        formData.append('audio', audio, `question.${extension}`)
        formData.append('language', lang || 'en')
        formData.append('autoDetect', String(autoDetectLanguage))
        setLoading(true)
        try {
          const response = await axios.post(`${API_BASE}/api/speech/transcribe`, formData, {
            timeout: 35000
          })
          if (response.data?.transcript) {
            setInput(response.data.transcript)
          } else {
            setVoiceError(langStrings.speechInputFailed)
          }
        } catch (error) {
          console.warn('Sarvam speech recognition failed:', error.response?.status || error.message)
          startBrowserVoiceInput()
        } finally {
          setLoading(false)
        }
      }
      recorder.start()
      setRecording(true)
      recordingTimerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 28000)
    } catch (error) {
      console.warn('Microphone recording unavailable:', error.message)
      startBrowserVoiceInput()
    }
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
          <button type="button" onClick={startVoiceInput} disabled={loading} className="bg-rose-100 text-slate-900 px-3 py-2 rounded" aria-label={langStrings.askVoice}>
            {recording ? langStrings.stopRecording : langStrings.startRecording}
          </button>
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 rounded">{langStrings.send || 'Send'}</button>
          <button type="button" onClick={exportMessages} className="bg-gray-200 text-gray-800 px-3 py-1 rounded">{langStrings.export || 'Export'}</button>
        </form>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={autoDetectLanguage}
            onChange={event => setAutoDetectLanguage(event.target.checked)}
          />
          {langStrings.automaticLanguageDetection}
        </label>
        {voiceError && <p className="mt-1 text-xs text-rose-700" role="status">{voiceError}</p>}
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
