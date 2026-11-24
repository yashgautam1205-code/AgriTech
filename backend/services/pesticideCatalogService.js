const fs = require('fs/promises');
const path = require('path');
const { state: dbState } = require('../config/db');
const PesticideProduct = require('../models/PesticideProduct');
const { getDiseaseClassRecords } = require('./diseaseClassRegistry');

const productsFile = path.join(__dirname, '..', 'data', 'pesticide-products.json');
const MAX_VERIFICATION_AGE_DAYS = 365;
const SUPPORTED_DISEASE_CLASSES = new Set(
  getDiseaseClassRecords()
    .filter(record => record.condition === 'diseased')
    .map(record => record.className)
);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function isOfficialRegistrationUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'ppqs.gov.in' || hostname.endsWith('.ppqs.gov.in');
  } catch (error) {
    return false;
  }
}

function validatePesticideProduct(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Pesticide product must be an object' };
  }
  const requiredText = [
    'productId', 'brandName', 'manufacturer', 'activeIngredient', 'formulation',
    'concentration', 'registrationInformation', 'labelSourceUrl',
    'approvedLabelInformation', 'safetyInformation', 'verifiedBy'
  ];
  for (const field of requiredText) {
    if (!isNonEmptyString(input[field])) return { error: `${field} is required` };
  }
  if (!Array.isArray(input.targetClasses) || input.targetClasses.length === 0 ||
      input.targetClasses.some(value => !SUPPORTED_DISEASE_CLASSES.has(value))) {
    return { error: 'targetClasses must contain exact supported PlantVillage class labels' };
  }
  if (!Array.isArray(input.packSizes) || input.packSizes.length === 0 ||
      input.packSizes.some(pack => !Number.isFinite(Number(pack.value)) || Number(pack.value) <= 0 ||
        !isNonEmptyString(pack.unit))) {
    return { error: 'packSizes must contain verified positive sizes and units' };
  }
  if (!isOfficialRegistrationUrl(input.registrationSourceUrl)) {
    return { error: 'registrationSourceUrl must reference the official PPQS/CIB&RC site' };
  }
  if (!isHttpsUrl(input.labelSourceUrl)) {
    return { error: 'labelSourceUrl must be an absolute HTTPS URL' };
  }
  if (!['pending', 'verified'].includes(input.registrationVerification) ||
      !['pending', 'verified'].includes(input.labelVerification)) {
    return { error: 'Registration and label verification must be pending or verified' };
  }
  if ((input.registrationVerification !== 'verified' || input.labelVerification !== 'verified') &&
      input.approvedDosage) {
    return { error: 'Dosage may be stored only after the registration and label are verified' };
  }

  const lastVerifiedAt = new Date(input.lastVerifiedAt);
  if (!Number.isFinite(lastVerifiedAt.getTime()) || lastVerifiedAt > new Date()) {
    return { error: 'lastVerifiedAt must be a valid non-future timestamp' };
  }

  return {
    product: {
      productId: input.productId.trim(),
      brandName: input.brandName.trim(),
      manufacturer: input.manufacturer.trim(),
      activeIngredient: input.activeIngredient.trim(),
      formulation: input.formulation.trim(),
      concentration: input.concentration.trim(),
      targetClasses: [...new Set(input.targetClasses)],
      targetCrops: [...new Set(input.targetClasses.map(value => value.split('___')[0]))],
      targetDiseases: [...new Set(input.targetClasses.map(value => value.split('___')[1]))],
      packSizes: [...new Map(input.packSizes.map(pack => [
        `${Number(pack.value)}:${pack.unit.trim().toLowerCase()}`,
        { value: Number(pack.value), unit: pack.unit.trim() }
      ])).values()],
      registrationInformation: input.registrationInformation.trim(),
      registrationSourceUrl: input.registrationSourceUrl.trim(),
      registrationVerification: input.registrationVerification,
      labelSourceUrl: input.labelSourceUrl.trim(),
      labelVerification: input.labelVerification,
      approvedLabelInformation: input.approvedLabelInformation.trim(),
      approvedDosage: input.approvedDosage ? input.approvedDosage.trim() : null,
      preHarvestInterval: input.preHarvestInterval || null,
      reEntryInterval: input.reEntryInterval || null,
      safetyInformation: input.safetyInformation.trim(),
      verifiedBy: input.verifiedBy.trim(),
      lastVerifiedAt,
      active: input.active !== false
    }
  };
}

function isProductVerified(product, now = new Date()) {
  const verifiedAt = new Date(product.lastVerifiedAt);
  return !validatePesticideProduct(product).error &&
    product.active === true &&
    product.registrationVerification === 'verified' &&
    product.labelVerification === 'verified' &&
    Number.isFinite(verifiedAt.getTime()) &&
    verifiedAt <= now &&
    (now - verifiedAt) / 86400000 <= MAX_VERIFICATION_AGE_DAYS;
}

async function ensureProductFile() {
  try {
    await fs.access(productsFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(productsFile, '[]', 'utf8');
  }
}

async function readJsonProducts() {
  await ensureProductFile();
  return JSON.parse(await fs.readFile(productsFile, 'utf8'));
}

async function writeJsonProducts(products) {
  await fs.writeFile(productsFile, JSON.stringify(products, null, 2), 'utf8');
}

async function listPesticideProducts() {
  return dbState.connected ? PesticideProduct.find().lean() : readJsonProducts();
}

async function getVerifiedPesticideProducts(now = new Date()) {
  const products = await listPesticideProducts();
  return products.filter(product => isProductVerified(product, now));
}

async function findVerifiedPesticideProduct(productId) {
  const products = await getVerifiedPesticideProducts();
  return products.find(product => product.productId === productId) || null;
}

async function createPesticideProduct(input) {
  const { product, error } = validatePesticideProduct(input);
  if (error) return { error };
  if (dbState.connected) {
    const existing = await PesticideProduct.findOne({ productId: product.productId }).lean();
    if (existing) return { error: 'A pesticide product with this productId already exists' };
    const created = await PesticideProduct.create(product);
    return { product: created.toObject() };
  }

  const products = await readJsonProducts();
  if (products.some(existing => existing.productId === product.productId)) {
    return { error: 'A pesticide product with this productId already exists' };
  }
  products.push(product);
  await writeJsonProducts(products);
  return { product };
}

async function updatePesticideProduct(productId, input) {
  const { product, error } = validatePesticideProduct({ ...input, productId });
  if (error) return { error };
  if (dbState.connected) {
    const updated = await PesticideProduct.findOneAndUpdate(
      { productId },
      product,
      { new: true, runValidators: true }
    ).lean();
    return updated ? { product: updated } : { error: 'Pesticide product not found' };
  }

  const products = await readJsonProducts();
  const index = products.findIndex(existing => existing.productId === productId);
  if (index < 0) return { error: 'Pesticide product not found' };
  products[index] = product;
  await writeJsonProducts(products);
  return { product };
}

module.exports = {
  createPesticideProduct,
  findVerifiedPesticideProduct,
  getVerifiedPesticideProducts,
  isOfficialRegistrationUrl,
  isProductVerified,
  listPesticideProducts,
  updatePesticideProduct,
  validatePesticideProduct
};
