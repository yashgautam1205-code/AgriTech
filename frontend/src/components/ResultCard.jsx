import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { translateDynamicTexts } from '../translationService'

function SeverityPill({ severity, isDark }) {
  const map = {
    low: isDark ? 'bg-emerald-800 text-emerald-100' : 'bg-green-200 text-green-800',
    medium: isDark ? 'bg-amber-800 text-amber-100' : 'bg-yellow-200 text-yellow-800',
    high: isDark ? 'bg-rose-800 text-rose-100' : 'bg-red-200 text-red-800'
  }
  return <span className={`px-3 py-1 rounded-full text-sm ${map[severity] || map.low}`}>{severity}</span>
}

export default function ResultCard({ result: sourceResult, langStrings, onSpeak, onChat, onOpenMap, isDark, lang = 'en' }) {
  const [priceLocation, setPriceLocation] = useState({ state: '', district: '', town: '' })
  const [priceListings, setPriceListings] = useState([])
  const [priceMessage, setPriceMessage] = useState('')
  const [pricesLoading, setPricesLoading] = useState(false)
  const [localizedResult, setLocalizedResult] = useState(null)

  useEffect(() => {
    setPriceListings(sourceResult?.pesticidePrices || [])
    setPriceMessage(sourceResult?.pesticidePriceMessage || '')
  }, [sourceResult?.scanId])

  useEffect(() => {
    let active = true
    async function localize() {
      setLocalizedResult(null)
      if (!sourceResult) return
      const sourceLanguage = sourceResult.contentLanguage || sourceResult.lang || 'en'
      const classMetadataKeys = ['cropName', 'diseaseName'].filter(key =>
        typeof sourceResult.classMetadata?.[key] === 'string' &&
        sourceResult.classMetadata[key].trim()
      )
      if (lang === sourceLanguage && (lang === 'en' || classMetadataKeys.length === 0)) return

      const localized = JSON.parse(JSON.stringify(sourceResult))
      const fields = []
      const scientificName = typeof localized.diseaseInfo?.scientificName === 'string'
        ? localized.diseaseInfo.scientificName
        : ''
      const scientificNameMarker = scientificName ? 'AGRIKEEPPRESERVEFIELD0TOKEN' : ''
      const protectScientificName = value => scientificName
        ? value.split(scientificName).join(scientificNameMarker)
        : value
      const addField = (object, key) => {
        if (typeof object?.[key] === 'string' && object[key].trim()) {
          fields.push([object, key, protectScientificName(object[key])])
        }
      }
      const addArray = (object, key) => {
        if (Array.isArray(object?.[key])) {
          object[key].forEach((value, index) => {
            if (typeof value === 'string' && value.trim()) {
              fields.push([object[key], index, protectScientificName(value)])
            }
          })
        }
      }

      addArray(localized, 'treatments')
      addArray(localized, 'affordableAlternatives')
      addField(localized, 'disease')
      addField(localized, 'possibleDiseaseName')
      addField(localized, 'pesticidePriceMessage')
      const diseaseInfo = localized.diseaseInfo
      for (const key of ['description', 'guidanceDisclaimer', 'message']) addField(diseaseInfo, key)
      for (const key of ['causes', 'symptoms', 'developmentConditions', 'spreadInformation', 'preventiveMeasures', 'followUp']) {
        addArray(diseaseInfo, key)
      }
      diseaseInfo?.references?.forEach(reference => addField(reference, 'title'))
      const riskAssessment = localized.riskAssessment
      for (const key of ['risk_reason', 'recommended_action']) addField(riskAssessment, key)
      addArray(riskAssessment, 'assessment_limitations')
      addField(localized.cropSelection, 'explanation')
      const organic = localized.organicTreatments
      addField(organic, 'message')
      organic?.recommendations?.forEach(item => {
        for (const key of ['name', 'category', 'description', 'application_guidance', 'safety_information', 'limitations', 'use_restriction']) {
          addField(item, key)
        }
        addArray(item, 'prevention_practices')
      })
      const chemical = localized.chemicalRecommendations
      addField(chemical, 'message')
      chemical?.recommendations?.forEach(product => {
        for (const key of ['use_restriction', 'safety_information', 'registration_information', 'approved_label_information', 'application_dosage', 'pre_harvest_interval', 're_entry_interval']) {
          addField(product, key)
        }
      })
      localized.pesticidePrices?.forEach(listing => {
        addField(listing, 'price_type')
        addField(listing, 'stale_reason')
      })
      const weather = localized.weatherForecast
      addField(weather, 'summary')
      weather?.forecast?.forEach(item => {
        addField(item, 'condition')
        addField(item, 'advice')
      })

      const [translated, localizedClassNames] = await Promise.all([
        translateDynamicTexts(
          fields.map(([, , value]) => value),
          lang,
          sourceLanguage
        ),
        translateDynamicTexts(
          classMetadataKeys.map(key => localized.classMetadata[key]),
          lang,
          'en'
        )
      ])
      if (!active) return
      fields.forEach(([object, key], index) => {
        const value = translated[index]
        object[key] = typeof value === 'string' && scientificNameMarker
          ? value.split(scientificNameMarker).join(scientificName)
          : value
      })
      classMetadataKeys.forEach((key, index) => {
        localized.classMetadata[key] = localizedClassNames[index] || localized.classMetadata[key]
      })
      setLocalizedResult(localized)
    }
    localize()
    return () => { active = false }
  }, [sourceResult?.scanId, sourceResult?.contentLanguage, sourceResult?.lang, lang])

  useEffect(() => {
    if (!sourceResult) return
    const localized = localizedResult || sourceResult
    setPriceListings(localized.pesticidePrices || [])
    setPriceMessage(localized.pesticidePriceMessage || '')
  }, [sourceResult?.scanId, localizedResult])

  if (!sourceResult) {
    return <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600" role="status" data-testid="results-empty-state">{langStrings.noScanYet}</p>
  }
  const result = localizedResult || sourceResult
  const chemicalProducts = result.chemicalRecommendations?.recommendations || []
  const isUncertain = result.detectionStatus === 'uncertain' ||
    (result.predictionStatus && result.predictionStatus !== 'CONFIRMED_BY_MODEL') ||
    result.classMappingStatus === 'NOT_AVAILABLE' ||
    result.riskAssessment?.is_uncertain === true
  const isDiseaseAdviceRestricted = isUncertain ||
    result.cropSelection?.disease_specific_recommendations_allowed === false
  const possibleDiseaseName = result.possibleDiseaseName || result.topPrediction?.replace('___', ' — ').replace(/_/g, ' ')

  async function loadPrices(event) {
    event.preventDefault()
    setPricesLoading(true)
    setPriceMessage('')
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || ''
      const response = await axios.get(`${API_BASE}/api/pesticide-prices`, {
        params: {
          state: priceLocation.state,
          district: priceLocation.district,
          town: priceLocation.town
        },
        timeout: 10000
      })
      const suitableIds = new Set(chemicalProducts.map(product => product.product_id))
      const listings = (response.data.listings || []).filter(listing => suitableIds.has(listing.product_id))
      const sourceLanguage = 'en'
      const values = listings.flatMap(listing => [listing.price_type || '', listing.stale_reason || ''])
      const translated = await translateDynamicTexts(values, lang, sourceLanguage)
      setPriceListings(listings.map((listing, index) => ({
        ...listing,
        price_type: translated[index * 2],
        stale_reason: translated[index * 2 + 1] || null
      })))
      const message = response.data.message || ''
      setPriceMessage(message
        ? (await translateDynamicTexts([message], lang, sourceLanguage))[0]
        : '')
    } catch (error) {
      setPriceListings([])
      setPriceMessage(langStrings.priceLoadError)
    } finally {
      setPricesLoading(false)
    }
  }

  return (
    <div className={`${isDark ? 'bg-slate-900 border border-slate-700 text-slate-100' : 'bg-white'} p-4 rounded-lg shadow space-y-3`}>
      {result.previewUrl && (
        <div className="w-full h-48 overflow-hidden rounded-lg">
          <img src={result.previewUrl} alt="Scanned leaf image" className="w-full h-full object-contain" />
        </div>
      )}
      {isUncertain && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 font-semibold text-amber-900" role="status" data-testid="prediction-status">
          {result.classMetadata?.condition === 'healthy'
            ? langStrings.uncertainHealthyMatch
            : langStrings.uncertainMatch}{' '}{possibleDiseaseName}
        </p>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">{isUncertain ? possibleDiseaseName : result.disease}</h3>
        {result.confidence != null && (
          <div className="text-right">
            <span className="block rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800">
              {langStrings.rawModelScore}: {(result.confidence * 100).toFixed(1)}%
            </span>
            {result.calibratedConfidence != null && (
              <span className="mt-1 block text-xs text-slate-600">
                {langStrings.calibratedScore}: {(result.calibratedConfidence * 100).toFixed(1)}%
              </span>
            )}
          </div>
        )}
        {result.severity && result.severity !== 'unassessed' && <SeverityPill severity={result.severity} isDark={isDark} />}
      </div>
      {result.classMetadata?.condition && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="prediction-details">
          <p><strong>{langStrings.crop}:</strong> {result.classMetadata.cropName}</p>
          <p><strong>{langStrings.diseaseLabel}:</strong> {result.classMetadata.diseaseName}</p>
          <p data-testid="classification-status">
            <strong>{langStrings.classificationLabel}:</strong>{' '}
            {isUncertain
              ? result.classMetadata.condition === 'healthy'
                ? langStrings.uncertainHealthyMatch
                : langStrings.uncertainMatch
              : result.classMetadata.condition === 'healthy'
              ? langStrings.healthyClassLabel
              : langStrings.diseasedClassLabel}
          </p>
        </div>
      )}
      {result.calibrationStatus === 'applied' && (
        <p className="text-xs text-slate-600">
          {langStrings.calibrationDisclaimer}
        </p>
      )}
      {result.cropSelection && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            ['mismatch', 'unsupported_crop'].includes(result.cropSelection.status)
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-slate-200 bg-slate-50 text-slate-800'
          }`}
          role={['mismatch', 'unsupported_crop'].includes(result.cropSelection.status) ? 'alert' : 'status'}
          data-testid="crop-compatibility"
        >
          <strong>{langStrings.cropCompatibility}: {result.cropSelection.status.replace(/_/g, ' ')}</strong>
          <p className="mt-1">{result.cropSelection.explanation}</p>
          {!isUncertain && !result.cropSelection.disease_specific_recommendations_allowed && (
            <p className="mt-1 font-medium">{langStrings.blockedTreatment}</p>
          )}
        </div>
      )}
      {isUncertain ? (
        <section
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          role="status"
          data-testid="disease-risk"
        >
          <h4 className="font-semibold">{langStrings.diseaseRiskTitle}: {langStrings.riskUnassessed}</h4>
          <p className="mt-1">{langStrings.riskNotInferred}</p>
          {result.riskAssessment?.farmer_observations && (
            <div className="mt-2 rounded border border-amber-200 bg-white/70 p-2 text-xs" data-testid="farmer-observations">
              <strong>{langStrings.farmerObservations}</strong>
              <p>
              {langStrings.farmerObservations} {langStrings.spread} {result.riskAssessment.farmer_observations.symptomsSpreading}; {langStrings.affectedPlantsLabel} {result.riskAssessment.farmer_observations.affectedPlants}; {langStrings.symptoms} {(result.riskAssessment.farmer_observations.visibleSymptoms || []).join(', ') || langStrings.notSelected}.
              </p>
            </div>
          )}
          <p className="mt-2 font-medium">
            {langStrings.nextStep}: {langStrings.retakePhotoAdvice}
          </p>
        </section>
      ) : result.riskAssessment && (
        <section
          className={`rounded-lg border p-3 ${
            result.riskAssessment.risk_level === 'HIGH'
              ? 'border-red-300 bg-red-50 text-red-900'
              : result.riskAssessment.risk_level === 'MEDIUM'
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : result.riskAssessment.risk_level === 'LOW'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-slate-300 bg-slate-50 text-slate-800'
          }`}
          data-testid="disease-risk"
        >
          <h4 className="font-semibold">{langStrings.diseaseRiskTitle}: {result.riskAssessment.risk_level}</h4>
          <p className="mt-1 text-sm">{result.riskAssessment.risk_reason}</p>
          <p className="mt-1 text-sm font-medium">{langStrings.nextStep}: {result.riskAssessment.recommended_action}</p>
          {result.riskAssessment.farmer_observations && (
            <p className="mt-1 text-xs">
              {langStrings.farmerObservations} {langStrings.spread} {result.riskAssessment.farmer_observations.symptomsSpreading}; {langStrings.affectedPlantsLabel} {result.riskAssessment.farmer_observations.affectedPlants}; {langStrings.symptoms} {(result.riskAssessment.farmer_observations.visibleSymptoms || []).join(', ') || langStrings.notSelected}.
            </p>
          )}
          <ul className="mt-2 list-disc pl-5 text-xs">
            {(result.riskAssessment.assessment_limitations || []).map((limitation, index) => <li key={index}>{limitation}</li>)}
          </ul>
        </section>
      )}
      <section className="space-y-2 rounded-xl border border-slate-200 p-3" data-testid="disease-information">
        <h4 className="font-semibold">
          {isUncertain ? langStrings.possibleDiseaseInfoTitle : langStrings.diseaseInformationTitle}
        </h4>
        <p className="text-xs font-medium">{langStrings.infoStatus}: {result.diseaseInfo?.status || 'NOT_AVAILABLE'}</p>
        {result.diseaseInfo?.sourceStatus === 'SOURCE_UNAVAILABLE' && (
          <p className="text-sm">{result.diseaseInfo.message || langStrings.sourceUnavailableMessage}</p>
        )}
        {result.diseaseInfo?.description ? (
          <>
            <p>{result.diseaseInfo.description}</p>
            {result.diseaseInfo.scientificName && <p><strong>{langStrings.associatedPathogen}:</strong> {result.diseaseInfo.scientificName}</p>}
            {(result.diseaseInfo.causes || []).length > 0 && (
              <div>
                <h5 className="font-medium">{langStrings.reportedCauses}</h5>
                <ul className="ml-5 list-disc">{result.diseaseInfo.causes.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </div>
            )}
            <div>
              <h5 className="font-medium">{langStrings.reportedSymptoms}</h5>
              <ul className="ml-5 list-disc">{(result.diseaseInfo.symptoms || []).map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
            <div>
              <h5 className="font-medium">{langStrings.developmentConditions}</h5>
              <ul className="ml-5 list-disc">{(result.diseaseInfo.developmentConditions || []).map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
            {(result.diseaseInfo.spreadInformation || []).length > 0 && (
              <div>
                <h5 className="font-medium">{langStrings.spreadInformationTitle}</h5>
                <ul className="ml-5 list-disc">{result.diseaseInfo.spreadInformation.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </div>
            )}
            <p className="text-xs text-slate-600">{result.diseaseInfo.guidanceDisclaimer}</p>
            {result.diseaseInfo.lastReviewedAt && (
              <p className="text-xs text-slate-600">
                {langStrings.reviewedOn}: <time dateTime={result.diseaseInfo.lastReviewedAt}>{result.diseaseInfo.lastReviewedAt}</time>
              </p>
            )}
          </>
        ) : <p className="text-sm">{result.diseaseInfo?.message || langStrings.diseaseRecordUnavailable}</p>}
        <div className="flex flex-wrap gap-3 text-sm">
          {(result.diseaseInfo?.references || []).map(reference => (
            <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
              {reference.title}
            </a>
          ))}
        </div>
      </section>
      <section className="space-y-2 rounded-xl border border-slate-200 p-3" data-testid="organic-treatments">
        <h4 className="font-semibold">
          {isUncertain
            ? langStrings.educationalGuidanceTitle
            : langStrings.generalManagementTitle}
        </h4>
        <p className="text-xs font-medium">{langStrings.infoStatus}: {result.organicTreatments?.status || 'NOT_AVAILABLE'}</p>
        {(result.organicTreatments?.recommendations || []).length === 0 ? (
          <p className="text-sm">{result.organicTreatments?.message || langStrings.managementRecordUnavailable}</p>
        ) : (
          result.organicTreatments.recommendations.map((item, index) => (
            <article key={`${item.name}-${index}`} className="rounded border border-slate-200 p-3 text-sm">
              <h5 className="font-medium">{item.name}</h5>
              <p><strong>{langStrings.guidanceType}:</strong> {item.guidance_scope === 'possible_disease_educational' ? langStrings.possibleDiseaseGuidance : langStrings.sourceBackedGuidance}</p>
              <p><strong>{langStrings.category}:</strong> {item.category}</p>
              <p className="mt-1">{item.description}</p>
              <p className="mt-1"><strong>{langStrings.generalManagement}:</strong> {item.application_guidance}</p>
              <ul className="ml-5 list-disc">{(item.prevention_practices || []).map((practice, practiceIndex) => <li key={practiceIndex}>{practice}</li>)}</ul>
              <p className="mt-1"><strong>{langStrings.useRestriction}:</strong> {isDiseaseAdviceRestricted || !item.application_allowed ? langStrings.educationalOnly : langStrings.noApplicationAdvice}</p>
              <p className="mt-1"><strong>{langStrings.safety}:</strong> {item.safety_information}</p>
              <p className="mt-1"><strong>{langStrings.limitations}:</strong> {item.limitations}</p>
              <a className="mt-1 inline-block text-blue-700 underline" href={item.source_url} target="_blank" rel="noreferrer">{item.source_name}</a>
              {item.last_reviewed_at && (
                <p className="text-xs text-slate-600">
                  {langStrings.reviewedOn}: <time dateTime={item.last_reviewed_at}>{item.last_reviewed_at}</time>
                </p>
              )}
            </article>
          ))
        )}
      </section>
      <section className="space-y-2 rounded-xl border border-slate-200 p-3" data-testid="chemical-recommendations">
        <h4 className="font-semibold">{langStrings.verifiedPesticideTitle}</h4>
        <p className="text-xs font-medium">{langStrings.infoStatus}: {result.chemicalRecommendations?.status || 'NOT_AVAILABLE'}</p>
        {(isDiseaseAdviceRestricted || result.chemicalRecommendations?.status === 'RESTRICTED') && (
          <p className="rounded bg-amber-50 p-2 text-sm font-medium text-amber-900">
            {chemicalProducts[0]?.use_restriction || result.chemicalRecommendations?.message || langStrings.uncertainPesticideRestriction}
          </p>
        )}
        {chemicalProducts.length === 0 ? (
          <p className="text-sm">{result.chemicalRecommendations?.message || langStrings.pesticideRecordUnavailable}</p>
        ) : chemicalProducts.map(product => (
          <article key={product.product_id} className="rounded border border-slate-200 p-3 text-sm">
            <h5 className="font-medium">{product.brand_name}</h5>
            <p>{product.active_ingredient} · {product.formulation} {product.concentration || ''}</p>
            <p>{langStrings.forCrop} {product.target_crop} / {product.target_disease}</p>
            <p>{langStrings.registration}: {product.registration_information}</p>
            <p>{langStrings.approvedLabel}: {product.approved_label_information}</p>
            {!isDiseaseAdviceRestricted && product.application_dosage && <p>{langStrings.labelGuidance}: {product.application_dosage}</p>}
            {!isDiseaseAdviceRestricted && <p>{langStrings.preHarvestInterval}: {product.pre_harvest_interval || langStrings.missing}</p>}
            {!isDiseaseAdviceRestricted && <p>{langStrings.reEntryInterval}: {product.re_entry_interval || langStrings.missing}</p>}
            <p>{langStrings.safety}: {product.safety_information}</p>
            <div className="flex gap-3">
              <a href={product.registration_source_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{langStrings.registrationSource}</a>
              <a href={product.label_source_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{langStrings.approvedLabelLink}</a>
            </div>
          </article>
        ))}
      </section>
      <section className="space-y-3 rounded-xl border border-slate-200 p-3" data-testid="pesticide-prices">
        <h4 className="font-semibold">{langStrings.priceInformation}</h4>
        <p className="text-xs font-medium">{langStrings.infoStatus}: {result.pesticidePriceStatus || (result.pesticidePrices?.length ? 'AVAILABLE' : 'NOT_AVAILABLE')}</p>
        {(isUncertain || result.pesticidePrices?.length > 0) && (
          <p className="text-sm">{langStrings.priceReferenceOnly}</p>
        )}
        {(result.pesticidePrices || []).length === 0 && (
          <p className="text-sm">{result.pesticidePriceMessage || langStrings.priceRecordUnavailable}</p>
        )}
        {chemicalProducts.length > 0 && (
          <form onSubmit={loadPrices} className="grid gap-2 sm:grid-cols-4">
              {['state', 'district', 'town'].map(field => (
                <label key={field} className="text-sm capitalize">
                  {langStrings[`${field}Label`]}
                  <input
                    required
                    value={priceLocation[field]}
                    onChange={event => setPriceLocation(current => ({ ...current, [field]: event.target.value }))}
                    className="block w-full rounded border p-2"
                    maxLength={100}
                  />
                </label>
              ))}
              <button type="submit" disabled={pricesLoading} className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-50">
                {pricesLoading ? langStrings.loadingPrice : langStrings.comparePricesButton}
              </button>
          </form>
        )}
          {priceListings.length > 0 && (
            <p className="text-sm">{result.pesticidePriceMessage}</p>
          )}
          {priceListings.length > 0 && (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr><th>{langStrings.product}</th><th>{langStrings.pack}</th><th>{langStrings.seller}</th><th>{langStrings.location}</th><th>{langStrings.price}</th><th>{langStrings.priceType}</th><th>{langStrings.availability}</th><th>{langStrings.updated}</th><th>{langStrings.source}</th></tr></thead>
                  <tbody>
                    {priceListings.map(listing => (
                      <tr key={listing.id} className="border-t">
                        <td>{listing.brand_name}</td>
                        <td>{listing.pack_size.value} {listing.pack_size.unit}</td>
                        <td>{listing.seller}</td>
                        <td>{listing.location.town}, {listing.location.district}, {listing.location.state}</td>
                        <td>{listing.price ? `₹${listing.price.amount}` : langStrings.unavailable}</td>
                        <td>{listing.price_type}{listing.source_type === 'administrator' ? ` ${langStrings.manuallyMaintained}` : ''}</td>
                        <td>{listing.availability_status}</td>
                        <td>{new Date(listing.last_updated_at).toLocaleString()}</td>
                        <td><a href={listing.source_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{langStrings.source}</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          )}
          {priceListings.length === 0 && result.pesticidePrices?.length > 0 && (
            <p className="text-sm">{priceMessage || langStrings.noPriceRecord}</p>
          )}
      </section>
      <section className="space-y-3 rounded-xl border border-slate-200 p-3" data-testid="prevention-follow-up">
        <h4 className="font-semibold">{isUncertain ? langStrings.educationalPreventionFollowUpTitle : langStrings.preventionFollowUpTitle}</h4>
        <p className="text-xs font-medium">{langStrings.infoStatus}: {result.diseaseInfo?.status || 'NOT_AVAILABLE'}</p>
        {result.diseaseInfo?.description ? (
          <>
            <p>{result.diseaseInfo.description}</p>
            <div>
              <h5 className="font-medium">{langStrings.preventionMonitoring}</h5>
              <ul className="list-disc ml-5">
                {(result.diseaseInfo.preventiveMeasures || []).map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </div>
            {(result.diseaseInfo.followUp || []).length > 0 && (
              <div>
                <h5 className="font-medium">{langStrings.followUp}</h5>
                <ul className="list-disc ml-5">{result.diseaseInfo.followUp.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm">{result.diseaseInfo?.message || langStrings.preventionRecordUnavailable}</p>
            {(result.diseaseInfo?.followUp || []).length > 0 && (
              <div>
                <h5 className="font-medium">{langStrings.followUp}</h5>
                <ul className="list-disc ml-5">{result.diseaseInfo.followUp.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          {(result.diseaseInfo?.references || []).map(reference => (
            <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{reference.title}</a>
          ))}
        </div>
        {isUncertain && <p className="text-sm font-medium">{langStrings.seekLocalConfirmation}</p>}
      </section>
      <div className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'} p-3 rounded-lg border`} data-testid="weather-forecast">
          <h4 className="font-semibold">{langStrings.weatherForecastLabel}:</h4>
          <p className="text-xs font-medium">{langStrings.infoStatus}: {result.weatherForecast?.informationStatus || (result.weatherForecast?.status === 'available' ? 'AVAILABLE' : 'NOT_AVAILABLE')}</p>
          <p className={`${isDark ? 'text-slate-200' : 'text-gray-700'} text-sm mb-2`}>{result.weatherForecast?.summary || langStrings.weatherUnavailable}</p>
          <p className="text-xs text-slate-500">
            {langStrings.source}: {result.weatherForecast?.source || langStrings.unavailable}
            {result.weatherForecast?.timezone ? ` · ${langStrings.forecastTimezone}: ${result.weatherForecast.timezone}` : ''}
            {result.weatherForecast?.fetchedAt ? ` · ${langStrings.updated} ${new Date(result.weatherForecast.fetchedAt).toLocaleString()}` : ''}
          </p>
          <div className="space-y-2">
            {(Array.isArray(result.weatherForecast?.forecast) ? result.weatherForecast.forecast : []).map((item, i) => (
              <div key={i} className={`${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} rounded-xl p-3 border`}>
                <div className={`flex justify-between text-sm font-semibold ${isDark ? 'text-slate-100' : ''}`}>
                  <span>{item.day || langStrings.day}</span>
                  <span>{item.condition || langStrings.unavailable}</span>
                </div>
                <div className={`text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{item.tempMin != null ? `${item.tempMin}°C` : langStrings.unavailable} - {item.tempMax != null ? `${item.tempMax}°C` : langStrings.unavailable}</div>
                <div className={`text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{langStrings.rainfall}: {item.precipitationMm != null ? `${item.precipitationMm} mm` : langStrings.unavailable}</div>
                <div className={`text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'} mt-1`}>{item.advice || langStrings.noAdvice}</div>
              </div>
            ))}
          </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSpeak && onSpeak(result)} className="flex-1 bg-blue-600 text-white py-2 rounded" data-testid="speak-button">{langStrings.speak}</button>
        <button onClick={() => onChat && onChat(result)} className={`${isDark ? 'bg-emerald-700 text-white' : 'bg-green-600 text-white'} flex-1 py-2 rounded`} data-testid="chat-button">{langStrings.chatWithDoctor}</button>
        <button onClick={() => onOpenMap && onOpenMap()} className={`${isDark ? 'bg-slate-700 text-slate-100' : 'bg-gray-200 text-gray-800'} flex-1 py-2 rounded`} data-testid="stores-button">{langStrings.pesticideStores}</button>
      </div>
    </div>
  )
}
