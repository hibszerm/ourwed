/**
 * Photographer-facing Contract Questionnaire answers.
 * Labels and option text come from the form instance options_snapshot
 * (frozen at send) plus customAnswers.labelSnapshot as fallback — never
 * from the live reusable studio config alone.
 */

import { formatDate } from '@/lib/utils/dates'
import { formatLocationAnswer } from '@/lib/forms/contractQuestionnaireSnapshot'
import {
  formatLocationAnswerDisplay,
  isManualLocationAnswer,
} from '@/features/prewedding/preweddingLocation'
import type {
  ContractQuestionnaireConfig,
  CustomFieldAnswer,
  FormInstanceOptionsSnapshot,
} from '@/types/contractQuestionnaire'
import type {
  ContractQuestionnaireBlock,
  QuestionnaireChoiceOption,
  QuestionnaireCustomFieldBlock,
} from '@/types/questionnaireBlocks'
import type { FormAnswerJson } from '@/types/formEngine'

export interface ContractAnswerItem {
  /** Stable key (block id or custom fieldKey). */
  id: string
  fieldKey: string
  label: string
  value: string
  kind:
    | 'text'
    | 'long_text'
    | 'date'
    | 'choice'
    | 'yes_no'
    | 'package'
    | 'addons'
    | 'location'
    | 'legacy'
  /** Original location answer for SelectedLocationCard (GeoPlace / legacy / string). */
  locationRaw?: unknown
  manualLocation?: boolean
}

export interface ContractAnswerSection {
  sectionId: string
  sectionTitle: string
  items: ContractAnswerItem[]
}

function isEmptyAnswer(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'boolean') return false
  if (typeof value === 'number') return Number.isNaN(value)
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    const loc = formatLocationAnswer(value)
    return !loc.trim()
  }
  return false
}

function optionLabel(
  options: Array<{ value: string; label: string }> | undefined,
  raw: string,
): string {
  if (!options?.length) return raw
  const hit = options.find((o) => o.value === raw || o.label === raw)
  return hit?.label ?? raw
}

function formatChoiceValue(
  value: unknown,
  options: Array<{ value: string; label: string }> | undefined,
  multiple: boolean,
): string {
  if (multiple && Array.isArray(value)) {
    return value
      .map((v) => optionLabel(options, String(v)))
      .filter(Boolean)
      .join(', ')
  }
  if (typeof value === 'string' && value.trim()) {
    return optionLabel(options, value.trim())
  }
  return ''
}

function formatYesNo(value: unknown): string {
  if (value === true || value === 'true' || value === 'Tak' || value === 'yes') {
    return 'Tak'
  }
  if (value === false || value === 'false' || value === 'Nie' || value === 'no') {
    return 'Nie'
  }
  return ''
}

function formatPackageNames(
  value: unknown,
  snapshots: Array<{ id: string; name: string }> | undefined,
): string {
  const ids = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string' && value
      ? [value]
      : []
  if (!ids.length) return ''
  const byId = new Map((snapshots ?? []).map((s) => [s.id, s.name]))
  return ids.map((id) => byId.get(id) ?? id).join(', ')
}

function resolveRawValue(
  answerJson: FormAnswerJson,
  block: ContractQuestionnaireBlock,
  fieldKey: string,
): unknown {
  const values = (answerJson.values ?? {}) as Record<string, unknown>
  if (block.id in values && values[block.id] !== undefined) {
    return values[block.id]
  }
  const fields = (answerJson.fields ?? {}) as Record<string, unknown>
  if (fieldKey in fields) return fields[fieldKey]
  if (fieldKey.startsWith('custom.')) {
    const bare = fieldKey.replace(/^custom\./, '')
    const customs = Array.isArray(answerJson.customAnswers)
      ? (answerJson.customAnswers as CustomFieldAnswer[])
      : []
    const hit = customs.find(
      (c) => c.fieldKey === bare || c.fieldId === block.id || c.fieldId === bare,
    )
    if (hit) return hit.value
  }
  return undefined
}

function blockFieldKey(block: ContractQuestionnaireBlock): string {
  if (block.type === 'system_field') return block.systemKey
  if (block.type === 'location') {
    const map = {
      bride_preparation: 'bridePreparationLocation',
      groom_preparation: 'groomPreparationLocation',
      ceremony: 'ceremonyLocation',
      reception: 'receptionLocation',
    } as const
    return map[block.locationRole]
  }
  if (block.type === 'packages') return 'selectedPackageIds'
  if (block.type === 'additional_services') return 'selectedAdditionalServiceIds'
  if (
    block.type === 'short_text' ||
    block.type === 'long_text' ||
    block.type === 'single_choice' ||
    block.type === 'multiple_choice' ||
    block.type === 'checkbox' ||
    block.type === 'date' ||
    block.type === 'number' ||
    block.type === 'email' ||
    block.type === 'phone'
  ) {
    return `custom.${block.fieldKey}`
  }
  return block.id
}

function locationItemFields(raw: unknown): Pick<
  ContractAnswerItem,
  'value' | 'kind' | 'locationRaw' | 'manualLocation'
> {
  return {
    value: formatLocationAnswerDisplay(raw) || formatLocationAnswer(raw),
    kind: 'location',
    locationRaw: raw,
    manualLocation: isManualLocationAnswer(raw),
  }
}

function formatBlockAnswer(
  block: ContractQuestionnaireBlock,
  raw: unknown,
  answerJson: FormAnswerJson,
  snapshot: FormInstanceOptionsSnapshot | null,
): ContractAnswerItem | null {
  if (block.type === 'heading' || block.type === 'divider') return null
  if (block.type === 'text') return null // information-only

  const fieldKey = blockFieldKey(block)
  if (isEmptyAnswer(raw) && block.type !== 'checkbox') return null

  let label: string
  let value: string
  let kind: ContractAnswerItem['kind'] = 'text'
  let locationRaw: unknown
  let manualLocation: boolean | undefined

  if (block.type === 'system_field') {
    label = block.label
    if (block.inputType === 'address') {
      const loc = locationItemFields(raw)
      value = loc.value
      kind = loc.kind
      locationRaw = loc.locationRaw
      manualLocation = loc.manualLocation
    } else if (block.inputType === 'date' && typeof raw === 'string') {
      value = formatDate(raw) || raw
      kind = 'date'
    } else if (block.inputType === 'textarea') {
      value = String(raw ?? '').trim()
      kind = 'long_text'
    } else {
      value = String(raw ?? '').trim()
    }
  } else if (block.type === 'location') {
    label = block.label
    const loc = locationItemFields(raw)
    value = loc.value
    kind = loc.kind
    locationRaw = loc.locationRaw
    manualLocation = loc.manualLocation
  } else if (block.type === 'packages') {
    label = block.label
    const ids =
      raw ??
      (answerJson.fields as Record<string, unknown> | undefined)?.selectedPackageIds ??
      (answerJson.fields as Record<string, unknown> | undefined)?.packageId
    value = formatPackageNames(
      ids,
      (answerJson.packageSnapshots as Array<{ id: string; name: string }> | undefined) ??
        snapshot?.packageOptions,
    )
    kind = 'package'
  } else if (block.type === 'additional_services') {
    label = block.label
    const ids =
      raw ??
      (answerJson.fields as Record<string, unknown> | undefined)
        ?.selectedAdditionalServiceIds
    value = formatPackageNames(
      ids,
      (answerJson.additionalServiceSnapshots as
        | Array<{ id: string; name: string }>
        | undefined) ?? snapshot?.additionalServiceOptions,
    )
    kind = 'addons'
  } else if (
    block.type === 'short_text' ||
    block.type === 'long_text' ||
    block.type === 'single_choice' ||
    block.type === 'multiple_choice' ||
    block.type === 'checkbox' ||
    block.type === 'date' ||
    block.type === 'number' ||
    block.type === 'email' ||
    block.type === 'phone'
  ) {
    label = block.label
    const opts = (block.options ?? []).map((o: QuestionnaireChoiceOption) => ({
      value: o.value,
      label: o.label,
    }))
    if (block.type === 'checkbox') {
      value = formatYesNo(raw)
      kind = 'yes_no'
    } else if (block.type === 'single_choice') {
      value = formatChoiceValue(raw, opts, false)
      kind = 'choice'
    } else if (block.type === 'multiple_choice') {
      value = formatChoiceValue(raw, opts, true)
      kind = 'choice'
    } else if (block.type === 'date' && typeof raw === 'string') {
      value = formatDate(raw) || raw
      kind = 'date'
    } else if (block.type === 'long_text') {
      value = String(raw ?? '').trim()
      kind = 'long_text'
    } else {
      value = String(raw ?? '').trim()
    }
  } else {
    return null
  }

  if (!value.trim()) return null

  return {
    id: block.id,
    fieldKey,
    label,
    value,
    kind,
    ...(kind === 'location'
      ? { locationRaw, manualLocation: Boolean(manualLocation) }
      : {}),
  }
}

/**
 * Build section-grouped answers from the issued form snapshot + stored answers.
 * Prefer optionsSnapshot.config over live studio config.
 */
export function buildContractAnswerSections(
  answerJson: FormAnswerJson,
  optionsSnapshot: FormInstanceOptionsSnapshot | null,
  /** Optional live config fallback only when snapshot is missing (legacy). */
  liveConfigFallback?: ContractQuestionnaireConfig | null,
): ContractAnswerSection[] {
  const config =
    optionsSnapshot?.config ??
    liveConfigFallback ??
    null

  // Use frozen blocks as-is. Do NOT run ensureQuestionnaireBlocks here —
  // that normalizes low version numbers into the product layout and would
  // drop custom fields from historical options_snapshot configs.
  const blocks: ContractQuestionnaireBlock[] = Array.isArray(config?.blocks)
    ? config.blocks
    : []

  const sections: ContractAnswerSection[] = []
  let current: ContractAnswerSection = {
    sectionId: 'sec_default',
    sectionTitle: '',
    items: [],
  }

  const pushCurrent = () => {
    if (current.items.length > 0) {
      sections.push(current)
    }
  }

  for (const block of [...blocks].sort((a, b) => a.order - b.order)) {
    if (!block.enabled) continue
    if (block.type === 'heading' && block.level !== 1) {
      pushCurrent()
      current = {
        sectionId: block.id,
        sectionTitle: block.text?.trim() || '',
        items: [],
      }
      continue
    }
    if (block.type === 'heading') continue

    const fieldKey = blockFieldKey(block)
    const raw = resolveRawValue(answerJson, block, fieldKey)
    const item = formatBlockAnswer(block, raw, answerJson, optionsSnapshot)
    if (item) current.items.push(item)
  }
  pushCurrent()

  // Orphan customAnswers not present in snapshot blocks (legacy / removed fields).
  const customs = Array.isArray(answerJson.customAnswers)
    ? (answerJson.customAnswers as CustomFieldAnswer[])
    : []
  const coveredKeys = new Set(
    sections.flatMap((s) => s.items.map((i) => i.fieldKey.replace(/^custom\./, ''))),
  )
  const orphanItems: ContractAnswerItem[] = []
  for (const a of customs) {
    const bare = a.fieldKey ?? a.fieldId
    if (coveredKeys.has(bare)) continue
    if (isEmptyAnswer(a.value) && a.type !== 'checkbox') continue
    const optionSnaps = a.optionSnapshots
    let value: string
    if (a.type === 'checkbox') {
      value = formatYesNo(a.value)
    } else if (a.type === 'single_choice' || a.type === 'radio') {
      value = formatChoiceValue(a.value, optionSnaps, false)
    } else if (a.type === 'multiple_choice' || a.type === 'multiselect') {
      value = formatChoiceValue(a.value, optionSnaps, true)
    } else if (a.type === 'long_text' || a.type === 'textarea') {
      value = String(a.value ?? '').trim()
    } else {
      value = String(a.value ?? '').trim()
    }
    if (!value.trim()) continue
    orphanItems.push({
      id: a.fieldId,
      fieldKey: a.fieldKey ? `custom.${a.fieldKey}` : a.fieldId,
      label: a.labelSnapshot || 'Pole własne',
      value,
      kind: a.type === 'checkbox' ? 'yes_no' : 'legacy',
    })
  }
  if (orphanItems.length > 0) {
    sections.push({
      sectionId: 'sec_orphan_custom',
      sectionTitle: 'Pola własne',
      items: orphanItems,
    })
  }

  return sections
}

/** Flat list in snapshot order. */
export function buildContractAnswerList(
  answerJson: FormAnswerJson,
  optionsSnapshot: FormInstanceOptionsSnapshot | null,
  liveConfigFallback?: ContractQuestionnaireConfig | null,
): ContractAnswerItem[] {
  return buildContractAnswerSections(
    answerJson,
    optionsSnapshot,
    liveConfigFallback,
  ).flatMap((s) => s.items)
}

/** Options from a custom block for tests / submit enrichment. */
export function choiceOptionsFromCustomBlock(
  block: QuestionnaireCustomFieldBlock,
): Array<{ value: string; label: string }> {
  return (block.options ?? []).map((o) => ({ value: o.value, label: o.label }))
}
