import assert from 'node:assert/strict'
import {
  GENERATION_INSTRUCTIONS,
  GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION,
  GENERIC_CONTRACT_PRODUCT_RULES,
} from './generator'

const instructions = GENERATION_INSTRUCTIONS.toLowerCase()
const productRules = GENERIC_CONTRACT_PRODUCT_RULES.join(' ').toLowerCase()

// Compatible transaction facts leave general or conditional source terms intact.
assert.match(GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, /facts about this transaction/i)
assert.match(GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, /source controls general or conditional contractual terms/i)
assert.match(GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, /preserve any source term that can coexist with current facts/i)

// Explicit supersession remains an authorized reason to change a source term.
assert.match(GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, /current authority or an explicit product rule clearly establishes that it is superseded, waived, or replaced/i)
assert.match(GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, /update stale transaction-specific facts without discarding the surrounding condition/i)

// A preservable condition alone requires neither extra input nor a conflict.
assert.match(GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, /do not request missing input or report a conflict solely to evaluate a condition that can be faithfully preserved/i)
assert.match(instructions, /return conflict_input only for a material conflict not resolved by the source, authority, answers, or product rules/i)

// Generic commercial status and amount facts do not erase compatible source policy.
assert.match(productRules, /apply current commercial statuses and amounts as facts about this transaction/i)
assert.match(productRules, /do not by themselves supersede compatible general or conditional source terms/i)

console.log('PASS generic current-fact and conditional-source authority boundary')
