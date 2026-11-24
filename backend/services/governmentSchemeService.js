const schemes = [
  {
    id: 'PMFBY',
    title: 'Pradhan Mantri Fasal Bima Yojana',
    category: 'Crop Insurance',
    benefit: 'Provides insurance cover for crop losses caused by weather, pests, and diseases.',
    description: 'Small and marginal farmers can get reduced premium rates and fast settlement for damaged crops.',
    applyLink: 'https://pmfby.gov.in/'
  },
  {
    id: 'PMKSY',
    title: 'Pradhan Mantri Krishi Sinchai Yojana',
    category: 'Irrigation',
    benefit: 'Supports irrigation infrastructure and water-saving systems for farms.',
    description: 'Farmers get financial support for drip irrigation, sprinkler systems, and efficient water use.',
    applyLink: 'https://pmksy.gov.in/'
  },
  {
    id: 'PMKKKY',
    title: 'Pradhan Mantri Kisan Kaushal Vikas Yojana',
    category: 'Skill Development',
    benefit: 'Helps farmers gain training in modern agriculture, organic farming, and agro-processing.',
    description: 'Training improves income, crop quality, and access to new markets.',
    applyLink: 'https://pmkky.gov.in/'
  },
  {
    id: 'PM-KISAN',
    title: 'Pradhan Mantri Kisan Samman Nidhi',
    category: 'Income Support',
    benefit: 'Annual cash support directly credited to small and marginal farmer bank accounts.',
    description: 'Regular installments help cover input costs and improve cash flow during the cropping cycle.',
    applyLink: 'https://pmkisan.gov.in/'
  },
  {
    id: 'SAMPADA',
    title: 'Pradhan Mantri Kisan Sampada Yojana',
    category: 'Agri-Processing',
    benefit: 'Funds food processing infrastructure to reduce post-harvest losses and improve value addition.',
    description: 'Farmers and farmer groups can benefit from better storage, grading, and market linkages.',
    applyLink: 'https://sampada.co.in/'
  },
  {
    id: 'SOIL HEALTH',
    title: 'Soil Health Card Scheme',
    category: 'Soil Health',
    benefit: 'Provides soil health reports and crop-specific nutrient recommendations.',
    description: 'Regular soil testing helps farmers choose the right fertilizers and improve yield.',
    applyLink: 'https://soilhealth.dac.gov.in/'
  }
]

function getGovernmentSchemeReferences() {
  return {
    source: 'curated static references',
    message: 'This list is not a live government feed. Confirm current eligibility, availability, and application details on the official portal.',
    schemes
  }
}

module.exports = { getGovernmentSchemeReferences }
