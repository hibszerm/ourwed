/**
 * Logical field ↔ physical bindings sync acceptance.
 * Run: npm run test:logical-contract-fields
 */

import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import { verifyContractTransformation } from './contractQualityCheck'
import {
  collapseCompletenessFieldsByRegistryKey,
  groupSlotsIntoLogicalFields,
  normalizePhysicalBindings,
  physicalBindingId,
  slotsForSinglePassApply,
} from './logicalContractFields'
import type { CompletenessField } from './buildContractCompleteness'
import type { TemplateSlot } from './types'

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

function binding(
  registryKey: string,
  para: number,
  start: number,
  end: number,
  originalText: string,
  idOverride?: string,
): TemplateSlot {
  return {
    id: idOverride ?? `slot-${registryKey}-${para}-${start}`,
    registryKey,
    label: registryKey,
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    operation: 'replace',
    paragraphIndex: para,
    originalText,
    startOffset: start,
    endOffset: end,
    allowedRange: { start, end },
    detectionStatus: 'bound',
  }
}

run('review collapses three contract_execution_date bindings to one row', () => {
  const slots = [
    binding('contract_execution_date', 1, 0, 10, '01.01.2026'),
    binding('contract_execution_date', 28, 5, 15, '01.01.2026'),
    binding('contract_execution_date', 49, 2, 12, '01.01.2026'),
    binding('client_phone', 10, 0, 9, '123456789'),
    binding('client_phone', 11, 0, 9, '123456789'),
  ]
  const logical = groupSlotsIntoLogicalFields(slots)
  const date = logical.find((f) => f.registryKey === 'contract_execution_date')
  const phone = logical.find((f) => f.registryKey === 'client_phone')
  assertEq(date?.physicalBindings.length, 3, 'date bindings')
  assertEq(phone?.physicalBindings.length, 2, 'phone bindings')

  const fields: CompletenessField[] = slots.map((s) => ({
    slotId: s.id,
    registryKey: s.registryKey!,
    label: s.label,
    group: 'wedding',
    value: 'x',
    missing: false,
    source: 'wedding',
    sourceLabel: 'Ślub',
  }))
  const collapsed = collapseCompletenessFieldsByRegistryKey(fields)
  assertEq(collapsed.length, 2, 'two logical review rows')
  assertEq(
    new Set(collapsed.map((f) => f.registryKey)).size,
    2,
    'unique keys',
  )
  assertEq(
    new Set(collapsed.map((f) => f.slotId)).size,
    collapsed.length,
    'unique react keys',
  )
})

run('end-offset drift does not create duplicate binding identity', () => {
  const slots = [
    binding('wedding_date', 5, 10, 20, '01.01.2026', 'slot-wedding_date-5-10'),
    binding('wedding_date', 5, 10, 22, '01.01.2026', 'slot-wedding_date-5-10'),
  ]
  const normalized = normalizePhysicalBindings(slots)
  const dates = normalized.filter((s) => s.registryKey === 'wedding_date')
  assertEq(dates.length, 1, 'one binding after normalize')
  assertEq(dates[0]?.id, physicalBindingId(dates[0]!), 'id includes end')
  assert(
    dates[0]!.id.includes('-10-22') || dates[0]!.endOffset === 22,
    'kept longer/stronger span',
  )
})

run('renderer replaces every distinct physical occurrence', () => {
  const slots = [
    binding('contract_execution_date', 0, 0, 10, '01.01.2026'),
    binding('contract_execution_date', 1, 0, 10, '01.01.2026'),
    binding('contract_execution_date', 2, 0, 10, '01.01.2026'),
  ]
  const original = [
    { index: 0, text: '01.01.2026 zawarta w Warszawie.' },
    { index: 1, text: '01.01.2026 data umowy.' },
    { index: 2, text: '01.01.2026 podpisano.' },
  ]
  const applied = applyBoundSlotsToParagraphs({
    original,
    slots: slotsForSinglePassApply(normalizePhysicalBindings(slots)),
    resolved: { contract_execution_date: '26.07.2026' },
  })
  assertEq(applied.failures.length, 0, 'no locate failures')
  assertEq(applied.applied.length, 3, 'three replacements')
  assert(
    applied.paragraphs.every((p) => p.text.includes('26.07.2026')),
    'all paragraphs updated',
  )
  const quality = verifyContractTransformation({
    original,
    transformed: applied.paragraphs,
    resolvedByKey: { contract_execution_date: '26.07.2026' },
    slots: normalizePhysicalBindings(slots),
  })
  assert(quality.ok, quality.report ?? quality.reason ?? 'quality')
})

run('shared physical span is applied once (reception/ceremony/prep)', () => {
  const shared = [
    binding('preparation_location', 7, 20, 40, 'Hotel Example'),
    binding('ceremony_location', 7, 20, 40, 'Hotel Example'),
    binding('reception_location', 7, 20, 40, 'Hotel Example'),
  ]
  const forApply = slotsForSinglePassApply(shared)
  assertEq(forApply.length, 1, 'one apply slot')
  assertEq(forApply[0]?.registryKey, 'reception_location', 'prefer reception')

  const original = [
    { index: 7, text: 'Miejsce: Hotel Example — sala główna.' },
  ]
  const applied = applyBoundSlotsToParagraphs({
    original,
    slots: forApply,
    resolved: {
      preparation_location: 'Pałac Wilanów',
      ceremony_location: 'Pałac Wilanów',
      reception_location: 'Pałac Wilanów',
    },
  })
  assertEq(applied.failures.length, 0, 'no safe locate failure')
  assert(applied.paragraphs[0]!.text.includes('Pałac Wilanów'), 'replaced')
})

run('distinct ceremony and reception spans both replace', () => {
  const slots = [
    binding('ceremony_location', 3, 10, 20, 'Kościół A'),
    binding('ceremony_location', 4, 5, 15, 'Kościół A'),
    binding('reception_location', 8, 12, 24, 'Sala B'),
    binding('reception_location', 9, 0, 12, 'Sala B'),
  ]
  const logical = groupSlotsIntoLogicalFields(slots)
  assertEq(
    logical.find((f) => f.registryKey === 'ceremony_location')?.physicalBindings
      .length,
    2,
    'ceremony x2',
  )
  assertEq(
    logical.find((f) => f.registryKey === 'reception_location')?.physicalBindings
      .length,
    2,
    'reception x2',
  )
  const forApply = slotsForSinglePassApply(normalizePhysicalBindings(slots))
  assertEq(forApply.length, 4, 'four distinct spans')

  const original = [
    { index: 3, text: 'Ceremonia: Kościół A dziś.' },
    { index: 4, text: 'Ślub w Kościół A.' },
    { index: 8, text: 'Przyjęcie: Sala B wieczorem.' },
    { index: 9, text: 'Sala B — bankiet.' },
  ]
  const applied = applyBoundSlotsToParagraphs({
    original,
    slots: forApply,
    resolved: {
      ceremony_location: 'Katedra',
      reception_location: 'Pałac',
    },
  })
  assertEq(applied.failures.length, 0, 'no locate failures')
  assertEq(applied.applied.length, 4, 'four applies')
})

run('React keys stay unique after collapse', () => {
  const fields: CompletenessField[] = [
    {
      slotId: 'slot-contract_execution_date-1-0',
      registryKey: 'contract_execution_date',
      label: 'Data',
      group: 'wedding',
      value: 'a',
      missing: false,
      source: 'wedding',
      sourceLabel: 'Ślub',
    },
    {
      slotId: 'slot-contract_execution_date-1-0',
      registryKey: 'contract_execution_date',
      label: 'Data',
      group: 'wedding',
      value: 'a',
      missing: false,
      source: 'wedding',
      sourceLabel: 'Ślub',
    },
    {
      slotId: 'slot-bride_phone-2-0',
      registryKey: 'bride_phone',
      label: 'Telefon',
      group: 'couple',
      value: '1',
      missing: false,
      source: 'wedding',
      sourceLabel: 'Ślub',
    },
  ]
  const collapsed = collapseCompletenessFieldsByRegistryKey(fields)
  assertEq(collapsed.length, 2, 'collapsed')
  const keys = collapsed.map((f) => f.slotId)
  assertEq(new Set(keys).size, keys.length, 'no duplicate react keys')
})

console.log('\nLogical contract field acceptance finished.')
