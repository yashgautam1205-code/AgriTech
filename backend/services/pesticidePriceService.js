const fs = require('fs/promises');
const path = require('path');
const { state: dbState } = require('../config/db');
const PesticidePrice = require('../models/PesticidePrice');
const {
  findVerifiedPesticideProduct,
  getVerifiedPesticideProducts
} = require('./pesticideCatalogService');

const pricesFile = path.join(__dirname, '..', 'data', 'pesticide-prices.json');
const PRICE_TYPES = new Set(['live_retail', 'manufacturer_mrp', 'historical_government', 'administrator_manual']);
const AVAILABILITY = new Set(['available', 'unavailable', 'unknown']);
const STALE_AFTER_DAYS = { live_retail: 7, manufacturer_mrp: 365, administrator_manual: 7 };

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validatePriceListing(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Price listing must be an object' };
  }

  const requiredText = [
    'productId', 'brandName', 'activeIngredient', 'formulation', 'packUnit',
    'seller', 'sourceUrl'
  ];
  for (const field of requiredText) {
    if (!isNonEmptyString(input[field])) {
      return { error: `${field} is required` };
    }
  }

  if (!Number.isFinite(Number(input.packSize)) || Number(input.packSize) <= 0) {
    return { error: 'packSize must be a positive number' };
  }
  if (!Number.isFinite(Number(input.price)) || Number(input.price) <= 0) {
    return { error: 'price must be a positive number' };
  }
  if (input.currency !== 'INR') {
    return { error: 'currency must be INR' };
  }
  if (!PRICE_TYPES.has(input.priceType)) {
    return { error: 'priceType is not supported' };
  }
  const allowedSourceTypes = new Set(['administrator', 'retailer_feed', 'manufacturer', 'government']);
  if (!allowedSourceTypes.has(input.sourceType)) {
    return { error: 'sourceType is not supported' };
  }
  if (input.priceType === 'live_retail' && input.sourceType !== 'retailer_feed') {
    return { error: 'Administrator-maintained prices cannot be classified as live retail prices' };
  }
  if (input.priceType === 'administrator_manual' && input.sourceType !== 'administrator') {
    return { error: 'Manually maintained prices must be attributed to an administrator' };
  }
  if (!AVAILABILITY.has(input.availabilityStatus || 'unknown')) {
    return { error: 'availabilityStatus is not supported' };
  }

  const location = input.location;
  if (!location || !['state', 'district', 'town'].every(key => isNonEmptyString(location[key]))) {
    return { error: 'location must include state, district, and town' };
  }

  let source;
  try {
    source = new URL(input.sourceUrl);
  } catch (error) {
    return { error: 'sourceUrl must be an absolute HTTP(S) URL' };
  }
  if (source.protocol !== 'https:') {
    return { error: 'sourceUrl must use HTTPS' };
  }

  const verifiedAt = new Date(input.verifiedAt);
  if (!Number.isFinite(verifiedAt.getTime()) || verifiedAt > new Date()) {
    return { error: 'verifiedAt must be a valid non-future timestamp' };
  }

  const normalized = {
    productId: input.productId.trim(),
    brandName: input.brandName.trim(),
    activeIngredient: input.activeIngredient.trim(),
    formulation: input.formulation.trim(),
    packSize: Number(input.packSize),
    packUnit: input.packUnit.trim(),
    price: Number(input.price),
    currency: 'INR',
    seller: input.seller.trim(),
    location: {
      state: location.state.trim(),
      district: location.district.trim(),
      town: location.town.trim()
    },
    priceType: input.priceType,
    sourceType: input.sourceType === 'administrator' ? 'administrator' : input.sourceType,
    availabilityStatus: input.availabilityStatus || 'unknown',
    sourceUrl: source.toString(),
    verifiedAt,
    lastUpdatedAt: new Date(),
    year: input.priceType === 'historical_government' ? Number(input.year) : undefined,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined
  };

  if (normalized.priceType === 'historical_government' &&
      (!Number.isInteger(normalized.year) || normalized.year < 1900 || normalized.year > new Date().getFullYear())) {
    return { error: 'Historical prices require a valid year no later than the current year' };
  }
  if (normalized.priceType === 'historical_government' &&
      normalized.sourceType !== 'government' && normalized.sourceType !== 'administrator') {
    return { error: 'Historical reference prices must cite a government source' };
  }
  if (normalized.priceType === 'historical_government' &&
      !(source.hostname === 'gov.in' || source.hostname.endsWith('.gov.in') ||
        source.hostname === 'nic.in' || source.hostname.endsWith('.nic.in'))) {
    return { error: 'Historical reference prices must cite an Indian government source' };
  }
  if (normalized.priceType === 'manufacturer_mrp' &&
      normalized.sourceType !== 'manufacturer' && normalized.sourceType !== 'administrator') {
    return { error: 'Manufacturer MRP records must cite a manufacturer source' };
  }
  if (normalized.expiresAt && !Number.isFinite(normalized.expiresAt.getTime())) {
    return { error: 'expiresAt must be a valid timestamp' };
  }
  return { listing: normalized };
}

function getStaleReason(listing, now = new Date()) {
  if (listing.expiresAt && new Date(listing.expiresAt) < now) {
    return 'Price record has expired.';
  }
  const maximumAgeDays = STALE_AFTER_DAYS[listing.priceType];
  if (maximumAgeDays) {
    const ageDays = (now - new Date(listing.verifiedAt)) / 86400000;
    if (ageDays > maximumAgeDays) {
      return `Price verification is older than ${maximumAgeDays} days.`;
    }
  }
  return null;
}

function toPublicListing(listing, now) {
  const staleReason = getStaleReason(listing, now);
  const priceTypeLabels = {
    live_retail: 'Live retail price',
    manufacturer_mrp: 'Manufacturer MRP',
    historical_government: `Historical reference price (${listing.year})`,
    administrator_manual: 'Administrator-maintained price'
  };
  return {
    id: String(listing._id || listing.id || ''),
    product_id: listing.productId,
    brand_name: listing.brandName,
    active_ingredient: listing.activeIngredient,
    formulation: listing.formulation,
    pack_size: { value: listing.packSize, unit: listing.packUnit },
    price: staleReason ? null : { amount: listing.price, currency: 'INR' },
    seller: listing.seller,
    location: listing.location,
    price_type: priceTypeLabels[listing.priceType],
    price_type_code: listing.priceType,
    source_type: listing.sourceType,
    availability_status: listing.availabilityStatus,
    last_updated_at: listing.lastUpdatedAt,
    verified_at: listing.verifiedAt,
    source_url: listing.sourceUrl,
    stale: Boolean(staleReason),
    stale_reason: staleReason
  };
}

function matchesFilters(listing, filters) {
  if (filters.productId && listing.productId !== filters.productId) return false;
  if (Array.isArray(filters.productIds) && !filters.productIds.includes(listing.productId)) return false;
  for (const key of ['state', 'district', 'town']) {
    if (filters[key] && String(listing.location?.[key] || '').toLowerCase() !== filters[key].toLowerCase()) {
      return false;
    }
  }
  return true;
}

function matchesApprovedPackSize(product, listing) {
  return Array.isArray(product?.packSizes) && product.packSizes.some(pack =>
    Number(pack.value) === Number(listing.packSize) &&
    String(pack.unit).toLowerCase() === String(listing.packUnit).toLowerCase()
  );
}

function isValidStoredPriceListing(listing, now = new Date()) {
  const updatedAt = new Date(listing.lastUpdatedAt);
  return !validatePriceListing(listing).error &&
    Number.isFinite(updatedAt.getTime()) &&
    updatedAt <= now;
}

async function ensurePriceFile() {
  try {
    await fs.access(pricesFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(pricesFile, '[]', 'utf8');
  }
}

async function readJsonListings() {
  await ensurePriceFile();
  return JSON.parse(await fs.readFile(pricesFile, 'utf8'));
}

async function writeJsonListings(listings) {
  await fs.writeFile(pricesFile, JSON.stringify(listings, null, 2), 'utf8');
}

async function listPesticidePrices(filters = {}, now = new Date()) {
  let listings;
  if (dbState.connected) {
    listings = await PesticidePrice.find().lean();
  } else {
    listings = await readJsonListings();
  }
  const products = await getVerifiedPesticideProducts(now);
  const verifiedProducts = new Map(products.map(product => [product.productId, product]));
  const seen = new Set();
  return listings
    .filter(listing => isValidStoredPriceListing(listing, now))
    .filter(listing => matchesApprovedPackSize(verifiedProducts.get(listing.productId), listing))
    .filter(listing => matchesFilters(listing, filters))
    .filter(listing => {
      const key = [
        listing.productId, listing.packSize, listing.packUnit, listing.seller,
        listing.location.state, listing.location.district, listing.location.town,
        listing.priceType, listing.year
      ].join('|').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(listing => toPublicListing(listing, now));
}

function isDuplicate(existing, listing) {
  const fields = ['productId', 'packSize', 'packUnit', 'seller', 'priceType', 'year'];
  return fields.every(field => String(existing[field]).toLowerCase() === String(listing[field]).toLowerCase()) &&
    ['state', 'district', 'town'].every(field =>
      String(existing.location?.[field] || '').toLowerCase() === listing.location[field].toLowerCase()
    );
}

async function createPesticidePrice(input) {
  const { listing, error } = validatePriceListing(input);
  if (error) return { error };
  const product = await findVerifiedPesticideProduct(listing.productId);
  if (!product) {
    return { error: 'Price listings are limited to products with verified registration and label records' };
  }
  if (!matchesApprovedPackSize(product, listing)) return { error: 'packSize and packUnit do not match a verified product pack' };
  if (dbState.connected) {
    const existing = await PesticidePrice.findOne({
      productId: listing.productId,
      packSize: listing.packSize,
      packUnit: listing.packUnit,
      seller: listing.seller,
      'location.state': listing.location.state,
      'location.district': listing.location.district,
      'location.town': listing.location.town,
      priceType: listing.priceType,
      year: listing.year
    }).lean();
    if (existing) return { error: 'A listing for this product, pack, seller, location, and price type already exists' };
    const created = await PesticidePrice.create(listing);
    return { listing: toPublicListing(created.toObject()) };
  }

  const listings = await readJsonListings();
  if (listings.some(existing => isDuplicate(existing, listing))) {
    return { error: 'A listing for this product, pack, seller, location, and price type already exists' };
  }
  const created = { ...listing, id: require('crypto').randomUUID() };
  listings.push(created);
  await writeJsonListings(listings);
  return { listing: toPublicListing(created) };
}

async function updatePesticidePrice(id, input) {
  const { listing, error } = validatePriceListing(input);
  if (error) return { error };
  const product = await findVerifiedPesticideProduct(listing.productId);
  if (!product) {
    return { error: 'Price listings are limited to products with verified registration and label records' };
  }
  if (!matchesApprovedPackSize(product, listing)) return { error: 'packSize and packUnit do not match a verified product pack' };
  if (dbState.connected) {
    const duplicate = await PesticidePrice.findOne({
      productId: listing.productId,
      packSize: listing.packSize,
      packUnit: listing.packUnit,
      seller: listing.seller,
      'location.state': listing.location.state,
      'location.district': listing.location.district,
      'location.town': listing.location.town,
      priceType: listing.priceType,
      year: listing.year,
      _id: { $ne: id }
    }).lean();
    if (duplicate) return { error: 'A listing for this product, pack, seller, location, and price type already exists' };
    const updated = await PesticidePrice.findByIdAndUpdate(id, listing, { new: true, runValidators: true }).lean();
    return updated ? { listing: toPublicListing(updated) } : { error: 'Price listing not found' };
  }

  const listings = await readJsonListings();
  const index = listings.findIndex(existing => String(existing.id || existing._id) === String(id));
  if (index < 0) return { error: 'Price listing not found' };
  if (listings.some((existing, otherIndex) => otherIndex !== index && isDuplicate(existing, listing))) {
    return { error: 'A listing for this product, pack, seller, location, and price type already exists' };
  }
  listings[index] = { ...listing, id: listings[index].id };
  await writeJsonListings(listings);
  return { listing: toPublicListing(listings[index]) };
}

module.exports = {
  createPesticidePrice,
  getStaleReason,
  isDuplicate,
  isValidStoredPriceListing,
  listPesticidePrices,
  matchesApprovedPackSize,
  toPublicListing,
  updatePesticidePrice,
  validatePriceListing
};
