/**
 * Stale persisted version → physical sync → generation quality.
 * Run: npm run test:coverage-hours-persist
 */

import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import { verifyContractTransformation } from './contractQualityCheck'
import {
  logContractLoadedBindings,
  syncPhysicalBindingsFromSource,
} from './syncPhysicalBindingsFromSource'
import { isSlotPhysicallyBound, type TemplateSlot } from './types'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'

const PARA_36 =
  'Wykonawca zastrzega że, czas jego pracy w dniu ślubu nie przekracza 11 godzin (od 12:00 - 23:00). Dłuższy czas pracy jest płatny dodatkowo. Za każdą dodatkową rozpoczętą godzinę pracy do ustalonego wynagrodzenia zostanie doliczona kwota 1000 zł.'

const EXPECTED =
  'Wykonawca zastrzega że, czas jego pracy w dniu ślubu nie przekracza 12 godzin (od 12:00 - 00:30). Dłuższy czas pracy jest płatny dodatkowo. Za każdą dodatkową rozpoczętą godzinę pracy do ustalonego wynagrodzenia zostanie doliczona kwota 1 400 zł.'

const VERSION_ID = '9744b63b-c4b8-4a6f-a504-b51547b438f7'

const emptyAi = {
  documentType: 'contract',
  language: 'pl',
  fields: [],
  packageVariables: [],
  weddingVariables: [],
  companyVariables: [],
  coupleVariables: [],
} as unknown as AiDocumentAnalysisResult

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

function stalePersistedSlotsWithoutCoverageHours(): TemplateSlot[] {
  // Simulate DB snapshot that only persisted start/end/overtime (pre-fix).
  return [
    {
      id: 'slot-coverage_start_time-36-82',
      registryKey: 'coverage_start_time',
      label: 'start',
      sourceHint: 'package',
      occurrences: 1,
      exampleText: '12:00',
      enabled: true,
      placeholderInserted: false,
      physicallyBound: true,
      operation: 'replace',
      paragraphIndex: 36,
      originalText: '12:00',
      startOffset: 82,
      endOffset: 87,
      allowedRange: { start: 82, end: 87 },
      detectionStatus: 'bound',
    },
    {
      id: 'slot-coverage_end_time-36-90',
      registryKey: 'coverage_end_time',
      label: 'end',
      sourceHint: 'package',
      occurrences: 1,
      exampleText: '23:00',
      enabled: true,
      placeholderInserted: false,
      physicallyBound: true,
      operation: 'replace',
      paragraphIndex: 36,
      originalText: '23:00',
      startOffset: 90,
      endOffset: 95,
      allowedRange: { start: 90, end: 95 },
      detectionStatus: 'bound',
    },
    {
      id: 'slot-overtime_rate-36-237',
      registryKey: 'overtime_rate',
      label: 'overtime',
      sourceHint: 'package',
      occurrences: 1,
      exampleText: '1000 zł',
      enabled: true,
      placeholderInserted: false,
      physicallyBound: true,
      operation: 'replace',
      paragraphIndex: 36,
      originalText: '1000 zł',
      startOffset: 237,
      endOffset: 244,
      allowedRange: { start: 237, end: 244 },
      leftAnchor: 'kwota ',
      rightAnchor: '.',
      detectionStatus: 'bound',
    },
  ]
}

const resolved = {
  coverage_hours: '12',
  coverage_start_time: '12:00',
  coverage_end_time: '00:30',
  overtime_rate: '1400',
  overtime_rate_formatted: '1 400 zł',
}

run('1 — stale persisted version has no coverage_hours', () => {
  const stale = stalePersistedSlotsWithoutCoverageHours()
  assert(
    !stale.some((s) => s.registryKey === 'coverage_hours'),
    'stale must omit coverage_hours',
  )
  logContractLoadedBindings({
    templateVersionId: VERSION_ID,
    phase: 'test-stale',
    slots: stale,
    paragraphIndex: 36,
  })
})

run('2 — re-analysis / binder detects coverage_hours = 11', () => {
  const fresh = buildSlotsFromAnalysis({
    ai: emptyAi,
    paragraphs: [{ index: 36, text: PARA_36 }],
    plainText: PARA_36,
    sourceKind: 'docx',
  })
  const hours = fresh.slots.find(
    (s) => s.registryKey === 'coverage_hours' && isSlotPhysicallyBound(s),
  )
  assert(Boolean(hours), 'coverage_hours bound')
  assertEq(hours!.originalText, '11', 'span')
  assertEq(hours!.paragraphIndex, 36, 'para')
  assertEq(hours!.startOffset, 68, 'start')
  assertEq(hours!.endOffset, 70, 'end')
})

run('3 — sync persists new binding into loaded map (simulates save)', () => {
  const staleMap = {
    version: 1 as const,
    slots: stalePersistedSlotsWithoutCoverageHours(),
    unmappedDynamics: [] as string[],
  }
  const synced = syncPhysicalBindingsFromSource({
    slotMap: staleMap,
    paragraphs: [{ index: 36, text: PARA_36 }],
  })
  assert(
    synced.diagnostic.added.some((a) => a.registryKey === 'coverage_hours'),
    'must add coverage_hours',
  )
  const hours = synced.slotMap.slots.find(
    (s) => s.registryKey === 'coverage_hours' && isSlotPhysicallyBound(s),
  )
  assert(Boolean(hours), 'persisted after sync')
  assertEq(hours!.originalText, '11', 'span after sync')
  // Simulate "reload browser" — use synced map as the only source of truth.
  assertEq(synced.diagnostic.paragraph36.filter((b) => b.registryKey === 'coverage_hours').length, 1, 'one hours')
})

run('4–8 — generation reloads synced version; SLOTS + quality', () => {
  const staleMap = {
    version: 1 as const,
    slots: stalePersistedSlotsWithoutCoverageHours(),
    unmappedDynamics: [] as string[],
  }
  const synced = syncPhysicalBindingsFromSource({
    slotMap: staleMap,
    paragraphs: [{ index: 36, text: PARA_36 }],
  })
  // Simulate generation load of the persisted (synced) version.
  const loaded = synced.slotMap
  logContractLoadedBindings({
    templateVersionId: VERSION_ID,
    phase: 'generation-reload',
    slots: loaded.slots,
    paragraphIndex: 36,
  })
  const bound = loaded.slots.filter(isSlotPhysicallyBound)
  const keys = new Set(bound.map((s) => s.registryKey))
  for (const k of [
    'coverage_hours',
    'coverage_start_time',
    'coverage_end_time',
    'overtime_rate',
  ]) {
    assert(keys.has(k), `runtime SLOTS must include ${k}`)
  }

  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 36, text: PARA_36 }],
    slots: bound,
    resolved,
  })
  const out = applied.paragraphs[0]!.text
  assert(out.includes('12 godzin'), '12 godzin')
  assert(out.includes('od 12:00 - 00:30'), 'times')
  assert(out.includes('1 400 zł'), 'money')
  assertEq(out, EXPECTED, 'exact paragraph')

  const quality = verifyContractTransformation({
    original: [{ index: 36, text: PARA_36 }],
    transformed: applied.paragraphs,
    allowedValues: Object.values(resolved),
    resolvedByKey: resolved,
    slots: bound,
  })
  assert(quality.ok, quality.report ?? quality.reason ?? 'quality')
})

run('9 — old cached map without sync cannot authorize hours change', () => {
  const stale = stalePersistedSlotsWithoutCoverageHours()
  const applied = applyBoundSlotsToParagraphs({
    original: [{ index: 36, text: PARA_36 }],
    slots: stale,
    resolved,
  })
  // Without coverage_hours, hours stay 11 — stale cache must not silently "fix" text.
  assert(applied.paragraphs[0]!.text.includes('11 godzin'), 'stale keeps 11')
  assert(!applied.paragraphs[0]!.text.includes('12 godzin'), 'stale no 12')
  const quality = verifyContractTransformation({
    original: [{ index: 36, text: PARA_36 }],
    transformed: [
      {
        index: 36,
        text: applied.paragraphs[0]!.text.replace('11 godzin', '12 godzin'),
      },
    ],
    allowedValues: Object.values(resolved),
    resolvedByKey: resolved,
    slots: stale,
  })
  assert(!quality.ok, 'tampered hours without slot must fail quality')
})

if (!process.exitCode) {
  console.log('\nAll coverage-hours persistence tests passed.')
}
