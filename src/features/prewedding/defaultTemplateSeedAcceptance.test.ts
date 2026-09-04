/**
 * Phase 0: getOrSeedDefault must never rewrite a user-owned template.
 * source_key marks origin, not live sync with the latest OurWed default.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decidePreWeddingDefaultSeed } from '@/features/prewedding/defaultTemplateSeed'
import {
  DEFAULT_TEMPLATE_SOURCE_KEY,
  DEFAULT_TEMPLATE_SOURCE_KEY_V1,
} from '@/features/prewedding/defaultTemplate'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS  ${message}`)
    passed++
  } else {
    console.error(`  FAIL  ${message}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    console.error(
      `  FAIL  ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
    failed++
  } else {
    console.log(`  PASS  ${message}`)
    passed++
  }
}

function run(name: string, fn: () => void) {
  console.log(`\n${name}`)
  fn()
}

function getOrSeedDefaultBody(): string {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
    'utf8',
  )
  const start = src.indexOf('async getOrSeedDefault()')
  const end = src.indexOf('async create(', start)
  assert(start >= 0 && end > start, 'getOrSeedDefault is present')
  return src.slice(start, end)
}

run('versioning: source_key is origin, not a live-sync pointer', () => {
  const defaults = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/defaultTemplate.ts'),
    'utf8',
  )
  const seed = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/defaultTemplateSeed.ts'),
    'utf8',
  )
  assertEqual(DEFAULT_TEMPLATE_SOURCE_KEY, 'pre_wedding_default_v2', 'v2 origin key')
  assertEqual(DEFAULT_TEMPLATE_SOURCE_KEY_V1, 'pre_wedding_default_v1', 'v1 origin key')
  assert(defaults.includes('mark ORIGIN only'), 'defaultTemplate origin comment')
  assert(
    defaults.includes('Never UPDATE an existing user-owned template'),
    'defaultTemplate forbids in-place rewrite',
  )
  assert(
    !defaults.includes('upgrade recognition'),
    'v1 key is not an upgrade trigger',
  )
  assert(
    seed.includes('Future versions must be a new source_key'),
    'v3 is a new copied template',
  )
  assert(!/'update_legacy'/.test(seed), 'decision type has no update-legacy action')
})

run('A: existing v1/custom does not trigger rewrite — missing v2 inserts a NEW row', () => {
  const withV1Default = decidePreWeddingDefaultSeed({
    hasCurrentSourceKey: false,
    hasActiveDefault: true,
  })
  assertEqual(withV1Default.action, 'insert_current', 'A: seed inserts v2 beside existing default')
  if (withV1Default.action === 'insert_current') {
    assertEqual(withV1Default.isDefault, false, 'A: does not steal existing is_default')
  }
})

run('B: existing current v2 is returned, not duplicated', () => {
  const existing = decidePreWeddingDefaultSeed({
    hasCurrentSourceKey: true,
    hasActiveDefault: true,
  })
  assertEqual(existing.action, 'return_current', 'B: return existing v2')
  const existingAlone = decidePreWeddingDefaultSeed({
    hasCurrentSourceKey: true,
    hasActiveDefault: false,
  })
  assertEqual(existingAlone.action, 'return_current', 'B: archived/non-default v2 still returned')
})

run('C: missing v2 can be explicitly seeded once', () => {
  const empty = decidePreWeddingDefaultSeed({
    hasCurrentSourceKey: false,
    hasActiveDefault: false,
  })
  assertEqual(empty.action, 'insert_current', 'C: insert when missing')
  if (empty.action === 'insert_current') {
    assertEqual(empty.isDefault, true, 'C: becomes default when none exists')
  }
})

run('D: repeated seed is idempotent (same decision every time v2 exists)', () => {
  const first = decidePreWeddingDefaultSeed({
    hasCurrentSourceKey: true,
    hasActiveDefault: false,
  })
  const second = decidePreWeddingDefaultSeed({
    hasCurrentSourceKey: true,
    hasActiveDefault: false,
  })
  assertEqual(first.action, 'return_current', 'D: first call returns current')
  assertEqual(second.action, 'return_current', 'D: second call returns current')
})

run('official V1 presets skip generic v2 insert', () => {
  const official = decidePreWeddingDefaultSeed({
    hasCurrentSourceKey: false,
    hasOfficialPresetSourceKey: true,
    hasActiveDefault: true,
  })
  assertEqual(official.action, 'return_official', 'official account does not insert v2')
})

run('E + service: getOrSeedDefault never mutates owned rows or issued snapshots', () => {
  const body = getOrSeedDefaultBody()
  assert(!body.includes('.update('), 'never UPDATE template rows')
  assert(!body.includes('DEFAULT_TEMPLATE_SOURCE_KEY_V1'), 'does not look up v1 to rewrite it')
  assert(body.includes("error.code === '23505'"), 'unique (owner_id, source_key) race is idempotent')
  assert(body.includes('decidePreWeddingDefaultSeed'), 'uses origin-only seed decision')
  assert(!body.includes('wedding_questionnaires'), 'does not write issued schema_snapshot_json')
  assert(!body.includes('schema_snapshot_json'), 'does not touch snapshot column')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
