/**
 * Universal contract analysis safety + immutable provider party data.
 * Run: npm run test:contract-slot-safety
 */

import { detectContractCandidates } from './candidateDetection'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import {
  validateMinimalSlotSpan,
  LEGAL_WRAPPER_PHRASES,
} from './contractSlotSafety'
import { extractMinimalCompanyNameAfterFirm } from './segmentCompanyClause'
import { analyzePartyCompleteness } from './contractPartyCompleteness'
import { runSyntheticTestGenerationGate } from './syntheticTestGenerationGate'
import { validateTemplateSlotBindings } from './templateReadiness'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
import type { TemplateSlot } from './types'

function confirmSlot(slot: TemplateSlot): TemplateSlot {
  if (slot.physicalSpanSafety === 'unsafe') {
    return {
      ...slot,
      needsConfirmation: true,
      physicallyBound: false,
      detectionStatus: 'ambiguous',
      detectionReason:
        slot.spanSafetyMessage ??
        'Zakres jest zbyt szeroki — nie można potwierdzić niebezpiecznego slotu.',
    }
  }
  return {
    ...slot,
    needsConfirmation: false,
    physicallyBound: true,
    detectionStatus: 'bound',
  }
}

function linkToCompany(slot: TemplateSlot): TemplateSlot {
  if (
    slot.physicalSpanSafety === 'unsafe' ||
    slot.canLinkToCompany === false
  ) {
    return {
      ...slot,
      variableClassification: 'template_constant',
      enabled: false,
      physicallyBound: false,
    }
  }
  return {
    ...slot,
    variableClassification: 'dynamic_candidate',
    enabled: true,
    physicallyBound: true,
    detectionStatus: 'bound',
    canLinkToCompany: false,
  }
}

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

const PRIME_CLAUSE =
  'prowadzącymi działalność gospodarczą w formie spółki cywilnej pod firmą PRIMEPHOTO s.c. Dominik Błaszczyk, Anna Hornik z siedzibą w Jaworznie, przy ul. Grunwaldzkiej 12, zwanych dalej „Filmowcami”.'

const BROAD_UNSAFE =
  'prowadzącymi działalność gospodarczą w formie spółki cywilnej pod firmą PRIMEPHOTO s.c. Dominik Błaszczyk, Anna Hornik z siedzibą w Jaworznie, przy ul. Grunwaldzkiej 12'

run('1. Provider clause classified immutable by default', () => {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    plainText: PRIME_CLAUSE,
  })
  assertEq(map.providerPartyMode, 'immutable_template', 'mode')
  const companySlots = map.slots.filter((s) => s.registryKey === 'company_name')
  for (const s of companySlots) {
    assertEq(s.variableClassification, 'template_constant', 'class')
    assert(s.physicallyBound !== true, 'not bound')
    assert(s.enabled === false, 'disabled')
  }
})

run('2. Broad clause is not a company_name replace slot', () => {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    plainText: PRIME_CLAUSE,
  })
  const dynamicCompany = map.slots.find(
    (s) =>
      s.registryKey === 'company_name' &&
      s.variableClassification === 'dynamic_candidate' &&
      s.physicallyBound,
  )
  assert(!dynamicCompany, 'no dynamic company binding')
  const nameCand = detectContractCandidates([{ index: 3, text: PRIME_CLAUSE }]).find(
    (c) => c.proposedKey === 'company_name',
  )
  assert(Boolean(nameCand), 'evidence candidate exists')
  assertEq(nameCand!.text, 'PRIMEPHOTO s.c.', 'minimal span evidence')
  assertEq(nameCand!.variableClassification, 'template_constant', 'const')
})

run('3. Two immutable representatives do not block readiness', () => {
  const party = analyzePartyCompleteness({
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    slots: [],
    profileRepresentativeCapacity: 1,
  })
  assert(party.requiredRepresentativeCount >= 2, 'count')
  assertEq(party.providerPartyMode, 'immutable_template', 'mode')
  assert(!party.generationBlocked, 'not blocked')
  assert(
    !party.warnings.some((w) => /wspólników|reprezentantów firmy/i.test(w)),
    party.warnings.join(' | '),
  )
})

run('4. Profile with one owner + two immutable partners is OK', () => {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [
      {
        index: 2,
        text: 'Jan Testowy i Anna Testowa, zwaną dalej „Parą Młodą”',
      },
      { index: 3, text: PRIME_CLAUSE },
      {
        index: 29,
        text: 'wynagrodzenie w wysokości 8 000 zł (słownie: osiem tysięcy złotych)',
      },
    ],
    plainText: PRIME_CLAUSE,
  })
  assertEq(map.providerPartyMode, 'immutable_template', 'provider')
  assert(
    !map.analysisWarnings?.some((w) => /wspólników/i.test(w)),
    map.analysisWarnings?.join(' | ') ?? '',
  )
})

run('5. Provider names remain unchanged after generation', () => {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    plainText: PRIME_CLAUSE,
  })
  const gate = runSyntheticTestGenerationGate({
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    slots: map.slots,
    sourceKind: 'docx',
  })
  assert(gate.ok, gate.reasons.join('; '))
  const out = gate.transformedParagraphs[0]!.text
  assert(out.includes('PRIMEPHOTO s.c.'), 'name kept')
  assert(out.includes('Dominik Błaszczyk'), 'rep1 kept')
  assert(out.includes('Anna Hornik'), 'rep2 kept')
})

run('6. Provider names are not flagged by stale-value detection', () => {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    plainText: PRIME_CLAUSE,
  })
  const gate = runSyntheticTestGenerationGate({
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    slots: map.slots,
    sourceKind: 'docx',
  })
  assert(
    !gate.reasons.some((r) => /Stale|PRIMEPHOTO|Dominik|Hornik/i.test(r)),
    gate.reasons.join('; '),
  )
})

run('7. Client/couple sample names remain dynamic', () => {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [
      {
        index: 2,
        text: 'Marcin Nowak i Karolina Jolińska, zwaną dalej „Parą Młodą”',
      },
      { index: 3, text: PRIME_CLAUSE },
    ],
    plainText: 'x',
  })
  const couple = map.slots.find((s) => s.registryKey === 'couple_full_names')
  assert(Boolean(couple), 'couple slot')
  assert(
    couple!.variableClassification !== 'template_constant',
    'couple not constant',
  )
  assert(couple!.enabled !== false, 'couple enabled')
})

run('8. Safe minimal company_name can be linked by explicit action', () => {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    plainText: PRIME_CLAUSE,
  })
  const name = map.slots.find(
    (s) =>
      s.registryKey === 'company_name' &&
      s.variableClassification === 'template_constant',
  )
  assert(Boolean(name), 'immutable candidate')
  assert(name!.canLinkToCompany === true, 'linkable')
  const linked = linkToCompany(name!)
  assertEq(linked.variableClassification, 'dynamic_candidate', 'linked class')
  assert(linked.physicallyBound === true, 'bound after link')
  assert(linked.enabled === true, 'enabled')
})

run('9. Dynamic provider fields still require profile when enabled', () => {
  const party = analyzePartyCompleteness({
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    slots: [
      {
        id: 'r1',
        registryKey: 'company_representative',
        label: 'rep',
        sourceHint: 'company',
        occurrences: 1,
        enabled: true,
        physicallyBound: true,
        originalText: 'Dominik Błaszczyk',
        variableClassification: 'dynamic_candidate',
        physicalSpanSafety: 'safe',
      },
      {
        id: 'r2',
        registryKey: 'company_representative',
        label: 'rep2',
        sourceHint: 'company',
        occurrences: 1,
        enabled: true,
        physicallyBound: true,
        originalText: 'Anna Hornik',
        variableClassification: 'dynamic_candidate',
        physicalSpanSafety: 'safe',
      },
    ],
    profileRepresentativeCapacity: 1,
  })
  assert(party.generationBlocked, 'blocked when dynamic multi-rep')
  assert(
    party.warnings.some((w) => /wspólników|reprezentantów/i.test(w)),
    party.warnings.join(' | '),
  )
})

run('10. Immutable legal wrappers remain unchanged', () => {
  const map = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    plainText: PRIME_CLAUSE,
  })
  const gate = runSyntheticTestGenerationGate({
    paragraphs: [{ index: 3, text: PRIME_CLAUSE }],
    slots: map.slots,
    sourceKind: 'docx',
  })
  const out = gate.transformedParagraphs[0]!.text
  assert(out.includes('prowadzącymi działalność gospodarczą'), 'w1')
  assert(out.includes('w formie spółki cywilnej'), 'w2')
  assert(out.includes('pod firmą'), 'w3')
  assert(out.includes('z siedzibą w'), 'w4')
})

run('extract still finds minimal PRIMEPHOTO s.c.', () => {
  const after =
    'PRIMEPHOTO s.c. Dominik Błaszczyk, Anna Hornik z siedzibą w Jaworznie'
  assertEq(extractMinimalCompanyNameAfterFirm(after)?.text, 'PRIMEPHOTO s.c.', 'x')
})

run('Broad whole-clause candidate is marked unsafe for replace', () => {
  const v = validateMinimalSlotSpan({
    registryKey: 'company_name',
    text: BROAD_UNSAFE,
    operation: 'replace',
  })
  assert(!v.ok, 'unsafe')
  assertEq(v.physicalSpanSafety, 'unsafe', 'safety')
})

run('Unsafe dynamic slot cannot be confirmed', () => {
  const slot: TemplateSlot = {
    id: 'x',
    registryKey: 'company_name',
    label: 'company',
    sourceHint: 'company',
    occurrences: 1,
    enabled: true,
    originalText: BROAD_UNSAFE,
    physicalSpanSafety: 'unsafe',
    spanSafetyMessage: 'Zakres jest zbyt szeroki',
    needsConfirmation: true,
    variableClassification: 'dynamic_candidate',
  }
  const next = confirmSlot(slot)
  assert(next.physicallyBound !== true, 'not bound')
})

run('Unsafe dynamic slot prevents generation readiness', () => {
  const poisoned = {
    version: 1 as const,
    slots: [
      {
        id: 'bad',
        registryKey: 'company_name',
        label: 'bad',
        sourceHint: 'company' as const,
        occurrences: 1,
        enabled: true,
        physicallyBound: true,
        originalText: BROAD_UNSAFE,
        physicalSpanSafety: 'unsafe' as const,
        paragraphIndex: 3,
        operation: 'replace' as const,
        detectionStatus: 'bound' as const,
        variableClassification: 'dynamic_candidate' as const,
      },
    ],
    unmappedDynamics: [] as string[],
  }
  const report = validateTemplateSlotBindings(poisoned)
  assert(!report.ready, 'not ready')
})

run('High confidence does not bypass span safety', () => {
  const v = validateMinimalSlotSpan({
    registryKey: 'company_name',
    text: BROAD_UNSAFE,
  })
  assert(!v.ok, 'still unsafe')
})

run('Missing client-party detection blocks client clause', () => {
  const text =
    'Umowa pomiędzy: firmą X oraz Parą Młodą, zwaną dalej „Parą Młodą”.'
  const party = analyzePartyCompleteness({
    paragraphs: [{ index: 0, text }],
    slots: [],
  })
  assertEq(party.clientPartyMode, 'missing', 'client missing')
  assert(
    party.warnings.some((w) => /klienta|pary/i.test(w)),
    party.warnings.join(' | '),
  )
})

run('Templates without party concepts are not globally blocked', () => {
  const party = analyzePartyCompleteness({
    paragraphs: [{ index: 0, text: 'Pakiet Movie obejmuje montaż filmu.' }],
    slots: [],
  })
  assert(!party.generationBlocked, 'not blocked')
})

run('PDF analysis cannot become generation-ready', () => {
  const gate = runSyntheticTestGenerationGate({
    paragraphs: [{ index: 0, text: PRIME_CLAUSE }],
    slots: [],
    sourceKind: 'pdf',
  })
  assert(!gate.ok, 'pdf blocked')
})

run('legal wrapper list covers expected phrases', () => {
  assert(
    LEGAL_WRAPPER_PHRASES.some((p) => p.includes('pod firm')),
    'pod firmą',
  )
})

if (!process.exitCode) {
  console.log('\nAll contract slot-safety tests passed.')
}
