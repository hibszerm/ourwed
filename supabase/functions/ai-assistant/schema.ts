/**
 * Strict JSON Schema for OpenAI structured output → AssistantDomainRequest.
 * Keep in sync with client validateDomain / queryPlanSchema.
 */

export const ASSISTANT_SEMANTIC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'domainKind',
    'kind',
    'personQuery',
    'dateHint',
    'weddingId',
    'sessionId',
    'requestedRole',
    'participantKey',
    'participantRole',
    'focus',
    'datePhrase',
    'partner1',
    'partner2',
    'date',
    'title',
    'duePhrase',
    'weddingQuery',
    'financeAspect',
    'aggregateMetric',
    'aggregateScope',
    'qpResource',
    'qpOperation',
    'qpField',
    'qpDatePhrase',
    'qpFrom',
    'qpTo',
    'qpUseActiveCollection',
    'qpPersonQuery',
    'qpLocationQuery',
    'qpPackageQuery',
    'qpWorkflowStage',
    'qpPaymentState',
    'qpRemainingOperator',
    'qpRemainingValue',
    'qpSortField',
    'qpSortDirection',
    'qpLimit',
    'qpTarget',
    'clarifyQuestion',
    'clarifyOption1Id',
    'clarifyOption1Label',
    'clarifyOption1QpOperation',
    'clarifyOption1QpField',
    'clarifyOption2Id',
    'clarifyOption2Label',
    'clarifyOption2QpOperation',
    'clarifyOption2QpField',
    'clarifySlot',
    'clarifyOption1ResumeKind',
    'clarifyOption1ParticipantKey',
    'clarifyOption1DatePhrase',
    'clarifyOption1RequestedRole',
    'clarifyOption2ResumeKind',
    'clarifyOption2ParticipantKey',
    'clarifyOption2DatePhrase',
    'clarifyOption2RequestedRole',
    'unsupportedReason',
    'unsupportedMessage',
    'planGoal',
    'steps',
  ],
  properties: {
    domainKind: {
      type: 'string',
      enum: ['direct', 'query_plan', 'clarification', 'unsupported', 'plan'],
    },
    kind: {
      type: ['string', 'null'],
      enum: [
        'wedding_finances',
        'wedding_places',
        'wedding_day_plan',
        'wedding_tasks',
        'wedding_next_action',
        'open_wedding',
        'open_session',
        'open_resource',
        'schedule',
        'prepare_create_wedding',
        'prepare_create_task',
        'aggregate',
        'unsupported',
        'unrecognized',
        null,
      ],
    },
    personQuery: { type: ['string', 'null'] },
    dateHint: { type: ['string', 'null'] },
    weddingId: { type: ['string', 'null'] },
    sessionId: { type: ['string', 'null'] },
    requestedRole: {
      type: ['string', 'null'],
      enum: [
        'preparations',
        'bride_preparation',
        'groom_preparation',
        'ceremony',
        'reception',
        'all',
        null,
      ],
    },
    participantKey: {
      type: ['string', 'null'],
      enum: ['p1', 'p2', null],
    },
    participantRole: {
      type: ['string', 'null'],
      enum: ['bride', 'groom', null],
    },
    focus: {
      type: ['string', 'null'],
      enum: ['ceremony', 'preparations', 'full', 'earliest', null],
    },
    datePhrase: { type: ['string', 'null'] },
    partner1: { type: ['string', 'null'] },
    partner2: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    title: { type: ['string', 'null'] },
    duePhrase: { type: ['string', 'null'] },
    weddingQuery: { type: ['string', 'null'] },
    financeAspect: {
      type: ['string', 'null'],
      enum: ['remaining', 'paid', 'contract_value', 'overview', null],
    },
    aggregateMetric: {
      type: ['string', 'null'],
      enum: ['count', 'contract_value', 'count_and_value', null],
    },
    aggregateScope: {
      type: ['string', 'null'],
      enum: ['weddings', 'sessions', 'assignments', null],
    },
    qpResource: {
      type: ['string', 'null'],
      enum: ['weddings', 'sessions', 'assignments', null],
    },
    qpOperation: {
      type: ['string', 'null'],
      enum: ['count', 'sum', 'min', 'max', 'list', null],
    },
    qpField: {
      type: ['string', 'null'],
      enum: ['contractValue', 'paidAmount', 'remainingAmount', 'date', null],
    },
    qpDatePhrase: { type: ['string', 'null'] },
    qpFrom: { type: ['string', 'null'] },
    qpTo: { type: ['string', 'null'] },
    qpUseActiveCollection: { type: ['boolean', 'null'] },
    qpPersonQuery: { type: ['string', 'null'] },
    qpLocationQuery: { type: ['string', 'null'] },
    qpPackageQuery: { type: ['string', 'null'] },
    qpWorkflowStage: { type: ['string', 'null'] },
    qpPaymentState: {
      type: ['string', 'null'],
      enum: ['unpaid', 'partial', 'paid', 'deposit_missing', null],
    },
    qpRemainingOperator: {
      type: ['string', 'null'],
      enum: ['gt', 'gte', 'lt', 'lte', null],
    },
    qpRemainingValue: { type: ['number', 'null'] },
    qpSortField: {
      type: ['string', 'null'],
      enum: ['contractValue', 'paidAmount', 'remainingAmount', 'date', null],
    },
    qpSortDirection: {
      type: ['string', 'null'],
      enum: ['asc', 'desc', null],
    },
    qpLimit: { type: ['number', 'null'] },
    qpTarget: {
      type: ['string', 'null'],
      enum: ['active_collection', 'active_resource', 'explicit', null],
    },
    clarifyQuestion: { type: ['string', 'null'] },
    clarifyOption1Id: { type: ['string', 'null'] },
    clarifyOption1Label: { type: ['string', 'null'] },
    clarifyOption1QpOperation: {
      type: ['string', 'null'],
      enum: ['count', 'sum', 'min', 'max', 'list', null],
    },
    clarifyOption1QpField: {
      type: ['string', 'null'],
      enum: ['contractValue', 'paidAmount', 'remainingAmount', 'date', null],
    },
    clarifyOption2Id: { type: ['string', 'null'] },
    clarifyOption2Label: { type: ['string', 'null'] },
    clarifyOption2QpOperation: {
      type: ['string', 'null'],
      enum: ['count', 'sum', 'min', 'max', 'list', null],
    },
    clarifyOption2QpField: {
      type: ['string', 'null'],
      enum: ['contractValue', 'paidAmount', 'remainingAmount', 'date', null],
    },
    clarifySlot: {
      type: ['string', 'null'],
      enum: [
        'participant',
        'resource',
        'assignment',
        'placeScope',
        'date',
        'financeAspect',
        'entity_type',
        'other',
        null,
      ],
    },
    clarifyOption1ResumeKind: {
      type: ['string', 'null'],
      enum: [
        'schedule',
        'wedding_places',
        'wedding_day_plan',
        'wedding_finances',
        'open_wedding',
        null,
      ],
    },
    clarifyOption1ParticipantKey: {
      type: ['string', 'null'],
      enum: ['p1', 'p2', null],
    },
    clarifyOption1DatePhrase: { type: ['string', 'null'] },
    clarifyOption1RequestedRole: {
      type: ['string', 'null'],
      enum: [
        'preparations',
        'bride_preparation',
        'groom_preparation',
        'ceremony',
        'reception',
        'all',
        null,
      ],
    },
    clarifyOption2ResumeKind: {
      type: ['string', 'null'],
      enum: [
        'schedule',
        'wedding_places',
        'wedding_day_plan',
        'wedding_finances',
        'open_wedding',
        null,
      ],
    },
    clarifyOption2ParticipantKey: {
      type: ['string', 'null'],
      enum: ['p1', 'p2', null],
    },
    clarifyOption2DatePhrase: { type: ['string', 'null'] },
    clarifyOption2RequestedRole: {
      type: ['string', 'null'],
      enum: [
        'preparations',
        'bride_preparation',
        'groom_preparation',
        'ceremony',
        'reception',
        'all',
        null,
      ],
    },
    unsupportedReason: {
      type: ['string', 'null'],
      enum: ['data_not_tracked', 'capability', 'write', 'missing_data', null],
    },
    unsupportedMessage: { type: ['string', 'null'] },
    planGoal: { type: ['string', 'null'] },
    steps: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'capability',
          'personQuery',
          'dateHint',
          'scope',
          'participantKey',
          'participantRole',
          'focus',
          'financeAspect',
          'originKind',
          'destinationRole',
          'fromStage',
          'title',
          'duePhrase',
          'partner1',
          'partner2',
          'date',
          'weddingQuery',
          'qpResource',
          'qpOperation',
          'qpField',
          'qpDatePhrase',
          'qpUseActiveCollection',
          'dependsOn',
        ],
        properties: {
          id: { type: 'string' },
          capability: {
            type: 'string',
            enum: [
              'search_weddings',
              'get_wedding_context',
              'get_wedding_participants',
              'get_wedding_places',
              'get_wedding_day_plan',
              'get_next_day_plan_stage',
              'get_wedding_finances',
              'get_wedding_tasks',
              'get_wedding_next_action',
              'collection_query',
              'calculate_route',
              'get_schedule',
              'search_sessions',
              'prepare_create_wedding',
              'prepare_create_task',
            ],
          },
          personQuery: { type: ['string', 'null'] },
          dateHint: { type: ['string', 'null'] },
          scope: {
            type: ['string', 'null'],
            enum: [
              'preparations',
              'bride_preparation',
              'groom_preparation',
              'ceremony',
              'reception',
              'all',
              null,
            ],
          },
          participantKey: {
            type: ['string', 'null'],
            enum: ['p1', 'p2', null],
          },
          participantRole: {
            type: ['string', 'null'],
            enum: ['bride', 'groom', null],
          },
          focus: {
            type: ['string', 'null'],
            enum: ['ceremony', 'preparations', 'full', 'earliest', null],
          },
          financeAspect: {
            type: ['string', 'null'],
            enum: ['remaining', 'paid', 'contract_value', 'overview', null],
          },
          originKind: {
            type: ['string', 'null'],
            enum: ['studio_start', null],
          },
          destinationRole: {
            type: ['string', 'null'],
            enum: [
              'bride_preparation',
              'groom_preparation',
              'ceremony',
              'reception',
              null,
            ],
          },
          fromStage: {
            type: ['string', 'null'],
            enum: [
              'preparations',
              'bride_preparation',
              'groom_preparation',
              'ceremony',
              'reception',
              null,
            ],
          },
          title: { type: ['string', 'null'] },
          duePhrase: { type: ['string', 'null'] },
          partner1: { type: ['string', 'null'] },
          partner2: { type: ['string', 'null'] },
          date: { type: ['string', 'null'] },
          weddingQuery: { type: ['string', 'null'] },
          qpResource: {
            type: ['string', 'null'],
            enum: ['weddings', 'sessions', 'assignments', null],
          },
          qpOperation: {
            type: ['string', 'null'],
            enum: ['count', 'sum', 'min', 'max', 'list', null],
          },
          qpField: {
            type: ['string', 'null'],
            enum: [
              'contractValue',
              'paidAmount',
              'remainingAmount',
              'date',
              null,
            ],
          },
          qpDatePhrase: { type: ['string', 'null'] },
          qpUseActiveCollection: { type: ['boolean', 'null'] },
          dependsOn: {
            type: ['string', 'null'],
          },
        },
      },
    },
  },
} as const

function asNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

function stripIdentity(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^(userId|ownerId|tenantId|user_id|owner_id|tenant_id)$/i.test(k)) {
      continue
    }
    out[k] = v
  }
  return out
}

function buildQueryPlanFromFlat(row: Record<string, unknown>): Record<string, unknown> | null {
  const resource = asNullableString(row.qpResource)
  const operation = asNullableString(row.qpOperation)
  if (!resource || !operation) return null

  const field = asNullableString(row.qpField)
  const datePhrase = asNullableString(row.qpDatePhrase)
  const from = asNullableString(row.qpFrom)
  const to = asNullableString(row.qpTo)
  const filters: Record<string, unknown> = {}

  if (from && to) filters.dateRange = { from, to }
  else if (datePhrase) filters.dateRange = { phrase: datePhrase }

  if (row.qpUseActiveCollection === true) filters.useActiveCollection = true
  const person = asNullableString(row.qpPersonQuery)
  if (person) filters.personQuery = person
  const loc = asNullableString(row.qpLocationQuery)
  if (loc) filters.locationQuery = loc
  const pkg = asNullableString(row.qpPackageQuery)
  if (pkg) filters.packageQuery = pkg
  const stage = asNullableString(row.qpWorkflowStage)
  if (stage) filters.workflowStage = stage
  const pay = asNullableString(row.qpPaymentState)
  if (pay) filters.paymentState = pay
  const remOp = asNullableString(row.qpRemainingOperator)
  const remVal = row.qpRemainingValue
  if (remOp && typeof remVal === 'number') {
    filters.remainingAmount = { operator: remOp, value: remVal }
  }

  const plan: Record<string, unknown> = {
    kind: 'query_plan',
    resource,
    operation,
  }
  if (field) plan.field = field
  if (Object.keys(filters).length) plan.filters = filters

  const sortField = asNullableString(row.qpSortField)
  const sortDir = asNullableString(row.qpSortDirection)
  if (sortField) {
    plan.sort = { field: sortField, direction: sortDir === 'asc' ? 'asc' : 'desc' }
  }
  if (typeof row.qpLimit === 'number') plan.limit = row.qpLimit
  const target = asNullableString(row.qpTarget)
  if (target) plan.target = target

  return plan
}

/**
 * Map flat model output → AssistantDomainRequest-shaped object.
 */
export function parseFlatSemanticPayload(
  raw: unknown,
): Record<string, unknown> | null {
  const cleaned = stripIdentity(raw)
  if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) {
    return null
  }
  const row = cleaned as Record<string, unknown>
  const domainKind = asNullableString(row.domainKind) ?? 'direct'

  if (domainKind === 'unsupported') {
    return {
      kind: 'unsupported',
      reason: asNullableString(row.unsupportedReason) ?? 'capability',
      message: asNullableString(row.unsupportedMessage) ?? undefined,
    }
  }

  if (domainKind === 'clarification') {
    const question = asNullableString(row.clarifyQuestion)
    if (!question) return null
    const options: Array<Record<string, unknown>> = []
    const clarifyResource =
      asNullableString(row.qpResource) ?? 'weddings'

    const buildOption = (
      id: string | null,
      label: string | null,
      qpOp: string | null,
      qpField: string | null,
      resumeKind: string | null,
      participantKey: string | null,
      datePhrase: string | null,
      requestedRole: string | null,
    ) => {
      if (!id || !label) return
      const op = qpOp
      const field = qpField
      const plan =
        op
          ? {
              kind: 'query_plan',
              resource: clarifyResource,
              operation: op,
              ...(field ? { field } : {}),
              filters: {
                useActiveCollection: true,
                ...(asNullableString(row.qpDatePhrase)
                  ? { dateRange: { phrase: asNullableString(row.qpDatePhrase) } }
                  : {}),
              },
            }
          : null
      let semantic: Record<string, unknown> | null = null
      const pk =
        participantKey === 'p1' || participantKey === 'p2'
          ? participantKey
          : null
      if (resumeKind === 'schedule') {
        semantic = {
          kind: 'schedule',
          datePhrase: datePhrase || asNullableString(row.datePhrase) || 'dziś',
        }
      } else if (resumeKind === 'wedding_places') {
        const role =
          requestedRole === 'preparations' ||
          requestedRole === 'bride_preparation' ||
          requestedRole === 'groom_preparation' ||
          requestedRole === 'ceremony' ||
          requestedRole === 'reception' ||
          requestedRole === 'all'
            ? requestedRole
            : 'preparations'
        semantic = {
          kind: 'wedding_places',
          resolver: {
            personQuery: null,
            dateHint: null,
            weddingId: null,
          },
          requestedRole: role,
          participantKey: pk,
          participantRole: null,
        }
      } else if (resumeKind === 'wedding_day_plan') {
        semantic = {
          kind: 'wedding_day_plan',
          resolver: { personQuery: null, dateHint: null, weddingId: null },
          focus: 'earliest',
          participantKey: pk,
          participantRole: null,
        }
      } else if (resumeKind === 'wedding_finances') {
        semantic = {
          kind: 'wedding_finances',
          resolver: { personQuery: null, dateHint: null, weddingId: null },
          financeAspect: 'remaining',
        }
      } else if (resumeKind === 'open_wedding') {
        semantic = {
          kind: 'open_wedding',
          resolver: { personQuery: null, dateHint: null, weddingId: null },
        }
      }
      const semanticPatch =
        pk || datePhrase || requestedRole
          ? {
              participantKey: pk,
              datePhrase: datePhrase,
              placeScope: requestedRole,
            }
          : null
      // Prefer resume fields; label-only still allowed for now but participant
      // clarifications should set clarifyOptionNParticipantKey or resumeKind.
      const clarifySlot = asNullableString(row.clarifySlot)
      if (
        clarifySlot === 'participant' &&
        !resumeKind &&
        !pk &&
        !plan
      ) {
        // Keep option for client-side regeneration, but mark as thin.
        options.push({
          id,
          label,
          plan: null,
          semantic: null,
          semanticPatch: null,
        })
        return
      }
      options.push({
        id,
        label,
        plan,
        semantic,
        semanticPatch,
      })
    }

    buildOption(
      asNullableString(row.clarifyOption1Id),
      asNullableString(row.clarifyOption1Label),
      asNullableString(row.clarifyOption1QpOperation),
      asNullableString(row.clarifyOption1QpField),
      asNullableString(row.clarifyOption1ResumeKind),
      asNullableString(row.clarifyOption1ParticipantKey),
      asNullableString(row.clarifyOption1DatePhrase),
      asNullableString(row.clarifyOption1RequestedRole),
    )
    buildOption(
      asNullableString(row.clarifyOption2Id),
      asNullableString(row.clarifyOption2Label),
      asNullableString(row.clarifyOption2QpOperation),
      asNullableString(row.clarifyOption2QpField),
      asNullableString(row.clarifyOption2ResumeKind),
      asNullableString(row.clarifyOption2ParticipantKey),
      asNullableString(row.clarifyOption2DatePhrase),
      asNullableString(row.clarifyOption2RequestedRole),
    )
    return {
      kind: 'clarification',
      question,
      options,
      slot: asNullableString(row.clarifySlot) ?? undefined,
    }
  }

  if (domainKind === 'query_plan') {
    const plan = buildQueryPlanFromFlat(row)
    if (!plan) return null
    return { kind: 'query_plan', plan }
  }

  if (domainKind === 'plan') {
    const goal = asNullableString(row.planGoal) ?? ''
    const stepsRaw = Array.isArray(row.steps) ? row.steps : []
    if (stepsRaw.length === 0 || stepsRaw.length > 5) return null
    const steps: Array<Record<string, unknown>> = []
    for (const item of stepsRaw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const s = item as Record<string, unknown>
      const id = asNullableString(s.id)
      const capability = asNullableString(s.capability)
      if (!id || !capability) return null
      const input: Record<string, unknown> = {}
      const personQuery = asNullableString(s.personQuery)
      const dateHint = asNullableString(s.dateHint)
      const scope = asNullableString(s.scope)
      const participantKey = asNullableString(s.participantKey)
      const participantRole = asNullableString(s.participantRole)
      const focus = asNullableString(s.focus)
      const financeAspect = asNullableString(s.financeAspect)
      const originKind = asNullableString(s.originKind)
      const destinationRole = asNullableString(s.destinationRole)
      const fromStage = asNullableString(s.fromStage)
      const title = asNullableString(s.title)
      const duePhrase = asNullableString(s.duePhrase)
      const partner1 = asNullableString(s.partner1)
      const partner2 = asNullableString(s.partner2)
      const date = asNullableString(s.date)
      const weddingQuery = asNullableString(s.weddingQuery)
      if (personQuery) input.personQuery = personQuery
      if (dateHint) input.dateHint = dateHint
      if (scope) {
        input.scope = scope
        input.requestedRole = scope
      }
      if (participantKey) input.participantKey = participantKey
      if (participantRole) input.participantRole = participantRole
      if (focus) input.focus = focus
      if (financeAspect) input.financeAspect = financeAspect
      if (originKind) input.originKind = originKind
      if (destinationRole) input.destinationRole = destinationRole
      if (fromStage) input.fromStage = fromStage
      if (title) input.title = title
      if (duePhrase) input.duePhrase = duePhrase
      if (partner1) input.partner1 = partner1
      if (partner2) input.partner2 = partner2
      if (date) input.date = date
      if (weddingQuery) input.weddingQuery = weddingQuery

      const qpResource = asNullableString(s.qpResource)
      const qpOperation = asNullableString(s.qpOperation)
      if (capability === 'collection_query' && qpResource && qpOperation) {
        const qp: Record<string, unknown> = {
          kind: 'query_plan',
          resource: qpResource,
          operation: qpOperation,
        }
        const qpField = asNullableString(s.qpField)
        if (qpField) qp.field = qpField
        const filters: Record<string, unknown> = {}
        const qpDatePhrase = asNullableString(s.qpDatePhrase)
        if (qpDatePhrase) filters.dateRange = { phrase: qpDatePhrase }
        if (s.qpUseActiveCollection === true) filters.useActiveCollection = true
        if (Object.keys(filters).length) qp.filters = filters
        input.plan = qp
      }

      const dependsOnRaw = asNullableString(s.dependsOn)
      const step: Record<string, unknown> = { id, capability, input }
      if (dependsOnRaw) step.dependsOn = [dependsOnRaw]
      steps.push(step)
    }
    return { kind: 'plan', goal, steps }
  }

  // direct — map legacy semantic kinds (including deprecated aggregate → query_plan)
  const kind = asNullableString(row.kind)
  if (!kind) return null

  if (kind === 'aggregate') {
    const metric = asNullableString(row.aggregateMetric) ?? 'count'
    const scope = asNullableString(row.aggregateScope) ?? 'weddings'
    const datePhrase =
      asNullableString(row.datePhrase) ?? asNullableString(row.qpDatePhrase)
    if (!datePhrase) return null
    if (metric === 'count') {
      return {
        kind: 'query_plan',
        plan: {
          kind: 'query_plan',
          resource: scope,
          operation: 'count',
          filters: { dateRange: { phrase: datePhrase } },
        },
      }
    }
    return {
      kind: 'query_plan',
      plan: {
        kind: 'query_plan',
        resource: 'weddings',
        operation: 'sum',
        field: 'contractValue',
        filters: { dateRange: { phrase: datePhrase } },
      },
    }
  }

  const personQuery = asNullableString(row.personQuery)
  const dateHint = asNullableString(row.dateHint)
  const weddingId = asNullableString(row.weddingId)
  const sessionId = asNullableString(row.sessionId)
  const requestedRole = asNullableString(row.requestedRole)
  const focus = asNullableString(row.focus)
  const datePhrase = asNullableString(row.datePhrase)
  const partner1 = asNullableString(row.partner1)
  const partner2 = asNullableString(row.partner2)
  const date = asNullableString(row.date)
  const title = asNullableString(row.title)
  const duePhrase = asNullableString(row.duePhrase)
  const weddingQuery = asNullableString(row.weddingQuery)
  const financeAspect = asNullableString(row.financeAspect)
  const participantKeyRaw = asNullableString(row.participantKey)
  const participantKey =
    participantKeyRaw === 'p1' || participantKeyRaw === 'p2'
      ? participantKeyRaw
      : null
  const participantRoleRaw = asNullableString(row.participantRole)
  const participantRole =
    participantRoleRaw === 'bride' || participantRoleRaw === 'groom'
      ? participantRoleRaw
      : null

  for (const field of [personQuery, weddingQuery, title, partner1, partner2]) {
    if (field && /ownerId|userId|tenantId/i.test(field)) return null
  }

  let semantic: Record<string, unknown> | null = null
  switch (kind) {
    case 'wedding_finances':
      semantic = {
        kind,
        resolver: { personQuery, dateHint, weddingId },
        ...(financeAspect ? { financeAspect } : {}),
      }
      break
    case 'wedding_places': {
      const role =
        requestedRole === 'preparations' ||
        requestedRole === 'bride_preparation' ||
        requestedRole === 'groom_preparation' ||
        requestedRole === 'ceremony' ||
        requestedRole === 'reception' ||
        requestedRole === 'all'
          ? requestedRole
          : 'all'
      semantic = {
        kind,
        resolver: { personQuery, dateHint, weddingId },
        requestedRole: role,
        participantKey,
        participantRole,
      }
      break
    }
    case 'wedding_day_plan': {
      const f =
        focus === 'ceremony' ||
        focus === 'preparations' ||
        focus === 'full' ||
        focus === 'earliest'
          ? focus
          : 'full'
      semantic = {
        kind,
        resolver: { personQuery, dateHint, weddingId },
        focus: f,
        participantKey,
        participantRole,
      }
      break
    }
    case 'wedding_tasks':
    case 'wedding_next_action':
    case 'open_wedding':
    case 'open_resource':
      semantic = {
        kind,
        resolver: { personQuery, dateHint, weddingId },
      }
      break
    case 'open_session':
      semantic = { kind, resolver: { personQuery, sessionId } }
      break
    case 'schedule': {
      const phrase = datePhrase || date
      if (!phrase) return null
      semantic = { kind, datePhrase: phrase }
      break
    }
    case 'prepare_create_wedding': {
      const d = date || datePhrase
      if (!partner1 || !partner2 || !d) return null
      semantic = { kind, partner1, partner2, date: d }
      break
    }
    case 'prepare_create_task':
      if (!title) return null
      semantic = {
        kind,
        title,
        duePhrase: duePhrase || datePhrase || date,
        weddingQuery: weddingQuery || personQuery,
        weddingId,
      }
      break
    case 'unsupported':
      return { kind: 'unsupported', reason: 'capability' }
    case 'unrecognized':
      return {
        kind: 'unsupported',
        reason: 'capability',
        message: 'Nie udało mi się rozpoznać tego polecenia.',
      }
    default:
      return null
  }

  return { kind: 'direct', semantic }
}
