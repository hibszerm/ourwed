import type { SemanticExtrasPlacement } from '../semanticExtrasPlacement'

export type ReplayExtrasPlacementSource =
  | 'LIVE_V7_PROVIDER_EVIDENCE'
  | 'SYNTHETIC_OFFLINE_PLACEMENT'
  | 'NOT_REQUIRED'

export type ReplayExtrasPlacementDecision = {
  placement: SemanticExtrasPlacement | null
  source: ReplayExtrasPlacementSource
  evidencePath: string | null
  modelSelectedBoundary: boolean
}

/** Live accepted V7 placement evidence takes precedence over replay fixtures. */
export function selectReplayExtrasPlacement(input: {
  requiresPlacement: boolean
  liveV7?: { placement: SemanticExtrasPlacement; evidencePath: string }
  synthetic?: SemanticExtrasPlacement | null
  syntheticPath?: string
}): ReplayExtrasPlacementDecision {
  if (!input.requiresPlacement) {
    return { placement: null, source: 'NOT_REQUIRED', evidencePath: null, modelSelectedBoundary: false }
  }
  if (input.liveV7) {
    return {
      placement: input.liveV7.placement,
      source: 'LIVE_V7_PROVIDER_EVIDENCE',
      evidencePath: input.liveV7.evidencePath,
      modelSelectedBoundary: true,
    }
  }
  if (input.synthetic) {
    return {
      placement: input.synthetic,
      source: 'SYNTHETIC_OFFLINE_PLACEMENT',
      evidencePath: input.syntheticPath ?? null,
      modelSelectedBoundary: false,
    }
  }
  throw new Error('REPLAY_EXTRAS_PLACEMENT_EVIDENCE_REQUIRED')
}
