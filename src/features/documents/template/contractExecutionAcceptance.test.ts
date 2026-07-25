/**
 * Focused regression: contract execution date + company city locative.
 * Run: npm run test:contract-execution
 */

import { detectContractCandidates } from '@/features/documents/template/candidateDetection'
import { buildSlotsFromAnalysis } from '@/features/documents/template/buildSlotsFromAnalysis'
import { applyBoundSlotsToParagraphs } from '@/features/documents/template/applyBoundSlots'
import {
  assertCompanyCityLocativeForSlots,
  localCalendarIsoDate,
  resolveContractExecutionValues,
} from '@/features/documents/template/contractExecutionContext'
import {
  buildParagraphRunModel,
  canonicalizeParagraphText,
} from '@/features/documents/template/canonicalParagraph'
import { toPolishLocativeCity } from '@/lib/utils/toPolishLocativeCity'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
import type { TemplateSlot } from '@/features/documents/template/types'

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

const emptyAi: AiDocumentAnalysisResult = {
  schemaVersion: '1',
  model: 'test',
  promptVersion: 'test',
  analyzerId: 'test',
  analyzerVersion: '1',
  documentType: 'contract',
  overallConfidence: 1,
  fields: [],
  packageVariables: [],
  sections: [],
  clauses: [],
  warnings: [],
  analyzedAt: new Date().toISOString(),
  sourceTextLength: 0,
}

const OPENING =
  'Zawarta w dniu 30.10.2024 r. w Zabrzu, zwana dalej "Umową", pomiędzy:'

function slotByKey(slots: TemplateSlot[], key: string) {
  return slots.find((s) => s.registryKey === key)
}

run('1. Date and city replacement on real opening', () => {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 0, text: OPENING }],
    plainText: OPENING,
  })
  const date = slotByKey(map.slots, 'contract_execution_date')!
  const city = slotByKey(map.slots, 'company_city_locative')!
  assert(Boolean(date?.physicallyBound), 'date bound')
  assert(Boolean(city?.physicallyBound), 'city bound')
  assertEq(date.originalText, '30.10.2024', 'date source')
  assertEq(city.originalText, 'Zabrzu', 'city source')

  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text: OPENING }],
    slots: [date, city],
    resolved: {
      contract_execution_date: '25.07.2026',
      company_city_locative: 'Zabrzu',
    },
  })
  assert(applied.failures.length === 0, applied.failures[0]?.reason ?? 'fail')
  assertEq(
    applied.paragraphs[0]!.text,
    'Zawarta w dniu 25.07.2026 r. w Zabrzu, zwana dalej "Umową", pomiędzy:',
    'opening',
  )
})

run('2. City change Zabrze → Kraków locative', () => {
  const text = 'w Zabrzu'
  // Minimal execution-like context for detection
  const full = 'Umowa zawarta w Zabrzu, zwana dalej'
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 0, text: full }],
    plainText: full,
  })
  const city = slotByKey(map.slots, 'company_city_locative')!
  assertEq(city.originalText, 'Zabrzu', 'source')
  const loc = toPolishLocativeCity('Kraków')
  assertEq(loc, 'Krakowie', 'locative')
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text: full }],
    slots: [city],
    resolved: { company_city_locative: loc! },
  })
  assert(applied.paragraphs[0]!.text.includes('w Krakowie'), applied.paragraphs[0]!.text)
  assert(!applied.paragraphs[0]!.text.includes('Zabrzu'), 'old city gone')
  void text
})

run('3. Replace only date and city spans', () => {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 0, text: OPENING }],
    plainText: OPENING,
  })
  const date = slotByKey(map.slots, 'contract_execution_date')!
  const city = slotByKey(map.slots, 'company_city_locative')!
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text: OPENING }],
    slots: [date, city],
    resolved: {
      contract_execution_date: '25.07.2026',
      company_city_locative: 'Krakowie',
    },
  })
  const out = applied.paragraphs[0]!.text
  assert(out.startsWith('Zawarta w dniu '), out)
  assert(out.includes(' r. w '), out)
  assert(out.includes(', zwana dalej "Umową", pomiędzy:'), out)
  assert(!out.includes('30.10.2024'), out)
  assert(!out.includes('Zabrzu'), out)
})

run('4. Wedding date is not execution date', () => {
  const paragraphs = [
    { index: 0, text: OPENING },
    {
      index: 8,
      text: 'Ślub odbędzie się w dniu 19.06.2025 r. w Rezydencji.',
    },
  ]
  const cands = detectContractCandidates(paragraphs)
  const exec = cands.filter((c) => c.proposedKey === 'contract_execution_date')
  const wedding = cands.filter((c) => c.proposedKey === 'wedding_date')
  assert(exec.some((c) => c.text === '30.10.2024'), 'exec date')
  assert(wedding.some((c) => c.text === '19.06.2025'), 'wedding date')
  assert(!wedding.some((c) => c.text === '30.10.2024'), 'exec not wedding')
})

run('5. Final payment date is not execution date', () => {
  const text =
    'Para młoda zapłaci pozostałą część wynagrodzenia najpóźniej w dniu 19.06.2025 r.'
  const cands = detectContractCandidates([{ index: 20, text }])
  const keys = cands.map((c) => `${c.proposedKey}:${c.text}`)
  assert(
    cands.some(
      (c) =>
        c.proposedKey === 'final_payment_due_date' && c.text === '19.06.2025',
    ),
    keys.join(','),
  )
  assert(
    !cands.some((c) => c.proposedKey === 'contract_execution_date'),
    'no exec',
  )
})

run('6. Company city not confused with event locations', () => {
  const paragraphs = [
    { index: 0, text: OPENING },
    {
      index: 9,
      text: 'Przygotowań ślubnych, które odbędą się w Krakowie.',
    },
    {
      index: 10,
      text: 'ceremonii ślubu, która odbędzie się w Rzeszowie;',
    },
  ]
  const cands = detectContractCandidates(paragraphs)
  const cities = cands.filter((c) => c.proposedKey === 'company_city_locative')
  assertEq(cities.length, 1, 'only opening city')
  assertEq(cities[0]!.text, 'Zabrzu', 'Zabrzu')
  assert(
    cands.some((c) => c.proposedKey === 'preparation_location'),
    'prep location separate',
  )
})

run('7. Saved snapshot keeps execution date after system date changes', () => {
  const snap = resolveContractExecutionValues({
    generationDate: '2026-07-25',
    companyCity: 'Zabrze',
  })
  assertEq(snap.values.contract_execution_date, '25.07.2026', 'generated')
  const later = resolveContractExecutionValues({
    generationDate: '2030-01-01',
    companyCity: 'Kraków',
    snapshot: snap.snapshot,
  })
  assertEq(later.values.contract_execution_date, '25.07.2026', 'frozen date')
  assertEq(later.values.company_city_locative, 'Zabrzu', 'frozen city')
})

run('8. Saved version keeps city after company city changes', () => {
  const snap = resolveContractExecutionValues({
    generationDate: '2026-07-25',
    companyCity: 'Zabrze',
  })
  const later = resolveContractExecutionValues({
    generationDate: '2026-07-25',
    companyCity: 'Warszawa',
    snapshot: {
      contractExecutionDate: snap.snapshot!.contractExecutionDate,
      contractExecutionCity: snap.snapshot!.contractExecutionCity,
    },
  })
  assertEq(later.values.company_city_locative, 'Zabrzu', 'still Zabrzu')
  assertEq(later.values.company_city, 'Warszawa', 'nominative may refresh')
})

run('9. New version uses current generation date and company city', () => {
  const a = resolveContractExecutionValues({
    generationDate: '2026-07-25',
    companyCity: 'Zabrze',
  })
  const b = resolveContractExecutionValues({
    generationDate: '2026-08-01',
    companyCity: 'Kraków',
  })
  assertEq(a.values.contract_execution_date, '25.07.2026', 'a date')
  assertEq(b.values.contract_execution_date, '01.08.2026', 'b date')
  assertEq(b.values.company_city_locative, 'Krakowie', 'b city')
  assert(localCalendarIsoDate(new Date(2026, 6, 25)) === '2026-07-25', 'local')
})

run('10. Missing company city blocks only templates with city slot', () => {
  let threw = false
  try {
    assertCompanyCityLocativeForSlots({
      slots: [
        {
          registryKey: 'company_city_locative',
          physicallyBound: true,
        },
      ],
      companyCity: null,
      locative: null,
      locativeUnsafe: false,
    })
  } catch {
    threw = true
  }
  assert(threw, 'must block with city slot')

  // No city slot → ok
  assertCompanyCityLocativeForSlots({
    slots: [{ registryKey: 'contract_execution_date', physicallyBound: true }],
    companyCity: null,
    locative: null,
    locativeUnsafe: false,
  })
})

run('11. Unsafe inflection blocks instead of using DOCX city', () => {
  let threw = false
  let msg = ''
  try {
    assertCompanyCityLocativeForSlots({
      slots: [
        { registryKey: 'company_city_locative', physicallyBound: true },
      ],
      companyCity: 'Xyzabc',
      locative: undefined,
      locativeUnsafe: true,
    })
  } catch (err) {
    threw = true
    msg = err instanceof Error ? err.message : String(err)
  }
  assert(threw, 'must block')
  assert(
    msg.includes('Nie udało się bezpiecznie odmienić miasta firmy'),
    msg,
  )
})

run('12. Multi-run date', () => {
  const xml = `<w:p>${['Zawarta w dniu ', '30', '.', '10', '.', '2024', ' r. w Zabrzu']
    .map((t) => `<w:r><w:t>${t}</w:t></w:r>`)
    .join('')}</w:p>`
  const model = buildParagraphRunModel(xml)
  const text = model.canonicalText
  const cands = detectContractCandidates([{ index: 0, text }])
  const date = cands.find((c) => c.proposedKey === 'contract_execution_date')!
  assertEq(date.text, '30.10.2024', 'canonical date')
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots: [
      {
        id: 'd',
        registryKey: 'contract_execution_date',
        label: 'date',
        sourceHint: 'unknown',
        occurrences: 1,
        enabled: true,
        physicallyBound: true,
        operation: 'replace',
        paragraphIndex: 0,
        originalText: date.text,
        startOffset: date.startOffset,
        endOffset: date.endOffset,
      },
    ],
    resolved: { contract_execution_date: '25.07.2026' },
  })
  assert(applied.paragraphs[0]!.text.includes('25.07.2026'), applied.paragraphs[0]!.text)
})

run('13. Multi-run city', () => {
  const xml = `<w:p>${[
    'Zawarta w dniu 30.10.2024 r. w ',
    'Za',
    'brzu',
    ', zwana dalej',
  ]
    .map((t) => `<w:r><w:t>${t}</w:t></w:r>`)
    .join('')}</w:p>`
  const model = buildParagraphRunModel(xml)
  const text = model.canonicalText
  const cands = detectContractCandidates([{ index: 0, text }])
  const city = cands.find((c) => c.proposedKey === 'company_city_locative')!
  assertEq(city.text, 'Zabrzu', 'canonical city')
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots: [
      {
        id: 'c',
        registryKey: 'company_city_locative',
        label: 'city',
        sourceHint: 'company',
        occurrences: 1,
        enabled: true,
        physicallyBound: true,
        operation: 'replace',
        paragraphIndex: 0,
        originalText: city.text,
        startOffset: city.startOffset,
        endOffset: city.endOffset,
      },
    ],
    resolved: { company_city_locative: 'Krakowie' },
  })
  assert(applied.paragraphs[0]!.text.includes('Krakowie'), applied.paragraphs[0]!.text)
})

run('15. No user-facing contract-signing-place field in company form module', async () => {
  const fs = await import('node:fs')
  const page = fs.readFileSync(
    new URL('../../../pages/CompanyDetailsPage.tsx', import.meta.url),
    'utf8',
  )
  assert(!/contractSigningPlace|signingCity|executionPlace|miejsce zawarcia/i.test(page), 'no extra UX')
  assert(/Miasto/.test(page), 'city field remains')
  assert(/city/.test(page), 'city binding remains')
})

if (!process.exitCode) {
  console.log('\nAll contract execution date/city tests passed.')
  console.log(
    'Exact opening:',
    canonicalizeParagraphText(
      'Zawarta w dniu 25.07.2026 r. w Zabrzu, zwana dalej "Umową", pomiędzy:',
    ),
  )
}
