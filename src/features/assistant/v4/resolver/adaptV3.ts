/**
 * READ-ONLY adapter: V3 WorkingContext → V4ShadowContext.
 * Deliberately reduces fields — does not mirror V3 complexity.
 */

import type { AssistantWorkingContext } from '../../api/workingContext'
import type { AssistantTaskSpec } from '../taskSpec'
import { emptyV4ShadowContext, type V4ShadowContext } from './types'

export function adaptWorkingContextToV4ShadowContext(input: {
  workingContext: AssistantWorkingContext
  previousTaskSpec?: AssistantTaskSpec | null
}): V4ShadowContext {
  const ctx = input.workingContext
  const out = emptyV4ShadowContext()

  if (ctx.activeResource) {
    out.activeResource = {
      kind: ctx.activeResource.kind,
      id: ctx.activeResource.id,
      label: ctx.activeResource.displayLabel,
    }
    if (ctx.activeResource.participants?.length) {
      out.candidates.participants = ctx.activeResource.participants.map(
        (p) => ({
          ref: p.key,
          label: p.canonicalName,
          kind: 'participant' as const,
          role: p.role,
          firstName: p.firstName,
          canonicalName: p.canonicalName,
        }),
      )
    }
  }

  if (ctx.activeParticipant) {
    out.activeParticipant = {
      key: ctx.activeParticipant.participantKey,
      label: ctx.activeParticipant.displayLabel,
      weddingId: ctx.activeParticipant.weddingId,
    }
  }

  if (ctx.activeCollection) {
    out.activeCollection = {
      resource: ctx.activeCollection.resource,
      label: ctx.activeCollection.label,
      filters: {
        dateRange: ctx.activeCollection.filters?.dateRange ?? null,
        locationQuery: ctx.activeCollection.filters?.locationQuery ?? null,
        locationRole: ctx.activeCollection.filters?.locationRole ?? null,
      },
      memberIds: ctx.activeCollection.memberIds,
      resultCount: ctx.activeCollection.resultCount,
    }
  }

  if (ctx.temporalAnchor) {
    out.temporalAnchor = {
      phrase: ctx.temporalAnchor.phrase,
      from: ctx.temporalAnchor.from,
      to: ctx.temporalAnchor.to,
    }
  }

  const seqKind = ctx.discourseFocus?.sequenceKind
  if (seqKind === 'day_plan' || seqKind === 'schedule') {
    out.sequenceCursor = {
      kind: seqKind,
      resourceId: ctx.discourseFocus?.weddingId ?? ctx.activeResource?.id ?? null,
      itemRef: ctx.discourseFocus?.dayPlanStage ?? null,
    }
  } else if (ctx.discourseFocus?.dayPlanStage) {
    out.sequenceCursor = {
      kind: 'day_plan',
      resourceId: ctx.discourseFocus.weddingId ?? ctx.activeResource?.id ?? null,
      itemRef: ctx.discourseFocus.dayPlanStage,
    }
  }

  out.previousTaskSpec = input.previousTaskSpec ?? null
  return out
}

/**
 * Legacy V3 fields deliberately NOT adapted:
 * - lastDirectContext (duplicative)
 * - lastResolvedRequest / lastPlanSummary (capability-shaped)
 * - pendingClarification / pendingCorrection / clarificationHistory
 * - discourseFocus.placeRef raw CRM place strings beyond sequence cursor
 *
 * Phase 3D: activeCollection.filters may be adapted as compatibility output.
 * G5: semantic SoT is activeCollection.query (DomainQuery) when present.
 */
