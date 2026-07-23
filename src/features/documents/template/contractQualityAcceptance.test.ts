/**
 * Acceptance cases for slot-aware contract quality validation.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/contractQualityAcceptance.test.ts
 */

import { verifyContractTransformation } from './contractQualityCheck'
import type { TemplateSlot } from './types'

const companyResolved = {
  company_name: 'Video Productions',
}

const coupleResolved = {
  partner1_full_name: 'Marcin Nowak',
  partner2_full_name: 'Karolina Jolinska',
  bride_full_name: 'Marcin Nowak',
  groom_full_name: 'Karolina Jolinska',
  couple_full_names: 'Marcin Nowak i Karolina Jolinska',
  bride_first_name: 'Marcin',
  bride_last_name: 'Nowak',
  groom_first_name: 'Karolina',
  groom_last_name: 'Jolinska',
}

function para(index: number, text: string) {
  return { index, text }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

run('Test 1 — empty company insertion', () => {
  const slots: TemplateSlot[] = [
    {
      id: 'company',
      registryKey: 'company_name',
      label: 'Firma',
      sourceHint: 'company',
      occurrences: 1,
      enabled: true,
      operation: 'insert',
      paragraphIndex: 0,
      leftAnchor: 'firmą',
      rightAnchor: 'zwanego dalej „Filmowcem”.',
    },
  ]
  const result = verifyContractTransformation({
    original: [para(0, 'firmą zwanego dalej „Filmowcem”.')],
    transformed: [para(0, 'firmą Video Productions zwanego dalej „Filmowcem”.')],
    resolvedByKey: companyResolved,
    slots,
  })
  assert(result.ok, result.report ?? result.reason ?? 'expected PASS')
})

run('Test 2 — couple composite insertion', () => {
  const slots: TemplateSlot[] = [
    {
      id: 'couple',
      registryKey: 'couple_full_names',
      label: 'Para',
      sourceHint: 'couple',
      occurrences: 1,
      enabled: true,
      operation: 'composite',
      paragraphIndex: 0,
      componentKeys: ['partner1_full_name', 'partner2_full_name'],
      separator: ' i ',
      rightAnchor: ', zwaną dalej „Parą Młodą”',
    },
  ]
  const result = verifyContractTransformation({
    original: [para(0, ', zwaną dalej „Parą Młodą”')],
    transformed: [
      para(0, 'Marcin Nowak i Karolina Jolinska, zwaną dalej „Parą Młodą”'),
    ],
    resolvedByKey: coupleResolved,
    slots,
  })
  assert(result.ok, result.report ?? result.reason ?? 'expected PASS')
})

run('Test 2b — couple with overlapping component aliases (must still PASS)', () => {
  const slots: TemplateSlot[] = [
    {
      id: 'b1',
      registryKey: 'bride_first_name',
      label: 'Imię',
      sourceHint: 'couple',
      occurrences: 1,
      enabled: true,
      paragraphIndex: 0,
    },
    {
      id: 'b2',
      registryKey: 'bride_last_name',
      label: 'Nazwisko',
      sourceHint: 'couple',
      occurrences: 1,
      enabled: true,
      paragraphIndex: 0,
    },
    {
      id: 'g1',
      registryKey: 'groom_first_name',
      label: 'Imię',
      sourceHint: 'couple',
      occurrences: 1,
      enabled: true,
      paragraphIndex: 0,
    },
    {
      id: 'g2',
      registryKey: 'groom_last_name',
      label: 'Nazwisko',
      sourceHint: 'couple',
      occurrences: 1,
      enabled: true,
      paragraphIndex: 0,
    },
    {
      id: 'bf',
      registryKey: 'bride_full_name',
      label: 'Bride',
      sourceHint: 'couple',
      occurrences: 1,
      enabled: true,
      paragraphIndex: 0,
    },
  ]
  const result = verifyContractTransformation({
    original: [para(0, ', zwaną dalej „Parą Młodą”')],
    transformed: [
      para(0, 'Marcin Nowak i Karolina Jolinska, zwaną dalej „Parą Młodą”'),
    ],
    resolvedByKey: coupleResolved,
    slots,
  })
  assert(result.ok, result.report ?? result.reason ?? 'expected PASS')
})

run('Test 3 — legal text modification', () => {
  const result = verifyContractTransformation({
    original: [para(0, 'zwaną dalej „Parą Młodą”')],
    transformed: [para(0, 'nazywaną w dalszej części umowy Klientami')],
    resolvedByKey: coupleResolved,
    slots: [],
  })
  assert(!result.ok, 'expected FAIL for legal rewrite')
})

run('Test 4 — company value plus legal modification', () => {
  const slots: TemplateSlot[] = [
    {
      id: 'company',
      registryKey: 'company_name',
      label: 'Firma',
      sourceHint: 'company',
      occurrences: 1,
      enabled: true,
      operation: 'insert',
      paragraphIndex: 0,
      leftAnchor: 'firmą',
      rightAnchor: 'zwanego dalej „Filmowcem”.',
    },
  ]
  const result = verifyContractTransformation({
    original: [para(0, 'firmą zwanego dalej „Filmowcem”.')],
    transformed: [
      para(0, 'firmą Video Productions określaną dalej jako „Usługodawca”.'),
    ],
    resolvedByKey: companyResolved,
    slots,
  })
  assert(!result.ok, 'expected FAIL when legal wording also changes')
  const report = result.report ?? ''
  assert(
    !/"firmą"\s*\n↓\s*\n"firmą"/.test(report),
    'must not report identical firmą → firmą',
  )
})

run('Test 5 — DOCX run splitting (NBSP / same visible text)', () => {
  const original = 'firmą\u00a0zwanego dalej „Filmowcem”.'
  const generated = 'firmą Video Productions zwanego dalej „Filmowcem”.'
  const result = verifyContractTransformation({
    original: [para(0, original)],
    transformed: [para(0, generated)],
    resolvedByKey: companyResolved,
    slots: [],
  })
  assert(result.ok, result.report ?? result.reason ?? 'expected PASS')
})

run('Test 6 — never report identical unexpected change', () => {
  const result = verifyContractTransformation({
    original: [para(0, 'firmą zwanego dalej „Filmowcem”.')],
    transformed: [para(0, 'firmą Video Productions zwanego dalej „Filmowcem”.')],
    resolvedByKey: companyResolved,
    slots: [],
  })
  assert(result.ok, result.report ?? result.reason ?? 'expected PASS')
  if (result.failures) {
    for (const f of result.failures) {
      for (const e of f.unexpectedEdits) {
        assert(
          e.from.trim() !== e.to.trim() || !e.from.trim(),
          `identical unexpected change: "${e.from}" → "${e.to}"`,
        )
      }
    }
  }
})

if (!process.exitCode) {
  console.log('\nAll acceptance tests passed.')
}
