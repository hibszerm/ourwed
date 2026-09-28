import assert from 'node:assert/strict'
import {
  ContractGenerationMetrics,
  GPT6_LUNA_STANDARD_RATES,
  normalizeProviderCall,
  openAIResponseMetadata,
} from './contractGenerationMetrics'

let monotonic = 0
let wall = Date.UTC(2026, 8, 28)
const clock = {
  monotonicNow: () => monotonic,
  wallNow: () => new Date(wall),
}
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
  input_tokens_details: { cached_tokens: 40, image_tokens: 0 },
  output_tokens: 20,
  output_tokens_details: { reasoning_tokens: 8, audio_tokens: 0 },
  total_tokens: 120,
}
metrics.recordProviderCall('planning', planningDuration, planningTimestamps.startedAt, planningTimestamps.endedAt,
  openAIResponseMetadata({ model: 'gpt-6-luna-2026-09-01', service_tier: 'default', usage: rawPlanningUsage }, 'gpt-6-luna', 'standard'))
const reviewUsage = {
  input_tokens: 10,
  input_tokens_details: { cached_tokens: 2 },
  output_tokens: 5,
  output_tokens_details: { reasoning_tokens: 1 },
  total_tokens: 15,
}
metrics.recordProviderCall('review', 9, '2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.009Z', {
  requestedModel: 'gpt-6-luna', responseModel: 'gpt-6-luna', requestedPricingMode: 'standard', serviceTier: 'default', usage: reviewUsage,
})
monotonic += 27
wall += 27
const measured = metrics.finish()

assert.deepEqual(GPT6_LUNA_STANDARD_RATES, { inputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.01, outputUsdPerMillion: 0.5 })
assert.equal(measured.timestamps.generationStartedAt, new Date(Date.UTC(2026, 8, 28)).toISOString())
assert.ok(measured.timestamps.generationCompletedAt)
assert.equal(measured.totalGenerationMs, 79.5)
assert.equal(measured.stages.preflightMs, 12.5)
assert.equal(measured.stages.planningProviderMs, 40)
assert.equal(measured.providerCalls.length, 2)
const planning = measured.providerCalls[0]!
assert.equal(planning.inputTokens, 100, 'input_tokens remains the API total and includes cached tokens')
assert.equal(planning.cachedInputTokens, 40)
assert.equal(planning.uncachedInputTokens, 60)
assert.equal(planning.outputTokens, 20)
assert.equal(planning.serviceTier, 'default')
assert.equal(planning.requestedPricingMode, 'standard')
assert.equal(planning.effectivePricingMode, 'default')
assert.equal(planning.reasoningTokens, 8)
assert.equal(planning.reasoningTokensIncludedInOutput, true, 'reasoning usage is reported separately but billed within output tokens')
assert.deepEqual(planning.usage, rawPlanningUsage, 'all API usage fields are preserved')
assert.equal(planning.cost.inputCostUsd, 0.000006)
assert.equal(planning.cost.cachedInputCostUsd, 0.0000004)
assert.equal(planning.cost.outputCostUsd, 0.00001)
assert.equal(planning.cost.totalCostUsd, 0.0000164)
assert.equal(measured.totalTokens.input, 110, 'cached tokens are not added to input_tokens a second time')
assert.equal(measured.totalTokens.cachedInput, 42)
assert.equal(measured.totalTokens.output, 25)
assert.equal(measured.totalTokens.reasoning, 9)
assert.equal(measured.totalCostUsd, 0.00001972)

const missingOptional = normalizeProviderCall('planning', 1, 'start', 'end', {
  requestedModel: 'gpt-6-luna', requestedPricingMode: 'standard',
  usage: { input_tokens: 7, output_tokens: 2 },
})
assert.equal(missingOptional.inputTokens, 7)
assert.equal(missingOptional.cachedInputTokens, null, 'an omitted cache detail stays explicitly unavailable')
assert.equal(missingOptional.reasoningTokens, null)
assert.equal(missingOptional.cost.pricingStatus, 'USAGE_INCOMPLETE')
assert.equal(missingOptional.cost.totalCostUsd, null, 'incomplete usage does not produce a fabricated total')
const noUsage = normalizeProviderCall('review', 1, 'start', 'end', { requestedModel: 'gpt-6-luna', requestedPricingMode: 'standard' })
assert.equal(noUsage.cost.pricingStatus, 'USAGE_MISSING')
const otherTier = normalizeProviderCall('review', 1, 'start', 'end', {
  requestedModel: 'gpt-6-luna', requestedPricingMode: 'standard', serviceTier: 'priority',
  usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1 },
})
assert.equal(otherTier.cost.pricingStatus, 'UNSUPPORTED_PRICING_MODE')
assert.equal(otherTier.requestedPricingMode, 'standard')
assert.equal(otherTier.effectivePricingMode, 'priority')
assert.equal(otherTier.cost.totalCostUsd, null, 'a different response tier is reported, not priced at standard rates')
console.log('PASS contract-generation metrics acceptance')
