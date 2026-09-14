/**
 * Phase 3A execution barrel.
 */

export * from './financeTypes'
export * from './financeEligibility'
export * from './executeSingleWeddingFinance'
export * from './compareFinanceShadow'
export * from './comparePlaceShadow'
export * from './compareTimeShadow'
/** Phase 3B: registry dispatch preserving Phase 3A entry-point name. */
export { executePhase3AFinanceIfEligible } from '../capabilities/dispatchFinance'
