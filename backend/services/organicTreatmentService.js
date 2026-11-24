const APPLE_SCAB_RECOMMENDATIONS = [
  {
    name: 'Manage fallen apple leaves and reduce leaf wetness',
    category: 'cultural practice',
    description: 'Apple scab overwinters in fallen infected leaves. Utah State University Extension describes leaf-litter management and avoiding foliage wetness as cultural controls. These practices reduce disease carry-over or favorable infection conditions; they are not a cure for existing lesions.',
    relevant_ingredient_or_agent: null,
    how_it_works: 'Reducing infected leaf litter can reduce overwintering inoculum; reducing the duration of leaf wetness can make infection conditions less favorable.',
    target_crop: 'Apple',
    target_disease: 'Apple scab',
    application_guidance: 'No product application is recommended. Adapt orchard sanitation and irrigation practices to local conditions and local extension advice.',
    prevention_practices: [
      'Manage fallen infected leaves using locally appropriate sanitation practices.',
      'Avoid wetting foliage when irrigating; where practical, irrigate early enough for foliage to dry.',
      'Maintain canopy airflow through locally appropriate pruning practices.'
    ],
    safety_information: 'Follow local rules for handling and disposal of plant material. The cited guidance is from Utah State University Extension and may not transfer directly to every climate or production system.',
    limitations: 'Cultural management is preventive or inoculum-reducing guidance and does not confirm the model diagnosis or guarantee disease control. No organic certification or pesticide efficacy is claimed.',
    source_name: 'Utah State University Extension - Apple Scab',
    source_url: 'https://extension.usu.edu/planthealth/ipm/notes_ag/fruit-apple-scab',
    last_reviewed_at: '2026-11-24',
    verification_status: 'source_verified'
  }
];

const STRAWBERRY_LEAF_SCORCH_RECOMMENDATIONS = [
  {
    name: 'Reduce leaf wetness with cultural management',
    category: 'cultural practice',
    description: 'The Pacific Northwest Plant Disease Management Handbook recommends practices that help strawberry foliage dry quickly, including adequate spacing, drip irrigation where practical, and timing overhead irrigation for rapid drying. These practices may reduce favorable conditions; they do not cure existing lesions.',
    relevant_ingredient_or_agent: null,
    how_it_works: 'Shortening periods of leaf wetness and maintaining appropriate crop nutrition can make conditions less favorable for disease development.',
    target_crop: 'Strawberry',
    target_disease: 'Leaf scorch',
    application_guidance: 'Where practical, use drip irrigation, maintain spacing that supports airflow, and schedule overhead irrigation so foliage dries quickly. Follow local extension guidance for crop nutrition and regional conditions.',
    prevention_practices: [
      'Maintain spacing and canopy airflow that allow strawberry foliage to dry.',
      'Use drip irrigation where practical; if overhead irrigation is used, time it for rapid foliage drying.',
      'Maintain locally appropriate, balanced crop nutrition.'
    ],
    safety_information: 'No product application is recommended. The cited handbook is regional Pacific Northwest guidance; adapt practices to local growing conditions and local extension recommendations.',
    limitations: 'Cultural management is not a cure and does not confirm the model diagnosis. No pesticide efficacy or organic certification is claimed; local timing and conditions may differ.',
    source_name: 'Pacific Northwest Plant Disease Management Handbook - Strawberry leaf scorch',
    source_url: 'https://pnwhandbooks.org/plantdisease/host-disease/strawberry-fragaria-spp-leaf-scorch',
    last_reviewed_at: '2026-11-24',
    verification_status: 'source_verified'
  }
];

const { getDiseaseClassMetadata } = require('./diseaseClassRegistry');

function getOrganicTreatments(predictedClass, isUncertain = false) {
  const classMetadata = getDiseaseClassMetadata(predictedClass);
  if (!classMetadata) {
    return {
      status: 'NOT_AVAILABLE',
      recommendations: [],
      message: 'The class identifier is not mapped to a supported crop and disease. No non-chemical treatment is inferred.'
    };
  }
  if (classMetadata.condition === 'healthy') {
    return {
      status: 'AVAILABLE',
      recommendations: [],
      message: 'The image matched a healthy-labeled class. No disease-specific treatment is indicated by this class; continue routine monitoring and seek local advice if symptoms are present.'
    };
  }

  const recommendationsByClass = {
    'Apple___Apple_scab': APPLE_SCAB_RECOMMENDATIONS,
    'Strawberry___Leaf_scorch': STRAWBERRY_LEAF_SCORCH_RECOMMENDATIONS,
    'Tomato___Early_blight': [{
      name: 'Crop-debris sanitation and rotation',
      category: 'cultural practice',
      description: 'Tamil Nadu Agricultural University lists removal and destruction of crop debris and crop rotation as cultural practices for tomato early blight. These practices are not a cure for existing lesions.',
      relevant_ingredient_or_agent: null,
      how_it_works: 'The cited guidance identifies infected crop debris as a survival source and crop rotation as a management practice.',
      target_crop: 'Tomato',
      target_disease: 'Early blight',
      application_guidance: 'Use locally appropriate crop rotation and sanitation practices; seek local extension advice for timing and disposal.',
      prevention_practices: [
        'Remove and destroy infected crop debris using locally appropriate practices.',
        'Use crop rotation as recommended by local agricultural extension.'
      ],
      safety_information: 'No pesticide application is recommended here. Follow local rules for handling and disposal of infected plant material.',
      limitations: 'Cultural management is not a cure and does not confirm the model diagnosis. The cited guidance is regional and may not transfer directly to every production system.',
      source_name: 'Tamil Nadu Agricultural University - Tomato: Early Blight',
      source_url: 'https://agritech.tnau.ac.in/crop_protection/tomato_diseases_2.html',
      last_reviewed_at: '2026-11-24',
      verification_status: 'source_verified'
    }]
  };
  const recommendations = recommendationsByClass[predictedClass] || [];

  return {
    status: recommendations.length ? (isUncertain ? 'PARTIAL' : 'AVAILABLE') : 'NOT_AVAILABLE',
    recommendations: recommendations.map(item => ({
      ...item,
      guidance_scope: isUncertain ? 'possible_disease_educational' : 'disease_mapped_cultural_guidance',
      application_allowed: false
    })),
    message: recommendations.length
      ? isUncertain
        ? 'Educational cultural guidance for the possible disease match. Confirm the diagnosis before disease-specific action.'
        : 'Verified source-linked cultural guidance; it is not a product application or cure.'
      : `No reviewed disease-specific non-chemical management record is available for the possible ${classMetadata.cropName} ${classMetadata.diseaseName} match. The image class is not a diagnosis; document field symptoms and seek local KVK or agricultural-extension confirmation before disease-specific action.`
  };
}

module.exports = { getOrganicTreatments };
