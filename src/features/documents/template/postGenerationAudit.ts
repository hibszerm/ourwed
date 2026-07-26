/**
 * Deterministic post-generation sanity audit for wedding-variable regions.
 * Does not rewrite legal prose — only validates known replacement outputs.
 */

import { parseFlexibleDate } from '@/features/ai-contract-lab/semanticValueEquality'
import type { Wedding } from '@/types/wedding'
import {
  auditPartnersRepresented,
  templateHasClientPartyData,
} from './partyBlockResolver'
import { isPlaceholderOnlyValue } from './placeholderValue'
import type { PaymentDueRule } from './paymentDueRule'
import type { TemplateSlot } from './types'
import { isSlotPhysicallyBound } from './types'

export type PostGenerationAuditCode =
  | 'missing_second_partner'
  | 'iso_date_in_polish_prose'
  | 'missing_space_before_r'
  | 'placeholder_only_material'
  | 'impossible_temporal'
  | 'payment_before_execution'
  | 'payment_before_wedding_for_wedding_rule'
  | 'duration_end_time_collision'
  | 'suspicious_numeric_cross_role'
  | 'stale_source_client_name'
  | 'stale_source_wedding_date'
  | 'stale_source_client_contact'

export interface PostGenerationAuditIssue {
  code: PostGenerationAuditCode
  severity: 'critical' | 'actionable' | 'info'
  /** Photographer-facing message (no technical jargon). */
  message: string
  /** Optional registry key for editable return-to-review. */
  registryKey?: string
  /** Advanced diagnostics only. */
  diagnostic?: string
}

export interface PostGenerationAuditResult {
  ok: boolean
  issues: PostGenerationAuditIssue[]
  /** Issues that should return the photographer to the review step. */
  actionableIssues: PostGenerationAuditIssue[]
}

function partyParagraphs(
  paragraphs: Array<{ text: string }>,
): Array<{ text: string }> {
  return paragraphs.filter((p) =>
    /Parą Młodą|Parą Mlodą|zwan[aąyi]\s+dalej|Panna\s+Młoda|Pan\s+Młody|Zamawiając/i.test(
      p.text,
    ),
  )
}

export function runPostGenerationAudit(input: {
  paragraphs: Array<{ text: string }>
  slots: TemplateSlot[]
  wedding: Pick<Wedding, 'couple' | 'date'>
  resolved: Record<string, string>
  applied: Array<{
    registryKey: string
    resolvedValue: string
    omitted: boolean
    paragraphIndex?: number
  }>
  paymentDueRule?: PaymentDueRule | null
  /** Source-template client names that must not remain in wedding-variable slots. */
  sourceClientNames?: string[]
  sourceWeddingDateText?: string | null
  overtimeSourceOk?: boolean
}): PostGenerationAuditResult {
  const issues: PostGenerationAuditIssue[] = []
  const hay = input.paragraphs.map((p) => p.text).join('\n')
  const party = partyParagraphs(input.paragraphs)
  const partyHay = party.length > 0 ? party.map((p) => p.text).join('\n') : hay

  const p1 = input.wedding.couple.partner1.trim()
  const p2 = input.wedding.couple.partner2.trim()
  const hasClientParty = templateHasClientPartyData(input.slots)

  if (hasClientParty && p1 && p2) {
    const partners = auditPartnersRepresented({
      paragraphs: party.length > 0 ? party : input.paragraphs,
      partner1Name: p1,
      partner2Name: p2,
      templateHasClientParty: true,
    })
    if (!partners.ok) {
      issues.push({
        code: 'missing_second_partner',
        severity: 'critical',
        message: `W umowie brakuje drugiej osoby z pary (${partners.missing.join(', ')}).`,
        registryKey: 'couple_full_names',
        diagnostic: `missing=${partners.missing.join('|')}`,
      })
    }
  }

  // ISO dates in Polish prose (replacement regions)
  for (const a of input.applied) {
    if (a.omitted || !a.resolvedValue) continue
    if (
      /^\d{4}-\d{2}-\d{2}/.test(a.resolvedValue.trim()) &&
      /date|deadline|due/i.test(a.registryKey)
    ) {
      issues.push({
        code: 'iso_date_in_polish_prose',
        severity: 'actionable',
        message: 'Data w umowie ma nieprawidłowy format.',
        registryKey: a.registryKey,
        diagnostic: a.resolvedValue,
      })
    }
    if (/\d{4}r\./i.test(a.resolvedValue) || /\d{2}\.\d{2}\.\d{4}r\./i.test(a.resolvedValue)) {
      issues.push({
        code: 'missing_space_before_r',
        severity: 'actionable',
        message: 'Data wymaga spacji przed „r.”.',
        registryKey: a.registryKey,
        diagnostic: a.resolvedValue,
      })
    }
  }
  if (/\d{4}-\d{2}-\d{2}\s*r\./.test(hay) || /\d{4}-\d{2}-\d{2}r\./.test(hay)) {
    if (!issues.some((i) => i.code === 'iso_date_in_polish_prose')) {
      issues.push({
        code: 'iso_date_in_polish_prose',
        severity: 'actionable',
        message: 'Data w umowie ma nieprawidłowy format (ISO).',
        diagnostic: 'ISO date embedded in generated prose',
      })
    }
  }
  if (/\d{2}\.\d{2}\.\d{4}r\./.test(hay) || /\d{4}r\./.test(hay)) {
    if (!issues.some((i) => i.code === 'missing_space_before_r')) {
      issues.push({
        code: 'missing_space_before_r',
        severity: 'actionable',
        message: 'Data wymaga spacji przed „r.”.',
      })
    }
  }

  // Placeholder-only material values left in output
  for (const a of input.applied) {
    if (a.omitted) continue
    if (
      isPlaceholderOnlyValue(a.resolvedValue) ||
      (/_{3,}|\.{3,}/.test(a.resolvedValue) &&
        /duration|teaser|film|count|hours|package/i.test(a.registryKey))
    ) {
      issues.push({
        code: 'placeholder_only_material',
        severity: 'critical',
        message: 'W umowie pozostała nieuzupełniona wartość pakietu.',
        registryKey: a.registryKey,
        diagnostic: a.resolvedValue,
      })
    }
  }
  if (/teledysk[^\n.]{0,40}_{3,}/i.test(hay) || /długości\s+ok\.\s*_{3,}/i.test(hay)) {
    issues.push({
      code: 'placeholder_only_material',
      severity: 'critical',
      message: 'Uzupełnij długość teledysku przed generowaniem.',
      registryKey: 'teaser_duration',
    })
  }

  // Duration + end-time collision
  if (
    /\d+\s+godzin[ay]?\s+\d{1,2}[.:]\d{2}/i.test(hay) ||
    /\d+\s+godziny\s+\d{1,2}[.:]\d{2}/i.test(hay)
  ) {
    issues.push({
      code: 'duration_end_time_collision',
      severity: 'critical',
      message:
        'Czas trwania reportażu i godzina zakończenia zostały błędnie połączone.',
      registryKey: 'coverage_hours',
    })
  }

  // Temporal relationships
  const weddingIso = input.wedding.date?.slice(0, 10) || null
  const dueRaw =
    input.resolved.final_payment_due_date ||
    input.resolved.payment_due_date ||
    ''
  const dueIso = parseFlexibleDate(dueRaw) || parseFlexibleDate(
    input.resolved.final_payment_due_date_long || '',
  )
  const execIso = parseFlexibleDate(
    input.resolved.contract_execution_date || '',
  )

  if (
    dueIso &&
    execIso &&
    dueIso < execIso &&
    input.paymentDueRule?.type !== 'fixed_template_value'
  ) {
    issues.push({
      code: 'payment_before_execution',
      severity: 'actionable',
      message:
        'Termin płatności końcowej wypada przed datą zawarcia umowy.',
      registryKey: 'final_payment_due_date',
    })
  }

  if (
    input.paymentDueRule?.type === 'wedding_date' &&
    dueIso &&
    weddingIso &&
    dueIso < weddingIso
  ) {
    issues.push({
      code: 'payment_before_wedding_for_wedding_rule',
      severity: 'critical',
      message:
        'Termin płatności powinien być datą ślubu — sprawdź datę w umowie.',
      registryKey: 'final_payment_due_date',
    })
  }

  if (input.overtimeSourceOk === false) {
    issues.push({
      code: 'suspicious_numeric_cross_role',
      severity: 'actionable',
      message: 'Stawka nadgodzin wymaga potwierdzenia.',
      registryKey: 'overtime_rate',
      diagnostic: 'unproven overtime source',
    })
  }

  // Stale source client names in party / wedding-variable output
  for (const name of input.sourceClientNames ?? []) {
    const n = name.trim()
    if (!n || n.length < 3) continue
    if (n === p1 || n === p2) continue
    if (partyHay.includes(n)) {
      issues.push({
        code: 'stale_source_client_name',
        severity: 'critical',
        message: 'W umowie pozostało imię klienta ze wzoru szablonu.',
        diagnostic: n,
      })
    }
  }

  if (input.sourceWeddingDateText?.trim()) {
    const src = input.sourceWeddingDateText.trim()
    const srcIso = parseFlexibleDate(src)
    if (
      srcIso &&
      weddingIso &&
      srcIso !== weddingIso &&
      hay.includes(src) &&
      !hay.includes(weddingIso.split('-').reverse().join('.'))
    ) {
      // Source date still present while wedding date missing in dotted form
      const dotted = weddingIso.split('-').reverse().join('.')
      if (!hay.includes(dotted)) {
        issues.push({
          code: 'stale_source_wedding_date',
          severity: 'critical',
          message: 'W umowie pozostała data ślubu ze wzoru szablonu.',
          registryKey: 'wedding_date',
          diagnostic: src,
        })
      }
    }
  }

  const actionableIssues = issues.filter(
    (i) => i.severity === 'critical' || i.severity === 'actionable',
  )

  return {
    ok: actionableIssues.length === 0,
    issues,
    actionableIssues,
  }
}

/** Collect likely source-template client names from slot originalText. */
export function collectSourceClientNamesFromSlots(
  slots: TemplateSlot[],
): string[] {
  const names: string[] = []
  const nameKeys = new Set([
    'bride_full_name',
    'groom_full_name',
    'partner1_full_name',
    'partner2_full_name',
    'couple_full_names',
    'client_name',
  ])
  for (const slot of slots) {
    if (!isSlotPhysicallyBound(slot) || !slot.registryKey) continue
    if (!nameKeys.has(slot.registryKey)) continue
    const t = slot.originalText?.trim()
    if (!t || isPlaceholderOnlyValue(t)) continue
    // Single person-ish token sequence
    if (/^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+){1,3}$/u.test(t)) {
      names.push(t)
    }
  }
  return [...new Set(names)]
}
