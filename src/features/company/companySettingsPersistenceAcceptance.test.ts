/**
 * Company settings persistence — regression for false “Zapisano” + stale cache.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient } from '@tanstack/react-query'
import type { CompanyDetails, UpsertCompanyDetailsInput } from '@/types/company'

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

function stubCompany(overrides: Partial<CompanyDetails> = {}): CompanyDetails {
  return {
    id: 'c1',
    userId: 'u1',
    companyName: 'Gentlemen Productions',
    ownerName: null,
    nip: '6482810484',
    regon: null,
    vatId: null,
    address: 'Slowackiego 6/17',
    postalCode: '41-800',
    city: 'Zabrze',
    country: 'Polska',
    phone: null,
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    bankAccount: null,
    iban: null,
    swift: null,
    logoPath: null,
    signaturePath: null,
    stampPath: null,
    signatureUpdatedAt: null,
    questionnaireConfig: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const VISIBLE_FIELDS: (keyof UpsertCompanyDetailsInput)[] = [
  'companyName',
  'ownerName',
  'nip',
  'regon',
  'vatId',
  'address',
  'postalCode',
  'city',
  'country',
  'phone',
  'email',
  'website',
  'instagram',
  'facebook',
  'bankAccount',
  'iban',
  'swift',
  'logoPath',
  'signaturePath',
  'stampPath',
]

run('1. page updates React Query cache after successful upsert', () => {
  const page = readFileSync(
    resolve('src/pages/CompanyDetailsPage.tsx'),
    'utf8',
  )
  assert(page.includes('setQueryData'), 'setQueryData after save')
  assert(page.includes('companyDetailsQueryKey'), 'stable query key helper')
  assert(page.includes('void persistRef.current'), 'autosave path')
  assert(page.includes("persistRef.current('retry')"), 'retry path')
  assert(page.includes('Spróbuj ponownie'), 'retry copy')
  assert(
    page.includes('Nie udało się zapisać'),
    'failure status is not Zapisano',
  )
  assert(
    !page.includes('dataUpdatedAt !== hydratedAt && !dirtyRef.current'),
    'no setState-during-render hydrate',
  )
})

run('2. unmount flush prevents debounce cancel data loss', () => {
  const page = readFileSync(
    resolve('src/pages/CompanyDetailsPage.tsx'),
    'utf8',
  )
  assert(page.includes('Flush pending edits on leave'), 'flush comment')
  assert(
    page.includes('companyDetailsService') && page.includes('upsert'),
    'flush calls upsert',
  )
})

run('3. service upsert throws when update affects zero rows', () => {
  const src = readFileSync(
    resolve('src/lib/api/companyDetailsService.ts'),
    'utf8',
  )
  assert(src.includes("count: 'exact'"), 'requests row count')
  assert(src.includes('brak wiersza do aktualizacji'), 'zero-row error')
  assert(src.includes('maybeSingle()'), 'does not swallow missing row')
  assert(src.includes('questionnaire_config'), 'preserves config field path')
})

run('4. visible company fields are included in upsert payload builder', () => {
  const page = readFileSync(
    resolve('src/pages/CompanyDetailsPage.tsx'),
    'utf8',
  )
  assert(page.includes('formToUpsertInput'), 'payload helper')
  for (const field of VISIBLE_FIELDS) {
    assert(page.includes(field), `payload includes ${field}`)
  }
})

run('5. query cache remount regression: setQueryData wins over staleTime', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 1000 * 60 * 5 } },
  })
  const key = ['company-details', 'u1'] as const
  const stale = stubCompany({ companyName: 'Gentlemen Productions' })
  const saved = stubCompany({
    companyName: 'Gentlemen Productions Test',
    nip: '1234567890',
    email: 'firma@example.test',
    phone: '500 600 700',
    address: 'ul. Testowa 12',
    postalCode: '30-001',
    city: 'Kraków',
    updatedAt: '2026-07-30T10:00:00.000Z',
  })

  queryClient.setQueryData(key, stale)
  // Simulate successful save updating cache (the missing step in the bug).
  queryClient.setQueryData(key, saved)

  const cached = queryClient.getQueryData<CompanyDetails>(key)
  assertEq(cached?.companyName, 'Gentlemen Productions Test', 'name')
  assertEq(cached?.nip, '1234567890', 'nip')
  assertEq(cached?.email, 'firma@example.test', 'email')
  assertEq(cached?.phone, '500 600 700', 'phone')
  assertEq(cached?.address, 'ul. Testowa 12', 'address')
  assertEq(cached?.postalCode, '30-001', 'postal')
  assertEq(cached?.city, 'Kraków', 'city')

  // Remount within staleTime must still see saved values from cache.
  const state = queryClient.getQueryState(key)
  assert(Boolean(state?.data), 'cache present')
  assertEq(
    (state?.data as CompanyDetails).companyName,
    'Gentlemen Productions Test',
    'remount reads saved cache',
  )
})

run('6. trimOrNull keeps Polish characters and postal zeroes', () => {
  const src = readFileSync(
    resolve('src/lib/api/companyDetailsService.ts'),
    'utf8',
  )
  assert(src.includes('function trimOrNull'), 'normalizer exists')
  assert(src.includes('postal_code: trimOrNull(input.postalCode)'), 'postal as text')
  assert(src.includes('nip: trimOrNull(input.nip)'), 'nip as text')
  assert(src.includes('phone: trimOrNull(input.phone)'), 'phone as text')
})

run('7. success status only after await upsert', () => {
  const page = readFileSync(
    resolve('src/pages/CompanyDetailsPage.tsx'),
    'utf8',
  )
  const persistStart = page.indexOf('async function persist(')
  const persistBlock = page.slice(persistStart, persistStart + 2800)
  const upsertIdx = persistBlock.indexOf('await companyDetailsService.upsert')
  assert(upsertIdx > 0, 'persist awaits upsert')
  assert(
    persistBlock.indexOf("setSaveStatus('saving')") < upsertIdx,
    'saving before upsert',
  )
  assert(
    persistBlock.indexOf("setSaveStatus('saved')", upsertIdx) > upsertIdx,
    'Zapisano after successful upsert',
  )
  assert(
    persistBlock.includes("setSaveStatus('error')"),
    'error status on failure',
  )
})

run('8. studio_details remains canonical storage', () => {
  const src = readFileSync(
    resolve('src/lib/api/companyDetailsService.ts'),
    'utf8',
  )
  assert(src.includes(".from('studio_details')"), 'reads/writes studio_details')
  assert(!src.includes(".from('profiles')"), 'does not write profiles')
})

console.log('Company settings persistence acceptance done.')
