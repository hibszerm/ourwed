// =============================================================================
// Packages page — no production-reachable dev/reference tooling
// =============================================================================

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  FAIL  ${msg}`)
    failed++
  } else {
    console.log(`  PASS  ${msg}`)
    passed++
  }
}

const pagePath = resolve(process.cwd(), 'src/pages/PackagesPage.tsx')
const src = readFileSync(pagePath, 'utf8')

console.log('\nPackages page — product surface hygiene\n')

assert(!src.includes("from '@/lib/dev/"), 'no @/lib/dev imports')
assert(!src.includes('lib/dev/'), 'no lib/dev path references')
assert(
  !src.includes('ensureReferenceWeddingSetup'),
  'no reference wedding seeder',
)
assert(
  !src.includes('ensureCompleteWeddingBriefReference'),
  'no brief reference seeder',
)
assert(!/Ślub referencyjn/i.test(src), 'no Ślub referencyjny UI copy')
assert(!/Brief demo/i.test(src), 'no Brief demo UI copy')
assert(!src.includes('seed-wedding-brief-demo'), 'no brief seed testid')
assert(!src.includes('seedBusy'), 'no seedBusy state')
assert(!src.includes('seedMessage'), 'no seedMessage state')
assert(!src.includes('import.meta.env.DEV'), 'no DEV gate leftover on Packages')

// Real package product still present
assert(src.includes('packageService'), 'packageService still used')
assert(src.includes('Nowy pakiet'), 'create package CTA preserved')
assert(src.includes('PackageContractSection'), 'package contract section preserved')
assert(src.includes('packageItemService'), 'package items still used')

// Dev fixtures remain available outside the page (tests / scripts)
const refPath = resolve(process.cwd(), 'src/lib/dev/referenceWedding.ts')
const briefPath = resolve(
  process.cwd(),
  'src/lib/dev/ensureCompleteWeddingBriefReference.ts',
)
assert(
  readFileSync(refPath, 'utf8').length > 0,
  'referenceWedding fixture module still exists for tests',
)
assert(
  readFileSync(briefPath, 'utf8').includes('ensureCompleteWeddingBriefReference'),
  'brief reference helper still exists for explicit DEV use',
)

console.log(`\npackages-page-dev-tooling: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
