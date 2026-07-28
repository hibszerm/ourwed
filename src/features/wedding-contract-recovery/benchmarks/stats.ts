export function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null
  if (sortedAsc.length === 1) return sortedAsc[0]!
  const rank = (p / 100) * (sortedAsc.length - 1)
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  if (low === high) return sortedAsc[low]!
  const weight = rank - low
  return sortedAsc[low]! * (1 - weight) + sortedAsc[high]! * weight
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function summarizeLatency(values: number[]): {
  min: number | null
  median: number | null
  p90: number | null
  max: number | null
  mean: number | null
} {
  const sorted = [...values].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  return {
    min: sorted[0] ?? null,
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    max: sorted.length ? sorted[sorted.length - 1]! : null,
    mean: mean(sorted),
  }
}

export type ModelPriceConfig = {
  inputPerMillionUsd: number
  cachedInputPerMillionUsd: number
  outputPerMillionUsd: number
}

/** Configurable defaults — override via env; do not treat as billing truth. */
export const DEFAULT_MODEL_PRICES_USD: Record<string, ModelPriceConfig> = {
  'gpt-5-mini': {
    inputPerMillionUsd: 0.25,
    cachedInputPerMillionUsd: 0.025,
    outputPerMillionUsd: 2.0,
  },
  'gpt-4.1-mini': {
    inputPerMillionUsd: 0.4,
    cachedInputPerMillionUsd: 0.1,
    outputPerMillionUsd: 1.6,
  },
}

export function estimateRecoveryCostUsd(input: {
  model: string
  inputTokens: number | null
  cachedInputTokens: number | null
  outputTokens: number | null
  prices?: Record<string, ModelPriceConfig>
}): { usd: number | null; priced: boolean; note: string } {
  const prices = input.prices ?? DEFAULT_MODEL_PRICES_USD
  const cfg = prices[input.model]
  if (!cfg) {
    return { usd: null, priced: false, note: 'no_price_config_for_model' }
  }
  if (input.inputTokens == null || input.outputTokens == null) {
    return { usd: null, priced: false, note: 'missing_token_usage' }
  }
  const cached = Math.min(input.cachedInputTokens ?? 0, input.inputTokens)
  const uncached = Math.max(0, input.inputTokens - cached)
  const usd =
    (uncached / 1_000_000) * cfg.inputPerMillionUsd +
    (cached / 1_000_000) * cfg.cachedInputPerMillionUsd +
    (input.outputTokens / 1_000_000) * cfg.outputPerMillionUsd
  return { usd, priced: true, note: 'configurable_unit_prices' }
}
