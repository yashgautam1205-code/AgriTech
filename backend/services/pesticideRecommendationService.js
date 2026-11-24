const pesticideCatalogService = require('./pesticideCatalogService');
const { getDiseaseClassMetadata } = require('./diseaseClassRegistry');
const { isProductVerified } = pesticideCatalogService;

async function getChemicalRecommendations({
  crop,
  predictedClass,
  isUncertain,
  riskLevel,
  applicationAllowed = true
}, catalog = null) {
  const classMetadata = getDiseaseClassMetadata(predictedClass);
  if (!crop || !classMetadata || classMetadata.condition !== 'diseased' || crop !== classMetadata.modelCrop) {
    return {
      status: 'NOT_AVAILABLE',
      recommendations: [],
      message: 'A mapped diseased class and its exact model crop are required to look up verified products.'
    };
  }
  const disease = predictedClass.split('___')[1] || '';
  const products = catalog || await pesticideCatalogService.getVerifiedPesticideProducts();
  const matchingProducts = products
    .filter(product =>
      isProductVerified(product) &&
      Array.isArray(product.targetClasses) &&
      product.targetClasses.includes(predictedClass)
    );
  const canProvideApplicationAdvice = applicationAllowed &&
    !isUncertain &&
    (riskLevel === 'MEDIUM' || riskLevel === 'HIGH');
  const useRestriction = isUncertain
    ? 'Not recommended for application based on this uncertain scan. Confirm the disease and check the approved product label with a qualified agricultural professional.'
    : riskLevel === 'LOW'
    ? 'No pesticide application is recommended for this low observation-based risk. Continue monitoring and seek confirmation if symptoms worsen.'
    : 'Product information is for reference only; application advice is unavailable until disease risk can be assessed.';
  const recommendations = matchingProducts.map(product => ({
      product_id: product.productId,
      brand_name: product.brandName,
      manufacturer: product.manufacturer,
      active_ingredient: product.activeIngredient,
      formulation: product.formulation,
      concentration: product.concentration,
      target_crop: crop,
      target_disease: disease,
      registration_information: product.registrationInformation,
      registration_verification: product.registrationVerification,
      approved_label_information: product.approvedLabelInformation,
      application_dosage: canProvideApplicationAdvice
        ? product.approvedDosage || 'Application dosage unavailable. Consult the approved product label or a qualified agricultural expert.'
        : null,
      pre_harvest_interval: product.preHarvestInterval || null,
      re_entry_interval: product.reEntryInterval || null,
      safety_information: product.safetyInformation,
      registration_source_url: product.registrationSourceUrl,
      label_source_url: product.labelSourceUrl,
      last_verified_at: product.lastVerifiedAt,
      use_restriction: canProvideApplicationAdvice ? null : useRestriction
    }));

  return {
    status: recommendations.length
      ? canProvideApplicationAdvice ? 'AVAILABLE' : 'RESTRICTED'
      : 'NOT_AVAILABLE',
    applicationAllowed: canProvideApplicationAdvice,
    recommendations,
    message: recommendations.length
      ? canProvideApplicationAdvice
        ? null
        : `Verified product information is available for reference only. ${useRestriction}`
      : 'No matching verified pesticide registration and approved-label record is available for this possible disease match.'
  };
}

module.exports = { getChemicalRecommendations };
