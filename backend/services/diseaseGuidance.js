const { getDiseaseClassMetadata, getDiseaseClassRecords } = require('./diseaseClassRegistry');

const DATASET_REFERENCE = {
  title: 'PlantVillage dataset paper',
  url: 'https://doi.org/10.3389/fpls.2016.01419'
};

const APPLE_SCAB = {
  description: 'Apple scab is caused by Venturia inaequalis. Utah State University Extension describes olive-brown lesions on leaves and fruit; fruit lesions can become dry, cracked, and scabby.',
  scientificName: 'Venturia inaequalis',
  causes: ['The fungus overwinters in fallen infected leaves and releases spores in spring.'],
  symptoms: [
    'Velvety brown to olive-brown lesions can develop on leaves and fruit.',
    'Fruit lesions may enlarge and become dry, cracked, and scabby.'
  ],
  developmentConditions: [
    'Moderate temperatures and rainfall can release spores from overwintered leaf litter.',
    'Leaf wetness and suitable temperatures support infection.'
  ],
  spreadInformation: [
    'Spores from fallen leaves can be carried by air currents to susceptible tissue.',
    'Secondary spores from lesions can start additional infection cycles.'
  ],
  preventiveMeasures: [
    'Manage fallen infected leaves using locally appropriate orchard sanitation.',
    'Prune to maintain canopy airflow and reduce the time leaves remain wet.',
    'Avoid wetting foliage during irrigation where practical.'
  ],
  followUp: [
    'Compare symptoms with a local diagnostic guide because other problems can cause similar leaf or fruit marks.',
    'Ask a local agricultural extension specialist before disease-specific treatment.'
  ],
  references: [{
    title: 'Utah State University Extension - Apple Scab',
    url: 'https://extension.usu.edu/planthealth/ipm/notes_ag/fruit-apple-scab'
  }],
  sourceName: 'Utah State University Extension',
  lastReviewedAt: '2026-11-24',
  verificationStatus: 'source_verified',
  guidanceDisclaimer: 'Educational information about a possible image-class match; not a diagnosis. Adapt regional guidance to local conditions.'
};

const TOMATO_EARLY_BLIGHT = {
  description: 'Tomato early blight is caused by Alternaria solani. Tamil Nadu Agricultural University describes brown spots with concentric rings and yellow margins on leaves, and concentric brown lesions on fruit.',
  scientificName: 'Alternaria solani',
  causes: ['The disease is caused by the fungus Alternaria solani.'],
  symptoms: [
    'Brown leaf spots may have concentric rings and a yellow margin.',
    'Fruit may develop brown concentric lesions near the calyx or stem attachment.'
  ],
  developmentConditions: [
    'TNAU reports warm, humid, rainy, and wet weather, around 24–29 °C, as favorable conditions.'
  ],
  spreadInformation: [
    'The fungus survives in infected plant debris.',
    'Infected seed is described as a primary spread route; conidia can be carried by rain and wind.'
  ],
  preventiveMeasures: [
    'Remove and destroy infected crop debris using locally appropriate practices.',
    'Use crop rotation as described by TNAU.'
  ],
  followUp: [
    'Confirm the diagnosis locally; other leaf spots can look similar.',
    'Consult local extension advice for practices suitable to the production area.'
  ],
  references: [{
    title: 'Tamil Nadu Agricultural University - Tomato: Early Blight',
    url: 'https://agritech.tnau.ac.in/crop_protection/tomato_diseases_2.html'
  }],
  sourceName: 'Tamil Nadu Agricultural University Agritech Portal',
  lastReviewedAt: '2026-11-24',
  verificationStatus: 'source_verified',
  guidanceDisclaimer: 'Educational information about a possible image-class match; not a diagnosis. TNAU guidance is regional and should be checked against local extension advice.'
};

const STRAWBERRY_LEAF_SCORCH = {
  cropId: 'Strawberry',
  diseaseId: 'Leaf_scorch',
  scientificName: 'Diplocarpon earlianum',
  description: 'Strawberry leaf scorch is a fungal disease. The Pacific Northwest Plant Disease Management Handbook reports that the fungus overwinters on old infected leaves and produces sticky spores that spread to healthy tissue by splashing water. Spring rains can support spread, and disease is often more severe in second- and third-year fields.',
  symptoms: [
    'Small, dark-purple spots develop on upper leaf surfaces and do not form white centers.',
    'Spots may merge; numerous lesions can make leaves look scorched.',
    'Severe disease can reduce foliage and stunt plants.',
    'Infected fruit may show elongated, slightly sunken reddish areas or streaks that disappear as fruit ripens.'
  ],
  developmentConditions: [
    'The fungus survives on old infected leaves.',
    'Rain and splashing water move sticky spores to healthy tissue.',
    'Long periods of leaf wetness can favor infection; spring rains can spread inoculum through a planting.',
    'The handbook reports greater severity in second- and third-year fields.'
  ],
  preventiveMeasures: [
    'Space plants so foliage dries rapidly after rain or irrigation.',
    'Use drip irrigation where practical; if overhead irrigation is used, shorten sets and time watering to promote rapid foliage drying.',
    'Maintain locally appropriate crop nutrition.',
    'Monitor leaves and fruit for changes and avoid moving potentially infected plant material between plots.',
    'The handbook describes summer renovation as an inoculum-reduction practice; follow local extension timing because its timing advice is regional.'
  ],
  followUp: [
    'Compare observed symptoms with a local diagnostic guide; similar-looking leaf spots can have different causes.',
    'Seek local agricultural extension or plant-clinic confirmation before disease-specific treatment, especially if symptoms spread.'
  ],
  references: [
    {
      title: 'Pacific Northwest Plant Disease Management Handbook - Strawberry leaf scorch',
      url: 'https://pnwhandbooks.org/plantdisease/host-disease/strawberry-fragaria-spp-leaf-scorch'
    },
    DATASET_REFERENCE
  ],
  sourceName: 'Pacific Northwest Plant Disease Management Handbook',
  lastReviewedAt: '2026-11-24',
  verificationStatus: 'source_verified',
  guidanceDisclaimer: 'Educational information about the possible disease match; not a diagnosis. This is regional Pacific Northwest guidance and may not transfer directly to other production regions.'
};

const KNOWLEDGE = new Map([
  ['Apple___Apple_scab', APPLE_SCAB],
  ['Strawberry___Leaf_scorch', STRAWBERRY_LEAF_SCORCH],
  ['Tomato___Early_blight', TOMATO_EARLY_BLIGHT]
]);

const HEALTHY_CLASS_REFERENCE = {
  title: 'PlantVillage dataset - class label reference',
  url: 'https://huggingface.co/datasets/mohanty/PlantVillage'
};

function classFields(classMetadata) {
  return {
    className: classMetadata.className,
    cropId: classMetadata.modelCrop,
    diseaseId: classMetadata.className.split('___')[1],
    canonicalCropId: classMetadata.cropId,
    canonicalDiseaseId: classMetadata.diseaseId,
    cropName: classMetadata.cropName,
    diseaseName: classMetadata.diseaseName,
    classificationType: classMetadata.condition,
    classMappingStatus: 'AVAILABLE'
  };
}

function getDiseaseGuidance(className, status, options = {}) {
  const rawClassName = String(className || '');
  const classMetadata = getDiseaseClassMetadata(rawClassName);
  if (!classMetadata) {
    const [cropId = null, diseaseId = null] = rawClassName.split('___');
    return {
      className: rawClassName || null,
      cropId,
      diseaseId,
      canonicalCropId: null,
      canonicalDiseaseId: null,
      classificationType: 'unmapped',
      classMappingStatus: 'NOT_AVAILABLE',
      knowledgeCoverage: 'NONE',
      status: 'NOT_AVAILABLE',
      sourceStatus: 'NOT_CHECKED',
      description: null,
      scientificName: null,
      causes: [],
      symptoms: [],
      developmentConditions: [],
      spreadInformation: [],
      preventiveMeasures: [],
      followUp: [],
      treatments: [],
      references: [],
      message: 'This class identifier is not in the supported model-class registry. No crop or disease association was inferred.'
    };
  }

  const metadata = classFields(classMetadata);
  const possibleMatch = status === 'uncertain';
  if (classMetadata.condition === 'healthy') {
    return {
      ...metadata,
      status: 'AVAILABLE',
      sourceStatus: 'AVAILABLE',
      knowledgeCoverage: 'healthy_class_guidance',
      matchLabel: possibleMatch
        ? 'Possible healthy-class match — plant health is not confirmed.'
        : 'Healthy-class image match — this does not confirm field health.',
      description: `The image model matched the PlantVillage healthy class for ${classMetadata.cropName}. This means no disease represented in the model was identified in this image; it does not prove that the plant is disease-free.`,
      scientificName: null,
      causes: [],
      symptoms: [],
      developmentConditions: [],
      spreadInformation: [],
      preventiveMeasures: ['Continue routine field monitoring.'],
      followUp: ['If symptoms are present or develop, seek local agricultural confirmation; the image result alone cannot rule out disease.'],
      treatments: [],
      references: [{ ...HEALTHY_CLASS_REFERENCE }],
      sourceName: 'PlantVillage class label reference',
      lastReviewedAt: '2026-11-24',
      verificationStatus: 'class_label_only',
      guidanceDisclaimer: 'This is a healthy-labeled image-class result, not a crop-health certificate or field diagnosis.',
      message: null
    };
  }

  const record = KNOWLEDGE.get(rawClassName);
  const sourceStatus = options.sourceStatus || 'AVAILABLE';

  if (!record) {
    return {
      ...metadata,
      knowledgeCoverage: 'CLASS_MAPPING_ONLY',
      status: 'NOT_AVAILABLE',
      sourceStatus,
      description: null,
      scientificName: null,
      causes: [],
      symptoms: [],
      developmentConditions: [],
      spreadInformation: [],
      preventiveMeasures: ['No reviewed disease-specific prevention guidance is available for this model class.'],
      followUp: [
        'Record field symptoms and seek local agricultural confirmation before disease-specific action.'
      ],
      treatments: [],
      references: [],
      message: `The class maps to ${classMetadata.cropName} ${classMetadata.diseaseName}, but no reviewed disease-specific knowledge record is available. This possible image match is not a confirmed diagnosis.`
    };
  }

  return {
    ...metadata,
    cropId: record.cropId || metadata.cropId,
    diseaseId: record.diseaseId || metadata.diseaseId,
    canonicalCropId: classMetadata.cropId,
    canonicalDiseaseId: classMetadata.diseaseId,
    knowledgeCoverage: 'DISEASE_SPECIFIC',
    status: sourceStatus === 'SOURCE_UNAVAILABLE' ? 'PARTIAL' : 'AVAILABLE',
    sourceStatus,
    matchLabel: possibleMatch ? 'Possible disease match — not confirmed.' : 'Model match — not a field diagnosis.',
    description: record.description,
    scientificName: record.scientificName,
    causes: [...(record.causes || [])],
    symptoms: [...record.symptoms],
    developmentConditions: [...record.developmentConditions],
    spreadInformation: [...(record.spreadInformation || [])],
    preventiveMeasures: [...record.preventiveMeasures],
    followUp: [...record.followUp],
    treatments: possibleMatch
      ? ['Educational information only. Confirm the diagnosis before disease-specific treatment.']
      : ['Confirm the diagnosis locally before choosing disease-specific treatment.'],
    references: [...record.references],
    sourceName: record.sourceName,
    lastReviewedAt: record.lastReviewedAt || null,
    verificationStatus: record.verificationStatus || 'source_verified',
    guidanceDisclaimer: record.guidanceDisclaimer,
    message: sourceStatus === 'SOURCE_UNAVAILABLE'
      ? 'The external agricultural source could not be reached; showing the locally reviewed knowledge record.'
      : null
  };
}

module.exports = {
  KNOWLEDGE,
  getDiseaseGuidance,
  getKnowledgeCoverage: () => {
    const records = getDiseaseClassRecords();
    return {
      mappedClasses: records.length,
      diseaseSpecificRecordCount: [...KNOWLEDGE.keys()].filter(className =>
        getDiseaseClassMetadata(className)?.condition === 'diseased'
      ).length,
      healthyClassCount: records.filter(record => record.condition === 'healthy').length,
      diseaseSpecificClasses: [...KNOWLEDGE.keys()].filter(className =>
        getDiseaseClassMetadata(className)?.condition === 'diseased'
      )
    };
  }
};
