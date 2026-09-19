/**
 * V7 Presentation Contract V1 — frontend-facing only.
 * Actions are projected from authorized tool evidence, never from model prose.
 */

export type PresentationStatus = 'answer' | 'error'

export type PresentationRefKind =
  | 'wedding'
  | 'session'
  | 'phone'
  | 'email'
  | 'address'
  | 'calendar'

export type AssistantAction =
  | { type: 'call_phone'; phone: string }
  | { type: 'send_sms'; phone: string }
  | { type: 'compose_email'; email: string }
  /**
   * Direct Maps navigation (same primitive as wedding Logistics Nawiguj).
   * `address` = destination postal text.
   * `label` = optional venue/place name only — NEVER a semantic UI role
   * (e.g. "Przygotowania pana młodego"). Role labels belong on the reference.
   */
  | { type: 'navigate_address'; address: string; label?: string }
  | { type: 'open_wedding'; weddingId: string }
  | { type: 'open_session'; sessionId: string }
  | { type: 'open_prewedding_questionnaire'; weddingId: string }
  | { type: 'open_calendar'; date?: string }

export type AssistantReference = {
  id: string
  kind: PresentationRefKind
  label?: string
  /**
   * Optional trusted secondary detail from authorized tool evidence
   * (e.g. ISO date from describe_resource_set preview). Display only.
   */
  detail?: string
  /** Wedding/session CRM UUID only — never ResourceSet handle. */
  entityId?: string
  actions: AssistantAction[]
  /**
   * Phase 2I.1 — authoritative answer membership vs supporting evidence.
   * Collection display prefers `result` when any result refs exist.
   * Omitted/`evidence` = may be trusted but is NOT automatically a result row.
   */
  role?: 'result' | 'evidence'
}

export type AssistantPresentationTurn = {
  message: string
  status: PresentationStatus
  references?: AssistantReference[]
  /** Original user utterance for retry after error. */
  retryUtterance?: string
}

/** Ephemeral UI transcript — presentation state only; never fed into V7. */
export type TranscriptEntry =
  | {
      id: string
      role: 'user'
      text: string
      status: 'pending' | 'sent'
    }
  | {
      id: string
      role: 'assistant'
      presentation: AssistantPresentationTurn
      status: 'ready' | 'error'
    }
