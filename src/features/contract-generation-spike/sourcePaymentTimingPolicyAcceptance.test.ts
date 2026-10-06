import assert from 'node:assert/strict'
import { GENERIC_CONTRACT_PRODUCT_RULES } from './generator'

const rules = GENERIC_CONTRACT_PRODUCT_RULES.join(' ')
assert.match(rules, /Preserve source-defined payment timing for each obligation/i)
assert.match(rules, /unless an existing explicit authority replaces that same obligation/i)
assert.match(rules, /do not invent signing dates or convert relative deadlines/i)
assert.match(rules, /unless an existing explicit authority replaces that same obligation/i, 'explicit wedding-day authority can replace a source relative deadline for that obligation')
assert.match(rules, /Preserve source-defined payment timing for each obligation/i, 'without an explicit replacement, the source relative deadline remains authoritative')
assert.doesNotMatch(rules, /within 3 days|within 5 days|7 days before the wedding|paymentTimingSignature|timingPhraseDictionary/i)
console.log('PASS generic source-defined payment timing product rule')
