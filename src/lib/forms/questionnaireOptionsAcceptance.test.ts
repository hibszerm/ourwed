/**
 * Regression tests for questionnaire options first-load, extras inject,
 * expiration removal, and contract address autocomplete.
 *
 * Run: npm run test:questionnaire-options-initial-load
 *      (also included via focused scripts below)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolvePublicFormTemplate } from '@/lib/forms/resolvePublicFormTemplate'
import {
  buildDefaultQuestionnaireBlocks,
  ensureQuestionnaireBlocks,
} from '@/lib/forms/questionnaireBlocks'
import { questionsFromBlocks } from '@/lib/forms/questionsFromBlocks'
import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import { formatLocationAnswer } from '@/lib/forms/contractQuestionnaireSnapshot'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'

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

function isExpiredNullSafe(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= Date.now()
}

const samplePackages = [
  { id: 'pkg-a', name: 'Pakiet Film', description: 'DESC', price: 1, currency: 'PLN' },
]
const sampleExtras = [
  { id: 'ex-1', name: 'Drone', description: 'DESC', price: 2, currency: 'PLN' },
]

// --- Package / extras first load ---

run('options: snapshot-backed template shows packages on first resolve', () => {
  const tpl = resolvePublicFormTemplate(null, [], {
    packages: samplePackages,
    additionalServices: sampleExtras,
    config: defaultContractQuestionnaireConfig(),
  })
  const pkg = tpl.questions.find((q) => q.fieldKey === 'selectedPackageIds')
  assert((pkg?.options?.length ?? 0) === 1, 'package options present')
  assertEq(pkg?.options?.[0]?.label, 'Pakiet Film', 'name only label')
  assert(pkg?.options?.[0]?.price == null, 'no price on option')
  assert(pkg?.options?.[0]?.description == null, 'no description on option')
})

run('options: injectCatalog finds sys_extras by fieldKey (not q-extras id)', () => {
  const schema = {
    title: 'Stored form',
    type: 'contract_questionnaire' as const,
    description: 'x',
    submitLabel: 'Wyślij',
    successTitle: 'OK',
    successDescription: 'OK',
    questions: [
      {
        id: 'q-wedding-date',
        type: 'date' as const,
        label: 'Data',
        fieldKey: 'weddingDate',
      },
      {
        id: 'sys_packages',
        type: 'multiselect' as const,
        label: 'Pakiet',
        fieldKey: 'selectedPackageIds',
        options: [] as { value: string; label: string }[],
      },
      {
        id: 'sys_extras',
        type: 'multiselect' as const,
        label: 'Usługi',
        fieldKey: 'selectedAdditionalServiceIds',
        options: [] as { value: string; label: string }[],
      },
    ],
  }
  const resolved = resolvePublicFormTemplate(schema, [], {
    packages: samplePackages,
    additionalServices: sampleExtras,
    config: defaultContractQuestionnaireConfig(),
  })
  const extras = resolved.questions.find(
    (q) => q.fieldKey === 'selectedAdditionalServiceIds',
  )
  assert(Boolean(extras), 'extras injected')
  assertEq(extras?.options?.length, 1, 'extras options')
  assertEq(extras?.options?.[0]?.label, 'Drone', 'extras name')
  assert(extras?.options?.[0]?.price == null, 'no extras price')
})

run('options: empty catalogs hide public package/extras sections', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  const qs = questionsFromBlocks(blocks, [], [])
  assert(
    !qs.some((q) => q.fieldKey === 'selectedPackageIds'),
    'packages hidden when empty',
  )
  assert(
    !qs.some((q) => q.fieldKey === 'selectedAdditionalServiceIds'),
    'extras hidden when empty',
  )
})

run('options: inactive packages not in name-only option list', () => {
  const tpl = buildContractQuestionnaireTemplate({
    packages: samplePackages,
    additionalServices: sampleExtras,
  })
  const pkg = tpl.questions.find((q) => q.fieldKey === 'selectedPackageIds')
  assertEq(pkg?.options?.[0]?.label, 'Pakiet Film', 'active name')
  assert(!JSON.stringify(pkg?.options).includes('DESC'), 'no description leak')
})

run('options: createFormInstance awaits snapshot before return', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/api/forms.ts'),
    'utf8',
  )
  const fnStart = src.indexOf('export async function createFormInstance')
  assert(fnStart > 0, 'createFormInstance exists')
  const fnSlice = src.slice(fnStart, fnStart + 1800)
  assert(
    fnSlice.includes('await buildFormInstanceOptionsSnapshot()'),
    'awaits snapshot',
  )
  assert(fnSlice.includes('options_snapshot: optionsSnapshot'), 'persists snapshot')
  const awaitIdx = fnSlice.indexOf('await buildFormInstanceOptionsSnapshot()')
  const insertIdx = fnSlice.indexOf('.insert({')
  assert(awaitIdx >= 0 && insertIdx > awaitIdx, 'await before insert')
  assert(fnSlice.includes('optionsSnapshot'), 'requires persisted snapshot check')
})

run('options: SQL extras fallback mirrors packages non-empty gate', () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260725190000_contract_questionnaire_extras_snapshot_fallback.sql',
    ),
    'utf8',
  )
  assert(
    sql.includes(
      "jsonb_array_length(snapshot->'additionalServiceOptions') > 0",
    ),
    'non-empty extras gate',
  )
  assert(sql.includes('expires_at is not null'), 'null expiry = indefinite')
})

// --- Expiration ---

run('expiration: generate modal has no validity control', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/questionnaires/GenerateQuestionnaireModal.tsx',
    ),
    'utf8',
  )
  assert(!src.includes('Ważność'), 'no Ważność label')
  assert(!src.includes('expiration'), 'no expiration state')
  assert(!src.includes('7d'), 'no 7d option')
})

run('expiration: generate always passes expiresAt null', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/api/questionnaireService.ts'),
    'utf8',
  )
  assert(src.includes('expiresAt: null'), 'null expiry on generate')
})

run('expiration: null expiresAt is not expired', () => {
  assert(!isExpiredNullSafe(null), 'null = not expired')
  assert(
    isExpiredNullSafe(new Date(Date.now() - 60_000).toISOString()),
    'past date expired',
  )
})

// --- Contract address ---

run('address: bride and groom use one autocomplete field each', () => {
  const cfg = ensureQuestionnaireBlocks(defaultContractQuestionnaireConfig())
  const tpl = buildContractQuestionnaireTemplate({
    packages: samplePackages,
    additionalServices: sampleExtras,
    config: cfg,
  })
  const bride = tpl.questions.find((q) => q.fieldKey === 'partner1.address')
  const groom = tpl.questions.find((q) => q.fieldKey === 'partner2.address')
  assertEq(bride?.type, 'location', 'bride autocomplete')
  assertEq(groom?.type, 'location', 'groom autocomplete')
  assertEq(bride?.label, 'Adres do umowy', 'bride label')
  assert(
    !tpl.questions.some((q) => q.fieldKey === 'partner1.postalCode'),
    'no postal field',
  )
  assert(
    !tpl.questions.some((q) => q.fieldKey === 'partner1.city'),
    'no city field',
  )
})

run('address: formattedAddress preserved for contract resolver string', () => {
  assertEq(
    formatLocationAnswer({
      formattedAddress: 'ul. Kwiatowa 12, 00-001 Warszawa',
      postalCode: '00-001',
      city: 'Warszawa',
    }),
    'ul. Kwiatowa 12, 00-001 Warszawa',
    'formatted',
  )
  assertEq(
    formatLocationAnswer('ul. Ręczna 1, Kraków'),
    'ul. Ręczna 1, Kraków',
    'manual string',
  )
})

run('address: AddressField is shared portalled component', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/forms/AddressField.tsx'),
    'utf8',
  )
  const qf = readFileSync(
    resolve(process.cwd(), 'src/features/forms/QuestionField.tsx'),
    'utf8',
  )
  assert(src.includes('FloatingPortal'), 'portalled')
  assert(qf.includes('AddressField'), 'QuestionField reuses AddressField')
  assert(qf.includes("question.type === 'location'"), 'location uses AddressField')
})

run('address: default blocks keep bride/groom groups separate', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  const ids = blocks.map((b) => b.id)
  const p1Addr = ids.indexOf('sys_p1_address')
  const p1Phone = ids.indexOf('sys_p1_phone')
  const p2Addr = ids.indexOf('sys_p2_address')
  const p2First = ids.indexOf('sys_p2_first')
  assert(p1Addr > 0 && p1Phone > p1Addr, 'bride address before phone')
  assert(p2Addr > p2First, 'groom address under groom section')
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
console.log('\nquestionnaire options/address/expiration acceptance: done')
