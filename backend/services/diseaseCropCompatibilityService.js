const { getDiseaseClassMetadata, getDiseaseClassRecords } = require('./diseaseClassRegistry');

const UNSUPPORTED_CROP_SELECTION = '__unsupported__';
const SUPPORTED_CROPS = new Set(getDiseaseClassRecords().map(record => record.modelCrop));

function validateSelectedCrop(value) {
  if (value == null || value === '') return { selectedCrop: null };
  if (value === UNSUPPORTED_CROP_SELECTION) return { selectedCrop: value };
  if (typeof value !== 'string' || !SUPPORTED_CROPS.has(value)) {
    return { error: 'selectedCrop must be a supported crop or __unsupported__' };
  }
  return { selectedCrop: value };
}

function assessCropCompatibility(predictedClass, selectedCrop) {
  const classMetadata = getDiseaseClassMetadata(predictedClass);
  const rawModelCrop = String(predictedClass || '').split('___')[0] || null;
  if (!classMetadata) {
    return {
      status: 'unsupported_crop',
      selected_crop: selectedCrop || null,
      model_crop: null,
      raw_model_crop: rawModelCrop,
      canonical_crop_id: null,
      crop_name: null,
      disease_specific_recommendations_allowed: false,
      explanation: 'The model result is not in the supported crop and disease label map.'
    };
  }
  const modelCrop = classMetadata.modelCrop;
  const mappedCrop = {
    model_crop: modelCrop,
    canonical_crop_id: classMetadata.cropId,
    crop_name: classMetadata.cropName
  };
  if (selectedCrop === UNSUPPORTED_CROP_SELECTION) {
    return {
      status: 'unsupported_crop',
      selected_crop: null,
      ...mappedCrop,
      disease_specific_recommendations_allowed: false,
      explanation: 'The farmer selected a crop that is not supported by this classifier.'
    };
  }
  if (!selectedCrop) {
    return {
      status: 'not_selected',
      selected_crop: null,
      ...mappedCrop,
      disease_specific_recommendations_allowed: true,
      explanation: 'No farmer crop selection was provided; the crop is taken from the model class.'
    };
  }
  if (selectedCrop !== modelCrop) {
    return {
      status: 'mismatch',
      selected_crop: selectedCrop,
      ...mappedCrop,
      disease_specific_recommendations_allowed: false,
      explanation: `The selected crop (${selectedCrop}) does not match the model class crop (${modelCrop}); disease-specific guidance is blocked.`
    };
  }
  return {
    status: 'matched',
    selected_crop: selectedCrop,
    ...mappedCrop,
    disease_specific_recommendations_allowed: true,
    explanation: 'The selected crop matches the crop associated with the model class; this does not confirm a field diagnosis.'
  };
}

module.exports = {
  UNSUPPORTED_CROP_SELECTION,
  assessCropCompatibility,
  validateSelectedCrop
};
