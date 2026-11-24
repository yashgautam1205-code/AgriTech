const test = require('node:test');
const assert = require('node:assert/strict');
const { getGovernmentSchemeReferences } = require('../services/governmentSchemeService');

test('static scheme references are not represented as a live daily feed', () => {
  const result = getGovernmentSchemeReferences();
  assert.equal(result.source, 'curated static references');
  assert.equal('updatedAt' in result, false);
  assert.equal('validUntil' in result, false);
  assert.match(result.message, /not a live government feed/);
  assert.ok(result.schemes.length > 0);
});
