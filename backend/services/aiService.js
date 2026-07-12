// Mock AI service - replace with real model or external API integration
const path = require('path');
const { fetchWeatherForecast } = require('./weatherService');

const diseases = [
  {
    name: 'Late Blight',
    treatments: ['Remove infected leaves', 'Improve drainage', 'Apply fungicide spray', 'Plant resistant varieties'],
    organic: ['Copper spray', 'Bordeaux mixture', 'Neem oil'],
    // chemical products with an estimated retail cost per litre/package
    chemical: [
      { name: 'Mancozeb', cost: 450 },
      { name: 'Copper oxychloride', cost: 620 },
      { name: 'Chlorothalonil', cost: 700 }
    ],
    // affordable alternatives with estimated smaller-scale cost or effort estimate
    affordableAlternatives: [
      { name: 'Spray diluted cow urine', costEstimate: 0 },
      { name: 'Use compost tea as foliar feed', costEstimate: 0 },
      { name: 'Apply diluted baking soda spray', costEstimate: 25 }
    ]
  },
  {
    name: 'Powdery Mildew',
    treatments: ['Increase air flow', 'Use neem oil', 'Remove infected shoots', 'Avoid overhead watering'],
    organic: ['Neem oil', 'Baking soda spray', 'Milk spray'],
    chemical: [
      { name: 'Sulfur', cost: 380 },
      { name: 'Propiconazole', cost: 520 }
    ],
    affordableAlternatives: [
      { name: 'Apply baking soda solution', costEstimate: 20 },
      { name: 'Use diluted milk spray', costEstimate: 30 },
      { name: 'Spray garlic water', costEstimate: 10 }
    ]
  },
  {
    name: 'Bacterial Spot',
    treatments: ['Remove affected areas', 'Use clean water', 'Sanitize tools', 'Improve air circulation'],
    organic: ['Bio-fungicide', 'Neem oil-based spray', 'Garlic spray'],
    chemical: [
      { name: 'Copper oxychloride', cost: 620 },
      { name: 'Streptomycin', cost: 1100 }
    ],
    affordableAlternatives: [
      { name: 'Use turmeric-water spray', costEstimate: 5 },
      { name: 'Keep leaves dry and prune well', costEstimate: 0 },
      { name: 'Apply diluted honey solution', costEstimate: 10 }
    ]
  },
  {
    name: 'Downy Mildew',
    treatments: ['Improve air circulation', 'Use resistant varieties', 'Avoid overhead irrigation'],
    organic: ['Garlic spray', 'Neem oil', 'Baking soda spray'],
    chemical: [
      { name: 'Metalaxyl', cost: 520 },
      { name: 'Mancozeb', cost: 450 }
    ],
    affordableAlternatives: [
      { name: 'Improve plant spacing', costEstimate: 0 },
      { name: 'Spray diluted milk solution', costEstimate: 30 }
    ]
  },
  {
    name: 'Anthracnose',
    treatments: ['Prune infected tissue', 'Rotate crops', 'Avoid wet foliage'],
    organic: ['Compost tea', 'Sulfur spray', 'Copper-based organic spray'],
    chemical: [
      { name: 'Copper hydroxide', cost: 600 },
      { name: 'Captan', cost: 550 }
    ],
    affordableAlternatives: [
      { name: 'Remove and burn infected debris', costEstimate: 0 },
      { name: 'Apply neem oil regularly', costEstimate: 50 }
    ]
  },
  {
    name: 'Rust',
    treatments: ['Remove affected leaves', 'Avoid overhead watering', 'Improve sunlight exposure'],
    organic: ['Baking soda spray', 'Potassium bicarbonate', 'Sulfur soap spray'],
    chemical: [
      { name: 'Myclobutanil', cost: 650 },
      { name: 'Trifloxystrobin', cost: 750 }
    ],
    affordableAlternatives: [
      { name: 'Apply diluted milk spray', costEstimate: 25 },
      { name: 'Use neem oil weekly', costEstimate: 50 }
    ]
  }
];

const voiceTextTemplates = {
  en: 'Detected {disease}. Severity is {severity}. Suggested treatments: {treatments}.',
  hi: '{disease} का पता चला। गंभीरता {severity} है। सुझाए गए उपचार: {treatments}.',
  kn: '{disease} ಪತ್ತೆಯಾಗಿದೆ. ತೀವ್ರತೆ {severity}. ಸೂಚಿಸಲಾದ ಚಿಕಿತ್ಸೆಗಳು: {treatments}.',
  mr: '{disease} सापडले. तीव्रता {severity} आहे. सुचविलेले उपचार: {treatments}.',
  ta: '{disease} கண்டுபிடிக்கப்பட்டது. தீவிரம் {severity}. பரிந்துரைக்கப்பட்ட சிகிச்சைகள்: {treatments}.',
  te: '{disease} గుర్తించబడింది. తీవ్రత {severity}. సూచించిన చికిత్సలు: {treatments}.',
  bn: '{disease} সনাক্ত করা হয়েছে। তীব্রতা {severity}। প্রস্তাবিত চিকিৎসা: {treatments}.',
};

const voiceTextAlternatives = {
  en: 'Low-cost alternative: {alternative}.',
  hi: 'सस्ती विकल्प: {alternative}.',
  kn: 'ಕಡಿಮೆ ವೆಚ್ಚದ ಪರ್ಯಾಯ: {alternative}.',
  mr: 'कमी किमतीचा पर्याय: {alternative}.',
  ta: 'குறைந்த செலவு மாற்று: {alternative}.',
  te: 'తక్కువ ఖర్చు ప్రత్యామ్నాయం: {alternative}.',
  bn: 'সস্তা বিকল্প: {alternative}.',
};

function severityFromConfidence(conf) {
  if (conf > 0.75) return 'high';
  if (conf > 0.4) return 'medium';
  return 'low';
}

function localizeVoiceText(disease, severity, treatments, affordableAlternatives, lang) {
  const template = voiceTextTemplates[lang] || voiceTextTemplates.en
  const text = template
    .replace('{disease}', disease)
    .replace('{severity}', severity)
    .replace('{treatments}', treatments.slice(0, 2).join(', '))

  if (affordableAlternatives && affordableAlternatives.length) {
    const alt = typeof affordableAlternatives[0] === 'string'
      ? affordableAlternatives[0]
      : affordableAlternatives[0].name
    const altTemplate = voiceTextAlternatives[lang] || voiceTextAlternatives.en
    return `${text} ${altTemplate.replace('{alternative}', alt)}`
  }

  return text
}

function localizeSeverity(severity, lang) {
  const map = {
    hi: { high: 'उच्च', medium: 'मध्यम', low: 'कम' },
    kn: { high: 'ಹೆಚ್ಚು', medium: 'ಮಧ್ಯಮ', low: 'ಕಮ್ಮಿ' },
    mr: { high: 'उच्च', medium: 'मध्यम', low: 'कमी' },
    ta: { high: 'உயர்', medium: 'மிதமான', low: 'குறைந்தது' },
    te: { high: 'ఎక్కువ', medium: 'మధ్యస్థ', low: 'తక్కువ' },
    bn: { high: 'উচ্চ', medium: 'মধ্যম', low: 'কম' }
  }
  return (map[lang] && map[lang][severity]) || severity
}

function buildWeatherForecast() {
  const today = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const conditions = [
    { condition: 'Sunny', advice: 'Good for spraying in the early morning.' },
    { condition: 'Light rain', advice: 'Avoid spraying and keep treated leaves dry.' },
    { condition: 'Cloudy', advice: 'Check for humidity before applying treatment.' }
  ];
  const forecasts = [];
  for (let i = 0; i < 3; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const choice = conditions[(today.getDay() + i) % conditions.length];
    forecasts.push({
      day: dayNames[date.getDay()],
      condition: choice.condition,
      tempMin: 20 + i * 2,
      tempMax: 28 + i * 2,
      advice: choice.advice
    });
  }
  return {
    summary: 'Local weather looks stable for the next few days. Plan treatment around dry windows.',
    forecast: forecasts
  };
}

async function analyzeImage(filePath, lat, lon, lang = 'en') {
  // This is a mock - in production, load model or call external API
  // Use file hash or name to pick deterministic output if desired
  const idx = Math.floor(Math.random() * diseases.length);
  const conf = Math.random();
  const chosen = diseases[idx];
  const severity = severityFromConfidence(conf);
  const weatherForecast = await fetchWeatherForecast(lat, lon);
  const voiceText = localizeVoiceText(chosen.name, localizeSeverity(severity, lang), chosen.treatments, chosen.affordableAlternatives, lang);

  return {
    disease: chosen.name,
    severity,
    treatments: chosen.treatments,
    // return pesticides with richer info (chemical items include cost)
    pesticides: { organic: chosen.organic, chemical: chosen.chemical },
    // keep affordable alternatives as objects with costEstimate
    affordableAlternatives: chosen.affordableAlternatives,
    weatherForecast,
    confidence: conf,
    voiceText,
    lang
  };
}

function simpleCauseFor(disease, lang = 'en') {
  const map = {
    en: {
      'Late Blight': 'A fungus that thrives in wet, cool conditions and spreads through spores.',
      'Powdery Mildew': 'A fungal growth that prefers dry leaves with poor air circulation.',
      'Bacterial Spot': 'Bacteria entering through wounds or water splashes on leaves.'
    },
    hi: {
      'Late Blight': 'एक फफूंदी जो गीले, ठंडे वातावरण में पनपती है और स्पोर द्वारा फैलती है।',
      'Powdery Mildew': 'एक कवक जो सूखी पत्तियों पर बढ़ता है और वायु संचार की कमी पसंद करता है।',
      'Bacterial Spot': 'कीटाणु जो घावों या पानी की छींटों के माध्यम से पत्तियों में प्रवेश करते हैं।'
    },
    kn: {
      'Late Blight': 'ಓ ಒಂದು ಫಂಗಸ್ ಅದು ತೇವದಿಂದ ತುಂಬಿದ, ತಣಿದ ಪರಿಸ್ಥಿತಿಯಲ್ಲಿ ಬೆಳೆಯುತ್ತದೆ ಮತ್ತು ಸ್ಪೋರ್ಸ್ ಮೂಲಕ ಹರಡುತ್ತದೆ.',
      'Powdery Mildew': 'ಒಂದು ಫಂಗಸ್ ಇದು ಒಣ ಎಲೆಗಳನ್ನು ಮತ್ತು ಕೆಟ್ಟ ವಾಯು ಸಂಚಾರವನ್ನು ಇಷ್ಟಪಡುತ್ತದೆ.',
      'Bacterial Spot': 'ಘಾಳೆ ಅಥವಾ ನೀರಿನ ತಳ್ಳಿ ಮೂಲಕ ಎಲೆಗಳಲ್ಲಿ ಬಾಕ್ಟೀರಿಯಾ ಪ್ರವೇಶಿಸುತ್ತದೆ.'
    },
    mr: {
      'Late Blight': 'एक बुरशी जी ओल्या, थंड परिस्थितीत वाढते आणि बियाणांद्वारे पसरते.',
      'Powdery Mildew': 'एक बुरशी जी कोरड्या पानांवर वाईट हवा संचार असलेल्या ठिकाणी वाढते.',
      'Bacterial Spot': 'जखम किंवा पाण्याच्या थेंबांमधून पानेमध्ये बॅक्टेरिया प्रवेश करते.'
    },
    ta: {
      'Late Blight': 'ஒரு பூஞ்சை இது ஈரமான, குளிர்ந்த சூழலில் வளரும் மற்றும் பூண்டு மூலம் பரவுகிறது.',
      'Powdery Mildew': 'ஒரு பூஞ்சை இது உலர் இலைகளில் மற்றும் மோசமான காற்றோட்டத்தில் வளர உதவுகிறது.',
      'Bacterial Spot': 'அசுவிடு அல்லது நீர் துளிக்களால் இலைகளில் பாக்டீரியா நுழைகிறது.'
    },
    te: {
      'Late Blight': 'ఒక ఫంగస్ ఇది తేమతో కూడిన, చల్లని పరిస్థితుల్లో పెరుగుతుంది మరియు స్పోర్లతో వ్యాపిస్తుంది.',
      'Powdery Mildew': 'ఒక ఫంగస్ ఇది పొడి ఆకుల మీద కనపడుతుంది మరియు బాగు గాలిసరుకు ఇష్టపడదు.',
      'Bacterial Spot': 'గాయాల లేదా నీటి తుోడులతో బ్యాక్టీరియా ఆకులలో ప్రవేశిస్తుంది.'
    },
    bn: {
      'Late Blight': 'একটি ফাঙ্গাস যা ভেজা, ঠান্ডা অবস্থায় বৃদ্ধি পায় এবং কণার মাধ্যমে ছড়ায়।',
      'Powdery Mildew': 'একটি ফাঙ্গাস যা শুষ্ক পাতায় এবং খারাপ বায়ু সঞ্চরণে বৃদ্ধি পায়।',
      'Bacterial Spot': 'ক্ষত বা পানির ছিটাকে দিয়ে আলায় ব্যাকটেরিয়া প্রবেশ করে।'
    }
  };
  return (map[lang] && map[lang][disease]) || map.en[disease] || 'A common crop disease; exact cause varies by pathogen and environment.';
}

function buildCropCalendar(crop, weatherForecast) {
  // naive, general guidance — can be replaced by real agronomy data
  const bestSprayingTime = (weatherForecast && weatherForecast.forecast && weatherForecast.forecast[0])
    ? `Best time: early morning on ${weatherForecast.forecast[0].day} when it is dry.`
    : 'Best time: early morning when leaves are dry and wind is calm.';

  const harvestSeason = {
    default: 'Depends on crop — check local variety, but many vegetables are ready 60–120 days after planting.'
  };

  const fertilizerSchedule = [
    'At planting: apply balanced compost or well-rotted manure near roots.',
    'Vegetative stage: apply nitrogen-rich feed once plants have established.',
    'Before flowering/fruiting: apply potassium-rich feed to support yield.'
  ];

  return {
    bestSprayingTime,
    harvestSeason: harvestSeason[crop] || harvestSeason.default,
    fertilizerSchedule
  };
}

function getTranslations(lang) {
  const map = {
    en: {
      riskHigh: 'High risk: the disease can spread quickly and reduce your yield if not acted upon.',
      riskMedium: 'Moderate risk: it may reduce yield and spread to nearby plants.',
      riskLow: 'Low immediate risk but monitor plants closely.',
      removeLeaves: 'Remove and destroy badly infected leaves to reduce spread.',
      avoidOverhead: 'Avoid overhead irrigation; water at the base of the plants.',
      treatmentPrompt: 'If available, apply one of these treatments: {treatments}.',
      chemicalOptions: 'Chemical options: {chemicals}. Use according to label, safety and local regulations.',
      organicOptions: 'Organic options: {organics}.',
      avoidSpray: 'Avoid spraying before rain or in strong wind.',
      bestSprayingTime: 'Best time: {time}',
      harvestSeason: 'Harvest season: {season}',
      fertilizerSchedule: 'Fertilizer schedule: {schedule}.'
    },
    hi: {
      riskHigh: 'उच्च जोखिम: यह रोग जल्दी फैल सकता है और आपके पैदावार को कम कर सकता है यदि समय पर कार्रवाई नहीं की गई।',
      riskMedium: 'मध्यम जोखिम: यह आपकी पैदावार को कम कर सकता है और आसपास के पौधों में फैल सकता है।',
      riskLow: 'तुरंत कम जोखिम है लेकिन पौधों की निगरानी करें।',
      removeLeaves: 'प्रसारण कम करने के लिए गंभीर रूप से संक्रमित पत्तियों को हटा दें और नष्ट करें।',
      avoidOverhead: 'ऊपर से सिंचाई से बचें; पानी जड़ों के पास दें।',
      treatmentPrompt: 'यदि उपलब्ध हो, तो इन उपचारों में से एक का उपयोग करें: {treatments}.',
      chemicalOptions: 'रासायनिक विकल्प: {chemicals}. लेबल, सुरक्षा और स्थानीय नियमों के अनुसार उपयोग करें।',
      organicOptions: 'जैविक विकल्प: {organics}.',
      avoidSpray: 'बारिश से पहले या तेज हवा में छिड़काव से बचें।',
      bestSprayingTime: 'सर्वोत्तम समय: {time}',
      harvestSeason: 'कटाई मौसम: {season}',
      fertilizerSchedule: 'खाद अनुसूची: {schedule}.'
    },
    kn: {
      riskHigh: 'ಹೆಚ್ಚು ಅಪಾಯ: ರೋಗವು ವೇಗವಾಗಿ ಹರಡಬಹುದು ಮತ್ತು ಸಮಯದಲ್ಲಿ ಕ್ರಮ ಕೈಗೊಳ್ಳದಿದ್ದರೆ ನಿಮ್ಮ ಪಡೆತವನ್ನು ಕಡಿಮೆ ಮಾಡಬಹುದು.',
      riskMedium: 'ಮಧ್ಯಮ ಅಪಾಯ: ಇದು ನಿಮ್ಮ ಫಸಲನ್ನು ಕಡಿಮೆ ಮಾಡಬಹುದು ಮತ್ತು ಹತ್ತಿರದ ಗಿಡಗಳಿಗೆ ಹರಡಬಹುದು.',
      riskLow: 'ತೆಗೆಯುವ ತಕ್ಷಣದ ಅಪಾಯ ಕಡಿಮೆ ಇದೆ ಆದರೆ ಸಸ್ಯಗಳನ್ನು ಗಮನಿಸಿ.',
      removeLeaves: 'ಹರೂಗುವಿಕೆ ಕಡಿಮೆ ಮಾಡಲು ಕಿಟಿಕಿಯಾದ ಸೊಪ್ಪುಗಳನ್ನು ತೆಗೆದು ನಾಶ ಮಾಡಿ.',
      avoidOverhead: 'ಮೇಲ್ಮೈ ನೀರು ಹಿಮ್ಮುಖದಿಂದ ಮರೆಯಿರಿ; ಬೇರುಗಳ ಬಳಿ ನೀರು ಹಾಕಿ.',
      treatmentPrompt: 'ಲಭ್ಯವಿದ್ದಲ್ಲಿ, ಈ ಚಿಕಿತ್ಸೆಗಳೊಂದನ್ನು ಅನ್ವಯಿಸಿ: {treatments}.',
      chemicalOptions: 'ರಾಸಾಯನಿಕ ಆಯ್ಕೆಗಳು: {chemicals}. ಲೇಬಲ್, ಸುರಕ್ಷತೆ ಮತ್ತು ಸ್ಥಳೀಯ ನಿಯಮಗಳ ಪ್ರಕಾರ ಉಪಯೋಗಿಸಿ.',
      organicOptions: 'ಸेंद्रಿಯ ಆಯ್ಕೆಗಳು: {organics}.',
      avoidSpray: 'ಮಳೆಯ ಮುಂಚೆ ಅಥವಾ ಬಲವಾದ ಗಾಳಿಯಲ್ಲಿ ಚಿತ್ರಣದಿಂದ ಬನ್ನಿ.',
      bestSprayingTime: 'ಉತ್ತಮ ಸಮಯ: {time}',
      harvestSeason: 'ಹರಿವು ಕಾಲ: {season}',
      fertilizerSchedule: 'ಬಳಸುವ ಸಮಯ: {schedule}.'
    },
    mr: {
      riskHigh: 'उच्च धोका: रोग वेगाने पसरू शकतो आणि वेळेवर उपचार न केल्यास तुमची उत्पन्न कमी करू शकतो.',
      riskMedium: 'मध्यम धोका: हे तुमचे उत्पादन कमी करू शकते आणि जवळच्या वनस्पतींवर पसरू शकते.',
      riskLow: 'तत्काळ कमी धोका आहे परंतु वनस्पतींचे निरीक्षण करा.',
      removeLeaves: 'सरफ्रेंड कमी करण्यासाठी दाहक पाने काढा आणि नष्ट करा.',
      avoidOverhead: 'वरून सिंचन टाळा; पानी मुळांच्या जवळ द्या.',
      treatmentPrompt: 'उपलब्ध असल्यास, या उपचारांपैकी एक लागू करा: {treatments}.',
      chemicalOptions: 'रासायनिक पर्याय: {chemicals}. लेबल, सुरक्षा आणि स्थानिक नियमांनुसार वापरा.',
      organicOptions: 'जैविक पर्याय: {organics}.',
      avoidSpray: 'पाऊसापूर्वी किंवा जोरदार वाऱ्यात फवारणी टाळा.',
      bestSprayingTime: 'उत्तम वेळ: {time}',
      harvestSeason: 'कापणी हंगाम: {season}',
      fertilizerSchedule: 'खत वेळापत्रक: {schedule}.'
    },
    ta: {
      riskHigh: 'உயர் அபாயம்: நோய் விரைவில் பரவக்கூடும் மற்றும் உடனடி நடவடிக்கை எடுத்தால் உற்பத்தி குறையலாம்.',
      riskMedium: 'மிதமான அபாயம்: இது உங்களுக்கு பயிரை பாதிக்கக்கூடும் மற்றும் அருகிலுள்ள தாவரங்களுக்கு பரவும்.',
      riskLow: 'நேரடி குறைந்த அபாயம் உள்ளது ஆனால் தாவரங்களை கவனிக்கவும்.',
      removeLeaves: 'விரைவாக பரவாமல் பாதிக்கப்பட்ட இலைகளை அகற்றி அழிக்கவும்.',
      avoidOverhead: 'மேலோட்ட நீர்ப்பாசனை தவிர்க்கவும்; ஆணை அடிப்பகுதியில் நீரை கொடுக்கவும்.',
      treatmentPrompt: 'கிடைத்தால், இந்த சிகிச்சைகள் ஒன்றைப் பயன்படுத்தவும்: {treatments}.',
      chemicalOptions: 'ரசாயன தேர்வுகள்: {chemicals}. லேபிள், பாதுகாப்பு மற்றும் உள்ளூர் விதிமுறைகள் படி பயன்படுத்தவும்.',
      organicOptions: 'சేందிரிய தேர்வுகள்: {organics}.',
      avoidSpray: 'மழை அல்லது பலமுள்ள காற்று முன்னதாக ஸ்ப்ரே செய்ய விரும்பாதே.',
      bestSprayingTime: 'சிறந்த நேரம்: {time}',
      harvestSeason: 'நெறிகாட்டும் காலம்: {season}',
      fertilizerSchedule: ' உரம் அட்டவணை: {schedule}.'
    },
    te: {
      riskHigh: 'ఎక్కువ ప్రమాదం: వ్యాధి త్వరగా వ్యాపించవచ్చు మరియు తక్షణ చర్య తీసుకోకపోతే మీ దిగుబడిని తగ్గించవచ్చు.',
      riskMedium: 'మధ్యస్థ ప్రమాదం: ఇది మీ దిగుబడిని తగ్గించవచ్చు మరియు పక్కటి మొక్కలకు వ్యాపించవచ్చు.',
      riskLow: 'తక్షణమే తక్కువ ప్రమాదం ఉంది కానీ మొక్కలను పర్యవేక్షించండి.',
      removeLeaves: 'పారవేదన తగ్గించడానికి దిగి ఉన్న ఆకులను తీసివేయండి మరియు నాశనం చేయండి.',
      avoidOverhead: 'ఎగువ నుంచి నీటి ఉత్పాతం నివారించండి; మూలల దగ్గరికి నీరు ఇవ్వండి.',
      treatmentPrompt: 'లభ్యమైతే, ఈ చికిత్సలలో ఒకదాన్ని వర్తించండి: {treatments}.',
      chemicalOptions: 'రసాయన ఎంపికలు: {chemicals}. లేబుల్, భద్రత మరియు స్థానిక నియమాల ప్రకారం ఉపయోగించండి.',
      organicOptions: 'సేంద్రీయ ఎంపికలు: {organics}.',
      avoidSpray: 'వర్షానికి ముందు లేదా బలమైన గాలిలో స్ప్రే చేయటంను నివారించండి.',
      bestSprayingTime: 'ఉత్తమ సమయం: {time}',
      harvestSeason: 'పంట కోయడం కాలం: {season}',
      fertilizerSchedule: 'సారానికి షెడ్యూల్: {schedule}.'
    },
    bn: {
      riskHigh: 'উচ্চ ঝুঁকি: রোগ দ্রুত ছড়াতে পারে এবং সঠিকভাবে চিকিৎসা না করলে আপনার ফলন কমতে পারে।',
      riskMedium: 'মধ্যম ঝুঁকি: এটি আপনার ফসলকে ক্ষতিগ্রস্ত করতে পারে এবং নিকটবর্তী গাছপালায় ছড়াতে পারে।',
      riskLow: 'তাৎক্ষণিকভাবে কম ঝুঁকি রয়েছে, কিন্তু গাছপালার নজর রাখুন।',
      removeLeaves: 'সংক্রমিত পাতা সরিয়ে তা ধ্বংস করুন যাতে ছড়ানো কমে।',
      avoidOverhead: 'উপর থেকে সেচ এড়িয়ে চলুন; মূলের কাছে জল দিন।',
      treatmentPrompt: 'উপলব্ধ থাকলে, এই চিকিত্সাগুলির মধ্যে একটি ব্যবহার করুন: {treatments}.',
      chemicalOptions: 'রাসায়নিক বিকল্প: {chemicals}. লেবেল, নিরাপত্তা এবং স্থানীয় নিয়ম অনুযায়ী ব্যবহার করুন।',
      organicOptions: 'জৈব বিকল্প: {organics}.',
      avoidSpray: 'বৃষ্টি বা তীব্র বায়ু আগে স্প্রে করা এড়ান।',
      bestSprayingTime: 'সেরা সময়: {time}',
      harvestSeason: 'ফসল কর্তনের ঋতু: {season}',
      fertilizerSchedule: 'সারের সময়সূচি: {schedule}.'
    }
  }
  return map[lang] || map.en
}

async function generateAssistantResponse({ disease, severity, treatments, pesticides, affordableAlternatives, weatherForecast, confidence, scanId, crop, lat, lon, userId, lang }, question) {
  // Produce simple, farmer-friendly answers for common questions.
  const cause = simpleCauseFor(disease, lang);
  const translations = getTranslations(lang)
  const risk = severity === 'high'
    ? translations.riskHigh
    : severity === 'medium'
    ? translations.riskMedium
    : translations.riskLow;

  const immediateSteps = [
    translations.removeLeaves,
    translations.avoidOverhead,
    translations.treatmentPrompt.replace('{treatments}', treatments && treatments.length ? treatments.slice(0,2).join(', ') : 'recommended treatment')
  ];

  const chemicalNames = (pesticides && pesticides.chemical && pesticides.chemical.length)
    ? pesticides.chemical.map(p => (typeof p === 'string' ? p : p.name)).join(', ')
    : '';

  const chemicalAdvice = chemicalNames
    ? translations.chemicalOptions.replace('{chemicals}', chemicalNames)
    : '';

  const organicNames = (pesticides && pesticides.organic && pesticides.organic.length)
    ? pesticides.organic.join(', ')
    : '';

  const organicAdvice = organicNames
    ? translations.organicOptions.replace('{organics}', organicNames)
    : '';

  const calendar = buildCropCalendar(crop, weatherForecast);

  function tLabel(key, langCode) {
    const map = {
      Cause: { hi: 'कारण', kn: 'ಕಾರಣ', mr: 'कारण', ta: 'காரணம்', te: 'కారణం', bn: 'কারণ' },
      Risk: { hi: 'जोखिम', kn: 'ஆபತ್ತು', mr: 'जोखीम', ta: 'ஆபத்து', te: 'ప్రమాదం', bn: 'ঝুঁকি' },
      'Immediate steps': { hi: 'तुरंत कदम', kn: 'ತಕ್ಷಣದ ಹೆಜ್ಜೆಗಳು', mr: 'त्वरित पावले', ta: 'தருநடுப்பு', te: 'తక్షణ చర్యలు', bn: 'তৎক্ষণাৎ পদক্ষেপ' },
      'If ignored': { hi: 'यदि अनदेखा किया गया', kn: 'ಉದಾಸೀನಳೆಯಾದರೆ', mr: 'जर दुर्लक्षित केले तर', ta: 'புறக்கணித்தால்', te: 'ఉపేక్షిస్తే', bn: 'উপেক্ষা করলে' },
      'Harvest season': { hi: 'कटाई मौसम', kn: 'ಗರಿಷ್ಠ فصل', mr: 'कापणी हंगाम', ta: 'படி அறு', te: 'కొయే కాలం', bn: 'ফসল কাটার মরশুম' },
      'Fertilizer schedule': { hi: 'खाद अनुसूची', kn: 'ವಪ್ಪಣಾ ವೇಳಾಪಟ್ಟಿ', mr: 'खत वेळापत्रक', ta: 'உலர் அட்டவணை', te: 'సారవ_schedule', bn: 'সারের সময়সূচি' }
    };
    if (!langCode || langCode === 'en') return key;
    return (map[key] && map[key][langCode]) || key;
  }

  // Compose answer depending on question keywords
  const q = (question || '').toLowerCase();
  let answer = '';
  if (q.includes('why') || q.includes('cause')) {
    answer = `${tLabel('Cause', lang)}: ${cause} ${tLabel('Risk', lang)}: ${risk}`;
  } else if (q.includes('ignore') || q.includes('what will happen')) {
    answer = `${tLabel('If ignored', lang)}: ${risk} ${tLabel('Immediate steps', lang)} — ${immediateSteps.join(' ')}.`;
  } else if (q.includes('what should i do') || q.includes('what to do') || q.includes('treatment') || q.includes('how to treat')) {
    answer = `${tLabel('Immediate steps', lang)}: ${immediateSteps.join(' ')} ${organicAdvice} ${chemicalAdvice}`;
  } else if (q.includes('spray') || q.includes('spraying') || q.includes('best time')) {
    answer = `${calendar.bestSprayingTime} ${tLabel('Immediate steps', lang)}: Avoid spraying before rain or in strong wind.`;
  } else if (q.includes('harvest') || q.includes('harvesting')) {
    answer = `${tLabel('Harvest season', lang)}: ${calendar.harvestSeason}`;
  } else if (q.includes('fertilizer') || q.includes('fertiliser') || q.includes('fertilize')) {
    answer = `${tLabel('Fertilizer schedule', lang)}: ${calendar.fertilizerSchedule.join(' ')}.`;
  } else {
    // multi-part friendly summary
    answer = `${tLabel('Immediate steps', lang)}: ${immediateSteps.join(' ')} ${organicAdvice} ${chemicalAdvice} ${calendar.bestSprayingTime}`;
  }

  // Return structured response
  return {
    question: question || 'general advice',
    answer,
    cause,
    risk,
    immediateSteps,
    organicAdvice,
    chemicalAdvice,
    calendar,
    scanId,
    confidence
  };
}

module.exports = { analyzeImage, generateAssistantResponse };
