/**
 * Analysis / readiness algorithm versions for summary staleness.
 * Bump when list-visible readiness semantics change — never auto-reanalyze on load.
 */

export const CONTRACT_ANALYSIS_VERSION = 'contract-analysis-v2'
export const CONTRACT_READINESS_VERSION = 'contract-readiness-v2'

export function isTemplateSummaryStale(meta: {
  analysisVersion?: string | null
  readinessVersion?: string | null
} | null | undefined): boolean {
  if (!meta) return false
  if (
    meta.analysisVersion &&
    meta.analysisVersion !== CONTRACT_ANALYSIS_VERSION
  ) {
    return true
  }
  if (
    meta.readinessVersion &&
    meta.readinessVersion !== CONTRACT_READINESS_VERSION
  ) {
    return true
  }
  return false
}
