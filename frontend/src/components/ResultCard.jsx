import React from 'react'

function SeverityPill({ severity, isDark }) {
  const map = {
    low: isDark ? 'bg-emerald-800 text-emerald-100' : 'bg-green-200 text-green-800',
    medium: isDark ? 'bg-amber-800 text-amber-100' : 'bg-yellow-200 text-yellow-800',
    high: isDark ? 'bg-rose-800 text-rose-100' : 'bg-red-200 text-red-800'
  }
  return <span className={`px-3 py-1 rounded-full text-sm ${map[severity] || map.low}`}>{severity}</span>
}

export default function ResultCard({ result, langStrings, onSpeak, onChat, onOpenMap, isDark }) {
  if (!result) return null
  return (
    <div className={`${isDark ? 'bg-slate-900 border border-slate-700 text-slate-100' : 'bg-white'} p-4 rounded-lg shadow space-y-3`}>
      {result.previewUrl && (
        <div className="w-full h-48 overflow-hidden rounded-lg">
          <img src={result.previewUrl} alt="preview" className="w-full h-full object-contain" />
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">{result.disease}</h3>
        <SeverityPill severity={result.severity} isDark={isDark} />
      </div>
      <div>
        <h4 className="font-semibold">{langStrings.treatments}:</h4>
        <ul className={`list-disc ml-5 ${isDark ? 'text-slate-200' : ''}`}>
          {result.treatments.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="font-semibold">{langStrings.organicLabel}:</h4>
        <div className="flex gap-2 flex-wrap">
          {(result.pesticides?.organic || []).map((p, i) => (
            <div key={i} className={`${isDark ? 'bg-emerald-900 text-emerald-100' : 'bg-green-100'} px-3 py-1 rounded`}>{p}</div>
          ))}
        </div>
      </div>
      <div>
        <h4 className="font-semibold">{langStrings.chemicalLabel}:</h4>
        <div className="flex gap-2 flex-wrap">
          {(result.pesticides?.chemical || []).map((p, i) => {
            const name = typeof p === 'string' ? p : p.name
            const cost = typeof p === 'object' && p.cost ? `₹${p.cost}` : null
            return (
              <div key={i} className={`${isDark ? 'bg-rose-900 text-rose-100' : 'bg-red-100'} px-3 py-1 rounded`}> 
                <div className="font-medium">{name}</div>
                {cost && <div className="text-sm opacity-80">{langStrings.costLabel || 'Cost'}: {cost}</div>}
              </div>
            )
          })}
        </div>
      </div>
      {result.affordableAlternatives && result.affordableAlternatives.length > 0 && (
        <div>
          <h4 className="font-semibold">{langStrings.affordableAlternativesLabel}:</h4>
          <ul className={`list-disc ml-5 ${isDark ? 'text-slate-200' : ''}`}>
            {result.affordableAlternatives.map((alt, i) => {
              const aname = typeof alt === 'string' ? alt : alt.name
              const acost = typeof alt === 'object' && alt.costEstimate != null ? `${langStrings.costLabel || 'Cost'}: ₹${alt.costEstimate}` : null
              return (
                <li key={i}>
                  <div>{aname}{acost ? ` — ${acost}` : ''}</div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {result.weatherForecast && (
        <div className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'} p-3 rounded-lg border`}>
          <h4 className="font-semibold">{langStrings.weatherForecastLabel}:</h4>
          <p className={`${isDark ? 'text-slate-200' : 'text-gray-700'} text-sm mb-2`}>{result.weatherForecast.summary || 'Weather information is not available right now.'}</p>
          <div className="space-y-2">
            {(Array.isArray(result.weatherForecast.forecast) ? result.weatherForecast.forecast : []).map((item, i) => (
              <div key={i} className={`${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} rounded-xl p-3 border`}>
                <div className={`flex justify-between text-sm font-semibold ${isDark ? 'text-slate-100' : ''}`}>
                  <span>{item.day || 'Day'}</span>
                  <span>{item.condition || 'Unknown'}</span>
                </div>
                <div className={`text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{item.tempMin != null ? `${item.tempMin}°C` : 'N/A'} - {item.tempMax != null ? `${item.tempMax}°C` : 'N/A'}</div>
                <div className={`text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'} mt-1`}>{item.advice || 'No advice available.'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => onSpeak && onSpeak(result)} className="flex-1 bg-blue-600 text-white py-2 rounded" data-testid="speak-button">{langStrings.speak}</button>
        <button onClick={() => onChat && onChat(result)} className={`${isDark ? 'bg-emerald-700 text-white' : 'bg-green-600 text-white'} flex-1 py-2 rounded`} data-testid="chat-button">{langStrings.chatWithDoctor || 'Ask crop doctor'}</button>
        <button onClick={() => onOpenMap && onOpenMap()} className={`${isDark ? 'bg-slate-700 text-slate-100' : 'bg-gray-200 text-gray-800'} flex-1 py-2 rounded`} data-testid="stores-button">{langStrings.pesticideStores}</button>
      </div>
    </div>
  )
}
