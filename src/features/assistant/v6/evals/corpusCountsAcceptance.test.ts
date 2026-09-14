/**
 * V6-F1 — Corpus count gate (no live Luna).
 */

import assert from 'node:assert/strict'
import { v6FoundationCorpusCounts } from './foundationCorpus'

const counts = v6FoundationCorpusCounts()
assert.equal(counts.single, 40)
assert.equal(counts.multi, 15)
assert.equal(counts.adversarial, 10)
assert.equal(counts.unsupported, 10)
assert.ok(counts.holdout >= 10)
console.log('  OK corpus counts', counts)
