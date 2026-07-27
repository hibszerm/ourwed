/**
 * Composite couple_full_names generation — no overlapping partner slots.
 * Run: npm run test:package-contract-composite-client-generation
 */

import { readFileSync } from 'node:fs'
import {
  deriveClientPartyGenerationCapability,
  preflightClientPartyGeneration,
  composeCoupleFullNamesValue,
  selectClientPartyAuditParagraphs,
} from './clientPartyGenerationCapability'
import { resolvePartyBlock, auditPartnersRepresented } from './partyBlockResolver'
import { runPostGenerationAudit } from './postGenerationAudit'
import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import { normalizeClientPartyPhysicalBindings } from './normalizeClientPartyPhysicalBindings'
import { isSlotPhysicallyBound, type TemplateSlot } from './types'
import type { Wedding } from '@/types/wedding'

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
    separator: key === 'couple_full_names' ? ' i ' : undefined,
    ...extra,
  }
}

function wedding(p1: string, p2: string): Pick<Wedding, 'couple' | 'date' | 'id'> {
  return {
    id: 'w-test',
    date: '2027-06-20',
    couple: {
      partner1: p1,
      partner2: p2,
      partner1Address: 'ul. Test 1',
      partner2Address: 'ul. Test 1',
    } as Wedding['couple'],
  }
}

run('1 — composite template + two wedding persons → one replacement', () => {
  const slots = [
    slot(
      'couple_full_names',
      0,
      0,
      40,
      'Anną Kwiatkowską i Tomaszem Kwiatkowskim',
    ),
  ]
  const cap = deriveClientPartyGenerationCapability(slots)
  assertEq(cap.physicalMode, 'composite', 'mode')
  assertEq(cap.expectedPersonCount, 2, 'expects two wedding persons')
  assertEq(cap.physicalIdentityBindingCount, 1, 'one physical')

  const plan = resolvePartyBlock({
    slots,
    wedding: wedding('Iza Karczewska', 'Jan Kulewski'),
  })
  assertEq(plan.strategy, 'composite_slot', 'strategy')
  assertEq(
    plan.overrides.couple_full_names,
    'Iza Karczewska i Jan Kulewski',
    'composed value',
  )
  assert(!plan.overrides.partner2_full_name || plan.capability.physicalMode === 'composite', 'no required partner2 physical')

  const pre = preflightClientPartyGeneration({
    capability: cap,
    wedding: {
      person1FullName: 'Iza Karczewska',
      person2FullName: 'Jan Kulewski',
    },
  })
  assert(pre.ready, 'preflight ready')
  assertEq(pre.composedCoupleValue, 'Iza Karczewska i Jan Kulewski', 'compose')
})

run('2 — composite + only person 1 → blocked missing wedding person 2', () => {
  const slots = [
    slot('couple_full_names', 0, 0, 40, 'Anną Kwiatkowską i Tomaszem Kwiatkowskim'),
  ]
  const pre = preflightClientPartyGeneration({
    capability: deriveClientPartyGenerationCapability(slots),
    wedding: { person1FullName: 'Iza Karczewska', person2FullName: '' },
  })
  assert(!pre.ready, 'blocked')
  assertEq(pre.failureCode, 'missing_wedding_person_2', 'code')
  if (!pre.ready) {
    assert(pre.message.includes('danych ślubu'), 'wedding-side message')
  }
})

run('3 — separate two-person template + both → two ops', () => {
  const slots = [
    slot('bride_full_name', 0, 0, 14, 'Anną Kowalską'),
    slot('groom_full_name', 0, 17, 31, 'Janem Nowakiem'),
  ]
  const cap = deriveClientPartyGenerationCapability(slots)
  assertEq(cap.physicalMode, 'separate_persons', 'separate')
  const plan = resolvePartyBlock({
    slots,
    wedding: wedding('Iza Karczewska', 'Jan Kulewski'),
  })
  assertEq(plan.overrides.bride_full_name, 'Iza Karczewska', 'p1')
  assertEq(plan.overrides.groom_full_name, 'Jan Kulewski', 'p2')
  assertEq(cap.physicalIdentityBindingCount, 2, 'two physical')
})

run('4 — separate + person 2 missing → blocked', () => {
  const slots = [
    slot('bride_full_name', 0, 0, 14, 'Anną Kowalską'),
    slot('groom_full_name', 0, 17, 31, 'Janem Nowakiem'),
  ]
  const pre = preflightClientPartyGeneration({
    capability: deriveClientPartyGenerationCapability(slots),
    wedding: { person1FullName: 'Iza Karczewska', person2FullName: '' },
  })
  assert(!pre.ready, 'blocked')
  assertEq(pre.failureCode, 'missing_wedding_person_2', 'code')
})

run('5 — single-person template + one person → ready', () => {
  const slots = [slot('partner1_full_name', 0, 0, 16, 'Robertem Strojkiem')]
  const cap = deriveClientPartyGenerationCapability(slots)
  assertEq(cap.physicalMode, 'single_person', 'single')
  assertEq(cap.expectedPersonCount, 1, 'one required')
  const pre = preflightClientPartyGeneration({
    capability: cap,
    wedding: { person1FullName: 'Robert Strojek', person2FullName: '' },
  })
  assert(pre.ready, 'ready')
})

run('6 — single-person template + two wedding persons → no second slot demand', () => {
  const slots = [slot('bride_full_name', 0, 0, 10, 'Anną X')]
  const cap = deriveClientPartyGenerationCapability(slots)
  assertEq(cap.expectedPersonCount, 1, 'does not demand person2 physically')
  const pre = preflightClientPartyGeneration({
    capability: cap,
    wedding: {
      person1FullName: 'Iza Karczewska',
      person2FullName: 'Jan Kulewski',
    },
  })
  assert(pre.ready, 'ready without partner2 slot')
  const plan = resolvePartyBlock({
    slots,
    wedding: wedding('Iza Karczewska', 'Jan Kulewski'),
  })
  assert(
    plan.overrides.bride_full_name.includes('Iza Karczewska') &&
      plan.overrides.bride_full_name.includes('Jan Kulewski'),
    'shared primary may compose both',
  )
})

run('7 — composite with aliases, no individual persisted bindings → ready', () => {
  const slots = [
    slot(
      'couple_full_names',
      0,
      0,
      40,
      'Anną Kwiatkowską i Tomaszem Kwiatkowskim',
      { aliases: ['partner1_full_name', 'partner2_full_name'] },
    ),
  ]
  const normalized = normalizeClientPartyPhysicalBindings([
    ...slots,
    slot('partner1_full_name', 0, 19, 40, 'Tomaszem Kwiatkowskim'),
  ])
  const identity = normalized.slots.filter(
    (s) => s.registryKey && isSlotPhysicallyBound(s) && /full_name|couple/.test(s.registryKey),
  )
  assertEq(identity.length, 1, 'one physical after normalize')
  const cap = deriveClientPartyGenerationCapability(normalized.slots)
  assertEq(cap.physicalMode, 'composite', 'composite')
  const pre = preflightClientPartyGeneration({
    capability: cap,
    wedding: {
      person1FullName: 'Iza Karczewska',
      person2FullName: 'Jan Kulewski',
    },
  })
  assert(pre.ready, 'ready')
})

run('8 — legacy bride + groom unchanged', () => {
  const slots = [
    slot('bride_full_name', 0, 0, 10, 'Anną'),
    slot('groom_full_name', 1, 0, 10, 'Janem'),
  ]
  const plan = resolvePartyBlock({
    slots,
    wedding: wedding('Iza Karczewska', 'Jan Kulewski'),
  })
  assertEq(plan.strategy, 'separate_slots', 'separate')
  assertEq(plan.overrides.bride_full_name, 'Iza Karczewska', 'bride')
  assertEq(plan.overrides.groom_full_name, 'Jan Kulewski', 'groom')
})

run('9 — Kwiatkowscy composite + Iza/Jan end-to-end apply + audit', () => {
  const paragraphs = [
    {
      index: 0,
      text: 'Anną Kwiatkowską i Tomaszem Kwiatkowskim, zam. ul. Lipowa 12/4, 30-702 Kraków, tel. 512 340 221, zwanymi dalej „Klientami”',
    },
    {
      index: 1,
      text: 'firmą Studio Foto Lumen Anna Wiśniewska, zwaną dalej „Fotografem”.',
    },
  ]
  const slots = [
    slot(
      'couple_full_names',
      0,
      0,
      40,
      'Anną Kwiatkowską i Tomaszem Kwiatkowskim',
    ),
    slot('bride_address', 0, 47, 77, 'ul. Lipowa 12/4, 30-702 Kraków'),
    slot('bride_phone', 0, 84, 95, '512 340 221'),
  ]
  const w = wedding('Iza Karczewska', 'Jan Kulewski')
  const plan = resolvePartyBlock({ slots, wedding: w })
  const resolved: Record<string, string> = {
    ...plan.overrides,
    bride_address: 'ul. Nowa 1, 00-001 Warszawa',
    bride_phone: '600 700 800',
  }
  assertEq(
    resolved.couple_full_names,
    'Iza Karczewska i Jan Kulewski',
    'replacement',
  )

  const applied = applyBoundSlotsToParagraphs({
    original: paragraphs,
    slots,
    resolved,
  })
  const out = applied.paragraphs.map((p) => p.text).join('\n')
  assert(out.includes('Iza Karczewska i Jan Kulewski'), 'names once')
  assert(!out.includes('Anną Kwiatkowską'), 'old names gone')
  assert(!out.includes('Tomaszem Kwiatkowskim'), 'old names gone')
  assert((out.match(/Iza Karczewska/g) ?? []).length === 1, 'iza once')
  assert((out.match(/Jan Kulewski/g) ?? []).length === 1, 'jan once')
  assert(out.includes('ul. Nowa 1, 00-001 Warszawa'), 'address once')
  assert(out.includes('600 700 800'), 'phone once')
  assert(out.includes('zwanymi dalej „Klientami”'), 'role formula intact')
  assert(out.includes('Anna Wiśniewska'), 'provider unchanged')
  assert(out.includes('Fotografem'), 'provider role unchanged')

  const identityOps = applied.applied.filter(
    (a) => a.registryKey === 'couple_full_names' && !a.omitted,
  )
  assertEq(identityOps.length, 1, 'one identity renderer op')

  const auditParas = selectClientPartyAuditParagraphs({
    paragraphs: applied.paragraphs,
    slots,
  })
  assert(
    auditParas.some((p) => /Iza Karczewska/.test(p.text)),
    'audit sees client para',
  )
  assert(
    !auditParas.every((p) => /Fotografem/.test(p.text) && !/Iza/.test(p.text)),
    'not provider-only',
  )

  const partners = auditPartnersRepresented({
    paragraphs: auditParas,
    partner1Name: 'Iza Karczewska',
    partner2Name: 'Jan Kulewski',
    templateHasClientParty: true,
    expectedPersonCount: 2,
  })
  assert(partners.ok, 'partners present in client region')

  const audit = runPostGenerationAudit({
    paragraphs: applied.paragraphs,
    slots,
    wedding: w,
    resolved,
    applied: applied.applied,
  })
  assert(audit.ok, 'post-gen audit ok')
  assert(
    !audit.issues.some((i) => i.message.includes('W umowie brakuje drugiej osoby')),
    'no legacy false missing-person message',
  )
})

run('10 — provider name remains unchanged (covered in 9)', () => {
  assert(true, 'see test 9')
})

run('11 — zwanymi dalej Klientami unchanged (covered in 9)', () => {
  assert(true, 'see test 9')
})

run('12 — source names replaced exactly once (covered in 9)', () => {
  assert(true, 'see test 9')
})

run('compose uses i separator from source composite', () => {
  assertEq(
    composeCoupleFullNamesValue({
      person1FullName: 'Iza Karczewska',
      person2FullName: 'Jan Kulewski',
      separator: ' i ',
    }),
    'Iza Karczewska i Jan Kulewski',
    'i sep',
  )
})

run('legacy error message must not blame the umowa for missing wedding people', () => {
  const src = readFileSync(
    'src/features/documents/template/postGenerationAudit.ts',
    'utf8',
  )
  assert(
    !src.includes('W umowie brakuje drugiej osoby z pary'),
    'old misleading copy removed',
  )
})

console.log('\nPackage contract composite client generation tests finished.')
