const { getDiseaseClassMetadata } = require('./diseaseClassRegistry');

const AFFECTED_PLANT_LEVELS = new Set(['less_10', '10_30', 'more_30', 'unsure']);
const SPREADING_VALUES = new Set(['yes', 'no', 'unsure']);
const VISIBLE_SYMPTOMS = new Set(['spots', 'yellowing', 'wilting', 'leaf_drying', 'mold', 'other']);

function validateObservations(value) {
  if (value == null || value === '') {
    return { observations: null };
  }

  let observations = value;
  if (typeof value === 'string') {
    try {
      observations = JSON.parse(value);
    } catch (error) {
      return { error: 'observations must be valid JSON' };
    }
  }

  if (!observations || typeof observations !== 'object' || Array.isArray(observations)) {
    return { error: 'observations must be an object' };
  }
  if (!SPREADING_VALUES.has(observations.symptomsSpreading)) {
    return { error: 'symptomsSpreading must be yes, no, or unsure' };
  }
  if (!AFFECTED_PLANT_LEVELS.has(observations.affectedPlants)) {
    return { error: 'affectedPlants must be less_10, 10_30, more_30, or unsure' };
  }
  if (!Array.isArray(observations.visibleSymptoms) ||
      observations.visibleSymptoms.some(symptom => !VISIBLE_SYMPTOMS.has(symptom))) {
    return { error: 'visibleSymptoms must contain supported symptom values' };
  }

  return {
    observations: {
      symptomsSpreading: observations.symptomsSpreading,
      affectedPlants: observations.affectedPlants,
      visibleSymptoms: [...new Set(observations.visibleSymptoms)]
    }
  };
}

function assessDiseaseRisk({
  predictedClass,
  confidence,
  calibratedConfidence,
  isUncertain,
  confidenceThreshold,
  observations
}) {
  const assessmentLimitations = [
    'This is a rule-based triage of farmer-reported observations, not a validated disease severity or outbreak model.',
    'No verified disease-specific risk/severity map is configured; LOW, MEDIUM, and HIGH reflect reported spread and affected-plant range only.',
    'Image classification confidence is not a calibrated probability of correctness and is separate from this risk level.',
    'PlantVillage classes represent controlled-background images; field performance and field diagnosis are unverified.'
  ];

  const base = {
    predicted_class: predictedClass || null,
    confidence: Number.isFinite(confidence) ? confidence : null,
    calibrated_confidence: Number.isFinite(calibratedConfidence) ? calibratedConfidence : null,
    confidence_threshold: Number.isFinite(confidenceThreshold) ? confidenceThreshold : null,
    is_uncertain: !predictedClass || !Number.isFinite(confidence) ||
      !Number.isFinite(confidenceThreshold) || isUncertain ||
      confidence < confidenceThreshold,
    risk_level: 'UNASSESSED',
    risk_reason: 'Disease risk cannot be assessed from the available information.',
    recommended_action: 'Seek local agricultural confirmation before applying a treatment.',
    assessment_limitations: assessmentLimitations,
    farmer_observations: observations || null
  };

  if (!predictedClass || !Number.isFinite(confidence) || !Number.isFinite(confidenceThreshold)) {
    return { ...base, risk_reason: 'A complete model prediction and confidence threshold are unavailable.' };
  }

  const classMetadata = getDiseaseClassMetadata(predictedClass);
  if (!classMetadata) {
    return {
      ...base,
      is_uncertain: true,
      risk_reason: 'The predicted class is not in the exact supported class registry; field risk remains unassessed.',
      recommended_action: 'Seek local agricultural confirmation. Do not select disease-specific treatments from an unmapped class.'
    };
  }

  if (isUncertain || confidence < confidenceThreshold) {
    return {
      ...base,
      risk_reason: 'The model confidence is below its configured threshold; the top class is not a confirmed diagnosis.',
      recommended_action: 'Rescan a clear leaf image and seek local agricultural confirmation. Do not select disease-specific pesticides from this result.'
    };
  }

  if (classMetadata.condition === 'healthy') {
    if (!observations) {
      return {
        ...base,
        is_uncertain: false,
        risk_reason: 'The image matched a healthy-labeled class, but farmer field observations were not provided; field risk remains unassessed.',
        recommended_action: 'Continue monitoring and seek local confirmation if symptoms are present.'
      };
    }
    const observationsConflictWithHealthyClass = observations && (
      observations.symptomsSpreading === 'yes' ||
      observations.affectedPlants === '10_30' ||
      observations.affectedPlants === 'more_30' ||
      observations.visibleSymptoms.length > 0
    );
    if (observationsConflictWithHealthyClass) {
      return {
        ...base,
        risk_reason: 'The model matched a healthy class, but farmer-reported symptoms or affected-plant levels conflict with that image result.',
        recommended_action: 'Do not rely on the image result alone. Seek local agricultural confirmation and monitor the affected plants.'
      };
    }
    return {
      ...base,
      is_uncertain: false,
      risk_level: 'LOW',
      risk_reason: 'The model confidently matched a healthy class; it did not detect a represented disease in this image.',
      recommended_action: 'Continue monitoring. A healthy-class prediction does not guarantee that the plant is disease-free.'
    };
  }

  if (!/^[A-Za-z0-9_,() -]+___[A-Za-z0-9_,() -]+$/.test(predictedClass)) {
    return { ...base, risk_reason: 'The predicted class is not in the supported crop/disease label format.' };
  }

  if (!observations || observations.symptomsSpreading === 'unsure' || observations.affectedPlants === 'unsure') {
    return {
      ...base,
      is_uncertain: false,
      risk_reason: 'The image class alone does not establish field risk; spreading and affected-plant observations are incomplete.',
      recommended_action: 'Record whether symptoms are spreading and the approximate affected-plant range, then seek local confirmation.'
    };
  }

  const widespread = observations.affectedPlants === 'more_30';
  const spreading = observations.symptomsSpreading === 'yes';
  const symptomNote = observations.visibleSymptoms.length
    ? ` Reported visible symptoms (not diagnostic): ${observations.visibleSymptoms.join(', ')}.`
    : '';
  let riskLevel = 'UNASSESSED';
  let riskReason = 'The reported observations do not support a clear triage category.';
  let recommendedAction = 'Monitor the affected area and seek local agricultural confirmation.';

  if (widespread && spreading) {
    riskLevel = 'HIGH';
    riskReason = `Farmer report: symptoms are spreading and more than 30% of plants are affected. This is an observation-based triage, not a confirmed disease-severity rating.${symptomNote}`;
    recommendedAction = 'Contact a local agricultural extension specialist promptly and avoid moving potentially affected plant material.';
  } else if (spreading || widespread || observations.affectedPlants === '10_30') {
    riskLevel = 'MEDIUM';
    riskReason = `Farmer report indicates spreading symptoms or at least 10% of plants affected. This is an observation-based triage, not a confirmed disease-severity rating.${symptomNote}`;
    recommendedAction = 'Seek local confirmation and monitor affected and nearby plants for changes.';
  } else if (observations.affectedPlants === 'less_10' && observations.symptomsSpreading === 'no') {
    riskLevel = 'LOW';
    riskReason = `Farmer report indicates fewer than 10% of plants are affected and symptoms are not spreading. This is an observation-based triage, not a confirmed disease-severity rating.${symptomNote}`;
    recommendedAction = 'Continue monitoring and seek confirmation if symptoms spread or worsen.';
  }

  return {
    ...base,
    is_uncertain: false,
    risk_level: riskLevel,
    risk_reason: riskReason,
    recommended_action: recommendedAction
  };
}

module.exports = { assessDiseaseRisk, validateObservations };
