import assert from 'node:assert/strict'
import { CONFLICT_REVIEW_INSTRUCTIONS, GENERATION_INSTRUCTIONS, GENERIC_CONTRACT_PRODUCT_RULES } from './generator'

const rules = GENERIC_CONTRACT_PRODUCT_RULES.join(' ')
const generator = GENERATION_INSTRUCTIONS.toLowerCase()
const conflictVerifier = CONFLICT_REVIEW_INSTRUCTIONS.toLowerCase()

// Synthetic authority cases: a source base service A, package metadata B, and a wedding extra C.
assert.match(rules, /selected source contract template already expresses the contractual base scope of the base package it is assigned to/i)
assert.match(rules, /package names, labels, categories, base package items, and package-associated base deliverable metadata are transaction\/package context/i)
assert.match(rules, /by themselves they do not supersede, reconstruct, enrich, redefine, or conflict with source-controlled base service identity, scope, deliverables, or obligations/i)
assert.match(rules, /only when an explicit product rule or authoritative user input establishes that they govern that fact/i)
assert.match(generator, /do not invent legal clauses or alter base service scope/i)

// Base package items remain available as context, but are not wedding-specific extras and cannot enrich base scope by themselves.
assert.match(rules, /wedding-specific purchased extras are authoritative current transaction facts distinct from base package metadata/i)
assert.match(rules, /do not add extras or charged travel on top of it/i)
assert.match(rules, /incorporate an extra not already represented as an additional purchased item in a source-compatible contractual location/i)
assert.match(rules, /do not duplicate one already adequately represented/i)
assert.match(rules, /without redefining unrelated base service scope/i)
assert.match(rules, /if a material fact required to represent an extra is genuinely absent .* request it through the normal batch missing_input mechanism/i)
assert.doesNotMatch(rules, /album|drone|vhs|photographer|videographer|photo|video/i, 'generic rules must not encode particular extra or service mappings')

// Package-versus-scope verification is required only for the conflict actually claimed.
assert.match(conflictVerifier, /for a specifically claimed package-versus-source-scope conflict/i)
assert.match(conflictVerifier, /whether package names, labels, categories, base package items, or package-associated base deliverable metadata are explicitly authorized to govern that same contractual fact/i)
assert.match(conflictVerifier, /absent such authority, they are transaction\/package context and do not by themselves .* conflict with source-controlled base scope/i)
assert.match(conflictVerifier, /based only on non-governing package metadata/i)
assert.match(conflictVerifier, /do not search for additional or unrelated conflicts, omitted missing inputs, package or service-scope issues/i)
assert.match(conflictVerifier, /beyond the generator's claimed conflict\(s\)/i)
assert.match(conflictVerifier, /you must assess a specifically claimed package or service-scope conflict under the rules above/i)

// Existing missing, conditional-source, and stale-transaction boundaries remain intact.
assert.match(generator, /before returning missing_input, inspect the complete source contract for every currently discoverable source-required fact/i)
assert.match(generator, /return all such gaps together; do not stop at the first/i)
assert.match(generator, /do not request facts already sufficiently established/i)
assert.match(generator, /treat a compatible conditional source term as a missing input/i)
assert.match(generator, /source controls general or conditional contractual terms/i)
assert.match(generator, /update stale transaction-specific facts without discarding the surrounding condition/i)
assert.match(conflictVerifier, /a stale source transaction-specific value .* difference alone is not a conflict/i)

console.log('PASS generic package/base-scope and wedding-extra authority rules')
