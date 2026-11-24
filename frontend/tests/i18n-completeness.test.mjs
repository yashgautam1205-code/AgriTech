import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { getTranslationCoverage, i18n } from '../src/i18n.js'

const localeCodes = ['en', 'kn', 'hi', 'ta', 'te', 'ml', 'mr', 'bn', 'gu', 'pa']
const sourcePath = new URL('../src/i18n.js', import.meta.url)
const sourceBytes = readFileSync(sourcePath)
const source = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes)

function placeholders(value) {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort()
}

function objectBodyAt(text, openingBrace) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = openingBrace; index < text.length; index += 1) {
    const character = text[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === "'" || character === '"' || character === '`') quote = character
    else if (character === '{') depth += 1
    else if (character === '}' && --depth === 0) return text.slice(openingBrace + 1, index)
  }
  assert.fail('unterminated locale object')
}

function propertyKeys(body) {
  const keys = []
  let index = 0
  while (index < body.length) {
    while (/\s|,/.test(body[index] || '')) index += 1
    const property = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:/.exec(body.slice(index))
    if (!property) {
      index += 1
      continue
    }
    keys.push(property[1])
    index += property[0].length
    let quote = null
    let escaped = false
    while (index < body.length) {
      const character = body[index]
      if (quote) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = null
      } else if (character === "'" || character === '"' || character === '`') {
        quote = character
      } else if (character === ',') {
        index += 1
        break
      }
      index += 1
    }
  }
  return keys
}

test('all supported locales provide the complete English key set', () => {
  const english = i18n.getResourceBundle('en', 'translation')
  assert.equal(Object.keys(english).length, 285)

  for (const locale of localeCodes) {
    const coverage = getTranslationCoverage(locale)
    const translations = i18n.getResourceBundle(locale, 'translation')
    assert.deepEqual(coverage.missing, [], `${locale} has missing keys`)
    assert.deepEqual(Object.keys(translations).sort(), Object.keys(english).sort(), `${locale} key set differs`)

    for (const [key, value] of Object.entries(translations)) {
      assert.equal(typeof value, 'string', `${locale}.${key} is not a string`)
      assert.ok(value.trim(), `${locale}.${key} is empty`)
      assert.deepEqual(placeholders(value), placeholders(english[key]), `${locale}.${key} changes interpolation variables`)
      if (locale !== 'en') assert.notEqual(value, english[key], `${locale}.${key} silently uses the English value`)
    }
  }
})

test('locale dictionary literals contain no duplicate keys', () => {
  const definitions = [
    ['en', 'hi'],
    ['hi', 'kn'],
    ['kn', 'localeCodes']
  ]
  for (const [name] of definitions) {
    const declaration = source.indexOf(`const ${name} = {`)
    assert.notEqual(declaration, -1, `${name} dictionary was not found`)
    const openingBrace = source.indexOf('{', declaration)
    const keys = propertyKeys(objectBodyAt(source, openingBrace))
    assert.equal(new Set(keys).size, keys.length, `${name} contains duplicate keys`)
  }

  for (const name of ['regionalPartial', 'regionalCompleteTranslations', 'supplementalTranslations', 'resultTranslations', 'resultDetailTranslations']) {
    const declaration = source.indexOf(`const ${name} = {`)
    assert.notEqual(declaration, -1, `${name} dictionary was not found`)
    const openingBrace = source.indexOf('{', declaration)
    const body = objectBodyAt(source, openingBrace)
    const localeBlocks = [...body.matchAll(/^\s{2}([a-z]{2}):\s*\{/gm)]
    const localeNames = localeBlocks.map((match) => match[1])
    assert.equal(new Set(localeNames).size, localeNames.length, `${name} repeats a locale`)
    for (let index = 0; index < localeBlocks.length; index += 1) {
      const locale = localeBlocks[index][1]
      const localeOpen = body.indexOf('{', localeBlocks[index].index)
      const keys = propertyKeys(objectBodyAt(body, localeOpen))
      assert.equal(new Set(keys).size, keys.length, `${name}.${locale} contains duplicate keys`)
      if (name === 'regionalCompleteTranslations') {
        assert.equal(keys.length, 110, `${locale} should define exactly 110 newly completed keys`)
      }
    }
  }
})

test('locale source is valid UTF-8 and contains no common mojibake markers', () => {
  assert.ok(!source.includes('\uFFFD'), 'source contains the Unicode replacement character')
  assert.ok(!/Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â€|ï¿½/.test(source), 'source contains likely mojibake')
})
