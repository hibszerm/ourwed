/**
 * Pre-generation actionable review issues — must surface in GenerationReviewState
 * before ContractTransformationService runs.
 */

import { formatPolishHours } from '@/lib/utils/polishDuration'
import {
  extractClockTimeOnly,
  looksLikeClockTime,
} from '@/lib/utils/polishDuration'
import { isPlaceholderOnlyValue } from './placeholderValue'
import type { TemplateSlot } from './types'
import { isSlotPhysicallyBound } from './types'

export type PreGenerationEditableField = {
  id: string
  registryKey: string
  label: string
  placeholder?: string
  group: 'package' | 'wedding' | 'other'
  sourceLabel: string
  /** Why this field is required. */
  reason: string
}

export type PreGenerationContextualIssue = {
  id: string
  label: string
  message: string
  relatedKeys: string[]
}

export type PreGenerationReviewIssues = {
  editableFields: PreGenerationEditableField[]
  contextualIssues: PreGenerationContextualIssue[]
}

const TEASER_CONTEXT =
  /teledysk|teaser|zapowied|highlight|zwiastun|trailer|rolk/i

const COLLISION_RE = /\d+\s+godzin(?:a|y)?\s+\d{1,2}[.:]\d{2}/i

/** Underscores including fullwidth / spaced blanks. */
const UNDERSCORE_RUN = /(?:_{2,}|＿{2,}|(?:_\s*){3,})/

function paragraphHasTeaserPlaceholder(text: string): boolean {
  if (!TEASER_CONTEXT.test(text) && !/długości\s+ok\.?/i.test(text)) {
    return false
  }
  if (UNDERSCORE_RUN.test(text)) return true
  if (/długości\s+ok\.?\s*$/i.test(text.trim())) return true
  if (/długości\s+ok\.?\s*[;.,]/i.test(text) && !/\d/.test(text)) return true
  // “długości ok.” with only punctuation / blanks after
  if (/długości\s+ok\.?\s*[_＿.\s;,-]*$/i.test(text.trim())) return true
  return false
}

function paragraphHasTeaserClause(text: string): boolean {
  return (
    TEASER_CONTEXT.test(text) &&
    (/długości\s+ok\.?/i.test(text) || UNDERSCORE_RUN.test(text))
  )
}

function paragraphHasCoverageDurationAndClock(text: string): boolean {
  const hasDuration = /\d+\s*godzin(?:a|y)?/i.test(text)
  const hasClock = /\d{1,2}[.:]\d{2}/.test(text)
  return hasDuration && hasClock
}

function hasOverride(
  overrides: Record<string, string>,
  ...keys: string[]
): boolean {
  return keys.some((k) => Boolean(overrides[k]?.trim()))
}

function resolvedLookup(
  resolved: Record<string, string>,
  overrides: Record<string, string>,
  keys: string[],
): string {
  for (const key of keys) {
    const v = overrides[key]?.trim() || resolved[key]?.trim()
    if (v && !isPlaceholderOnlyValue(v)) return v
  }
  return ''
}

/** True when teaser duration is complete enough to generate (not mid-typing). */
export function isValidTeaserDuration(value: string): boolean {
  const t = value.trim()
  if (!t || isPlaceholderOnlyValue(t)) return false
  if (!/\d/.test(t)) return false
  // Require a letter so "3", "3-", "3-5" stay mounted while typing the unit.
  if (!/[A-Za-zÀ-žĄąĆćĘęŁłŃńÓóŚśŹźŻż]/.test(t)) return false
  return true
}

/** True when text is a usable duration (not a clock time). */
export function isValidCoverageDuration(value: string): boolean {
  const t = value.trim()
  if (!t || isPlaceholderOnlyValue(t)) return false
  if (looksLikeClockTime(t)) return false
  if (COLLISION_RE.test(t)) return false
  return /\d+/.test(t)
}

/** True when text is a usable clock time (not a duration phrase). */
export function isValidCoverageEndTime(value: string): boolean {
  const t = value.trim()
  if (!t || isPlaceholderOnlyValue(t)) return false
  if (/godzin/i.test(t) && !looksLikeClockTime(extractClockTimeOnly(t) ?? '')) {
    // "12 godzin" is not an end time
    if (!/\d{1,2}[.:]\d{2}/.test(t)) return false
  }
  return extractClockTimeOnly(t) != null || looksLikeClockTime(t)
}

/**
 * Detect teaser / coverage issues that must block generation with editable UI.
 */
export function detectPreGenerationReviewIssues(input: {
  slots: TemplateSlot[]
  resolved: Record<string, string>
  overrides: Record<string, string>
  /** Canonical paragraph texts from the current template version. */
  paragraphs?: Array<{ index: number; text: string }>
  coverageHours?: number | null
  coverageEndTime?: string | null
}): PreGenerationReviewIssues {
  const editableFields: PreGenerationEditableField[] = []
  const contextualIssues: PreGenerationContextualIssue[] = []
  const paragraphs = input.paragraphs ?? []
  const hay = paragraphs.map((p) => p.text).join('\n')

  // --- Teaser duration ---------------------------------------------------
  const teaserKeys = ['teaser_duration', 'film_duration', 'teaser']
  const teaserCandidate = resolvedLookup(
    input.resolved,
    input.overrides,
    teaserKeys,
  )
  const hasValidTeaser = isValidTeaserDuration(teaserCandidate)

  const teaserSlots = input.slots.filter(
    (s) =>
      isSlotPhysicallyBound(s) &&
      s.registryKey &&
      (teaserKeys.includes(s.registryKey) ||
        TEASER_CONTEXT.test(
          `${s.label} ${s.originalText ?? ''} ${s.sampleContext ?? ''}`,
        )),
  )

  const teaserPlaceholderInSlots = teaserSlots.some((s) =>
    isPlaceholderOnlyValue(s.originalText),
  )
  const teaserPlaceholderInProse = paragraphs.some((p) =>
    paragraphHasTeaserPlaceholder(p.text),
  )
  const teaserClauseWithoutPackageValue = paragraphs.some((p) =>
    paragraphHasTeaserClause(p.text),
  )

  // Keep the field required until a *valid* value exists — partial typing
  // ("3") must not unmount the input.
  const needsTeaser =
    !hasValidTeaser &&
    (teaserPlaceholderInSlots ||
      teaserPlaceholderInProse ||
      teaserClauseWithoutPackageValue)

  if (needsTeaser) {
    editableFields.push({
      id: 'teaser_duration',
      registryKey: 'teaser_duration',
      label: 'Długość teledysku',
      placeholder: 'np. 3–5 minut',
      group: 'package',
      sourceLabel: 'Tylko w tej umowie',
      reason: 'Szablon wymaga długości teledysku, a pakiet nie ma gotowej wartości.',
    })
  }

  // Also: bound material duration slots that are placeholder-only
  for (const slot of input.slots) {
    if (!isSlotPhysicallyBound(slot) || !slot.registryKey) continue
    if (!isPlaceholderOnlyValue(slot.originalText)) continue
    if (
      !/film_duration|teaser|package_duration|photo_count|album|operator|videographer/i.test(
        slot.registryKey,
      )
    ) {
      continue
    }
    if (hasOverride(input.overrides, slot.registryKey)) continue
    const resolved = resolvedLookup(input.resolved, input.overrides, [
      slot.registryKey,
    ])
    if (resolved) continue
    if (editableFields.some((f) => f.registryKey === slot.registryKey)) continue
    if (
      slot.registryKey === 'teaser_duration' ||
      (TEASER_CONTEXT.test(`${slot.label} ${slot.sampleContext ?? ''}`) &&
        editableFields.some((f) => f.registryKey === 'teaser_duration'))
    ) {
      continue
    }
    const isTeaser = TEASER_CONTEXT.test(
      `${slot.label} ${slot.originalText ?? ''} ${slot.sampleContext ?? ''}`,
    )
    editableFields.push({
      id: isTeaser ? 'teaser_duration' : slot.registryKey,
      registryKey: isTeaser ? 'teaser_duration' : slot.registryKey,
      label: isTeaser ? 'Długość teledysku' : slot.label.trim() || slot.registryKey,
      placeholder: isTeaser ? 'np. 3–5 minut' : undefined,
      group: 'package',
      sourceLabel: 'Tylko w tej umowie',
      reason: 'W szablonie jest puste miejsce wymagające wartości pakietu.',
    })
  }

  // --- Coverage duration / end time --------------------------------------
  const durationKeys = ['coverage_hours', 'working_hours', 'package_duration', 'coverage_duration']
  const endKeys = ['coverage_end_time']

  const durationSlots = input.slots.filter(
    (s) =>
      isSlotPhysicallyBound(s) &&
      s.registryKey &&
      durationKeys.includes(s.registryKey),
  )
  const endSlots = input.slots.filter(
    (s) =>
      isSlotPhysicallyBound(s) &&
      s.registryKey &&
      endKeys.includes(s.registryKey),
  )

  const durationFromWedding =
    input.coverageHours != null && Number.isFinite(input.coverageHours)
      ? formatPolishHours(input.coverageHours)
      : ''
  const endFromWedding = input.coverageEndTime?.trim() || ''

  let durationValue = resolvedLookup(
    input.resolved,
    input.overrides,
    durationKeys,
  )
  if (!durationValue && durationFromWedding) durationValue = durationFromWedding

  let endValue = resolvedLookup(input.resolved, input.overrides, endKeys)
  if (!endValue && endFromWedding) endValue = endFromWedding

  const durationOk = isValidCoverageDuration(durationValue)
  const endOk = isValidCoverageEndTime(endValue)

  // Physical span overlap between duration and end-time slots
  let overlapping = false
  for (const d of durationSlots) {
    for (const e of endSlots) {
      if (d.paragraphIndex !== e.paragraphIndex) continue
      const ds = d.startOffset ?? d.allowedRange?.start
      const de = d.endOffset ?? d.allowedRange?.end
      const es = e.startOffset ?? e.allowedRange?.start
      const ee = e.endOffset ?? e.allowedRange?.end
      if (ds == null || de == null || es == null || ee == null) continue
      if (ds < ee && es < de) {
        overlapping = true
      }
    }
  }

  const collisionInSource = COLLISION_RE.test(hay)
  const collisionInResolved =
    COLLISION_RE.test(durationValue) || COLLISION_RE.test(endValue)
  const coLocatedDurationAndClock = paragraphs.some((p) =>
    paragraphHasCoverageDurationAndClock(p.text),
  )

  const templateNeedsDuration =
    durationSlots.length > 0 || coLocatedDurationAndClock || collisionInSource
  const templateNeedsEnd =
    endSlots.length > 0 || coLocatedDurationAndClock || collisionInSource

  if (overlapping || collisionInSource || collisionInResolved || coLocatedDurationAndClock) {
    // Both values safely known → do not block; transform repairs owned spans.
    if (durationOk && endOk && !overlapping) {
      // continue without coverage fields
    } else {
      if (overlapping) {
        contextualIssues.push({
          id: 'coverage_slot_overlap',
          label: 'Czas reportażu i godzina zakończenia',
          message:
            'Czas trwania i godzina zakończenia nachodzą na ten sam fragment szablonu. Uzupełnij obie wartości osobno — generowanie nie może ich połączyć.',
          relatedKeys: ['coverage_duration', 'coverage_end_time'],
        })
      }
      if (
        (collisionInSource || collisionInResolved || coLocatedDurationAndClock) &&
        (!durationOk || !endOk)
      ) {
        contextualIssues.push({
          id: 'coverage_duration_end_time_collision',
          label: 'Czas reportażu i godzina zakończenia',
          message:
            'Czas trwania reportażu i godzina zakończenia muszą być podane osobno.',
          relatedKeys: ['coverage_duration', 'coverage_end_time'],
        })
      }
      if (!durationOk && templateNeedsDuration) {
        if (!editableFields.some((f) => f.registryKey === 'coverage_duration')) {
          editableFields.push({
            id: 'coverage_duration',
            registryKey: 'coverage_duration',
            label: 'Czas pracy podczas reportażu',
            placeholder: 'np. 12 godzin',
            group: 'package',
            sourceLabel: 'Tylko w tej umowie',
            reason:
              'Czas trwania reportażu musi być podany osobno (np. 12 godzin).',
          })
        }
      }
      if (!endOk && templateNeedsEnd) {
        if (!editableFields.some((f) => f.registryKey === 'coverage_end_time')) {
          editableFields.push({
            id: 'coverage_end_time',
            registryKey: 'coverage_end_time',
            label: 'Godzina zakończenia',
            placeholder: 'np. 00:30',
            group: 'package',
            sourceLabel: 'Tylko w tej umowie',
            reason: 'Godzina zakończenia musi być podana osobno (np. 00:30).',
          })
        }
      }
    }
  } else {
    // No collision — still require values when slots exist and values missing
    if (durationSlots.length > 0 && !durationOk) {
      editableFields.push({
        id: 'coverage_duration',
        registryKey: 'coverage_duration',
        label: 'Czas pracy podczas reportażu',
        placeholder: 'np. 12 godzin',
        group: 'package',
        sourceLabel: 'Tylko w tej umowie',
        reason: 'Szablon wymaga czasu pracy podczas reportażu.',
      })
    }
    if (endSlots.length > 0 && !endOk) {
      editableFields.push({
        id: 'coverage_end_time',
        registryKey: 'coverage_end_time',
        label: 'Godzina zakończenia',
        placeholder: 'np. 00:30',
        group: 'package',
        sourceLabel: 'Tylko w tej umowie',
        reason: 'Szablon wymaga godziny zakończenia reportażu.',
      })
    }
  }

  // Deduplicate by registryKey
  const seen = new Set<string>()
  const uniqueFields = editableFields.filter((f) => {
    if (seen.has(f.registryKey)) return false
    seen.add(f.registryKey)
    return true
  })

  return { editableFields: uniqueFields, contextualIssues }
}

/**
 * When both duration and end time are known, remove accidental merged phrases
 * like "12 godziny 00:30" from generated paragraphs (duration keeps the span).
 */
export function repairDurationEndTimeCollisions(input: {
  paragraphs: Array<{ index: number; text: string }>
  durationPhrase: string
}): {
  paragraphs: Array<{ index: number; text: string }>
  repaired: boolean
} {
  const phrase = input.durationPhrase.trim()
  if (!phrase || !/\d/.test(phrase)) {
    return { paragraphs: input.paragraphs, repaired: false }
  }
  let repaired = false
  const paragraphs = input.paragraphs.map((p) => {
    if (!COLLISION_RE.test(p.text)) return p
    const next = p.text.replace(COLLISION_RE, phrase)
    if (next !== p.text) repaired = true
    return { ...p, text: next }
  })
  return { paragraphs, repaired }
}

/** Real Umowa GP – Aleksandra B source shapes (05E32CA1 control-flow fixture). */
export const UMOWA_GP_ALEKSANDRA_B_FIXTURE = {
  teaserParagraph: 'teledysku ślubnego o długości ok. 1-2 minut;',
  teaserPlaceholderParagraph: 'teledysku ślubnego o długości ok. __________;',
  coverageParagraph:
    'przyjęcia weselnego, które odbędzie się w Rezydencji Lubomirskich - Retyrada – z czego w zakresie przyjęcia weselnego reportaż ślubny obejmuje czas maksymalnie do godziny 00.30. Czas pracy kamerzysty wynosi maksymalnie 12 godzin. Każda dodatkowa godzina to koszt w wysokości 800zł.',
} as const

/**
 * Map coverage_duration override into coverage_hours for the resolver.
 */
export function expandCoverageOverrides(
  overrides: Record<string, string>,
): Record<string, string> {
  const out = { ...overrides }
  const duration = overrides.coverage_duration?.trim()
  if (duration) {
    const hours = Number(duration.match(/\d+/)?.[0])
    if (Number.isFinite(hours)) {
      out.coverage_hours = String(hours)
      out.working_hours = String(hours)
      out.package_duration = String(hours)
    } else {
      out.coverage_hours = duration
    }
  }
  const teaser = overrides.teaser_duration?.trim()
  if (teaser) {
    out.teaser_duration = teaser
    // Also feed film_duration when that is the bound key
    if (!out.film_duration?.trim()) out.film_duration = teaser
  }
  return out
}

/**
 * Bind teaser-context underscore placeholders so a review override can replace them.
 */
export function ensureTeaserDurationSlots(input: {
  slots: TemplateSlot[]
  paragraphs: Array<{ index: number; text: string }>
}): TemplateSlot[] {
  const alreadyCovered = new Set<string>()
  for (const slot of input.slots) {
    if (!isSlotPhysicallyBound(slot)) continue
    if (
      slot.registryKey !== 'teaser_duration' &&
      slot.registryKey !== 'film_duration'
    ) {
      continue
    }
    if (!isPlaceholderOnlyValue(slot.originalText)) continue
    const start = slot.startOffset ?? slot.allowedRange?.start
    if (slot.paragraphIndex != null && start != null) {
      alreadyCovered.add(`${slot.paragraphIndex}:${start}`)
    }
  }

  const extra: TemplateSlot[] = []
  for (const para of input.paragraphs) {
    if (!TEASER_CONTEXT.test(para.text) && !/długości\s+ok\./i.test(para.text)) {
      continue
    }
    const re = /_{3,}/g
    let match: RegExpExecArray | null
    while ((match = re.exec(para.text)) != null) {
      const start = match.index
      const key = `${para.index}:${start}`
      if (alreadyCovered.has(key)) continue
      // Prefer underscores near teaser / „długości ok.”
      const windowStart = Math.max(0, start - 80)
      const local = para.text.slice(windowStart, start + match[0].length + 20)
      if (
        !TEASER_CONTEXT.test(local) &&
        !/długości\s+ok\./i.test(local)
      ) {
        continue
      }
      alreadyCovered.add(key)
      const originalText = match[0]
      extra.push({
        id: `auto-teaser-duration-${para.index}-${start}`,
        label: 'Długość teledysku',
        registryKey: 'teaser_duration',
        enabled: true,
        physicallyBound: true,
        physicalSpanSafety: 'safe',
        operation: 'replace',
        requirement: 'optional',
        paragraphIndex: para.index,
        startOffset: start,
        endOffset: start + originalText.length,
        allowedRange: { start, end: start + originalText.length },
        originalText,
        sourceHint: 'package',
        variableClassification: 'dynamic_candidate',
        occurrences: 1,
      } as TemplateSlot)
    }
  }

  return extra.length > 0 ? [...input.slots, ...extra] : input.slots
}

/**
 * When source prose merges duration + clock ("12 godziny 00:30"), bind the
 * full phrase as coverage_hours so a known duration can replace it without
 * leaving a duration+clock collision. End time must come from a separate
 * „do godziny” span when present.
 */
export function ensureCoverageCollisionRepairSlots(input: {
  slots: TemplateSlot[]
  paragraphs: Array<{ index: number; text: string }>
}): TemplateSlot[] {
  const extra: TemplateSlot[] = []
  for (const para of input.paragraphs) {
    const re = /\d+\s+godzin(?:a|y)?\s+\d{1,2}[.:]\d{2}/gi
    let match: RegExpExecArray | null
    while ((match = re.exec(para.text)) != null) {
      const start = match.index
      const end = start + match[0].length
      const covered = input.slots.some((s) => {
        if (!isSlotPhysicallyBound(s)) return false
        if (s.paragraphIndex !== para.index) return false
        const ss = s.startOffset ?? s.allowedRange?.start
        const ee = s.endOffset ?? s.allowedRange?.end
        if (ss == null || ee == null) return false
        return ss <= start && ee >= end
      })
      if (covered) continue
      extra.push({
        id: `auto-coverage-collision-${para.index}-${start}`,
        label: 'Czas pracy podczas reportażu',
        registryKey: 'coverage_hours',
        enabled: true,
        physicallyBound: true,
        physicalSpanSafety: 'safe',
        operation: 'replace',
        requirement: 'optional',
        paragraphIndex: para.index,
        startOffset: start,
        endOffset: end,
        allowedRange: { start, end },
        originalText: match[0],
        sourceHint: 'package',
        variableClassification: 'dynamic_candidate',
        occurrences: 1,
      } as TemplateSlot)
    }
  }

  return extra.length > 0 ? [...input.slots, ...extra] : input.slots
}

/**
 * Map post-generation audit blockers into editable review fields.
 */
export function reviewFieldsFromAuditMessages(messages: string[]): {
  editableFields: PreGenerationEditableField[]
  contextualIssues: PreGenerationContextualIssue[]
} {
  const editableFields: PreGenerationEditableField[] = []
  const contextualIssues: PreGenerationContextualIssue[] = []
  const text = messages.join('\n')
  if (/długość teledysku|teledysk/i.test(text)) {
    editableFields.push({
      id: 'teaser_duration',
      registryKey: 'teaser_duration',
      label: 'Długość teledysku',
      placeholder: 'np. 3–5 minut',
      group: 'package',
      sourceLabel: 'Tylko w tej umowie',
      reason: 'Uzupełnij długość teledysku przed generowaniem.',
    })
  }
  if (/połączone|czas trwania reportażu/i.test(text)) {
    contextualIssues.push({
      id: 'duration_end_time_collision',
      label: 'Czas reportażu i godzina zakończenia',
      message:
        'Czas trwania reportażu i godzina zakończenia zostały błędnie połączone.',
      relatedKeys: ['coverage_duration', 'coverage_end_time'],
    })
    editableFields.push({
      id: 'coverage_duration',
      registryKey: 'coverage_duration',
      label: 'Czas pracy podczas reportażu',
      placeholder: 'np. 12 godzin',
      group: 'package',
      sourceLabel: 'Tylko w tej umowie',
      reason: 'Podaj czas trwania osobno.',
    })
    editableFields.push({
      id: 'coverage_end_time',
      registryKey: 'coverage_end_time',
      label: 'Godzina zakończenia',
      placeholder: 'np. 00:30',
      group: 'package',
      sourceLabel: 'Tylko w tej umowie',
      reason: 'Podaj godzinę zakończenia osobno.',
    })
  }
  return { editableFields, contextualIssues }
}
