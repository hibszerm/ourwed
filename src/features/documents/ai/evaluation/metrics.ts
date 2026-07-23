/**
 * Deterministic Expected vs Detected scoring.
 */

import { normalizeIdList } from './normalizeIds'
import type { BucketScore, DetectedBuckets, BenchmarkExpected } from './types'

function scoreBucket(expectedRaw: string[], detectedRaw: string[]): BucketScore {
  const expected = normalizeIdList(expectedRaw)
  const detected = normalizeIdList(detectedRaw)
  const expectedSet = new Set(expected)
  const detectedSet = new Set(detected)

  const missing = expected.filter((id) => !detectedSet.has(id))
  const unexpected = detected.filter((id) => !expectedSet.has(id))
  const matched = expected.length - missing.length
  const recall =
    expected.length === 0 ? 1 : matched / expected.length

  return {
    expected: expected.length,
    detected: detected.length,
    matched,
    missing,
    unexpected,
    recall,
  }
}

export function scoreDetected(
  expected: BenchmarkExpected,
  detected: DetectedBuckets,
): {
  couple: BucketScore
  company: BucketScore
  package: BucketScore
  overall: BucketScore
  unexpectedAll: string[]
  missingAll: string[]
} {
  const couple = scoreBucket(expected.couple, detected.couple)
  const company = scoreBucket(expected.company, detected.company)
  const pkg = scoreBucket(expected.package, detected.package)

  const overallExpected = [
    ...expected.couple,
    ...expected.company,
    ...expected.package,
  ]
  const overallDetected = [
    ...detected.couple,
    ...detected.company,
    ...detected.package,
  ]
  const overall = scoreBucket(overallExpected, overallDetected)

  // Possibles that are not in any expected bucket count as unexpected noise.
  const expectedAll = new Set(normalizeIdList(overallExpected))
  const possibleUnexpected = normalizeIdList(detected.possible).filter(
    (id) => !expectedAll.has(id),
  )
  const unexpectedAll = normalizeIdList([
    ...overall.unexpected,
    ...possibleUnexpected,
  ])
  const missingAll = normalizeIdList(overall.missing)

  return {
    couple,
    company,
    package: pkg,
    overall,
    unexpectedAll,
    missingAll,
  }
}

export function averageRecall(scores: number[]): number {
  if (scores.length === 0) return 0
  const sum = scores.reduce((a, b) => a + b, 0)
  return sum / scores.length
}

export function formatRecallPercent(recall: number): string {
  return `${Math.round(recall * 1000) / 10}%`
}
