/**
 * Dynamic Brief V1 — questionnaire detail sections from instance snapshot.
 * Preserves section/question order and labels. Does not use live templates.
 */

import { formatAnswerValueForDisplay } from '@/features/prewedding/answerSummary'
import { answerToGeoPlace } from '@/features/prewedding/preweddingLocation'
import {
  isAdminOnlyRule,
  resolveBriefFieldRule,
} from '@/features/wedding-brief/briefFieldRegistry'
import {
  isPresentationNoValue,
  normalizeBriefTimeInText,
  normalizeBriefWhitespace,
  textsSemanticallyEqual,
} from '@/features/wedding-brief/briefNormalize'
import type {
  BriefNote,
  BriefQuestionnaireItem,
  BriefQuestionnaireSection,
} from '@/features/wedding-brief/types'
import type {
  PreWeddingFieldType,
  PreWeddingQuestion,
  PreWeddingTemplateSchema,
} from '@/types/preweddingQuestionnaire'

/** Stable overview destinations — omit from dynamic detail when mapping resolves here. */
const CONSUMED_BY_STABLE_DESTINATIONS = new Set([
  'assignment',
  'contacts',
  'timeline',
  'locations',
  'vendors',
])

export function isBriefAnswerPresent(
  q: PreWeddingQuestion,
  value: unknown,
): boolean {
  if (q.type === 'information' || q.type === 'acknowledgement') return false
  if (q.hidden) return false
  if (value == null) return false
  if (typeof value === 'string') return normalizeBriefWhitespace(value).length > 0
  // yes_no false ("Nie") is a real answered value for Dynamic Brief.
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    const geo = answerToGeoPlace(value as never)
    if (geo) {
      return Boolean(
        geo.formattedAddress?.trim() || geo.label?.trim() || geo.placeId,
      )
    }
    const o = value as Record<string, unknown>
    return Boolean(
      (typeof o.formattedAddress === 'string' && o.formattedAddress.trim()) ||
        (typeof o.label === 'string' && o.label.trim()) ||
        (typeof o.address === 'string' && o.address.trim()),
    )
  }
  return false
}

function formatQuestionnaireDisplay(
  q: PreWeddingQuestion,
  raw: unknown,
): string {
  let display = normalizeBriefWhitespace(formatAnswerValueForDisplay(q, raw))
  if (q.type !== 'address') {
    display = normalizeBriefTimeInText(display)
  }
  return display
}

function isConsumedByStableOverview(q: PreWeddingQuestion): boolean {
  const rule = resolveBriefFieldRule({
    questionId: q.id,
    mapping: q.weddingDayMapping,
    questionType: q.type,
  })
  if (isAdminOnlyRule(rule)) return false
  return CONSUMED_BY_STABLE_DESTINATIONS.has(rule.destination)
}

function isSensitiveMapping(q: PreWeddingQuestion): boolean {
  return q.weddingDayMapping === 'sensitiveFamilyNotes'
}

/**
 * Build Layer B — dynamic questionnaire sections in snapshot array order.
 */
export function buildQuestionnaireBriefSections(input: {
  schema: PreWeddingTemplateSchema
  answers: Record<string, unknown>
  criticalNotes?: BriefNote[]
}): {
  sections: BriefQuestionnaireSection[]
  includedQuestionIds: string[]
  orphanAnswers: Array<{ questionId: string; displayValue: string }>
} {
  const criticalNotes = input.criticalNotes ?? []
  const sections: BriefQuestionnaireSection[] = []
  const includedQuestionIds: string[] = []
  const seenIds = new Set<string>()

  for (const section of input.schema.sections ?? []) {
    const items: BriefQuestionnaireItem[] = []
    for (const q of section.questions ?? []) {
      seenIds.add(q.id)
      if (!isBriefAnswerPresent(q, input.answers[q.id])) continue

      const raw = input.answers[q.id]
      const displayValue = formatQuestionnaireDisplay(q, raw)
      if (!displayValue && q.type !== 'yes_no') continue

      const rule = resolveBriefFieldRule({
        questionId: q.id,
        mapping: q.weddingDayMapping,
        questionType: q.type,
      })
      if (isAdminOnlyRule(rule)) continue
      if (
        isPresentationNoValue({
          displayValue,
          questionType: q.type,
          mapping: q.weddingDayMapping,
          questionId: q.id,
        })
      ) {
        continue
      }

      const inCritical = criticalNotes.some((n) =>
        textsSemanticallyEqual(n.content, displayValue),
      )

      // Sensitive: elevate to Nie przegap only — least duplication.
      if (isSensitiveMapping(q) && inCritical) continue

      const consumedByOperationalBlock = isConsumedByStableOverview(q)
      if (consumedByOperationalBlock) continue

      const critical =
        inCritical ||
        rule.destination === 'nie_przegap' ||
        Boolean(rule.criticalEligible && inCritical)

      items.push({
        questionId: q.id,
        label: normalizeBriefWhitespace(q.label) || rule.briefLabel,
        type: q.type as PreWeddingFieldType,
        displayValue:
          displayValue ||
          (typeof raw === 'boolean' ? (raw ? 'Tak' : 'Nie') : ''),
        semanticMapping: q.weddingDayMapping,
        critical: critical || undefined,
        consumedByOperationalBlock: false,
      })
      includedQuestionIds.push(q.id)
    }
    if (items.length === 0) continue
    sections.push({
      id: section.id,
      title: section.title?.trim() || '',
      items,
    })
  }

  const orphanAnswers: Array<{ questionId: string; displayValue: string }> = []
  for (const [questionId, raw] of Object.entries(input.answers)) {
    if (seenIds.has(questionId)) continue
    if (raw == null) continue
    if (typeof raw === 'string' && !raw.trim()) continue
    if (Array.isArray(raw) && raw.length === 0) continue
    const stub: PreWeddingQuestion = {
      id: questionId,
      label: questionId,
      type: 'short_text',
      required: false,
    }
    if (!isBriefAnswerPresent(stub, raw)) continue
    const displayValue = formatQuestionnaireDisplay(stub, raw)
    if (!displayValue) continue
    if (
      isPresentationNoValue({
        displayValue,
        questionType: 'short_text',
        questionId,
      })
    ) {
      continue
    }
    orphanAnswers.push({ questionId, displayValue })
  }

  return { sections, includedQuestionIds, orphanAnswers }
}
