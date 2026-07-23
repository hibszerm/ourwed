/**
 * @deprecated LEGACY — questionnaire-centric AI evaluation.
 * Template-first architecture scores slot coverage, not questionnaire drafts.
 * Route `/dev/contract-analysis-eval` may remain for historical fixtures only.
 */

export { runBenchmarkCase, runBenchmarkSuite, BENCHMARK_FIXTURES } from './runBenchmark'
export { scoreDetected, averageRecall, formatRecallPercent } from './metrics'
export { normalizeEvalId, normalizeIdList } from './normalizeIds'
export type {
  BenchmarkCaseResult,
  BenchmarkExpected,
  BenchmarkFixture,
  BenchmarkSuiteResult,
  BucketScore,
  DetectedBuckets,
  EvalBucket,
} from './types'
