import assert from 'node:assert/strict'
import {
  ContractGenerationMetrics,
  GPT6_LUNA_STANDARD_RATES,
  normalizeProviderCall,
  openAIResponseMetadata,
} from './contractGenerationMetrics'

function call(usage: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return normalizeProviderCall('planning', 1, 'start', 'end', {
    requestedModel: 'gpt-6-luna', responseModel: 'gpt-6-luna', requestedPricingMode: 'standard', serviceTier: 'default',
    processingRegion: 'GLOBAL',
    usage: usage as never,
    ...extra,
  })
}
function assertUsd(actual: number | null, expected: number, label: string) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-15, `${label}: expected ${expected}, got ${actual}`)
}

let monotonic = 0
let wall = Date.UTC(2026, 8, 28)
const clock = { monotonicNow: () => monotonic, wallNow: () => new Date(wall) }
const metrics = new ContractGenerationMetrics(clock)
metrics.startStage('preflight')
monotonic += 12.5
wall += 13
assert.equal(metrics.endStage('preflight'), 12.5, 'stage duration uses monotonic elapsed time')
metrics.startStage('planningProvider')
monotonic += 40
wall += 40
const planningDuration = metrics.endStage('planningProvider')
const planningTimestamps = metrics.snapshot().timestamps.stages.planningProvider!
const rawPlanningUsage = {
  input_tokens: 100,
  input_tokens_details: { cached_tokens: 40, cache_write_tokens: 10, image_tokens: 0 },
  output_tokens: 20,
  output_tokens_details: { reasoning_tokens: 8, audio_tokens: 0 },
  total_tokens: 120,
}
metrics.recordProviderCall('planning', planningDuration, planningTimestamps.startedAt, planningTimestamps.endedAt,
  {
    ...openAIResponseMetadata({ model: 'gpt-6-luna-2026-09-01', service_tier: 'default', usage: rawPlanningUsage }, 'gpt-6-luna', 'standard'),
    processingRegion: 'GLOBAL',
  })
const reviewUsage = {
  input_tokens: 10,
  input_tokens_details: { cached_tokens: 2, cache_write_tokens: 1 },
  output_tokens: 5,
  output_tokens_details: { reasoning_tokens: 1 },
  total_tokens: 15,
}
metrics.recordProviderCall('review', 9, '2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.009Z', {
  requestedModel: 'gpt-6-luna', responseModel: 'gpt-6-luna', requestedPricingMode: 'standard', serviceTier: 'default', processingRegion: 'GLOBAL', usage: reviewUsage,
})
monotonic += 27
wall += 27
const measured = metrics.finish()

assert.deepEqual(GPT6_LUNA_STANDARD_RATES, {
  short: { ordinaryInputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.01, cacheWriteUsdPerMillion: 0.125, outputUsdPerMillion: 0.5 },
  long: { ordinaryInputUsdPerMillion: 0.2, cachedInputUsdPerMillion: 0.02, cacheWriteUsdPerMillion: 0.25, outputUsdPerMillion: 0.75 },
})
assert.equal(measured.timestamps.generationStartedAt, new Date(Date.UTC(2026, 8, 28)).toISOString())
assert.ok(measured.timestamps.generationCompletedAt)
assert.equal(measured.totalGenerationMs, 79.5)
assert.equal(measured.stages.preflightMs, 12.5)
assert.equal(measured.stages.planningProviderMs, 40)
assert.equal(measured.providerCalls.length, 2)
const planning = measured.providerCalls[0]!
assert.equal(planning.purpose, 'planning')
assert.equal(planning.inputTokens, 100)
assert.equal(planning.cachedInputTokens, 40)
assert.equal(planning.cacheWriteTokens, 10)
assert.equal(planning.ordinaryInputTokens, 50)
assert.equal(planning.uncachedInputTokens, 50)
assert.equal(planning.outputTokens, 20)
assert.equal(planning.serviceTier, 'default')
assert.equal(planning.requestedPricingMode, 'standard')
assert.equal(planning.effectivePricingMode, 'default')
assert.equal(planning.processingRegion, 'GLOBAL')
assert.equal(planning.reasoningTokens, 8)
assert.equal(planning.reasoningTokensIncludedInOutput, true)
assert.equal(planning.contextPricingBand, 'SHORT')
assert.deepEqual(planning.usage, rawPlanningUsage, 'all API usage fields are preserved')
assert.equal(planning.cost.ordinaryInputCostUsd, 0.000005)
assert.equal(planning.cost.cachedInputCostUsd, 0.0000004)
assert.equal(planning.cost.cacheWriteCostUsd, 0.00000125)
assert.equal(planning.cost.outputCostUsd, 0.00001, 'reasoning tokens remain included in output cost')
assert.equal(planning.cost.totalCostUsd, 0.00001665)
assert.equal(measured.totals.totalInputTokens, 110, 'cache categories are included in input_tokens and are not added again')
assert.equal(measured.totals.totalOrdinaryInputTokens, 57)
assert.equal(measured.totals.totalCachedInputTokens, 42)
assert.equal(measured.totals.totalCacheWriteTokens, 11)
assert.equal(measured.totals.totalOutputTokens, 25)
assert.equal(measured.totals.totalReasoningTokens, 9)
assertUsd(measured.totals.totalOrdinaryInputCostUsd, 0.0000057, 'aggregate ordinary input cost')
assertUsd(measured.totals.totalCachedInputCostUsd, 0.00000042, 'aggregate cached input cost')
assertUsd(measured.totals.totalCacheWriteCostUsd, 0.000001375, 'aggregate cache-write cost')
assertUsd(measured.totals.totalOutputCostUsd, 0.0000125, 'aggregate output cost')
assertUsd(measured.totals.totalCostUsd, 0.000019995, 'aggregate total cost')
assert.equal(measured.totalCostUsd, measured.totals.totalCostUsd)

// A. No cache usage: absent optional category fields are zero.
const noCache = call({ input_tokens: 100, output_tokens: 20 })
assert.equal(noCache.cachedInputTokens, 0)
assert.equal(noCache.cacheWriteTokens, 0)
assert.equal(noCache.ordinaryInputTokens, 100)
assert.equal(noCache.cost.totalCostUsd, 0.00002)

// B. Cached input only; C. cache writes only; D. all input categories together.
const cachedOnly = call({ input_tokens: 100, input_tokens_details: { cached_tokens: 25 }, output_tokens: 0 })
assert.equal(cachedOnly.ordinaryInputTokens, 75)
assert.equal(cachedOnly.cacheWriteTokens, 0)
const writesOnly = call({ input_tokens: 100, input_tokens_details: { cache_write_tokens: 20 }, output_tokens: 0 })
assert.equal(writesOnly.ordinaryInputTokens, 80)
assert.equal(writesOnly.cachedInputTokens, 0)
const allCategories = call({ input_tokens: 100, input_tokens_details: { cached_tokens: 30, cache_write_tokens: 20 }, output_tokens: 0 })
assert.equal(allCategories.ordinaryInputTokens, 50)
assert.equal(allCategories.cachedInputTokens! + allCategories.cacheWriteTokens! + allCategories.ordinaryInputTokens!, allCategories.inputTokens)

// E. Input categories partition input_tokens; neither cache category is counted twice.
assert.equal(measured.totals.totalOrdinaryInputTokens! + measured.totals.totalCachedInputTokens! + measured.totals.totalCacheWriteTokens!, measured.totals.totalInputTokens)

// F. Reasoning is a reported subset of output, not an additional billed category.
const withReasoning = call({ input_tokens: 0, output_tokens: 100, output_tokens_details: { reasoning_tokens: 40 } })
assert.equal(withReasoning.reasoningTokens, 40)
assert.equal(withReasoning.cost.outputCostUsd, 0.00005)

// G. Short-context rates; H. input beyond 272K uses long-context rates.
assert.equal(call({ input_tokens: 272_000, output_tokens: 1 }).contextPricingBand, 'SHORT')
const longContext = call({ input_tokens: 272_001, output_tokens: 1 })
assert.equal(longContext.contextPricingBand, 'LONG')
assert.equal(longContext.cost.ordinaryInputCostUsd, 0.0544002)
assert.equal(longContext.cost.outputCostUsd, 0.00000075)

// I. Missing cache_write_tokens is safely zero.
assert.equal(cachedOnly.cacheWriteTokens, 0)

// J. Inconsistent cache usage clamps ordinary input at zero and refuses to invent a price.
const inconsistent = call({ input_tokens: 10, input_tokens_details: { cached_tokens: 8, cache_write_tokens: 5 }, output_tokens: 1 })
assert.equal(inconsistent.ordinaryInputTokens, 0)
assert.equal(inconsistent.cost.pricingStatus, 'USAGE_INCONSISTENT')
assert.equal(inconsistent.cost.totalCostUsd, null)

// Missing usage and unsupported tiers remain unpriced.
const missingOptional = normalizeProviderCall('planning', 1, 'start', 'end', {
  requestedModel: 'gpt-6-luna', requestedPricingMode: 'standard', processingRegion: 'GLOBAL', usage: { input_tokens: 7, output_tokens: 2 },
})
assert.equal(missingOptional.cachedInputTokens, 0)
assert.equal(missingOptional.cacheWriteTokens, 0)
assert.equal(missingOptional.reasoningTokens, null)
assert.equal(missingOptional.cost.pricingStatus, 'PRICED_STANDARD')
const noUsage = normalizeProviderCall('review', 1, 'start', 'end', { requestedModel: 'gpt-6-luna', requestedPricingMode: 'standard' })
assert.equal(noUsage.cost.pricingStatus, 'USAGE_MISSING')
const otherTier = normalizeProviderCall('review', 1, 'start', 'end', {
  requestedModel: 'gpt-6-luna', requestedPricingMode: 'standard', serviceTier: 'priority',
  processingRegion: 'GLOBAL',
  usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1 },
})
assert.equal(otherTier.cost.pricingStatus, 'UNSUPPORTED_PRICING_MODE')
assert.equal(otherTier.requestedPricingMode, 'standard')
assert.equal(otherTier.effectivePricingMode, 'priority')
assert.equal(otherTier.cost.totalCostUsd, null)

// A. Explicit global/standard metadata can use the known rate table.
assert.equal(noCache.cost.pricingStatus, 'PRICED_STANDARD')
// B. Explicit regional processing is recorded and left unpriced without a regional table.
const regional = call({ input_tokens: 10, output_tokens: 2 }, { processingRegion: 'REGIONAL:eu' })
assert.equal(regional.processingRegion, 'REGIONAL:eu')
assert.equal(regional.cost.pricingStatus, 'UNPRICED_REGIONAL')
assert.equal(regional.cost.totalCostUsd, null)
// C. The response helper does not infer a region from response fields that are not exposed.
const unknownRegion = normalizeProviderCall('planning', 1, 'start', 'end', openAIResponseMetadata(
  { model: 'gpt-6-luna', service_tier: 'default', usage: { input_tokens: 10, output_tokens: 2 } }, 'gpt-6-luna', 'standard'))
assert.equal(unknownRegion.processingRegion, 'UNKNOWN')
assert.equal(unknownRegion.cost.pricingStatus, 'UNPRICED_UNKNOWN_REGION')
assert.equal(unknownRegion.cost.totalCostUsd, null)
// D. Unsupported service tier stays unpriced even when global processing is known.
assert.equal(otherTier.cost.pricingStatus, 'UNSUPPORTED_PRICING_MODE')
// E. Metadata normalization is observational and does not mutate response/request objects.
const responseWithoutRegion = { model: 'gpt-6-luna', service_tier: 'default', usage: { input_tokens: 3, output_tokens: 1 } }
const responseBefore = structuredClone(responseWithoutRegion)
const responseMetadata = openAIResponseMetadata(responseWithoutRegion, 'gpt-6-luna', 'standard')
assert.deepEqual(responseWithoutRegion, responseBefore)
assert.equal(responseMetadata.processingRegion, undefined, 'no region value is manufactured when the runtime does not expose one')
console.log('PASS contract-generation metrics acceptance')
