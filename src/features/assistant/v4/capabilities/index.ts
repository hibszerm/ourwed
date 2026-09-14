/**
 * V4 Capability Registry foundation barrel.
 */

export * from './types'
export * from './errors'
export * from './availability'
export * from './registry'
export * from './selector'
export * from './runtime'
export * from './adaptFinanceResult'
export { weddingFinanceGetCapability } from './finance/weddingFinanceCapability'
export { weddingPlacesGetCapability } from './places/weddingPlacesCapability'
export { weddingDayPlanGetCapability } from './dayPlan/weddingDayPlanCapability'
export { collectionQueryCapability } from './collection/collectionQueryCapability'
export { loadOperationalWeddingDay } from './loadOperationalWeddingDay'
// executePhase3AFinanceIfEligible is re-exported from execution/ to avoid
// duplicate export * collisions via v4/index.
