/**
 * Coarse semantic comparison: V3 domain/semantic → comparable shape vs TaskSpec.
 */

import type { AssistantDomainRequest, AssistantSemanticRequest } from '../types'
import type { AssistantTaskSpec, TaskOperation, TaskSubject } from './taskSpec'

export type CoarseSemantic = {
  opFamily:
    | 'location'
    | 'time'
    | 'amount'
    | 'distance'
    | 'count'
    | 'sum'
    | 'rank'
    | 'list'
    | 'next'
    | 'open'
    | 'write'
    | 'inherit'
    | 'correction'
    | 'unsupported'
    | 'other'
  subject: TaskSubject | null
  hasParticipant: boolean
  temporalPhrase: string | null
  isClarification: boolean
  isPlanNextStage: boolean
  isFullDayPlan: boolean
}

export function taskSpecToCoarse(spec: AssistantTaskSpec): CoarseSemantic {
  const op = spec.op
  let opFamily: CoarseSemantic['opFamily'] = 'other'
  if (op === 'get_location') opFamily = 'location'
  else if (op === 'get_time') opFamily = 'time'
  else if (op === 'get_amount') opFamily = 'amount'
  else if (op === 'get_distance') opFamily = 'distance'
  else if (op === 'count') opFamily = 'count'
  else if (op === 'sum') opFamily = 'sum'
  else if (op === 'rank') opFamily = 'rank'
  else if (op === 'list') opFamily = 'list'
  else if (op === 'get_next') opFamily = 'next'
  else if (op === 'open') opFamily = 'open'
  else if (op === 'prepare_create') opFamily = 'write'
  else if (op === 'inherit') opFamily = 'inherit'
  else if (op === 'correction') opFamily = 'correction'
  else if (op === 'unsupported') opFamily = 'unsupported'
  else if (op === 'get') {
    if (spec.subject === 'route') opFamily = 'distance'
    else if (
      spec.subject === 'remaining' ||
      spec.subject === 'paid' ||
      spec.subject === 'payment'
    )
      opFamily = 'amount'
    else if (spec.subject === 'ceremony' || spec.subject === 'schedule')
      opFamily = 'time'
    else opFamily = 'location'
  }

  return {
    opFamily,
    subject: spec.subject,
    hasParticipant:
      spec.participant?.kind === 'explicit' ||
      spec.participant?.kind === 'active_participant',
    temporalPhrase: spec.temporal?.phrase ?? null,
    isClarification: false,
    isPlanNextStage: op === 'get_next',
    isFullDayPlan: spec.subject === 'day_plan' && op === 'get',
  }
}

export function v3DomainToCoarse(
  domain: AssistantDomainRequest | null | undefined,
): CoarseSemantic | null {
  if (!domain) return null
  if (domain.kind === 'clarification') {
    return {
      opFamily: 'other',
      subject: null,
      hasParticipant: false,
      temporalPhrase: null,
      isClarification: true,
      isPlanNextStage: false,
      isFullDayPlan: false,
    }
  }
  if (domain.kind === 'unsupported') {
    return {
      opFamily: 'unsupported',
      subject: null,
      hasParticipant: false,
      temporalPhrase: null,
      isClarification: false,
      isPlanNextStage: false,
      isFullDayPlan: false,
    }
  }
  if (domain.kind === 'query_plan') {
    const op = domain.plan.operation
    return {
      opFamily:
        op === 'count'
          ? 'count'
          : op === 'sum'
            ? 'sum'
            : op === 'min' || op === 'max'
              ? 'rank'
              : 'list',
      subject:
        domain.plan.field === 'remainingAmount'
          ? 'remaining'
          : domain.plan.field === 'paidAmount'
            ? 'paid'
            : domain.plan.field === 'contractValue'
              ? 'contract_value'
              : 'wedding',
      hasParticipant: Boolean(domain.plan.filters?.personQuery),
      temporalPhrase:
        domain.plan.filters?.dateRange &&
        'phrase' in domain.plan.filters.dateRange
          ? domain.plan.filters.dateRange.phrase
          : null,
      isClarification: false,
      isPlanNextStage: false,
      isFullDayPlan: false,
    }
  }
  if (domain.kind === 'plan') {
    const caps = domain.steps.map((s) => s.capability)
    const next = caps.includes('get_next_day_plan_stage')
    const route = caps.includes('calculate_route')
    const schedule = caps.includes('get_schedule')
    const dayPlan = caps.includes('get_wedding_day_plan')
    const places = caps.includes('get_wedding_places')
    const finances = caps.includes('get_wedding_finances')
    return {
      opFamily: next
        ? 'next'
        : route
          ? 'distance'
          : finances
            ? 'amount'
            : schedule
              ? 'location'
              : places
                ? 'location'
                : dayPlan
                  ? 'other'
                  : 'other',
      subject: next
        ? 'day_plan'
        : route
          ? 'route'
          : finances
            ? 'payment'
            : schedule
              ? 'assignment'
              : places
                ? 'preparations'
                : dayPlan
                  ? 'day_plan'
                  : null,
      hasParticipant: domain.steps.some(
        (s) =>
          s.input?.participantKey === 'p1' ||
          s.input?.participantKey === 'p2' ||
          typeof s.input?.personQuery === 'string',
      ),
      temporalPhrase: null,
      isClarification: false,
      isPlanNextStage: next,
      isFullDayPlan: dayPlan && !next,
    }
  }
  if (domain.kind === 'direct') {
    return semanticToCoarse(domain.semantic)
  }
  return null
}

function semanticToCoarse(s: AssistantSemanticRequest): CoarseSemantic {
  switch (s.kind) {
    case 'schedule':
      return {
        opFamily: 'location',
        subject: 'assignment',
        hasParticipant: false,
        temporalPhrase: s.datePhrase,
        isClarification: false,
        isPlanNextStage: false,
        isFullDayPlan: false,
      }
    case 'wedding_places': {
      const role = s.requestedRole
      const subject: TaskSubject =
        role === 'ceremony'
          ? 'ceremony'
          : role === 'reception'
            ? 'reception'
            : role === 'preparations' ||
                role === 'bride_preparation' ||
                role === 'groom_preparation'
              ? 'preparations'
              : 'wedding'
      return {
        opFamily: 'location',
        subject,
        hasParticipant: Boolean(s.participantKey || s.participantRole || s.resolver.personQuery),
        temporalPhrase: s.resolver.dateHint,
        isClarification: false,
        isPlanNextStage: false,
        isFullDayPlan: false,
      }
    }
    case 'wedding_day_plan': {
      const focus = s.focus
      if (focus === 'ceremony') {
        return {
          opFamily: 'time',
          subject: 'ceremony',
          hasParticipant: Boolean(s.participantKey),
          temporalPhrase: null,
          isClarification: false,
          isPlanNextStage: false,
          isFullDayPlan: false,
        }
      }
      return {
        opFamily: focus === 'earliest' ? 'location' : 'other',
        subject: focus === 'preparations' ? 'preparations' : 'day_plan',
        hasParticipant: Boolean(s.participantKey),
        temporalPhrase: null,
        isClarification: false,
        isPlanNextStage: false,
        isFullDayPlan: focus === 'full' || !focus,
      }
    }
    case 'wedding_finances': {
      const aspect = s.financeAspect
      const subject: TaskSubject =
        aspect === 'remaining'
          ? 'remaining'
          : aspect === 'paid'
            ? 'paid'
            : aspect === 'contract_value'
              ? 'contract_value'
              : 'payment'
      return {
        opFamily: 'amount',
        subject,
        hasParticipant: Boolean(s.resolver.personQuery),
        temporalPhrase: s.resolver.dateHint,
        isClarification: false,
        isPlanNextStage: false,
        isFullDayPlan: false,
      }
    }
    case 'wedding_tasks':
      return {
        opFamily: 'list',
        subject: 'task',
        hasParticipant: false,
        temporalPhrase: null,
        isClarification: false,
        isPlanNextStage: false,
        isFullDayPlan: false,
      }
    case 'wedding_next_action':
      return {
        opFamily: 'other',
        subject: 'next_action',
        hasParticipant: false,
        temporalPhrase: null,
        isClarification: false,
        isPlanNextStage: false,
        isFullDayPlan: false,
      }
    case 'open_wedding':
    case 'open_resource':
    case 'open_session':
      return {
        opFamily: 'open',
        subject: s.kind === 'open_session' ? 'session' : 'wedding',
        hasParticipant: Boolean(
          'personQuery' in s.resolver ? s.resolver.personQuery : null,
        ),
        temporalPhrase: null,
        isClarification: false,
        isPlanNextStage: false,
        isFullDayPlan: false,
      }
    case 'prepare_create_wedding':
    case 'prepare_create_task':
      return {
        opFamily: 'write',
        subject: s.kind === 'prepare_create_task' ? 'task' : 'wedding',
        hasParticipant: false,
        temporalPhrase: 'duePhrase' in s ? s.duePhrase : 'date' in s ? s.date : null,
        isClarification: false,
        isPlanNextStage: false,
        isFullDayPlan: false,
      }
    case 'unsupported':
    case 'unrecognized':
      return {
        opFamily: 'unsupported',
        subject: null,
        hasParticipant: false,
        temporalPhrase: null,
        isClarification: false,
        isPlanNextStage: false,
        isFullDayPlan: false,
      }
    default:
      return {
        opFamily: 'other',
        subject: null,
        hasParticipant: false,
        temporalPhrase: null,
        isClarification: false,
        isPlanNextStage: false,
        isFullDayPlan: false,
      }
  }
}

export type CoarseAgreement = {
  opFamilyAgree: boolean
  subjectAgree: boolean
  participantAgree: boolean
  temporalAgree: boolean
  overallAgree: boolean
}

export function compareCoarse(
  a: CoarseSemantic,
  b: CoarseSemantic,
): CoarseAgreement {
  const opFamilyAgree = a.opFamily === b.opFamily
  const subjectAgree =
    a.subject == null || b.subject == null || a.subject === b.subject
  const participantAgree = a.hasParticipant === b.hasParticipant
  const temporalAgree =
    !a.temporalPhrase ||
    !b.temporalPhrase ||
    a.temporalPhrase.toLowerCase() === b.temporalPhrase.toLowerCase()
  return {
    opFamilyAgree,
    subjectAgree,
    participantAgree,
    temporalAgree,
    overallAgree:
      opFamilyAgree && subjectAgree && participantAgree && temporalAgree,
  }
}

export function opFamilyFromExpected(op: TaskOperation): CoarseSemantic['opFamily'] {
  return taskSpecToCoarse({
    version: 1,
    op,
    subject: null,
    resource: null,
    participant: null,
    temporal: null,
    qualifiers: {
      aspect: null,
      rank: null,
      destination: null,
      titleHint: null,
      unsupportedReason: null,
    },
    correction: null,
    fieldSource: {
      op: 'explicit',
      subject: 'omitted',
      resource: 'omitted',
      participant: 'omitted',
      temporal: 'omitted',
    },
  }).opFamily
}
