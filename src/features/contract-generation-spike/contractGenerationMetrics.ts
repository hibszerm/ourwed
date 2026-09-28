export type GenerationMetricStage =
  | 'preflight'
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
  input_tokens_details?: Record<string, unknown> & { cached_tokens?: number }
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
  usage?: OpenAIResponsesUsage
}

export type ProviderCost = {
  inputCostUsd: number | null
  cachedInputCostUsd: number | null
  outputCostUsd: number | null
  totalCostUsd: number | null
  pricingStatus: 'PRICED_STANDARD' | 'USAGE_MISSING' | 'USAGE_INCOMPLETE' | 'UNSUPPORTED_MODEL' | 'UNSUPPORTED_PRICING_MODE'
}

export type ProviderCallMeasurement = {
  purpose: 'planning' | 'review'
  requestedModel: string | null
  model: string | null
  serviceTier: string | null
  requestedPricingMode: string | null
  effectivePricingMode: string | null
  latencyMs: number
  startedAt: string
  endedAt: string
  inputTokens: number | null
  cachedInputTokens: number | null
  uncachedInputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
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
  totalCostUsd: number | null
}

export const GPT6_LUNA_STANDARD_RATES = Object.freeze({
  inputUsdPerMillion: 0.10,
  cachedInputUsdPerMillion: 0.01,
  outputUsdPerMillion: 0.50,
})

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
  const cachedInputTokens = nonNegativeInteger(usage?.input_tokens_details?.cached_tokens ?? usage?.cached_input_tokens)
  const outputTokens = nonNegativeInteger(usage?.output_tokens)
  const reasoningTokens = nonNegativeInteger(usage?.output_tokens_details?.reasoning_tokens ?? usage?.reasoning_tokens)
  const uncachedInputTokens = inputTokens !== null && cachedInputTokens !== null
    ? Math.max(0, inputTokens - cachedInputTokens)
    : null
  const model = metadata?.responseModel ?? metadata?.requestedModel ?? null
  const serviceTier = metadata?.serviceTier ?? null
  const requestedPricingMode = metadata?.requestedPricingMode ?? null
  const effectivePricingMode = serviceTier ?? requestedPricingMode
  let cost: ProviderCost
  if (!usage) {
    cost = { inputCostUsd: null, cachedInputCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'USAGE_MISSING' }
  } else if (!isGpt6Luna(model)) {
    cost = { inputCostUsd: null, cachedInputCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'UNSUPPORTED_MODEL' }
  } else if (!isStandardPricingMode(effectivePricingMode)) {
    cost = { inputCostUsd: null, cachedInputCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'UNSUPPORTED_PRICING_MODE' }
  } else if (uncachedInputTokens === null || cachedInputTokens === null || outputTokens === null) {
    cost = { inputCostUsd: null, cachedInputCostUsd: null, outputCostUsd: null, totalCostUsd: null, pricingStatus: 'USAGE_INCOMPLETE' }
  } else {
    const inputCostUsd = roundUsd(uncachedInputTokens * GPT6_LUNA_STANDARD_RATES.inputUsdPerMillion / 1_000_000)
    const cachedInputCostUsd = roundUsd(cachedInputTokens * GPT6_LUNA_STANDARD_RATES.cachedInputUsdPerMillion / 1_000_000)
    const outputCostUsd = roundUsd(outputTokens * GPT6_LUNA_STANDARD_RATES.outputUsdPerMillion / 1_000_000)
    cost = {
      inputCostUsd,
      cachedInputCostUsd,
      outputCostUsd,
      totalCostUsd: roundUsd(inputCostUsd + cachedInputCostUsd + outputCostUsd),
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
    latencyMs: Math.max(0, latencyMs),
    startedAt,
    endedAt,
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    reasoningTokens,
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
    const costs = calls.map((call) => call.cost.totalCostUsd)
    const totalCostUsd = sumComplete(costs)
    return {
      timestamps: {
        generationStartedAt: this.generationStartedAt,
        generationCompletedAt: this.generationCompletedAt,
        stages: { ...this.stageTimestamps },
      },
      totalGenerationMs: this.totalGenerationMs,
      stages: {
        preflightMs: this.stageDurations.preflight ?? null,
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
      totalCostUsd: totalCostUsd === null ? null : roundUsd(totalCostUsd),
    }
  }
}
