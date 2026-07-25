/**
 * Opening-clause city → company_city_locative physical slot.
 * Run: npm run test:contract-company-city-slot
 */

import { detectContractCandidates } from './candidateDetection'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import {
  inventoryCompanyCityCandidates,
} from './contractCompanyCitySlotClassification'
import {
  resolveContractExecutionValues,
} from './contractExecutionContext'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
import {
  buildParagraphRunModel,
  canonicalizeParagraphText,
} from './canonicalParagraph'
import { applyBoundSlotsToParagraphs } from './applyBoundSlots'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(a: unknown, b: unknown, label: string) {
  if (a !== b) {
    throw new Error(
      `${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
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

function accepted(
  cands: ReturnType<typeof detectContractCandidates>,
  key: string,
) {
  return cands.find(
    (c) =>
      c.proposedKey === key &&
      (c.decision === 'accepted' || c.decision === 'needs_confirmation'),
  )
}

run('1 — Umowa zawarta w Jaworznie → company_city_locative', () => {
  const text = 'Umowa zawarta w Jaworznie dnia 17.06.2026 r. pomiędzy:'
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'company_city_locative')?.text, 'Jaworznie', 'city')
  assertEq(
    accepted(c, 'company_city_locative')?.variableClassification,
    'dynamic_candidate',
    'dynamic',
  )
})

run('2 — Exact span Jaworznie (date form)', () => {
  const text = 'zawarta w dniu 17.06.2026 r. w Jaworznie pomiędzy:'
  const c = detectContractCandidates([{ index: 0, text }])
  const city = accepted(c, 'company_city_locative')!
  assertEq(city.text, 'Jaworznie', 'span')
  assertEq(text.slice(city.startOffset, city.endOffset), 'Jaworznie', 'offsets')
  assert(!city.text.includes('w '), 'no preposition')
})

run('3 — Provider z siedzibą w Krakowie → immutable (no dynamic city)', () => {
  const text =
    'pod firmą PRIMEPHOTO s.c. z siedzibą w Krakowie, przy ul. Testowej 1'
  const c = detectContractCandidates([{ index: 0, text }])
  const city = accepted(c, 'company_city_locative')
  assert(!city || city.variableClassification === 'template_constant', 'not dynamic')
  const roles = inventoryCompanyCityCandidates([{ index: 0, text }])
  assert(
    roles.some((r) => r.detectedRole === 'provider_seat' && r.sourceText === 'Krakowie'),
    'seat role',
  )
})

run('4 — Client address → not company_city_locative', () => {
  const text = 'Panna Młoda: Anna Kowalska zamieszkała w Krakowie, ul. Floriańska 1'
  const c = detectContractCandidates([{ index: 0, text }])
  assert(!accepted(c, 'company_city_locative'), 'no opening city')
})

run('5 — Venue ZINNAR CASTLE Kraków → reception_location', () => {
  const text =
    'przygotowania, ceremonia, przyjęcie: ZINNAR CASTLE Kraków'
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'reception_location')?.text, 'ZINNAR CASTLE Kraków', 'venue')
  assert(!accepted(c, 'company_city_locative'), 'Kraków not execution city')
})

run('6 — Same paragraph Jaworznie + Krakowie → Jaworznie wins', () => {
  const text =
    'Umowa zawarta w Jaworznie dnia 17.06.2026 r. pomiędzy Firmą XYZ z siedzibą w Krakowie'
  const c = detectContractCandidates([{ index: 0, text }])
  const city = accepted(c, 'company_city_locative')!
  assertEq(city.text, 'Jaworznie', 'opening wins')
  assertEq(city.variableClassification, 'dynamic_candidate', 'dynamic')
  assert(
    !c.some(
      (x) =>
        x.proposedKey === 'company_city_locative' &&
        x.text === 'Krakowie' &&
        (x.decision === 'accepted' || x.decision === 'needs_confirmation') &&
        x.variableClassification === 'dynamic_candidate',
    ),
    'seat not dynamic',
  )
})

run('7 — DOCX run split Umowa zawarta / w Jaworznie', () => {
  const xml = `<w:p>${[
    'Umowa zawarta ',
    'w Jaworznie',
    ' dnia 17.06.2026 r.',
  ]
    .map((t) => `<w:r><w:t>${t}</w:t></w:r>`)
    .join('')}</w:p>`
  const model = buildParagraphRunModel(xml)
  const text = canonicalizeParagraphText(model.canonicalText)
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'company_city_locative')?.text, 'Jaworznie', 'split')
})

run('8 — Renderer resolves Company Settings company_city_locative', () => {
  const text = 'zawarta w dniu 30.10.2024 r. w Zabrzu, zwana dalej "Umową"'
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 0, text }],
    plainText: text,
  })
  const slot = map.slots.find((s) => s.registryKey === 'company_city_locative')
  assert(Boolean(slot?.physicallyBound), 'bound')
  assertEq(slot!.variableClassification, 'dynamic_candidate', 'dynamic')
  const resolved = resolveContractExecutionValues({
    generationDate: '2026-07-25',
    companyCity: 'Kraków',
  })
  assertEq(resolved.values.company_city_locative, 'Krakowie', 'from settings')
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots: [slot!],
    resolved: { company_city_locative: resolved.values.company_city_locative! },
  })
  assert(
    applied.paragraphs[0]!.text.includes('Krakowie'),
    'rendered from settings',
  )
  assert(!applied.paragraphs[0]!.text.includes('Zabrzu'), 'source not copied')
})

run('9 — Opening city maps to company_city_locative, not execution_city', () => {
  assert(!SystemVariableRegistry.get('execution_city'), 'no execution_city')
  assert(!SystemVariableRegistry.get('signing_city'), 'no signing_city')
  assert(Boolean(SystemVariableRegistry.get('company_city_locative')), 'has locative')
  const text = 'zawarta w dniu 17.06.2026 r. w Jaworznie pomiędzy:'
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'company_city_locative')?.text, 'Jaworznie', 'slot key')
  assert(!accepted(c, 'execution_city'), 'no execution_city candidate')
  assert(!accepted(c, 'signing_city'), 'no signing_city candidate')
})

if (!process.exitCode) {
  console.log('\nAll contract-company-city-slot tests passed.')
}
