/**
 * Document correctness regression — party, placeholders, payment due,
 * dates, coverage/end-time, overtime family, post-gen audit, preview source.
 */

import {
  prepareSlotReplacementValue,
  applyBoundSlotsToParagraphs,
} from '@/features/documents/template/applyBoundSlots'
import {
  formatContractDateForSlot,
  ensureSpaceBeforeR,
  formatPolishShortDateWithR,
} from '@/features/documents/template/contractDateStyle'
import {
  isPlaceholderOnlyValue,
  isMaterialPackageRegistryKey,
} from '@/features/documents/template/placeholderValue'
import {
  inferPaymentDueRule,
  resolvePaymentDueIso,
} from '@/features/documents/template/paymentDueRule'
import {
  resolvePartyBlock,
  auditPartnersRepresented,
} from '@/features/documents/template/partyBlockResolver'
import {
  formatPolishHours,
  polishHourWord,
  stripClockTimeFromDuration,
  extractClockTimeOnly,
} from '@/lib/utils/polishDuration'
import { assertOvertimeValueSource } from '@/features/documents/template/numericSemanticFamily'
import {
  runPostGenerationAudit,
  collectSourceClientNamesFromSlots,
} from '@/features/documents/template/postGenerationAudit'
import { formatContractDateShort } from '@/lib/utils/contractCommercialVariables'
import type { TemplateSlot } from '@/features/documents/template/types'
import type { Wedding } from '@/types/wedding'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(a: unknown, b: unknown, message: string) {
  if (a !== b) throw new Error(`${message}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err)
    process.exitCode = 1
  }
}

function slot(partial: Partial<TemplateSlot> & { registryKey: string }): TemplateSlot {
  return {
    id: partial.id ?? `slot-${partial.registryKey}`,
    label: partial.label ?? partial.registryKey,
    enabled: true,
    physicallyBound: true,
    paragraphIndex: partial.paragraphIndex ?? 0,
    startOffset: partial.startOffset ?? 0,
    endOffset: partial.endOffset ?? (partial.originalText?.length ?? 1),
    originalText: partial.originalText ?? '',
    operation: 'replace',
    requirement: 'optional',
    ...partial,
  } as TemplateSlot
}

function weddingPair(): Wedding {
  return {
    id: 'w1',
    couple: {
      partner1: 'Iza Karczewska',
      partner2: 'Jan Kulewski',
      partner1Address: 'ul. Testowa 1, Warszawa',
      partner2Address: 'ul. Inna 2, Kraków',
      partner1Phone: '111',
      partner2Phone: '222',
    },
    date: '2026-07-29',
    price: 9500,
    depositAmount: 1000,
    currency: 'PLN',
    packageName: 'Video Mini',
    coverageHours: 12,
    coverageEndTime: '00:30',
    overtimeRate: 800,
  } as Wedding
}

run('shared party slot contains both partners', () => {
  const plan = resolvePartyBlock({
    slots: [slot({ registryKey: 'bride_full_name', originalText: 'Aleksandra B' })],
    wedding: weddingPair(),
  })
  assert(plan.strategy === 'shared_client_slot', 'shared strategy')
  assert(
    plan.overrides.bride_full_name.includes('Iza Karczewska') &&
      plan.overrides.bride_full_name.includes('Jan Kulewski'),
    'both names in shared slot',
  )
  assert(plan.bothPartnersRepresented, 'both represented')
})

run('second partner is never silently dropped', () => {
  const plan = resolvePartyBlock({
    slots: [slot({ registryKey: 'client_name', originalText: 'Iza' })],
    wedding: weddingPair(),
  })
  assert(plan.overrides.client_name.includes('Jan Kulewski'), 'partner2 present')
  const audit = auditPartnersRepresented({
    paragraphs: [{ text: 'Iza Karczewska, zwaną dalej Parą Młodą' }],
    partner1Name: 'Iza Karczewska',
    partner2Name: 'Jan Kulewski',
    templateHasClientParty: true,
  })
  assert(!audit.ok, 'detects missing partner2')
  assert(audit.missing.includes('Jan Kulewski'), 'lists partner2')
})

run('different partner addresses trigger contextual handling', () => {
  const plan = resolvePartyBlock({
    slots: [
      slot({ registryKey: 'bride_full_name', originalText: 'A' }),
      slot({ registryKey: 'bride_address', originalText: 'ul. X' }),
    ],
    wedding: weddingPair(),
  })
  assert(plan.addressAmbiguity != null, 'address ambiguity')
  assertEq(plan.addressAmbiguity!.slotKeys[0], 'bride_address', 'slot key')
})

run('placeholder underscores are not accepted as resolved package data', () => {
  assert(isPlaceholderOnlyValue('__________'), 'underscores')
  assert(isPlaceholderOnlyValue('.....'), 'dots')
  assert(isPlaceholderOnlyValue('do uzupełnienia'), 'words')
  assert(isPlaceholderOnlyValue('   '), 'whitespace')
  assert(!isPlaceholderOnlyValue('90 sekund'), 'concrete ok')
  assert(isMaterialPackageRegistryKey('film_duration'), 'film material')
  assert(isMaterialPackageRegistryKey('teaser_duration'), 'teaser material')
})

run('missing teaser duration creates editable-style empty prepare', () => {
  const prepared = prepareSlotReplacementValue({
    registryKey: 'film_duration',
    value: '__________',
    originalText: '__________',
    resolved: {},
  })
  assertEq(prepared, '', 'placeholder cleared')
})

run('concrete source teaser duration may be preserved via non-placeholder value', () => {
  const prepared = prepareSlotReplacementValue({
    registryKey: 'film_duration',
    value: '90 sekund',
    originalText: '90 sekund',
    resolved: {},
  })
  assertEq(prepared, '90 sekund', 'concrete preserved')
})

run('source due date equal to source wedding date infers wedding_date', () => {
  const rule = inferPaymentDueRule({
    slots: [
      slot({ registryKey: 'wedding_date', originalText: '29.07.2026' }),
      slot({ registryKey: 'final_payment_due_date', originalText: '29.07.2026' }),
    ],
  })
  assertEq(rule.type, 'wedding_date', 'rule type')
  const iso = resolvePaymentDueIso({
    rule,
    weddingDateIso: '2026-07-29',
  })
  assertEq(iso, '2026-07-29', 'resolved iso')
})

run('source due date offset infers days_before_wedding', () => {
  const rule = inferPaymentDueRule({
    slots: [
      slot({ registryKey: 'wedding_date', originalText: '29.07.2026' }),
      slot({ registryKey: 'final_payment_due_date', originalText: '15.07.2026' }),
    ],
  })
  assertEq(rule.type, 'days_before_wedding', 'before')
  if (rule.type === 'days_before_wedding') {
    assertEq(rule.days, 14, '14 days')
  }
})

run('ambiguous due date asks during generation', () => {
  const rule = inferPaymentDueRule({
    slots: [
      slot({ registryKey: 'final_payment_due_date', originalText: '01.03.2025' }),
    ],
  })
  assertEq(rule.type, 'manual_at_generation', 'manual')
})

run('ISO input date renders in source Polish date style', () => {
  const out = formatContractDateForSlot({
    isoOrValue: '2026-07-29',
    sourceText: '15.07.2026 r.',
  })
  assertEq(out, '29.07.2026 r.', 'polish dotted with r.')
  assert(!out.includes('2026-07-29'), 'no ISO')
})

run('correct spacing before r.', () => {
  assertEq(ensureSpaceBeforeR('29.07.2026r.'), '29.07.2026 r.', 'fix tight')
  assertEq(formatPolishShortDateWithR('2026-07-29'), '29.07.2026 r.', 'with r')
})

run('duration and end time do not share one replacement', () => {
  const hours = prepareSlotReplacementValue({
    registryKey: 'coverage_hours',
    value: '12 godziny 00:30',
    originalText: '12',
    resolved: { coverage_end_time: '00:30' },
  })
  assert(!/\d{1,2}[.:]\d{2}/.test(hours), 'no clock in duration')
  const end = prepareSlotReplacementValue({
    registryKey: 'coverage_end_time',
    value: '12 godziny 00:30',
    originalText: '00.30',
    resolved: {},
  })
  assert(extractClockTimeOnly(end) != null, 'clock only')
  assert(!/godzin/i.test(end), 'no hour word in end time')
})

run('Polish hour inflection', () => {
  assertEq(polishHourWord(1), 'godzina', '1')
  assertEq(polishHourWord(2), 'godziny', '2')
  assertEq(polishHourWord(5), 'godzin', '5')
  assertEq(polishHourWord(12), 'godzin', '12')
  assertEq(formatPolishHours(12), '12 godzin', 'phrase')
})

run('overtime numeric-family isolation', () => {
  const bad = assertOvertimeValueSource({
    registryKey: 'overtime_rate',
    resolvedValue: '9500',
    weddingOvertimeRate: 800,
    templateOriginal: '800',
  })
  assert(!bad.ok, '9500 not proven as overtime')
  const good = assertOvertimeValueSource({
    registryKey: 'overtime_rate',
    resolvedValue: '800',
    weddingOvertimeRate: 800,
  })
  assert(good.ok && good.source === 'wedding', 'wedding overtime')
})

run('post-generation audit finds stale source client data', () => {
  const slots = [
    slot({ registryKey: 'bride_full_name', originalText: 'Aleksandra Kowalska' }),
  ]
  const names = collectSourceClientNamesFromSlots(slots)
  assert(names.includes('Aleksandra Kowalska'), 'collect source name')
  const audit = runPostGenerationAudit({
    paragraphs: [
      {
        text: 'Aleksandra Kowalska, zam. …, zwaną dalej „Parą Młodą”',
      },
    ],
    slots,
    wedding: weddingPair(),
    resolved: {},
    applied: [],
    sourceClientNames: names,
  })
  assert(
    audit.issues.some((i) => i.code === 'stale_source_client_name'),
    'stale client',
  )
})

run('post-generation audit finds a missing second partner', () => {
  const audit = runPostGenerationAudit({
    paragraphs: [
      {
        text: 'Iza Karczewska, zam. …, zwaną dalej „Parą Młodą”',
      },
    ],
    slots: [slot({ registryKey: 'bride_full_name', originalText: 'X' })],
    wedding: weddingPair(),
    resolved: {},
    applied: [],
  })
  assert(
    audit.issues.some((i) => i.code === 'missing_second_partner'),
    'missing partner',
  )
})

run('post-generation audit finds placeholder-only material fields', () => {
  const audit = runPostGenerationAudit({
    paragraphs: [
      { text: 'teledysku ślubnego o długości ok. __________;' },
    ],
    slots: [slot({ registryKey: 'film_duration', originalText: '__________' })],
    wedding: weddingPair(),
    resolved: {},
    applied: [
      {
        registryKey: 'film_duration',
        resolvedValue: '__________',
        omitted: false,
      },
    ],
  })
  assert(
    audit.issues.some((i) => i.code === 'placeholder_only_material'),
    'placeholder',
  )
})

run('wedding_date is never emitted as ISO (formatter + source)', () => {
  const short = formatContractDateShort('2026-07-29')
  assertEq(short, '29.07.2026', 'dotted short')
  const resolveSrc = readFileSync(
    resolve('src/features/documents/template/resolveContractVariables.ts'),
    'utf8',
  )
  assert(resolveSrc.includes('formatContractDateShort'), 'uses short formatter')
  assert(
    resolveSrc.includes("emitWedding(out, 'wedding_date', weddingDateShort"),
    'emits short date',
  )
})

run('duration strip helper', () => {
  assertEq(
    stripClockTimeFromDuration('12 godziny 00:30'),
    '12 godziny',
    'strip',
  )
})

run('applyBoundSlots separates coverage hours from end time on same paragraph', () => {
  const text =
    'reportaż ślubny obejmuje czas maksymalnie do godziny 00.30. Czas pracy kamerzysty wynosi maksymalnie 12 godzin.'
  const slots: TemplateSlot[] = [
    slot({
      registryKey: 'coverage_end_time',
      originalText: '00.30',
      paragraphIndex: 0,
      startOffset: text.indexOf('00.30'),
      endOffset: text.indexOf('00.30') + 5,
    }),
    slot({
      registryKey: 'coverage_hours',
      originalText: '12',
      paragraphIndex: 0,
      startOffset: text.lastIndexOf('12'),
      endOffset: text.lastIndexOf('12') + 2,
    }),
  ]
  const result = applyBoundSlotsToParagraphs({
    original: [{ index: 0, text }],
    slots,
    resolved: {
      coverage_hours: '12',
      coverage_end_time: '00:30',
    },
  })
  assert(result.failures.length === 0, 'no failures')
  const out = result.paragraphs[0]!.text
  assert(!/12\s+godzin[ay]?\s+00/i.test(out), 'no collision phrase')
  assert(/maksymalnie 12 godzin/i.test(out), 'hours intact')
  assert(/do godziny 00:30/i.test(out) || /do godziny 00.30/i.test(out), 'end time')
})

run('preview consumes generated artifact (source scan)', () => {
  const page = readFileSync(
    resolve('src/pages/WeddingContractGenerationPage.tsx'),
    'utf8',
  )
  assert(page.includes('buildDocxPreviewModel'), 'builds docx preview model')
  assert(page.includes('previewModel'), 'passes previewModel')
  const preview = readFileSync(
    resolve('src/features/weddings/actions/ContractDocumentPreview.tsx'),
    'utf8',
  )
  assert(preview.includes('Umowa została przygotowana'), 'status copy')
  assert(!preview.includes('Uzupełnione dane'), 'no technical filled count')
  assert(!preview.includes('Sprawdź zmienne'), 'no Sprawdź zmienne')
  assert(preview.includes('generated_docx') || preview.includes('previewModel'), 'docx source')
})

run('OOXML formatting preserve helpers exist', () => {
  const editor = readFileSync(
    resolve('src/features/documents/template/docxParagraphEditor.ts'),
    'utf8',
  )
  assert(editor.includes('replaceCanonicalSpanInParagraphXml'), 'span replace')
  assert(editor.includes('applyDocxParagraphEdits'), 'apply edits')
  const apply = readFileSync(
    resolve('src/features/documents/template/applyBoundSlots.ts'),
    'utf8',
  )
  assert(apply.includes('prepareSlotReplacementValue'), 'prepare values')
  assert(apply.includes('claimedSpans'), 'span ownership')
})

console.log('\nDocument correctness regression done.')
