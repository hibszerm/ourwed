/**
 * Assistant V1 — typed protocol and response contracts.
 * Model emits data only; UI renders typed cards. No HTML from the model.
 */

export const ASSISTANT_TOOL_NAMES = [
  'search_weddings',
  'get_wedding_summary',
  'get_wedding_places',
  'get_wedding_day_plan',
  'get_wedding_finances',
  'get_wedding_tasks',
  'search_sessions',
  'get_schedule_for_date',
  'resolve_wedding',
  'resolve_session',
  'prepare_create_wedding',
  'prepare_create_task',
  'get_wedding_count_for_range',
  'get_session_count_for_range',
  'get_assignment_count_for_range',
  'get_wedding_contract_value_sum_for_range',
] as const

export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number]

export const FORBIDDEN_TOOL_IDENTITY_KEYS = [
  'userId',
  'ownerId',
  'tenantId',
] as const

export const ASSISTANT_MAX_TOOL_ITERATIONS = 4
export const ASSISTANT_SEARCH_LIMIT = 6
export const ASSISTANT_MAX_TURNS = 12

export type PageContextHint = {
  resourceType: 'wedding' | 'session'
  resourceId: string
}

/** Compact DTOs — never full Wedding / note / contract bodies. */

export type AssistantWeddingCardDto = {
  id: string
  displayName: string
  date: string | null
  locationLine: string | null
  packageName?: string | null
  /** Identity-only couple names for participant context (never addresses). */
  partner1?: string | null
  partner2?: string | null
  nextActionTitle?: string | null
  nextActionDestination?: string | null
}

export type AssistantSessionCardDto = {
  id: string
  displayName: string
  date: string | null
  timeLine: string | null
  locationLine: string | null
}

export type AssistantPlaceRoleDto = {
  /** Canonical wedding_places roles — bride/groom prep are not collapsed. */
  role:
    | 'bride_preparation'
    | 'groom_preparation'
    | 'ceremony'
    | 'reception'
    /** @deprecated legacy collapsed slot — executor maps away */
    | 'preparations'
  label: string
  name: string | null
  address: string | null
  time: string | null
  participantKey?: 'p1' | 'p2' | null
}

export type AssistantDayStopDto = {
  key: string
  title: string
  time: string | null
  placeName: string | null
  address: string | null
  /** Canonical place role when stop is a wedding_place. */
  role?: string | null
}

export type AssistantFinanceDto = {
  weddingId: string
  displayName: string
  date?: string | null
  contractValue: number
  totalPaid: number
  remainingToPay: number
  agreedDeposit: number
  currency: string
}

export type AssistantTaskDto = {
  id: string
  title: string
  dueDate: string
  completed: boolean
  weddingId: string | null
  weddingDisplayName: string | null
}

export type AssistantScheduleItemDto = {
  kind: 'wedding' | 'session'
  id: string
  displayName: string
  timeLine: string | null
  locationLine: string | null
}

export type AssistantChoiceItemDto = {
  id: string
  kind: 'wedding' | 'session'
  title: string
  subtitle: string | null
  /** Optional secondary line (e.g. location). */
  meta?: string | null
}

export type AssistantDuplicateHintDto = {
  weddingId: string
  displayName: string
  weddingDate: string | null
  reasons: string[]
}

export type PreparedCreateWeddingDto = {
  partner1: string
  partner2: string
  date: string
  displayLabel: string
  dateLabel: string
  duplicates: AssistantDuplicateHintDto[]
  needsYearChoice?: boolean
  yearOptions?: string[]
}

export type PreparedCreateTaskDto = {
  title: string
  dueDate: string | null
  dueDateLabel: string | null
  weddingId: string | null
  weddingDisplayName: string | null
}

export type AssistantNavigateAction = {
  path: string
  label?: string
}

/** Shared semantic request — local parser and Edge LLM both produce this. */
export type WeddingResolver = {
  personQuery: string | null
  dateHint: string | null
  weddingId?: string | null
}

export type SessionResolver = {
  personQuery: string | null
  sessionId?: string | null
}

export type PlaceRoleFilter =
  | 'preparations'
  | 'bride_preparation'
  | 'groom_preparation'
  | 'ceremony'
  | 'reception'
  | 'all'

/** Host-provided candidate key — never a free-form CRM UUID from the model. */
export type AssistantParticipantKeyRef = 'p1' | 'p2'

export type AssistantSemanticRequest =
  | {
      kind: 'wedding_finances'
      resolver: WeddingResolver
      financeAspect?: 'remaining' | 'paid' | 'contract_value' | 'overview'
    }
  | {
      kind: 'wedding_places'
      resolver: WeddingResolver
      requestedRole: PlaceRoleFilter
      /** Model-selected candidate from host-provided participant list. */
      participantKey?: AssistantParticipantKeyRef | null
      /** Authoritative role language when model maps pan młody / panna młoda. */
      participantRole?: 'bride' | 'groom' | null
    }
  | {
      kind: 'wedding_day_plan'
      resolver: WeddingResolver
      focus?: 'ceremony' | 'preparations' | 'full' | 'earliest'
      participantKey?: AssistantParticipantKeyRef | null
      participantRole?: 'bride' | 'groom' | null
    }
  | { kind: 'wedding_tasks'; resolver: WeddingResolver }
  | { kind: 'wedding_next_action'; resolver: WeddingResolver }
  | { kind: 'open_wedding'; resolver: WeddingResolver }
  | { kind: 'open_session'; resolver: SessionResolver }
  | { kind: 'open_resource'; resolver: WeddingResolver }
  | { kind: 'schedule'; datePhrase: string }
  | {
      kind: 'prepare_create_wedding'
      partner1: string
      partner2: string
      date: string
    }
  | {
      kind: 'prepare_create_task'
      title: string
      duePhrase: string | null
      weddingQuery: string | null
      weddingId?: string | null
    }
  | {
      /** @deprecated Prefer kind: query_plan via AssistantDomainRequest. Kept for Edge transition. */
      kind: 'aggregate'
      metric: 'count' | 'contract_value' | 'count_and_value'
      scope: 'weddings' | 'sessions' | 'assignments'
      datePhrase: string
    }
  | { kind: 'unsupported' }
  | { kind: 'unrecognized' }

/** V2 domain request — Edge interpretation output. */
export type AssistantClarificationOption = {
  id: string
  label: string
  /** Resume as QueryPlan when chosen. */
  plan?: import('./api/queryPlanSchema').AssistantQueryPlan | null
  /** Or resume as direct semantic. */
  semantic?: AssistantSemanticRequest | null
  /** Structured slot patch — preferred over re-parsing label. */
  semanticPatch?: {
    participantKey?: 'p1' | 'p2' | null
    participantRole?: 'bride' | 'groom' | null
    weddingId?: string | null
    sessionId?: string | null
    placeScope?: PlaceRoleFilter | null
    datePhrase?: string | null
    financeAspect?: 'remaining' | 'paid' | 'contract_value' | 'overview' | null
  } | null
}

export type AssistantDomainRequest =
  | {
      kind: 'direct'
      semantic: AssistantSemanticRequest
    }
  | {
      kind: 'query_plan'
      plan: import('./api/queryPlanSchema').AssistantQueryPlan
    }
  | {
      kind: 'plan'
      goal: string
      steps: Array<{
        id: string
        capability: string
        input: Record<string, unknown>
        dependsOn?: string[]
      }>
    }
  | {
      kind: 'clarification'
      question: string
      options?: AssistantClarificationOption[]
    }
  | {
      kind: 'unsupported'
      reason?: 'data_not_tracked' | 'capability' | 'write' | 'missing_data'
      message?: string
    }

export type AssistantCollectionItemDto = {
  kind: 'wedding' | 'session'
  id: string
  displayName: string
  date: string | null
  meta?: string | null
  contractValue?: number
  remainingAmount?: number
}

export type AssistantResponse =
  | { kind: 'text'; message: string }
  | {
      kind: 'wedding'
      wedding: AssistantWeddingCardDto
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'session'
      session: AssistantSessionCardDto
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'places'
      wedding: AssistantWeddingCardDto
      places: AssistantPlaceRoleDto[]
      /** When set and not 'all', UI shows only filtered places (never expands). */
      focusRole?: PlaceRoleFilter
      emptyMessage?: string
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'day_plan'
      wedding: AssistantWeddingCardDto
      stops: AssistantDayStopDto[]
      focus?: 'ceremony' | 'preparations' | 'full' | 'earliest'
      emptyMessage?: string
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'finance'
      finance: AssistantFinanceDto
      financeAspect?: 'remaining' | 'paid' | 'contract_value' | 'overview'
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'schedule'
      date: string
      dateLabel: string
      items: AssistantScheduleItemDto[]
    }
  | {
      kind: 'tasks'
      tasks: AssistantTaskDto[]
      wedding?: AssistantWeddingCardDto | null
      emptyMessage?: string
    }
  | {
      kind: 'next_action'
      wedding: AssistantWeddingCardDto
      title: string
      description?: string | null
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'aggregate'
      metric: 'count' | 'contract_value' | 'count_and_value'
      scope: 'weddings' | 'sessions' | 'assignments'
      titleLabel: string
      rangeLabel: string
      from: string
      to: string
      count: number
      /** Present when metric includes contract value (weddings only). */
      totalContractValue?: number | null
      currency?: string
      unitLabel: string
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'scalar'
      metric: 'count'
      value: number
      unitLabel: string
      titleLabel: string
      rangeLabel?: string | null
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'money'
      metric: 'sum' | 'min' | 'max'
      field: 'contractValue' | 'paidAmount' | 'remainingAmount' | 'date'
      value: number
      currency: string
      titleLabel: string
      subtitle: string
      count?: number
      unitLabel?: string
      rangeLabel?: string | null
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'collection'
      resource: 'weddings' | 'sessions' | 'assignments'
      titleLabel: string
      rangeLabel?: string | null
      resultCount: number
      shownCount: number
      items: AssistantCollectionItemDto[]
      truncated: boolean
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'clarification'
      question: string
      options: AssistantClarificationOption[]
    }
  | {
      kind: 'choice'
      prompt: string
      items: AssistantChoiceItemDto[]
      /** @deprecated Prefer pendingSemantic */
      pendingQuery?: string | null
      /** Survives disambiguation — selection continues THIS intent. */
      pendingSemantic?: AssistantSemanticRequest | null
    }
  | {
      kind: 'confirmation'
      action: 'create_wedding'
      prepared: PreparedCreateWeddingDto
    }
  | {
      kind: 'confirmation'
      action: 'create_task'
      prepared: PreparedCreateTaskDto
    }
  | {
      kind: 'success'
      message: string
      title: string
      subtitle?: string | null
      navigate?: AssistantNavigateAction
    }
  | {
      kind: 'route_distance'
      message: string
      distanceKm: number
      durationMinutes?: number | null
      destinationLabel: string
      fromStudio?: boolean
      provenance?: string[]
    }
  | { kind: 'error'; message: string }
  | { kind: 'unsupported'; message: string }

export type AssistantToolCallRequest = {
  id: string
  name: AssistantToolName
  args: Record<string, unknown>
}

export type AssistantToolResultPayload = {
  id: string
  name: AssistantToolName
  ok: boolean
  /** Bounded structured data only — treated as untrusted content by the model. */
  data: unknown
  error?: string
}

export type AssistantEdgeRequest = {
  /** Current user utterance (preferred). */
  utterance?: string
  /** Bounded prior user phrases only — no CRM payloads. */
  recentUtterances?: string[]
  pageContext?: PageContextHint | null
  sessionContext?: { weddingId?: string | null } | null
  /** V2 ephemeral semantic working context — no CRM rows. */
  workingContext?: Record<string, unknown> | null
  /** @deprecated Legacy hybrid tool loop — unused by semantic Edge. */
  messages?: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>
  /** @deprecated */
  toolResults?: AssistantToolResultPayload[]
  /** @deprecated */
  continuation?: unknown
}

export type AssistantEdgeResponse =
  | {
      status: 'semantic'
      request: AssistantSemanticRequest
      diagnostics?: {
        durationMs?: number
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
    }
  | {
      status: 'domain'
      request: AssistantDomainRequest
      diagnostics?: {
        durationMs?: number
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
    }
  | { status: 'final'; response: AssistantResponse }
  | {
      status: 'needs_tools'
      toolCalls: AssistantToolCallRequest[]
      continuation?: unknown
    }
  | { status: 'error'; message: string; code?: string }
