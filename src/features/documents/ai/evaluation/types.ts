/**
 * Golden-benchmark types for AI Contract Analysis evaluation.
 * Expected sets answer: "What is required to regenerate this contract?"
 */

export type EvalBucket = 'couple' | 'company' | 'package'

export interface BenchmarkExpected {
  couple: string[]
  company: string[]
  package: string[]
  /**
   * Concepts that must remain static template text (not variables).
   * Informational only — not scored as missing/unexpected.
   */
  staticOnly?: string[]
}

export interface BenchmarkFixture {
  id: string
  name: string
  description?: string
  /** Contract template text sent to production analysis (unchanged pipeline). */
  sourceText: string
  expected: BenchmarkExpected
}

export interface DetectedBuckets {
  couple: string[]
  company: string[]
  package: string[]
  /** Freeform possibles — counted as unexpected if not in any expected bucket. */
  possible: string[]
}

export interface BucketScore {
  expected: number
  detected: number
  matched: number
  missing: string[]
  unexpected: string[]
  /** matched / expected (0–1). Empty expected → 1. */
  recall: number
}

export interface BenchmarkCaseResult {
  fixtureId: string
  name: string
  ok: boolean
  error?: string
  fromCache?: boolean
  detected: DetectedBuckets
  couple: BucketScore
  company: BucketScore
  package: BucketScore
  /** Union of all buckets. */
  overall: BucketScore
  /** Possibles + extras not in any expected set. */
  unexpectedAll: string[]
  missingAll: string[]
  elapsedMs: number
}

export interface BenchmarkSuiteResult {
  ranAt: string
  cases: BenchmarkCaseResult[]
  summary: {
    cases: number
    overallRecall: number
    coupleRecall: number
    companyRecall: number
    packageRecall: number
    totalMissing: number
    totalUnexpected: number
  }
}
