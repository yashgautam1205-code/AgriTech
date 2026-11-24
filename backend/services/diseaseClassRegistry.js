const modelLabels = require('../../ml_service/models/plant_disease_labels.json');

const classRecords = [
  ['Apple___Apple_scab', 'apple', 'Apple', 'apple_scab', 'Apple scab', 'diseased'],
  ['Apple___Black_rot', 'apple', 'Apple', 'black_rot', 'Black rot', 'diseased'],
  ['Apple___Cedar_apple_rust', 'apple', 'Apple', 'cedar_apple_rust', 'Cedar apple rust', 'diseased'],
  ['Apple___healthy', 'apple', 'Apple', 'healthy', 'Healthy', 'healthy'],
  ['Blueberry___healthy', 'blueberry', 'Blueberry', 'healthy', 'Healthy', 'healthy'],
  ['Cherry_(including_sour)___Powdery_mildew', 'cherry', 'Cherry', 'powdery_mildew', 'Powdery mildew', 'diseased'],
  ['Cherry_(including_sour)___healthy', 'cherry', 'Cherry', 'healthy', 'Healthy', 'healthy'],
  ['Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot', 'corn', 'Corn (maize)', 'cercospora_gray_leaf_spot', 'Cercospora leaf spot / gray leaf spot', 'diseased'],
  ['Corn_(maize)___Common_rust_', 'corn', 'Corn (maize)', 'common_rust', 'Common rust', 'diseased'],
  ['Corn_(maize)___Northern_Leaf_Blight', 'corn', 'Corn (maize)', 'northern_leaf_blight', 'Northern leaf blight', 'diseased'],
  ['Corn_(maize)___healthy', 'corn', 'Corn (maize)', 'healthy', 'Healthy', 'healthy'],
  ['Grape___Black_rot', 'grape', 'Grape', 'black_rot', 'Black rot', 'diseased'],
  ['Grape___Esca_(Black_Measles)', 'grape', 'Grape', 'esca_black_measles', 'Esca (black measles)', 'diseased'],
  ['Grape___Leaf_blight_(Isariopsis_Leaf_Spot)', 'grape', 'Grape', 'leaf_blight_isariopsis_leaf_spot', 'Leaf blight (Isariopsis leaf spot)', 'diseased'],
  ['Grape___healthy', 'grape', 'Grape', 'healthy', 'Healthy', 'healthy'],
  ['Orange___Haunglongbing_(Citrus_greening)', 'orange', 'Orange', 'huanglongbing', 'Huanglongbing (citrus greening)', 'diseased'],
  ['Peach___Bacterial_spot', 'peach', 'Peach', 'bacterial_spot', 'Bacterial spot', 'diseased'],
  ['Peach___healthy', 'peach', 'Peach', 'healthy', 'Healthy', 'healthy'],
  ['Pepper,_bell___Bacterial_spot', 'bell_pepper', 'Bell pepper', 'bacterial_spot', 'Bacterial spot', 'diseased'],
  ['Pepper,_bell___healthy', 'bell_pepper', 'Bell pepper', 'healthy', 'Healthy', 'healthy'],
  ['Potato___Early_blight', 'potato', 'Potato', 'early_blight', 'Early blight', 'diseased'],
  ['Potato___Late_blight', 'potato', 'Potato', 'late_blight', 'Late blight', 'diseased'],
  ['Potato___healthy', 'potato', 'Potato', 'healthy', 'Healthy', 'healthy'],
  ['Raspberry___healthy', 'raspberry', 'Raspberry', 'healthy', 'Healthy', 'healthy'],
  ['Soybean___healthy', 'soybean', 'Soybean', 'healthy', 'Healthy', 'healthy'],
  ['Squash___Powdery_mildew', 'squash', 'Squash', 'powdery_mildew', 'Powdery mildew', 'diseased'],
  ['Strawberry___Leaf_scorch', 'strawberry', 'Strawberry', 'leaf_scorch', 'Leaf scorch', 'diseased'],
  ['Strawberry___healthy', 'strawberry', 'Strawberry', 'healthy', 'Healthy', 'healthy'],
  ['Tomato___Bacterial_spot', 'tomato', 'Tomato', 'bacterial_spot', 'Bacterial spot', 'diseased'],
  ['Tomato___Early_blight', 'tomato', 'Tomato', 'early_blight', 'Early blight', 'diseased'],
  ['Tomato___Late_blight', 'tomato', 'Tomato', 'late_blight', 'Late blight', 'diseased'],
  ['Tomato___Leaf_Mold', 'tomato', 'Tomato', 'leaf_mold', 'Leaf mold', 'diseased'],
  ['Tomato___Septoria_leaf_spot', 'tomato', 'Tomato', 'septoria_leaf_spot', 'Septoria leaf spot', 'diseased'],
  ['Tomato___Spider_mites Two-spotted_spider_mite', 'tomato', 'Tomato', 'spider_mites_two_spotted_spider_mite', 'Spider mites (two-spotted spider mite)', 'diseased'],
  ['Tomato___Target_Spot', 'tomato', 'Tomato', 'target_spot', 'Target spot', 'diseased'],
  ['Tomato___Tomato_Yellow_Leaf_Curl_Virus', 'tomato', 'Tomato', 'tomato_yellow_leaf_curl_virus', 'Tomato yellow leaf curl virus', 'diseased'],
  ['Tomato___Tomato_mosaic_virus', 'tomato', 'Tomato', 'tomato_mosaic_virus', 'Tomato mosaic virus', 'diseased'],
  ['Tomato___healthy', 'tomato', 'Tomato', 'healthy', 'Healthy', 'healthy']
].map(([className, cropId, cropName, diseaseId, diseaseName, condition]) => ({
  className,
  modelCrop: className.split('___')[0],
  cropId,
  cropName,
  diseaseId,
  diseaseName,
  condition
}));

const classNames = classRecords.map(record => record.className);
if (classNames.length !== modelLabels.classes.length ||
    new Set(classNames).size !== classNames.length ||
    modelLabels.classes.some(className => !classNames.includes(className))) {
  throw new Error('Disease class registry must map every PlantVillage model label exactly once.');
}

const recordsByClass = new Map(classRecords.map(record => [record.className, Object.freeze(record)]));

function getDiseaseClassMetadata(className) {
  return typeof className === 'string' ? recordsByClass.get(className) || null : null;
}

function getDiseaseClassRecords() {
  return classRecords.map(record => ({ ...record }));
}

module.exports = {
  getDiseaseClassMetadata,
  getDiseaseClassRecords
};
