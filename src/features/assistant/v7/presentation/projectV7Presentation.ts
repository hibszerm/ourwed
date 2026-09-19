/**
 * Deterministic V7 → AssistantPresentationTurn projection.
 * Uses authorized tool results + ResourceSet membership only.
 * NEVER parses model prose for actions/entities.
 */

import { ASSISTANT_API_FAILURE } from '../../copy'
import type { V7TurnResult } from '../agent/loop'
import { sanitizeV7UserText } from '../render/sanitize'
import type { V7ResourceSetStore } from '../resourceSet/store'
import type { V7SessionBinding } from '../resourceSet/types'
import type {
  AssistantAction,
  AssistantPresentationTurn,
  AssistantReference,
  PresentationRefKind,
} from './types'
import {
  isValidCalendarDate,
  isValidEntityId,
  isValidPresentationAddress,
  isValidPresentationEmail,
  isValidPresentationPhone,
  scalarString,
} from './validate'

type ToolCallRecord = {
  name: string
  args: unknown
  result: unknown
}

type InspectField = {
  concept: string
  value: unknown
  filled: boolean
  display_text?: string | null
}

type SubjectHit = {
  resourceType: 'wedding' | 'session'
  entityId: string
  displayName: string | null
  questionnaire: boolean
  dateValue: string | null
}

const PHONE_CONCEPTS = new Set([
  'CONTACT.BRIDE_PHONE',
  'CONTACT.GROOM_PHONE',
])

const EMAIL_CONCEPTS = new Set([
  'CONTACT.BRIDE_EMAIL',
  'CONTACT.GROOM_EMAIL',
])

const ADDRESS_CONCEPTS = new Set([
  'CONTACT.BRIDE_ADDRESS',
  'CONTACT.GROOM_ADDRESS',
  'PLACE.CEREMONY_ADDRESS',
  'PLACE.RECEPTION_ADDRESS',
  'PLACE.BRIDE_PREP_ADDRESS',
  'PLACE.GROOM_PREP_ADDRESS',
])

const DATE_CONCEPTS = new Set(['WEDDING.DATE', 'SESSION.DATE'])

const QUESTIONNAIRE_CONCEPTS = new Set([
  'Q.PREWEDDING_STATUS',
  'Q.PREWEDDING_COMPLETED',
])

/** Closed presentation labels for known concepts — not action button copy. */
const CONCEPT_LABELS: Record<string, string> = {
  'CONTACT.BRIDE_PHONE': 'Telefon panny młodej',
  'CONTACT.GROOM_PHONE': 'Telefon pana młodego',
  'CONTACT.BRIDE_EMAIL': 'E-mail panny młodej',
  'CONTACT.GROOM_EMAIL': 'E-mail pana młodego',
  'CONTACT.BRIDE_ADDRESS': 'Adres panny młodej',
  'CONTACT.GROOM_ADDRESS': 'Adres pana młodego',
  'PLACE.CEREMONY_ADDRESS': 'Adres ceremonii',
  'PLACE.RECEPTION_ADDRESS': 'Adres przyjęcia',
  'PLACE.BRIDE_PREP_ADDRESS': 'Przygotowania panny młodej',
  'PLACE.GROOM_PREP_ADDRESS': 'Przygotowania pana młodego',
  'SESSION.LOCATION_SUMMARY': 'Lokalizacja sesji',
}

/** Semantic UI role labels — never Maps venue prefixes. */
const SEMANTIC_ADDRESS_ROLE_LABELS = new Set(
  Object.values(CONCEPT_LABELS).map((v) => v.toLowerCase()),
)

function isSemanticAddressRoleLabel(label: string | null | undefined): boolean {
  if (!label) return false
  return SEMANTIC_ADDRESS_ROLE_LABELS.has(label.trim().toLowerCase())
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function toolOk(result: unknown): boolean {
  return isRecord(result) && result.ok === true
}

function resolveMemberId(
  store: V7ResourceSetStore,
  binding: V7SessionBinding,
  handle: unknown,
  ordinal: unknown,
): { resourceType: 'wedding' | 'session'; entityId: string } | null {
  if (typeof handle !== 'string' || !handle.startsWith('rs_')) return null
  let ord =
    typeof ordinal === 'number' && Number.isInteger(ordinal) ? ordinal : null
  const got = store.get(handle, binding)
  if (!got.ok) return null
  if (ord == null) {
    if (got.record.count !== 1) return null
    ord = 1
  }
  if (ord < 1 || ord > got.record.count) return null
  const entityId = got.record.memberIds[ord - 1]
  if (!entityId || !isValidEntityId(entityId)) return null
  return { resourceType: got.record.resourceType, entityId }
}

function fieldDisplayValue(field: InspectField): string | null {
  const fromDisplay = scalarString(field.display_text)
  if (fromDisplay) return fromDisplay
  return scalarString(field.value)
}

function pushRef(
  refs: AssistantReference[],
  partial: Omit<AssistantReference, 'id'> & { id?: string },
  seq: { n: number },
): void {
  if (partial.actions.length === 0) return
  seq.n += 1
  refs.push({
    id: partial.id ?? `ref-${seq.n}`,
    kind: partial.kind,
    label: partial.label,
    detail: partial.detail,
    entityId: partial.entityId,
    actions: partial.actions,
    ...(partial.role ? { role: partial.role } : {}),
  })
}

function absorbSubjectFields(
  subjects: Map<string, SubjectHit>,
  resolved: { resourceType: 'wedding' | 'session'; entityId: string },
  displayName: string | null,
  fields: InspectField[],
): void {
  const key = `${resolved.resourceType}:${resolved.entityId}`
  const prev = subjects.get(key) ?? {
    resourceType: resolved.resourceType,
    entityId: resolved.entityId,
    displayName,
    questionnaire: false,
    dateValue: null,
  }
  if (!prev.displayName) {
    prev.displayName = displayName
  }
  for (const field of fields) {
    if (!field || typeof field.concept !== 'string') continue
    if (QUESTIONNAIRE_CONCEPTS.has(field.concept)) {
      prev.questionnaire = true
    }
    if (DATE_CONCEPTS.has(field.concept) && field.filled) {
      const d = fieldDisplayValue(field)
      if (d && isValidCalendarDate(d)) prev.dateValue = d
    }
  }
  subjects.set(key, prev)
}

function collectSubjectsFromInspect(
  store: V7ResourceSetStore,
  binding: V7SessionBinding,
  call: ToolCallRecord,
  subjects: Map<string, SubjectHit>,
): void {
  if (!toolOk(call.result)) return
  const result = call.result as Record<string, unknown>

  if (call.name === 'inspect_resource') {
    const args = isRecord(call.args) ? call.args : {}
    const resolved = resolveMemberId(
      store,
      binding,
      result.handle ?? args.handle,
      result.ordinal ?? args.ordinal,
    )
    if (!resolved) return
    const fields = Array.isArray(result.fields)
      ? (result.fields as InspectField[])
      : []
    absorbSubjectFields(
      subjects,
      resolved,
      scalarString(result.display_name),
      fields,
    )
    return
  }

  // Phase 2K.10-E1 — sort_resources optional evidence (inspect-equivalent fields).
  if (call.name === 'sort_resources' && Array.isArray(result.evidence)) {
    for (const entry of result.evidence) {
      if (!isRecord(entry)) continue
      const resolved = resolveMemberId(
        store,
        binding,
        result.handle,
        entry.ordinal,
      )
      if (!resolved) continue
      const fields = Array.isArray(entry.fields)
        ? (entry.fields as InspectField[])
        : []
      absorbSubjectFields(
        subjects,
        resolved,
        scalarString(entry.display_name),
        fields,
      )
    }
  }
}

function collectSubjectsFromListRelated(
  store: V7ResourceSetStore,
  binding: V7SessionBinding,
  call: ToolCallRecord,
  subjects: Map<string, SubjectHit>,
): void {
  if (call.name !== 'list_related' || !toolOk(call.result)) return
  const result = call.result as Record<string, unknown>
  const args = isRecord(call.args) ? call.args : {}
  const resolved = resolveMemberId(
    store,
    binding,
    result.handle ?? args.handle,
    result.ordinal ?? args.ordinal,
  )
  if (!resolved) return
  const key = `${resolved.resourceType}:${resolved.entityId}`
  if (!subjects.has(key)) {
    subjects.set(key, {
      resourceType: resolved.resourceType,
      entityId: resolved.entityId,
      displayName: null,
      questionnaire: false,
      dateValue: null,
    })
  }
}

function projectFieldsToContactAndPlaceRefs(
  fields: InspectField[],
  entityId: string | undefined,
  refs: AssistantReference[],
  seq: { n: number },
): void {
  for (const field of fields) {
    if (!field || typeof field.concept !== 'string' || !field.filled) continue
    const value = fieldDisplayValue(field)
    if (!value) continue
    const label = CONCEPT_LABELS[field.concept]

    if (PHONE_CONCEPTS.has(field.concept)) {
      if (!isValidPresentationPhone(value)) continue
      const actions: AssistantAction[] = [
        { type: 'call_phone', phone: value },
        { type: 'send_sms', phone: value },
      ]
      pushRef(
        refs,
        {
          kind: 'phone',
          label,
          entityId,
          actions,
        },
        seq,
      )
      continue
    }

    if (EMAIL_CONCEPTS.has(field.concept)) {
      if (!isValidPresentationEmail(value)) continue
      pushRef(
        refs,
        {
          kind: 'email',
          label,
          entityId,
          actions: [{ type: 'compose_email', email: value }],
        },
        seq,
      )
      continue
    }

    if (
      ADDRESS_CONCEPTS.has(field.concept) ||
      field.concept === 'SESSION.LOCATION_SUMMARY'
    ) {
      // LOCATION_SUMMARY may be locality-only — still navigable if address-like.
      if (!isValidPresentationAddress(value)) continue
      // Skip pure place *names* without address concepts — PLACE.*_PLACE is name.
      if (field.concept.endsWith('_PLACE')) continue
      // Reference.label = UI semantics; navigate_address must NOT carry role
      // labels into Maps (Logistics uses venue placeName, not concept roles).
      pushRef(
        refs,
        {
          kind: 'address',
          label,
          entityId,
          actions: [
            {
              type: 'navigate_address',
              address: value,
            },
          ],
        },
        seq,
      )
    }
  }
}

function projectContactAndPlaceRefs(
  store: V7ResourceSetStore,
  binding: V7SessionBinding,
  call: ToolCallRecord,
  refs: AssistantReference[],
  seq: { n: number },
): void {
  if (!toolOk(call.result)) return
  const result = call.result as Record<string, unknown>

  if (call.name === 'inspect_resource') {
    const args = isRecord(call.args) ? call.args : {}
    const resolved = resolveMemberId(
      store,
      binding,
      result.handle ?? args.handle,
      result.ordinal ?? args.ordinal,
    )
    const fields = Array.isArray(result.fields)
      ? (result.fields as InspectField[])
      : []
    projectFieldsToContactAndPlaceRefs(
      fields,
      resolved?.entityId,
      refs,
      seq,
    )
    return
  }

  // Phase 2K.10-E1 — evidence from sort_resources uses the same field projection.
  if (call.name === 'sort_resources' && Array.isArray(result.evidence)) {
    for (const entry of result.evidence) {
      if (!isRecord(entry)) continue
      const resolved = resolveMemberId(
        store,
        binding,
        result.handle,
        entry.ordinal,
      )
      const fields = Array.isArray(entry.fields)
        ? (entry.fields as InspectField[])
        : []
      projectFieldsToContactAndPlaceRefs(
        fields,
        resolved?.entityId,
        refs,
        seq,
      )
    }
  }
}

function projectListRelatedAddresses(
  call: ToolCallRecord,
  refs: AssistantReference[],
  seq: { n: number },
): void {
  if (call.name !== 'list_related' || !toolOk(call.result)) return
  const result = call.result as Record<string, unknown>
  const relation =
    typeof result.relation === 'string' ? result.relation : ''
  if (relation !== 'DAY_PLAN_STOPS' && relation !== 'ROUTE_STOPS') return
  const items = Array.isArray(result.items) ? result.items : []
  for (const item of items) {
    if (!isRecord(item)) continue
    const title = scalarString(item.title)
    const subtitle = scalarString(item.subtitle)
    const meta = scalarString(item.meta)
    // Prefer subtitle (ROUTE_STOPS address); else last segment of meta.
    let address = subtitle
    if (!address && meta) {
      const parts = meta.split('·').map((p) => p.trim())
      address = parts[parts.length - 1] || meta
    }
    if (!address || !isValidPresentationAddress(address)) continue
    // If address equals title, still OK (name-as-query).
    // Venue label only — never semantic role labels (Phase 2J).
    const venueLabel =
      title &&
      !isSemanticAddressRoleLabel(title) &&
      title.trim().toLowerCase() !== address.trim().toLowerCase()
        ? title
        : undefined
    pushRef(
      refs,
      {
        kind: 'address',
        label: title ?? undefined,
        actions: [
          {
            type: 'navigate_address',
            address,
            ...(venueLabel ? { label: venueLabel } : {}),
          },
        ],
      },
      seq,
    )
  }
}

function hadMultiMemberSetWithoutSingleSubject(
  toolCalls: ToolCallRecord[],
): boolean {
  for (const call of toolCalls) {
    if (!toolOk(call.result)) continue
    const result = call.result as Record<string, unknown>
    if (
      call.name === 'search_resources' ||
      call.name === 'refine_resources' ||
      call.name === 'sort_resources' ||
      call.name === 'describe_resource_set'
    ) {
      const count =
        typeof result.count === 'number'
          ? result.count
          : typeof result.member_count === 'number'
            ? result.member_count
            : null
      if (count != null && count > 1) {
        // Multi set exists — OPEN only if exactly one subject was later inspected.
        return true
      }
    }
    if (call.name === 'aggregate_resources') {
      return true
    }
  }
  return false
}

function projectEntityOpenActions(
  subjects: Map<string, SubjectHit>,
  toolCalls: ToolCallRecord[],
  refs: AssistantReference[],
  seq: { n: number },
): void {
  const weddingSubjects = [...subjects.values()].filter(
    (s) => s.resourceType === 'wedding',
  )
  const sessionSubjects = [...subjects.values()].filter(
    (s) => s.resourceType === 'session',
  )

  const multiCollection = hadMultiMemberSetWithoutSingleSubject(toolCalls)

  // Fail-closed: OPEN only when exactly one subject of that type was
  // inspect/list_related target this turn.
  if (weddingSubjects.length === 1) {
    const w = weddingSubjects[0]!
    // If multi-member collection existed AND we somehow have >1 wedding subject
    // we already gated; for aggregates with no inspect subject, weddingSubjects empty.
    // If aggregate ran but we also inspected exactly one wedding — allow OPEN
    // (exact subject proven). If only aggregate/search multi with zero inspect —
    // weddingSubjects empty → no OPEN. Good.
    void multiCollection
    const actions: AssistantAction[] = [
      { type: 'open_wedding', weddingId: w.entityId },
    ]
    if (w.questionnaire) {
      actions.push({
        type: 'open_prewedding_questionnaire',
        weddingId: w.entityId,
      })
    }
    pushRef(
      refs,
      {
        kind: 'wedding',
        label: w.displayName ?? undefined,
        entityId: w.entityId,
        actions,
      },
      seq,
    )
  }

  if (sessionSubjects.length === 1) {
    const s = sessionSubjects[0]!
    pushRef(
      refs,
      {
        kind: 'session',
        label: s.displayName ?? undefined,
        entityId: s.entityId,
        actions: [{ type: 'open_session', sessionId: s.entityId }],
      },
      seq,
    )
  }

  // Calendar: only when exactly one filled canonical date proven this turn.
  const dates = [...subjects.values()]
    .map((s) => s.dateValue)
    .filter((d): d is string => Boolean(d))
  const uniqueDates = [...new Set(dates)]
  if (uniqueDates.length === 1) {
    pushRef(
      refs,
      {
        kind: 'calendar',
        label: uniqueDates[0],
        actions: [{ type: 'open_calendar', date: uniqueDates[0] }],
      },
      seq,
    )
  }
}

/**
 * Phase 2I.1 — authoritative RESULT collection from select_nearest_assignments.
 * Resolves entity IDs via typed handles + set_ordinal (never from prose/UUID in tool JSON).
 * Returns number of result refs emitted (0 = no authoritative selection this turn).
 */
function projectSelectedAssignments(
  store: V7ResourceSetStore,
  binding: V7SessionBinding,
  toolCalls: ToolCallRecord[],
  refs: AssistantReference[],
  seq: { n: number },
): number {
  let emitted = 0
  for (const call of toolCalls) {
    if (call.name !== 'select_nearest_assignments' || !toolOk(call.result)) {
      continue
    }
    const result = call.result as Record<string, unknown>
    const selected = Array.isArray(result.selected) ? result.selected : []
    const weddingHandle =
      typeof result.wedding_handle === 'string' ? result.wedding_handle : null
    const sessionHandle =
      typeof result.session_handle === 'string' ? result.session_handle : null

    for (const raw of selected) {
      if (!isRecord(raw)) continue
      const resourceType =
        raw.resource_type === 'session'
          ? 'session'
          : raw.resource_type === 'wedding'
            ? 'wedding'
            : null
      if (!resourceType) continue
      const setOrdinal =
        typeof raw.set_ordinal === 'number' && Number.isInteger(raw.set_ordinal)
          ? raw.set_ordinal
          : null
      if (setOrdinal == null || setOrdinal < 1) continue
      const handle = resourceType === 'session' ? sessionHandle : weddingHandle
      if (!handle) continue
      const resolved = resolveMemberId(store, binding, handle, setOrdinal)
      if (!resolved || resolved.resourceType !== resourceType) continue

      const displayName = scalarString(raw.display_name)
      const rawDate = scalarString(raw.date)
      const date =
        rawDate && isValidCalendarDate(rawDate) ? rawDate : null
      const kind: PresentationRefKind =
        resourceType === 'session' ? 'session' : 'wedding'
      const actions: AssistantAction[] =
        kind === 'session'
          ? [{ type: 'open_session', sessionId: resolved.entityId }]
          : [{ type: 'open_wedding', weddingId: resolved.entityId }]
      pushRef(
        refs,
        {
          kind,
          label: displayName ?? undefined,
          detail: date ?? undefined,
          entityId: resolved.entityId,
          actions,
          role: 'result',
        },
        seq,
      )
      emitted += 1
      if (emitted >= 12) break
    }
    // One authoritative selection tool per turn is enough.
    if (emitted > 0) break
  }
  return emitted
}

/**
 * Phase 2G — collection OPEN refs from describe_resource_set preview evidence.
 * Only when no unique single-subject OPEN applies. Uses store membership +
 * authorized preview labels/dates — never model prose.
 */
function projectCollectionFromDescribe(
  store: V7ResourceSetStore,
  binding: V7SessionBinding,
  toolCalls: ToolCallRecord[],
  subjects: Map<string, SubjectHit>,
  refs: AssistantReference[],
  seq: { n: number },
): void {
  const weddingSubjects = [...subjects.values()].filter(
    (s) => s.resourceType === 'wedding',
  )
  const sessionSubjects = [...subjects.values()].filter(
    (s) => s.resourceType === 'session',
  )
  // Unique inspected subject already owns OPEN — do not spam collection.
  if (weddingSubjects.length === 1 || sessionSubjects.length === 1) return
  // Ambiguous multi-inspect — fail closed (no collection spam either).
  if (weddingSubjects.length > 1 || sessionSubjects.length > 1) return

  // Phase 2H.2: accumulate across all describe_resource_set calls so mixed
  // wedding+session assignment collections keep trusted OPEN actions for every
  // member (including a single session describe after a wedding describe).
  const startLen = refs.length
  let totalEmitted = 0
  for (const call of toolCalls) {
    if (call.name !== 'describe_resource_set' || !toolOk(call.result)) continue
    const result = call.result as Record<string, unknown>
    const args = isRecord(call.args) ? call.args : {}
    const handle =
      typeof result.handle === 'string'
        ? result.handle
        : typeof args.handle === 'string'
          ? args.handle
          : null
    if (!handle) continue
    const got = store.get(handle, binding)
    if (!got.ok) continue
    const preview = Array.isArray(result.preview) ? result.preview : []
    if (preview.length < 1) continue

    const kind: PresentationRefKind =
      got.record.resourceType === 'session' ? 'session' : 'wedding'
    let emitted = 0
    for (const raw of preview) {
      if (!isRecord(raw)) continue
      const ordinal =
        typeof raw.ordinal === 'number' && Number.isInteger(raw.ordinal)
          ? raw.ordinal
          : null
      if (ordinal == null || ordinal < 1) continue
      const entityId = got.record.memberIds[ordinal - 1]
      if (!entityId || !isValidEntityId(entityId)) continue
      const displayName = scalarString(raw.display_name)
      const rawDate = scalarString(raw.date)
      const date =
        rawDate && isValidCalendarDate(rawDate) ? rawDate : null
      const actions: AssistantAction[] =
        kind === 'session'
          ? [{ type: 'open_session', sessionId: entityId }]
          : [{ type: 'open_wedding', weddingId: entityId }]
      pushRef(
        refs,
        {
          kind,
          label: displayName ?? undefined,
          detail: date ?? undefined,
          entityId,
          actions,
          role: 'evidence',
        },
        seq,
      )
      emitted += 1
      totalEmitted += 1
      if (emitted >= 12) break
    }
  }
  // Incomplete collection (<2 members across all describes) — roll back.
  if (totalEmitted < 2) {
    refs.splice(startLen, refs.length - startLen)
  }
}

/**
 * Strip any accidental internal leaks from serialized presentation (defense).
 */
export function presentationContainsForbiddenLeak(
  presentation: AssistantPresentationTurn,
): boolean {
  const blob = JSON.stringify(presentation)
  if (/\brs_[a-z0-9]+\b/i.test(blob)) return true
  if (/\b(search_resources|inspect_resource|refine_resources|select_nearest_assignments)\b/.test(blob)) {
    return true
  }
  if (/\b(CONTACT|PLACE|FIN|Q|SESSION|WEDDING)\.[A-Z_]+\b/.test(blob)) {
    return true
  }
  if (/\b(ownerId|userId|tenantId|tenantKey)\b/.test(blob)) return true
  if (/\bgpt-|\bterra\b|\bluna\b/i.test(blob)) return true
  return false
}

export function projectV7PresentationTurn(input: {
  result: V7TurnResult
  store: V7ResourceSetStore
  binding: V7SessionBinding
  utterance: string
}): AssistantPresentationTurn {
  const { result, store, binding, utterance } = input

  if (!result.ok || result.stoppedReason === 'provider_error') {
    return {
      message: ASSISTANT_API_FAILURE,
      status: 'error',
      retryUtterance: utterance,
    }
  }

  const message = sanitizeV7UserText(result.userText)
  if (!message) {
    return {
      message: ASSISTANT_API_FAILURE,
      status: 'error',
      retryUtterance: utterance,
    }
  }

  const toolCalls = (result.toolCalls ?? []) as ToolCallRecord[]
  const refs: AssistantReference[] = []
  const seq = { n: 0 }
  const subjects = new Map<string, SubjectHit>()

  for (const call of toolCalls) {
    collectSubjectsFromInspect(store, binding, call, subjects)
    collectSubjectsFromListRelated(store, binding, call, subjects)
  }

  for (const call of toolCalls) {
    projectContactAndPlaceRefs(store, binding, call, refs, seq)
    projectListRelatedAddresses(call, refs, seq)
  }

  projectEntityOpenActions(subjects, toolCalls, refs, seq)

  // Aggregate-only answers must not spam entity OPEN rows from inspect noise.
  // Phase 2I: still project describe_resource_set collections when present —
  // previously aggregate+no-subject skipped describe entirely (follow-up prose).
  const hasAggregate = toolCalls.some(
    (c) => c.name === 'aggregate_resources' && toolOk(c.result),
  )
  if (hasAggregate && subjects.size === 0) {
    for (let i = refs.length - 1; i >= 0; i--) {
      const kind = refs[i]?.kind
      if (kind === 'wedding' || kind === 'session' || kind === 'calendar') {
        refs.splice(i, 1)
      }
    }
  }

  // Phase 2I.1: authoritative mixed/top-K selection wins over describe dump.
  const selectedCount = projectSelectedAssignments(
    store,
    binding,
    toolCalls,
    refs,
    seq,
  )
  if (selectedCount === 0) {
    // Phase 2G/2H.2/2I: describe preview → evidence/collection OPEN when no
    // authoritative select_nearest_assignments result.
    projectCollectionFromDescribe(
      store,
      binding,
      toolCalls,
      subjects,
      refs,
      seq,
    )
  }

  const presentation: AssistantPresentationTurn = {
    message,
    status: 'answer',
    ...(refs.length > 0 ? { references: refs } : {}),
  }

  if (presentationContainsForbiddenLeak(presentation)) {
    // Fail-closed: keep message, drop all references.
    return { message, status: 'answer' }
  }

  return presentation
}

/** Pure helper for tests: project from prose-only turn (no tools). */
export function projectProseOnlyPresentation(
  message: string,
): AssistantPresentationTurn {
  return {
    message: sanitizeV7UserText(message) || message,
    status: 'answer',
  }
}

export type { PresentationRefKind }
