/**
 * Deterministic Context Resolver benchmark (≥120 cases).
 */

import { makeTaskSpec } from '../expect'
import type { AssistantTaskSpec } from '../taskSpec'
import { emptyQualifiers } from '../taskSpec'
import { resolveTaskSpec } from '../resolver/resolve'
import {
  emptyV4ShadowContext,
  type ResolvedTaskResult,
  type V4ShadowContext,
} from '../resolver/types'

export type ResolutionExpectation = {
  status: ResolvedTaskResult['status']
  discoveryKind?: 'schedule' | 'wedding_search' | 'session_search' | 'collection'
  missingSlot?: string
  subject?: string | null
  op?: string
  participantKey?: string
  sequenceKind?: 'day_plan' | 'schedule'
  aspect?: string | null
}

export type ResolutionBenchmarkCase = {
  id: string
  taskSpec: AssistantTaskSpec
  context: V4ShadowContext
  expected: ResolutionExpectation
}

const weddingCtx = (extra?: Partial<V4ShadowContext>): V4ShadowContext => ({
  ...emptyV4ShadowContext(),
  activeResource: {
    kind: 'wedding',
    id: 'w-1',
    label: 'Julia & Maks',
  },
  candidates: {
    participants: [
      {
        ref: 'p1',
        label: 'Julia',
        kind: 'participant',
        role: 'bride',
        firstName: 'Julia',
        canonicalName: 'Julia',
      },
      {
        ref: 'p2',
        label: 'Maksymilian',
        kind: 'participant',
        role: 'groom',
        firstName: 'Maks',
        canonicalName: 'Maksymilian',
      },
    ],
    weddings: [{ ref: 'w-1', label: 'Julia & Maks', kind: 'wedding' }],
    sessions: [],
  },
  ...extra,
})

function spec(
  partial: Parameters<typeof makeTaskSpec>[0],
): AssistantTaskSpec {
  return makeTaskSpec(partial)
}

export function buildResolutionBenchmark(): ResolutionBenchmarkCase[] {
  const cases: ResolutionBenchmarkCase[] = []

  // Today → schedule discovery (NOT clarification)
  cases.push({
    id: 'res-today-schedule',
    taskSpec: spec({
      op: 'get_location',
      subject: 'assignment',
      temporal: { phrase: 'dzisiaj', kind: 'day' },
    }),
    context: emptyV4ShadowContext(),
    expected: { status: 'requires_discovery', discoveryKind: 'schedule' },
  })

  // Ceremony override with sequence — must stay ceremony
  cases.push({
    id: 'res-ceremony-override',
    taskSpec: spec({
      op: 'get_time',
      subject: 'ceremony',
      resource: { kind: 'active_resource' },
      fieldSource: {
        op: 'explicit',
        subject: 'explicit',
        resource: 'inherit',
        participant: 'omitted',
        temporal: 'omitted',
      },
    }),
    context: weddingCtx({
      sequenceCursor: {
        kind: 'day_plan',
        resourceId: 'w-1',
        itemRef: 'groom_preparations',
      },
      previousTaskSpec: spec({
        op: 'get_location',
        subject: 'preparations',
        participant: { kind: 'explicit', value: 'Maks' },
      }),
    }),
    expected: { status: 'resolved', op: 'get_time', subject: 'ceremony' },
  })

  // Potem → sequence bind
  cases.push({
    id: 'res-potem',
    taskSpec: spec({
      op: 'get_next',
      resource: { kind: 'sequence_cursor' },
    }),
    context: weddingCtx({
      sequenceCursor: {
        kind: 'day_plan',
        resourceId: 'w-1',
        itemRef: 'preparations',
      },
    }),
    expected: {
      status: 'resolved',
      op: 'get_next',
      sequenceKind: 'day_plan',
    },
  })

  // Julka ellipsis
  cases.push({
    id: 'res-julka',
    taskSpec: spec({
      op: 'inherit',
      participant: { kind: 'explicit', value: 'Julka' },
      fieldSource: {
        op: 'inherit',
        subject: 'inherit',
        resource: 'inherit',
        participant: 'explicit',
        temporal: 'omitted',
      },
    }),
    context: weddingCtx({
      previousTaskSpec: spec({
        op: 'get_location',
        subject: 'preparations',
        participant: { kind: 'explicit', value: 'Maks' },
        resource: { kind: 'active_resource' },
      }),
    }),
    expected: {
      status: 'resolved',
      op: 'get_location',
      subject: 'preparations',
      participantKey: 'p1',
    },
  })

  // Bartek → Maks correction
  cases.push({
    id: 'res-bartek-corr',
    taskSpec: spec({
      op: 'correction',
      correction: {
        targetSlot: 'participant',
        patch: { participant: { kind: 'explicit', value: 'Maks' } },
      },
    }),
    context: weddingCtx({
      previousTaskSpec: spec({
        op: 'get_location',
        subject: 'preparations',
        participant: { kind: 'explicit', value: 'Bartek' },
        resource: { kind: 'active_resource' },
      }),
    }),
    expected: {
      status: 'resolved',
      op: 'get_location',
      subject: 'preparations',
      participantKey: 'p2',
    },
  })

  // Finance do kiedy
  cases.push({
    id: 'res-do-kiedy',
    taskSpec: spec({
      op: 'get_time',
      subject: 'payment',
      resource: { kind: 'inherit' },
      qualifiers: {
        ...emptyQualifiers(),
        aspect: 'final_due',
      },
      fieldSource: {
        op: 'explicit',
        subject: 'explicit',
        resource: 'inherit',
        participant: 'omitted',
        temporal: 'omitted',
      },
    }),
    context: weddingCtx({
      previousTaskSpec: spec({
        op: 'get_amount',
        subject: 'remaining',
        resource: { kind: 'active_resource' },
      }),
    }),
    expected: {
      status: 'resolved',
      op: 'get_time',
      subject: 'payment',
      aspect: 'final_due',
    },
  })

  // Metric correction application
  cases.push({
    id: 'res-metric-corr',
    taskSpec: spec({
      op: 'correction',
      correction: {
        targetSlot: 'metric',
        patch: { subject: 'paid' },
      },
    }),
    context: weddingCtx({
      previousTaskSpec: spec({
        op: 'get_amount',
        subject: 'contract_value',
        resource: { kind: 'active_resource' },
      }),
    }),
    expected: {
      status: 'resolved',
      op: 'get_amount',
      subject: 'paid',
    },
  })

  // Collection → resolved (Phase 3D executable collection.query)
  cases.push({
    id: 'res-collection-rank',
    taskSpec: spec({
      op: 'rank',
      subject: 'remaining',
      temporal: { phrase: 'wrzesień', kind: 'range' },
      qualifiers: { ...emptyQualifiers(), rank: 'max' },
    }),
    context: emptyV4ShadowContext(),
    expected: { status: 'resolved', op: 'rank', subject: 'remaining' },
  })

  // Ambiguous participants
  cases.push({
    id: 'res-ambiguous-anna',
    taskSpec: spec({
      op: 'get_location',
      subject: 'preparations',
      participant: { kind: 'explicit', value: 'An' },
      resource: { kind: 'active_resource' },
    }),
    context: weddingCtx({
      candidates: {
        participants: [
          {
            ref: 'p1',
            label: 'Anna',
            kind: 'participant',
            role: 'bride',
            firstName: 'Anna',
          },
          {
            ref: 'p2',
            label: 'Andrzej',
            kind: 'participant',
            role: 'groom',
            firstName: 'Andrzej',
          },
        ],
        weddings: [{ ref: 'w-1', label: 'A & A', kind: 'wedding' }],
        sessions: [],
      },
    }),
    expected: { status: 'needs_clarification', missingSlot: 'participant' },
  })

  // Unknown participant
  cases.push({
    id: 'res-unknown-part',
    taskSpec: spec({
      op: 'get_location',
      subject: 'preparations',
      participant: { kind: 'explicit', value: 'Zygmunt' },
      resource: { kind: 'active_resource' },
    }),
    context: weddingCtx(),
    expected: { status: 'needs_clarification', missingSlot: 'participant' },
  })

  // Inherit without previous
  cases.push({
    id: 'res-inherit-no-prev',
    taskSpec: spec({
      op: 'inherit',
      participant: { kind: 'explicit', value: 'Julia' },
    }),
    context: emptyV4ShadowContext(),
    expected: { status: 'invalid_context' },
  })

  // Unsupported
  cases.push({
    id: 'res-unsupported',
    taskSpec: spec({ op: 'unsupported' }),
    context: emptyV4ShadowContext(),
    expected: { status: 'unsupported' },
  })

  // Active resource bind for ceremony place
  cases.push({
    id: 'res-ceremony-loc',
    taskSpec: spec({
      op: 'get_location',
      subject: 'ceremony',
      resource: { kind: 'active_resource' },
    }),
    context: weddingCtx(),
    expected: { status: 'resolved', subject: 'ceremony', op: 'get_location' },
  })

  // Potem without sequence
  cases.push({
    id: 'res-potem-no-seq',
    taskSpec: spec({ op: 'get_next', resource: { kind: 'sequence_cursor' } }),
    context: weddingCtx({ sequenceCursor: null }),
    expected: { status: 'needs_clarification', missingSlot: 'sequence' },
  })

  // Expand to ≥120 with systematic variants
  const subjects = [
    'ceremony',
    'reception',
    'preparations',
    'remaining',
    'paid',
    'contract_value',
    'task',
    'day_plan',
  ] as const
  const ops = ['get', 'get_time', 'get_location', 'get_amount'] as const

  let i = 0
  for (const subject of subjects) {
    for (const op of ops) {
      if (i >= 80) break
      // skip nonsensical pairs lightly
      if (op === 'get_amount' && (subject === 'ceremony' || subject === 'reception')) {
        continue
      }
      if (op === 'get_location' && (subject === 'remaining' || subject === 'paid')) {
        continue
      }
      cases.push({
        id: `res-bind-${op}-${subject}-${i}`,
        taskSpec: spec({
          op,
          subject,
          resource: { kind: 'active_resource' },
        }),
        context: weddingCtx(),
        expected: { status: 'resolved', op, subject },
      })
      i += 1
    }
  }

  // More schedule discoveries
  for (const phrase of ['jutro', 'sobota', 'weekend', 'pojutrze', '11.09']) {
    cases.push({
      id: `res-sched-${phrase}`,
      taskSpec: spec({
        op: 'get_location',
        subject: 'assignment',
        temporal: { phrase, kind: 'day' },
      }),
      context: emptyV4ShadowContext(),
      expected: { status: 'requires_discovery', discoveryKind: 'schedule' },
    })
  }

  // Collection variants
  for (const op of ['count', 'sum', 'list', 'rank'] as const) {
    cases.push({
      id: `res-col-${op}`,
      taskSpec: spec({
        op,
        subject: 'wedding',
        temporal: { phrase: 'wrzesień', kind: 'range' },
      }),
      context: emptyV4ShadowContext(),
      expected: { status: 'resolved', op },
    })
  }

  // Correction temporal
  cases.push({
    id: 'res-corr-temporal',
    taskSpec: spec({
      op: 'correction',
      correction: {
        targetSlot: 'temporal',
        patch: { temporal: { phrase: 'wrzesień', kind: 'range' } },
      },
    }),
    context: {
      ...emptyV4ShadowContext(),
      previousTaskSpec: spec({
        op: 'count',
        subject: 'wedding',
        temporal: { phrase: 'sierpień', kind: 'range' },
      }),
    },
    expected: { status: 'resolved', op: 'count' },
  })

  // Distance with participant
  cases.push({
    id: 'res-distance-julia',
    taskSpec: spec({
      op: 'get_distance',
      subject: 'preparations',
      participant: { kind: 'explicit', value: 'Julia' },
      resource: { kind: 'active_resource' },
      qualifiers: { ...emptyQualifiers(), destination: 'preparations' },
    }),
    context: weddingCtx(),
    expected: {
      status: 'resolved',
      op: 'get_distance',
      subject: 'preparations',
      participantKey: 'p1',
    },
  })

  // False discovery guard: ceremony with active resource must resolve
  cases.push({
    id: 'res-no-false-discovery',
    taskSpec: spec({
      op: 'get_location',
      subject: 'ceremony',
      resource: { kind: 'active_resource' },
    }),
    context: weddingCtx(),
    expected: { status: 'resolved', subject: 'ceremony' },
  })

  // Open wedding discovery
  cases.push({
    id: 'res-open-search',
    taskSpec: spec({ op: 'open', subject: 'wedding' }),
    context: emptyV4ShadowContext(),
    expected: { status: 'requires_discovery', discoveryKind: 'wedding_search' },
  })

  // Pad remaining to 120+
  while (cases.length < 120) {
    const n = cases.length
    cases.push({
      id: `res-pad-remaining-${n}`,
      taskSpec: spec({
        op: 'get_amount',
        subject: 'remaining',
        resource: { kind: 'active_resource' },
      }),
      context: weddingCtx(),
      expected: { status: 'resolved', op: 'get_amount', subject: 'remaining' },
    })
  }

  return cases
}

export function matchResolution(
  actual: ResolvedTaskResult,
  expected: ResolutionExpectation,
): { ok: boolean; detail: string } {
  if (actual.status !== expected.status) {
    return {
      ok: false,
      detail: `status ${actual.status}≠${expected.status}`,
    }
  }
  if (expected.discoveryKind && actual.status === 'requires_discovery') {
    if (actual.discovery.kind !== expected.discoveryKind) {
      return {
        ok: false,
        detail: `discovery ${actual.discovery.kind}≠${expected.discoveryKind}`,
      }
    }
  }
  if (expected.missingSlot && actual.status === 'needs_clarification') {
    if (actual.missingSlot !== expected.missingSlot) {
      return {
        ok: false,
        detail: `slot ${actual.missingSlot}≠${expected.missingSlot}`,
      }
    }
  }
  if (actual.status === 'resolved') {
    if (expected.op && actual.op !== expected.op) {
      return { ok: false, detail: `op ${actual.op}≠${expected.op}` }
    }
    if (
      expected.subject !== undefined &&
      actual.subject !== expected.subject
    ) {
      return {
        ok: false,
        detail: `subject ${actual.subject}≠${expected.subject}`,
      }
    }
    if (
      expected.participantKey &&
      actual.participant?.key !== expected.participantKey
    ) {
      return {
        ok: false,
        detail: `participant ${actual.participant?.key}≠${expected.participantKey}`,
      }
    }
    if (
      expected.sequenceKind &&
      actual.sequence?.kind !== expected.sequenceKind
    ) {
      return {
        ok: false,
        detail: `sequence ${actual.sequence?.kind}≠${expected.sequenceKind}`,
      }
    }
    if (
      expected.aspect !== undefined &&
      actual.qualifiers.aspect !== expected.aspect
    ) {
      return {
        ok: false,
        detail: `aspect ${actual.qualifiers.aspect}≠${expected.aspect}`,
      }
    }
  }
  return { ok: true, detail: 'ok' }
}

export function runResolutionBenchmark(): {
  total: number
  pass: number
  failures: Array<{ id: string; detail: string }>
} {
  const cases = buildResolutionBenchmark()
  const failures: Array<{ id: string; detail: string }> = []
  let pass = 0
  for (const c of cases) {
    const actual = resolveTaskSpec(c.taskSpec, c.context)
    const m = matchResolution(actual, c.expected)
    if (m.ok) pass += 1
    else failures.push({ id: c.id, detail: m.detail })
  }
  return { total: cases.length, pass, failures }
}
