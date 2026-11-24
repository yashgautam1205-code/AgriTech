const DATASET_REFERENCE = {
  title: 'PlantVillage dataset paper',
  url: 'https://doi.org/10.3389/fpls.2016.01419'
};

const EXTENSION_REFERENCE = {
  title: 'University extension plant disease resources',
  url: 'https://extension.umn.edu/plant-diseases'
};

function getDiseaseGuidance(className, status) {
  const [crop = 'Plant', rawDisease = 'unknown'] = String(className || '').split('___');
  const healthy = rawDisease.toLowerCase() === 'healthy';
  const disease = rawDisease.replace(/_/g, ' ');
  const description = status === 'uncertain'
    ? `The image model's top match is ${crop} — ${disease}, below its confidence threshold. This is not a diagnosis.`
    : healthy
    ? `The model matched the ${crop} healthy class. This does not rule out problems not represented in PlantVillage.`
    : `The model matched the PlantVillage class ${crop} — ${disease}. Image classification does not confirm symptoms or determine disease severity.`;

  return {
    description,
    symptoms: [
      'Symptoms are not independently assessed by this image classifier.',
      'Compare the plant with an extension diagnostic guide and seek local confirmation, especially when symptoms are spreading.'
    ],
    treatments: healthy
      ? ['No disease treatment is indicated by the predicted healthy class; continue monitoring the plant.']
      : [
          'Do not apply pesticide based only on this model output.',
          'Confirm the diagnosis with a local agricultural extension service before choosing treatment.'
        ],
    preventiveMeasures: [
      'Use clean tools and avoid moving potentially infected plant material between plots.',
      'Follow crop-specific sanitation and irrigation guidance from a local extension service.'
    ],
    references: [DATASET_REFERENCE, EXTENSION_REFERENCE],
    guidanceDisclaimer: 'No pesticide product or dosage is prescribed.'
  };
}

module.exports = { getDiseaseGuidance };
