import assert from 'node:assert/strict'
import { GENERIC_CONTRACT_PRODUCT_RULES } from './generator'

assert.match(GENERIC_CONTRACT_PRODUCT_RULES.join(' '), /contractValue is the authoritative total/i)
assert.match(GENERIC_CONTRACT_PRODUCT_RULES.join(' '), /Preserve source-defined payment timing for each obligation/i)
console.log('PASS payment composition and source timing product rules')
