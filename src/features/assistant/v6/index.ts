/**
 * V6-F1 — Public barrel.
 */

export type { SemanticAction } from './semantics/types'
export {
  v6CollectionStore,
  destroyV6CollectionSession,
  assertSnapshotSubset,
} from './collections/store'
export { queryCollection, transformCollection, aggregateCollection } from './tools'
export * from './registry'
export { runV6ShadowTurn } from './agent/loop'
export {
  runV6AssistantShadow,
  enqueueAndAwaitV6ShadowTurn,
  setV6ShadowSessionOpen,
  invalidateV6ShadowTurn,
} from './shadow'
export { decideV6Authority } from './authority/decide'
export {
  isV6OwnerCanaryVisible,
  isV6EmergencyVisible,
  isV6EmergencyFlagEnabled,
  decideV6CanaryRouting,
  setV6EmergencyFlagForTests,
  setV6OwnerCanaryFlagForTests,
} from './canary/ownerCanaryGate'
export { renderV6TurnResult } from './render/renderV6TurnResult'
