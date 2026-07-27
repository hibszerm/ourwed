/**
 * Client-party shared physical span normalization.
 * Run: npm run test:package-contract-shared-span-normalization
 */

import { readFileSync } from 'node:fs'
import {
  classifySpanRelationship,
  normalizeClientPartyPhysicalBindings,
} from './normalizeClientPartyPhysicalBindings'
import { findSharedPhysicalSpanConflicts } from './packageContractGenerationModel'
import { buildPackageContractFinalReport } from './packageContractFinalReport'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import { applyPackageContractAllowlistToSlotMap } from './packageContractAllowlist'
import { normalizeSlotMap } from './logicalContractFields'
import {
  evaluateClientPartyReadiness,
  isClientPartyIdentityKey,
} from './clientPartyReadiness'
import { isSlotPhysicallyBound, type TemplateSlot } from './types'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'

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

function slot(
  key: string,
  para: number,
  start: number,
  end: number,
  text: string,
  extra?: Partial<TemplateSlot>,
): TemplateSlot {
  return {
    id: `slot-${key}-${para}-${start}-${end}`,
    registryKey: key,
    label: key,
    enabled: true,
    physicallyBound: true,
    paragraphIndex: para,
    startOffset: start,
    endOffset: end,
    allowedRange: { start, end },
    originalText: text,
    operation: key === 'couple_full_names' ? 'composite' : 'replace',
    sourceHint: 'couple',
    occurrences: 1,
    confidence: 0.9,
    ...extra,
  }
}

const quiet = () => {
  const info = console.info
  console.info = () => {}
  return () => {
    console.info = info
  }
}

run('A — composite contains individual names → one canonical identity', () => {
  const restore = quiet()
  const input = [
    slot('couple_full_names', 0, 0, 46, 'Anną Kwiatkowską i Tomaszem Kwiatkowskim'),
    slot('bride_full_name', 0, 0, 18, 'Anną Kwiatkowską'),
    slot('groom_full_name', 0, 21, 46, 'Tomaszem Kwiatkowskim'),
  ]
  const result = normalizeClientPartyPhysicalBindings(input)
  restore()
  assertEq(result.retained.length, 1, 'one retained')
  assertEq(result.retained[0]?.registryKey, 'couple_full_names', 'composite')
  assert(
    result.discarded.every(
      (d) => d.reason === 'covered_by_canonical_composite_identity',
    ),
    'discard reason',
  )
  assertEq(findSharedPhysicalSpanConflicts(result.slots).length, 0, 'no conflict')
  const party = evaluateClientPartyReadiness({
    boundRegistryKeys: result.retained.map((s) => s.registryKey!),
  })
  assert(party.ready, 'identity ready')
  assertEq(party.recognizedPersonCount, 2, 'two persons via composite')
})

run('B — exact duplicate composite → one retained', () => {
  const restore = quiet()
  const a = slot(
    'couple_full_names',
    0,
    0,
    40,
    'Anną Kwiatkowską i Tomaszem Kwiatkowskim',
    { id: 'slot-a', confidence: 0.9 },
  )
  const b = slot(
    'couple_full_names',
    0,
    0,
    40,
    'Anną Kwiatkowską i Tomaszem Kwiatkowskim',
    { id: 'slot-b', confidence: 0.8 },
  )
  const result = normalizeClientPartyPhysicalBindings([a, b])
  restore()
  assertEq(result.retained.length, 1, 'one')
  assertEq(result.retained[0]?.id, 'slot-a', 'higher confidence wins')
  assert(
    result.discarded.some((d) => d.reason === 'exact_duplicate_binding'),
    'duplicate reason',
  )
})

run('C — shared address bride+groom identical span → one physical', () => {
  const restore = quiet()
  const result = normalizeClientPartyPhysicalBindings([
    slot('bride_address', 0, 10, 40, 'ul. Lipowa 12/4, 30-702 Kraków'),
    slot('groom_address', 0, 10, 40, 'ul. Lipowa 12/4, 30-702 Kraków'),
  ])
  restore()
  assertEq(result.retained.length, 1, 'one address')
  assertEq(result.retained[0]?.registryKey, 'bride_address', 'bride preferred')
  assert(
    (result.retained[0]?.aliases ?? []).includes('groom_address'),
    'alias recorded',
  )
  assertEq(findSharedPhysicalSpanConflicts(result.slots).length, 0, 'no conflict')
})

run('D — shared phone two keys identical span → one physical', () => {
  const restore = quiet()
  const result = normalizeClientPartyPhysicalBindings([
    slot('bride_phone', 0, 5, 16, '512 340 221'),
    slot('groom_phone', 0, 5, 16, '512 340 221'),
  ])
  restore()
  assertEq(result.retained.length, 1, 'one phone')
  assertEq(findSharedPhysicalSpanConflicts(result.slots).length, 0, 'no conflict')
})

run('E — composite overlapping address remains blocked if ranges collide', () => {
  const restore = quiet()
  // Identity incorrectly ends past the comma into address — partial/contains unsafe
  const result = normalizeClientPartyPhysicalBindings([
    slot(
      'couple_full_names',
      0,
      0,
      50,
      'Anną Kwiatkowską i Tomaszem Kwiatkowskim, zam',
    ),
    slot('bride_address', 0, 47, 77, 'ul. Lipowa 12/4, 30-702 Kraków'),
  ])
  restore()
  assert(result.remainingConflicts.length > 0 || findSharedPhysicalSpanConflicts(result.slots).length > 0, 'still blocked')
})

run('F — partial overlap unrelated fields remains blocked', () => {
  const restore = quiet()
  const result = normalizeClientPartyPhysicalBindings([
    slot('couple_full_names', 0, 0, 30, 'Anną Kwiatkowską i Tomaszem'),
    slot('bride_address', 0, 25, 55, 'Tomaszem Kwiatkowskim, zam.'),
  ])
  restore()
  assert(result.remainingConflicts.length > 0, 'unresolved partial')
  assertEq(
    result.remainingConflicts[0]?.relationship,
    'partial_overlap',
    'partial',
  )
})

run('G — same text different paragraphs is not a conflict', () => {
  const restore = quiet()
  const result = normalizeClientPartyPhysicalBindings([
    slot('bride_address', 0, 0, 20, 'ul. Lipowa 12/4'),
    slot('bride_address', 1, 0, 20, 'ul. Lipowa 12/4'),
  ])
  restore()
  assertEq(result.retained.length, 2, 'both kept')
  assertEq(findSharedPhysicalSpanConflicts(result.slots).length, 0, 'no conflict')
})

run('H — same offsets different paragraphs is not a conflict', () => {
  assertEq(
    classifySpanRelationship(
      { paragraphIndex: 0, start: 5, end: 16 },
      { paragraphIndex: 1, start: 5, end: 16 },
    ),
    null,
    'different paras',
  )
})

const KWIATKOWSCY_MULTI = [
  {
    index: 0,
    text: 'Zawarta w dniu 14.03.2027 r. w Krakowie, zwana dalej „Umową”,',
  },
  { index: 1, text: 'pomiędzy:' },
  { index: 2, text: 'Anną Kwiatkowską i Tomaszem Kwiatkowskim,' },
  { index: 3, text: 'zam. ul. Lipowa 12/4, 30-702 Kraków,' },
  { index: 4, text: 'tel. 512 340 221,' },
  { index: 5, text: 'zwanymi dalej „Klientami”' },
  { index: 6, text: 'a' },
  {
    index: 7,
    text: 'firmą Studio Foto Lumen Anna Wiśniewska, stałe miejsce wykonywania działalności gospodarczej: ul. Krakowska 22/3, 30-002 Kraków, NIP 679-000-00-00, REGON 123456789, tel. 601 220 330, zwaną dalej „Fotografem”.',
  },
  {
    index: 8,
    text: 'Ślub odbędzie się w dniu 20.06.2027 r.',
  },
  {
    index: 9,
    text: 'Wynagrodzenie wynosi 9000 zł brutto.',
  },
]

const KWIATKOWSCY_SINGLE = [
  {
    index: 0,
    text: 'Anną Kwiatkowską i Tomaszem Kwiatkowskim, zam. ul. Lipowa 12/4, 30-702 Kraków, tel. 512 340 221, zwanymi dalej „Klientami”',
  },
  {
    index: 1,
    text: 'Zawarta w dniu 14.03.2027 r.',
  },
  {
    index: 2,
    text: 'Ślub odbędzie się w dniu 20.06.2027 r.',
  },
  {
    index: 3,
    text: 'Wynagrodzenie wynosi 9000 zł brutto.',
  },
]

function emptyAi(): AiDocumentAnalysisResult {
  return {
    documentType: 'contract',
    fields: [],
    confidence: 1,
    warnings: [],
  } as unknown as AiDocumentAnalysisResult
}

function fullPipeline(paragraphs: Array<{ index: number; text: string }>) {
  const restore = quiet()
  const map = buildSlotsFromAnalysis({
    ai: emptyAi(),
    plainText: paragraphs.map((p) => p.text).join('\n'),
    paragraphs,
    sourceKind: 'docx',
  })
  const filtered = applyPackageContractAllowlistToSlotMap(normalizeSlotMap(map))
  const normalized = normalizeClientPartyPhysicalBindings(filtered.slotMap.slots)
  const physical = normalized.slots.filter(
    (s) => s.registryKey && isSlotPhysicallyBound(s),
  )
  const conflicts = findSharedPhysicalSpanConflicts(physical)
  const allowedKeys = physical.map((s) => s.registryKey!)
  const report = buildPackageContractFinalReport({
    paragraphs,
    slots: physical,
    allowedRegistryKeys: allowedKeys,
    sharedSpanConflicts: conflicts,
  })
  restore()
  return { physical, conflicts, report, normalized }
}

run('I — Kwiatkowscy multi-paragraph fixture → ready', () => {
  const { physical, conflicts, report } = fullPipeline(KWIATKOWSCY_MULTI)
  assertEq(conflicts.length, 0, 'no conflicts')
  assertEq(report.blockingIssues.length, 0, 'no blockers')
  if (report.kind !== 'ready') {
    throw new Error(
      `ready expected; got ${report.kind} missing=${JSON.stringify(report.missingCategories)} keys=${physical.map((s) => s.registryKey).join(',')}`,
    )
  }
  const id = physical.find((s) => isClientPartyIdentityKey(s.registryKey))
  assertEq(
    id?.originalText,
    'Anną Kwiatkowską i Tomaszem Kwiatkowskim',
    'canonical identity',
  )
  assert(
    !physical.some((s) => /Wiśniewska/i.test(s.originalText ?? '')),
    'provider excluded',
  )
  const party = evaluateClientPartyReadiness({
    boundRegistryKeys: physical.map((s) => s.registryKey!),
  })
  assertEq(party.recognizedPersonCount, 2, 'two persons')
})

run('I2 — Kwiatkowscy single-paragraph fixture → ready (was the conflict)', () => {
  const { physical, conflicts, report, normalized } = fullPipeline(
    KWIATKOWSCY_SINGLE,
  )
  assertEq(conflicts.length, 0, 'no conflicts after normalize')
  assertEq(report.blockingIssues.length, 0, 'no blockers')
  if (report.kind !== 'ready') {
    throw new Error(
      `ready expected; got ${report.kind} missing=${JSON.stringify(report.missingCategories)} keys=${physical.map((s) => s.registryKey).join(',')}`,
    )
  }
  const identities = physical.filter((s) =>
    isClientPartyIdentityKey(s.registryKey),
  )
  assertEq(identities.length, 1, 'one identity replacement')
  assertEq(
    identities[0]?.originalText,
    'Anną Kwiatkowską i Tomaszem Kwiatkowskim',
    'canonical phrase',
  )
  assertEq(
    physical.filter((s) => s.registryKey && /address/i.test(s.registryKey))
      .length,
    1,
    'one address',
  )
  assertEq(
    physical.filter((s) => s.registryKey && /phone/i.test(s.registryKey)).length,
    1,
    'one phone',
  )
  assert(
    normalized.discarded.every((d) =>
      [
        'covered_by_canonical_composite_identity',
        'exact_duplicate_binding',
        'shared_address_identical_span_alias',
        'shared_phone_identical_span_alias',
      ].includes(d.reason),
    ),
    'only safe discard reasons',
  )
})

run('J — one-person masculine no regression', () => {
  const { report, conflicts } = fullPipeline([
    {
      index: 0,
      text: 'Robertem Strojkiem, zam. ul. A 1, tel. 600 100 200, zwanym dalej „Klientem”',
    },
  ])
  assertEq(conflicts.length, 0, 'no conflicts')
  assert(report.requiredData.clientParty.ready, 'client ready')
})

run('K — one-person feminine no regression', () => {
  const { report, conflicts } = fullPipeline([
    {
      index: 0,
      text: 'Aleksandrą Biłas, zam. ul. A 1, tel. 600 100 200, zwaną dalej „Klientką”',
    },
  ])
  assertEq(conflicts.length, 0, 'no conflicts')
  assert(report.requiredData.clientParty.ready, 'client ready')
})

run('L — two people separate addresses and phones retained', () => {
  const restore = quiet()
  const result = normalizeClientPartyPhysicalBindings([
    slot('bride_full_name', 0, 0, 14, 'Anną Kowalską'),
    slot('groom_full_name', 0, 17, 31, 'Janem Nowakiem'),
    slot('bride_address', 1, 0, 20, 'ul. Pierwsza 1'),
    slot('groom_address', 2, 0, 20, 'ul. Druga 2'),
    slot('bride_phone', 3, 0, 11, '500 100 200'),
    slot('groom_phone', 4, 0, 11, '500 100 201'),
  ])
  restore()
  assertEq(result.retained.length, 6, 'all separate kept')
  assertEq(findSharedPhysicalSpanConflicts(result.slots).length, 0, 'no overlap')
})

run('M — shared address + separate phones', () => {
  const restore = quiet()
  const result = normalizeClientPartyPhysicalBindings([
    slot('couple_full_names', 0, 0, 40, 'Anną Kowalską i Janem Nowakiem'),
    slot('bride_address', 1, 0, 20, 'ul. Wspólna 1'),
    slot('groom_address', 1, 0, 20, 'ul. Wspólna 1'),
    slot('bride_phone', 2, 0, 11, '500 100 200'),
    slot('groom_phone', 3, 0, 11, '500 100 201'),
  ])
  restore()
  assertEq(
    result.retained.filter((s) => /address/.test(s.registryKey!)).length,
    1,
    'one address',
  )
  assertEq(
    result.retained.filter((s) => /phone/.test(s.registryKey!)).length,
    2,
    'two phones',
  )
})

run('N — separate addresses + shared phone', () => {
  const restore = quiet()
  const result = normalizeClientPartyPhysicalBindings([
    slot('couple_full_names', 0, 0, 40, 'Anną Kowalską i Janem Nowakiem'),
    slot('bride_address', 1, 0, 20, 'ul. Pierwsza 1'),
    slot('groom_address', 2, 0, 20, 'ul. Druga 2'),
    slot('bride_phone', 3, 0, 11, '512 340 221'),
    slot('groom_phone', 3, 0, 11, '512 340 221'),
  ])
  restore()
  assertEq(
    result.retained.filter((s) => /address/.test(s.registryKey!)).length,
    2,
    'two addresses',
  )
  assertEq(
    result.retained.filter((s) => /phone/.test(s.registryKey!)).length,
    1,
    'one phone',
  )
})

run('assignment runs normalize before conflict detection', () => {
  const src = readFileSync(
    'src/features/documents/template/packageContractAssignment.ts',
    'utf8',
  )
  const normAt = src.indexOf('normalizeClientPartyPhysicalBindings')
  const conflictAt = src.indexOf('findSharedPhysicalSpanConflicts')
  assert(normAt >= 0 && conflictAt > normAt, 'normalize before conflicts')
})

run('blocker copy is not location-misleading', () => {
  const src = readFileSync(
    'src/features/documents/template/packageContractRequiredDataReadiness.ts',
    'utf8',
  )
  assert(src.includes('nakładają się na siebie'), 'overlap wording')
  assert(!src.includes('rozpoznać miejsc w umowie'), 'old location wording gone')
})

console.log('\nPackage contract shared-span normalization tests finished.')
