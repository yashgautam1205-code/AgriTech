import React, { useState, useEffect } from 'react'
import axios from 'axios'

export default function UserHistory({ userId, onClose, langStrings }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const API_BASE = import.meta.env.VITE_API_BASE || ''

  useEffect(() => {
    const uid = userId || 'anonymous'
    setLoading(true)
    axios.get(`${API_BASE}/api/assistant/history/user/${encodeURIComponent(uid)}`)
      .then(res => setItems(res.data || []))
      .catch(err => {
        console.error('load history failed', err)
        setItems([])
      })
      .finally(() => setLoading(false))
  }, [userId])

  function exportAll() {
    const blob = new Blob([JSON.stringify({ userId, items }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cropdoctor-user-history-${userId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4">
      <div className="bg-white p-4 rounded shadow max-w-lg w-full">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold">{langStrings.userHistoryTitle || 'Your chat history'}</h3>
          <div className="flex gap-2">
            <button onClick={exportAll} className="px-3 py-1 bg-gray-200 rounded">{langStrings.export || 'Export'}</button>
            <button onClick={onClose} className="px-3 py-1 bg-gray-100 rounded">{langStrings.close || 'Close'}</button>
          </div>
        </div>
        <div className="h-64 overflow-auto">
          {loading && <div>Loading...</div>}
          {!loading && items.length === 0 && <div>{langStrings.noHistory || 'No history found'}</div>}
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="p-2 border rounded">
                <div className="text-sm text-gray-600">{it.createdAt} — {it.scanId || 'scan'}</div>
                <div className="mt-1">{it.from}: {it.text}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
