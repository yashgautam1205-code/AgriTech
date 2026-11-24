const test = require('node:test');
const assert = require('node:assert/strict');
const { findNearbyShops } = require('../services/persistence');

test('JSON shop fallback only returns explicitly verified listings', async () => {
  const shops = await findNearbyShops(12.9716, 77.5946, 100, true);
  assert.ok(shops.every(shop => shop.verified === true));
});
