/**
 * Wedding package_id FK safety — hydrate + update payload decisions.
 */

import {
  decideWeddingPackageIdWrite,
  resolveHydratedWeddingPackageId,
} from '@/lib/api/weddings/weddingPackageIdSafety'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

const STALE = 'ec09bec0-e14f-4ec8-affb-809d7d0f4363'
const VALID = 'b20aec57-c63d-4c0c-965f-d7da843d66c1'

run('1. Hydrate keeps existing wedding packageId', () => {
  assertEq(
    resolveHydratedWeddingPackageId({
      weddingPackageId: VALID,
      resolvedCatalogPackageId: STALE,
    }),
    VALID,
    'keep wedding',
  )
})

run('2. Hydrate uses resolved catalog package when wedding has none', () => {
  assertEq(
    resolveHydratedWeddingPackageId({
      weddingPackageId: null,
      resolvedCatalogPackageId: VALID,
    }),
    VALID,
    'resolved',
  )
})

run('3. Hydrate does not fall back to unresolved form UUID', () => {
  assertEq(
    resolveHydratedWeddingPackageId({
      weddingPackageId: null,
      resolvedCatalogPackageId: null,
    }),
    null,
    'null',
  )
})

run('4. Update writes null when clearing package', () => {
  const d = decideWeddingPackageIdWrite({
    incomingPackageId: null,
    packageExists: null,
    currentPackageId: VALID,
  })
  assert(d.include && d.value === null, 'clear')
})

run('5. Update writes valid package id', () => {
  const d = decideWeddingPackageIdWrite({
    incomingPackageId: VALID,
    packageExists: true,
  })
  assert(d.include && d.value === VALID, 'write valid')
})

run('6. Update omits stale missing package id (preserve DB)', () => {
  const d = decideWeddingPackageIdWrite({
    incomingPackageId: STALE,
    packageExists: false,
    currentPackageId: null,
  })
  assert(!d.include, 'omit stale')
})

run('7. Non-uuid catalog ids become null writes', () => {
  const d = decideWeddingPackageIdWrite({
    incomingPackageId: 'p1',
    packageExists: null,
  })
  assert(d.include && d.value === null, 'legacy mock')
})

run('8. Unrelated edit omits unchanged null package_id', () => {
  const d = decideWeddingPackageIdWrite({
    incomingPackageId: null,
    packageExists: null,
    currentPackageId: null,
  })
  assert(!d.include, 'omit unchanged null')
})

run('9. Unrelated edit omits unchanged valid package_id', () => {
  const d = decideWeddingPackageIdWrite({
    incomingPackageId: VALID,
    packageExists: true,
    currentPackageId: VALID,
  })
  assert(!d.include, 'omit unchanged valid')
})

run('10. mergeFormAnswers no longer falls back to requestedPrimary', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/forms/mergeFormAnswersIntoWedding.ts'),
    'utf8',
  )
  assert(src.includes('resolveHydratedWeddingPackageId'), 'helper')
  assert(!src.includes('?? requestedPrimary ?? null'), 'no stale fallback')
})

run('11. weddingService omits invalid package_id on update', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddingService.ts'),
    'utf8',
  )
  assert(src.includes('resolveWritableWeddingPackageId'), 'resolver')
  assert(
    src.includes('packageIdWrite.include ? { package_id: packageIdWrite.value }'),
    'conditional write',
  )
  assert(src.includes("select('package_id')"), 'reads current package_id')
})

run('12. PackageFields handles missing/archived catalog package', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/fields/PackageFields.tsx',
    ),
    'utf8',
  )
  assert(src.includes('package-catalog-missing'), 'missing state')
  assert(src.includes('missingCatalogPackage'), 'flag')
  assert(src.includes("activeOnly: true"), 'archived not selectable')
})

run('13. FK migration does not drop constraint', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260729150000_wedding_package_id_fk_safety.sql',
    ),
    'utf8',
  )
  assert(!/drop constraint/i.test(src), 'no drop')
  assert(!/disable.*trigger/i.test(src), 'no disable')
  assert(src.includes('form_answers'), 'repairs answers')
  assert(src.includes('stale_field_count'), 'counts')
})

run('14. Correspondence acceptance keeps previously failing fixture package_id null-safe', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/correspondence/weddingCorrespondenceAcceptance.test.ts',
    ),
    'utf8',
  )
  assert(src.includes('package_id: null'), 'null package fixture')
})

console.log('\nwedding package_id fk safety: done')
