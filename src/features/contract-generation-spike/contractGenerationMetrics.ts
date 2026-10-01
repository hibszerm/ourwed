export type GenerationMetricStage =
  | 'preflight'
  | 'inventoryProvider'
  | 'generationProvider'
  | 'planningProvider'
  | 'planValidation'
  | 'docxApply'
  | 'candidateValidation'
  | 'reviewProvider'

export type MetricsClock = {
  monotonicNow(): number
  wallNow(): Date
}

export const systemMetricsClock: MetricsClock = {
  monotonicNow: () => globalThis.performance.now(),
  wallNow: () => new Date(),
}

export type OpenAIResponsesUsage = Record<string, unknown> & {
  input_tokens?: number
  input_tokens_details?: Record<string, unknown> & { cached_tokens?: number; cache_write_tokens?: number }
  cached_input_tokens?: number
  output_tokens?: number
  output_tokens_details?: Record<string, unknown> & { reasoning_tokens?: number }
  reasoning_tokens?: number
}

/** Metadata copied from one provider response; prompt/request content is deliberately excluded. */
export type ProviderResponseMetadata = {
  requestedModel?: string
  responseModel?: string
  requestedPricingMode?: string
  serviceTier?: string
  /** Set only from provider/runtime metadata or request configuration; never inferred locally. */
  processingRegion?: 'GLOBAL' | `REGIONAL:${string}` | 'UNKNOWN'
  usage?: OpenAIResponsesUsage
}

export type ProviderCost = {
  ordinaryInputCostUsd: number | null
  cachedInputCostUsd: number | null
  cacheWriteCostUsd: number | null
  outputCostUsd: number | null
  totalCostUsd: number | null
  pricingStatus: 'PRICED_STANDARD' | 'USAGE_MISSING' | 'USAGE_INCOMPLETE' | 'USAGE_INCONSISTENT' | 'UNPRICED_UNKNOWN_REGION' | 'UNPRICED_REGIONAL' | 'UNSUPPORTED_MODEL' | 'UNSUPPORTED_PRICING_MODE'
}

export type ProviderCallMeasurement = {
  purpose: 'inventory' | 'generation' | 'planning' | 'review'
  requestedModel: string | null
  model: string | null
  serviceTier: string | null
  requestedPricingMode: string | null
  effectivePricingMode: string | null
  processingRegion: 'GLOBAL' | `REGIONAL:${string}` | 'UNKNOWN'
  latencyMs: number
  startedAt: string
  endedAt: string
  inputTokens: number | null
  ordinaryInputTokens: number | null
  cachedInputTokens: number | null
  cacheWriteTokens: number | null
  /** @deprecated Use ordinaryInputTokens. Retained for existing report consumers. */
  uncachedInputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  contextPricingBand: 'SHORT' | 'LONG' | 'UNKNOWN'
  reasoningTokensIncludedInOutput: boolean | null
  usage: OpenAIResponsesUsage | null
  cost: ProviderCost
}

export type StageTimestamps = { startedAt: string; endedAt: string }
export type GenerationMeasurements = {
  timestamps: {
    generationStartedAt: string
    generationCompletedAt: string | null
    stages: Partial<Record<GenerationMetricStage, StageTimestamps>>
  }
  totalGenerationMs: number | null
  stages: {
    preflightMs: number | null
    inventoryProviderMs: number | null
    generationProviderMs: number | null
    planningProviderMs: number | null
    planValidationMs: number | null
    docxApplyMs: number | null
    candidateValidationMs: number | null
    reviewProviderMs: number | null
  }
  providerCalls: ProviderCallMeasurement[]
  totalTokens: {
    input: number | null
    cachedInput: number | null
    output: number | null
    reasoning: number | null
  }
  totals: {
    totalInputTokens: number | null
    totalOrdinaryInputTokens: number | null
    totalCachedInputTokens: number | null
    totalCacheWriteTokens: number | null
    totalOutputTokens: number | null
    totalReasoningTokens: number | null
    totalOrdinaryInputCostUsd: number | null
    totalCachedInputCostUsd: number | null
    totalCacheWriteCostUsd: number | null
    totalOutputCostUsd: number | null
    totalCostUsd: number | null
  }
  totalCostUsd: number | null
}

export const GPT6_LUNA_STANDARD_RATES = Object.freeze({
  short: Object.freeze({ ordinaryInputUsdPerMillion: 0.10, cachedInputUsdPerMillion: 0.01, cacheWriteUsdPerMillion: 0.125, outputUsdPerMillion: 0.50 }),
  long: Object.freeze({ ordinaryInputUsdPerMillion: 0.20, cachedInputUsdPerMillion: 0.02, cacheWriteUsdPerMillion: 0.25, outputUsdPerMillion: 0.75 }),
})

const LONG_CONTEXT_INPUT_TOKENS = 272_000

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

function roundUsd(value: number): number {
  return Number(value.toFixed(12))
}

function isStandardPricingMode(mode: string | null): boolean {
  return mode !== null && ['standard', 'default'].includes(mode.toLowerCase())
}

function isGpt6Luna(model: string | null): boolean {
  return model !== null && /^gpt-6-luna(?:-|$)/i.test(model)
}

export function normalizeProviderCall(
  purpose: ProviderCallMeasurement['purpose'],
  latencyMs: number,
  startedAt: string,
  endedAt: string,
  metadata?: ProviderResponseMetadata,
): ProviderCallMeasurement {
  const usage = metadata?.usage ?? null
  const inputTokens = nonNegativeInteger(usage?.input_tokens)
  const rawCachedInputTokens = usage?.input_tokens_details?.cached_tokens ?? usage?.cached_input_tokens
  const rawCacheWriteTokens = usage?.input_tokens_details?.cache_write_tokens
  // Responses usage omits zero-valued optional cache categories. Treat absence as zero,
  // while retaining null for malformed values and for a missing input_tokens total.
  const cachedInputTokens = inputTokens === null ? null : rawCachedInputTokens === undefined ? 0 : nonNegativeInteger(rawCachedInputTokens)
  const cacheWriteTokens = inputTokens === null ? null : rawCacheWriteTokens === undefined ? 0 : nonNegativeInteger(rawCacheWriteTokens)
  const outputTokens = nonNegativeInteger(usage?.output_tokens)
  const reasoningTokens = nonNegativeInteger(usage?.output_tokens_details?.reasoning_tokens ?? usage?.reasoning_tokens)
  const categoryTotal = cachedInputTokens !== null && cacheWriteTokens !== null ? cachedInputTokens + cacheWriteTokens : null
  const inconsistentUsage = inputTokens !== null && categoryTotal !== null && categoryTotal > inputTokens
  const ordinaryInputTokens = inputTokens !== null && categoryTotal !== null
    ? Math.max(0, inputTokens - categoryTotal)
    : null
  const contextPricingBand = inputTokens === null ? 'UNKNOWN' : inputTokens > LONG_CONTEXT_INPUT_TOKENS ? 'LONG' : 'SHORT'
  const model = metadata?.responseModel ?? metadata?.requestedModel ?? null
  const serviceTier = metadata?.serviceTier ?? null
  const requestedPricingMode = metadata?.requestedPricingMode ?? null
  const effectivePricingMode = serviceTier ?? requestedPricingMode
  const processingRegion = metadata?.processingRegion ?? 'UNKNOWN'
  let cost: ProviderCost
  if (!usage) {
    cost = { ordinaryInputCostUsd: null, cachedInputCostUsd: null, cacheWriteCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'USAGE_MISSING' }
  } else if (!isGpt6Luna(model)) {
    cost = { ordinaryInputCostUsd: null, cachedInputCostUsd: null, cacheWriteCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'UNSUPPORTED_MODEL' }
  } else if (!isStandardPricingMode(effectivePricingMode)) {
    cost = { ordinaryInputCostUsd: null, cachedInputCostUsd: null, cacheWriteCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'UNSUPPORTED_PRICING_MODE' }
  } else if (inconsistentUsage) {
    cost = { ordinaryInputCostUsd: null, cachedInputCostUsd: null, cacheWriteCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'USAGE_INCONSISTENT' }
  } else if (processingRegion === 'UNKNOWN') {
    cost = { ordinaryInputCostUsd: null, cachedInputCostUsd: null, cacheWriteCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'UNPRICED_UNKNOWN_REGION' }
  } else if (processingRegion.startsWith('REGIONAL:')) {
    cost = { ordinaryInputCostUsd: null, cachedInputCostUsd: null, cacheWriteCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'UNPRICED_REGIONAL' }
  } else if (ordinaryInputTokens === null || cachedInputTokens === null || cacheWriteTokens === null || outputTokens === null || contextPricingBand === 'UNKNOWN') {
    cost = { ordinaryInputCostUsd: null, cachedInputCostUsd: null, cacheWriteCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'USAGE_INCOMPLETE' }
  } else {
    const rates = contextPricingBand === 'LONG' ? GPT6_LUNA_STANDARD_RATES.long : GPT6_LUNA_STANDARD_RATES.short
    const ordinaryInputCostUsd = roundUsd(ordinaryInputTokens * rates.ordinaryInputUsdPerMillion / 1_000_000)
    const cachedInputCostUsd = roundUsd(cachedInputTokens * rates.cachedInputUsdPerMillion / 1_000_000)
    const cacheWriteCostUsd = roundUsd(cacheWriteTokens * rates.cacheWriteUsdPerMillion / 1_000_000)
    const outputCostUsd = roundUsd(outputTokens * rates.outputUsdPerMillion / 1_000_000)
    cost = {
      ordinaryInputCostUsd,
      cachedInputCostUsd,
      cacheWriteCostUsd,
      outputCostUsd,
      totalCostUsd: roundUsd(ordinaryInputCostUsd + cachedInputCostUsd + cacheWriteCostUsd + outputCostUsd),
      pricingStatus: 'PRICED_STANDARD',
    }
  }
  return {
    purpose,
    requestedModel: metadata?.requestedModel ?? null,
    model,
    serviceTier,
    requestedPricingMode,
    effectivePricingMode,
    processingRegion,
    latencyMs: Math.max(0, latencyMs),
    startedAt,
    endedAt,
    inputTokens,
    ordinaryInputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    uncachedInputTokens: ordinaryInputTokens,
    outputTokens,
    reasoningTokens,
    contextPricingBand,
    reasoningTokensIncludedInOutput: reasoningTokens === null ? null : true,
    usage,
    cost,
  }
}

export function openAIResponseMetadata(
  response: { model?: unknown; service_tier?: unknown; usage?: unknown },
  requestedModel: string,
  requestedPricingMode: string,
): ProviderResponseMetadata {
  const responseModel = typeof response.model === 'string' ? response.model : undefined
  const serviceTier = typeof response.service_tier === 'string' ? response.service_tier : undefined
  const usage = response.usage && typeof response.usage === 'object' && !Array.isArray(response.usage)
    ? response.usage as OpenAIResponsesUsage
    : undefined
  return { requestedModel, responseModel, requestedPricingMode, serviceTier, usage }
}

function sumComplete(values: Array<number | null>): number | null {
  if (values.length === 0 || values.some((value) => value === null)) return null
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}

export class ContractGenerationMetrics {
  private readonly clock: MetricsClock
  private readonly monotonicStart: number
  private readonly generationStartedAt: string
  private generationCompletedAt: string | null = null
  private totalGenerationMs: number | null = null
  private readonly activeStages = new Map<GenerationMetricStage, { monotonic: number; timestamp: string }>()
  private readonly stageTimestamps: Partial<Record<GenerationMetricStage, StageTimestamps>> = {}
  private readonly stageDurations: Partial<Record<GenerationMetricStage, number>> = {}
  private readonly calls: ProviderCallMeasurement[] = []

  constructor(clock: MetricsClock = systemMetricsClock) {
    this.clock = clock
    this.monotonicStart = clock.monotonicNow()
    this.generationStartedAt = clock.wallNow().toISOString()
  }

  startStage(stage: GenerationMetricStage): void {
    this.activeStages.set(stage, { monotonic: this.clock.monotonicNow(), timestamp: this.clock.wallNow().toISOString() })
  }

  endStage(stage: GenerationMetricStage): number {
    const start = this.activeStages.get(stage)
    if (!start) return 0
    this.activeStages.delete(stage)
    const endedAt = this.clock.wallNow().toISOString()
    const durationMs = Math.max(0, this.clock.monotonicNow() - start.monotonic)
    this.stageTimestamps[stage] = { startedAt: start.timestamp, endedAt }
    this.stageDurations[stage] = durationMs
    return durationMs
  }

  recordProviderCall(
    purpose: ProviderCallMeasurement['purpose'],
    latencyMs: number,
    startedAt: string,
    endedAt: string,
    metadata?: ProviderResponseMetadata,
  ): void {
    this.calls.push(normalizeProviderCall(purpose, latencyMs, startedAt, endedAt, metadata))
  }

  finish(): GenerationMeasurements {
    if (this.generationCompletedAt === null) {
      this.generationCompletedAt = this.clock.wallNow().toISOString()
      this.totalGenerationMs = Math.max(0, this.clock.monotonicNow() - this.monotonicStart)
    }
    return this.snapshot()
  }

  snapshot(): GenerationMeasurements {
    const calls = [...this.calls]
    const totalCostUsd = sumComplete(calls.map((call) => call.cost.totalCostUsd))
    const totals = {
      totalInputTokens: sumComplete(calls.map((call) => call.inputTokens)),
      totalOrdinaryInputTokens: sumComplete(calls.map((call) => call.ordinaryInputTokens)),
      totalCachedInputTokens: sumComplete(calls.map((call) => call.cachedInputTokens)),
      totalCacheWriteTokens: sumComplete(calls.map((call) => call.cacheWriteTokens)),
      totalOutputTokens: sumComplete(calls.map((call) => call.outputTokens)),
      totalReasoningTokens: sumComplete(calls.map((call) => call.reasoningTokens)),
      totalOrdinaryInputCostUsd: sumComplete(calls.map((call) => call.cost.ordinaryInputCostUsd)),
      totalCachedInputCostUsd: sumComplete(calls.map((call) => call.cost.cachedInputCostUsd)),
      totalCacheWriteCostUsd: sumComplete(calls.map((call) => call.cost.cacheWriteCostUsd)),
      totalOutputCostUsd: sumComplete(calls.map((call) => call.cost.outputCostUsd)),
      totalCostUsd: totalCostUsd === null ? null : roundUsd(totalCostUsd),
    }
    return {
      timestamps: {
        generationStartedAt: this.generationStartedAt,
        generationCompletedAt: this.generationCompletedAt,
        stages: { ...this.stageTimestamps },
      },
      totalGenerationMs: this.totalGenerationMs,
      stages: {
        preflightMs: this.stageDurations.preflight ?? null,
        inventoryProviderMs: this.stageDurations.inventoryProvider ?? null,
        generationProviderMs: this.stageDurations.generationProvider ?? null,
        planningProviderMs: this.stageDurations.planningProvider ?? null,
        planValidationMs: this.stageDurations.planValidation ?? null,
        docxApplyMs: this.stageDurations.docxApply ?? null,
        candidateValidationMs: this.stageDurations.candidateValidation ?? null,
        reviewProviderMs: this.stageDurations.reviewProvider ?? null,
      },
      providerCalls: calls,
      totalTokens: {
        input: sumComplete(calls.map((call) => call.inputTokens)),
        cachedInput: sumComplete(calls.map((call) => call.cachedInputTokens)),
        output: sumComplete(calls.map((call) => call.outputTokens)),
        reasoning: sumComplete(calls.map((call) => call.reasoningTokens)),
      },
      totals,
      totalCostUsd: totals.totalCostUsd,
    }
  }
}
