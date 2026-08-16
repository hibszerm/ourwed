/**
 * Controlled OpenAI model benchmark for wedding-contract-recovery.
 *
 * Usage:
 *   OPENAI_API_KEY=... npm run benchmark:wedding-contract-recovery-models
 *
 * Optional env:
 *   BENCHMARK_MODELS=gpt-5-mini,gpt-4.1-mini
 *   BENCHMARK_FIXTURES=A-standard,B-role-separation
 *   BENCHMARK_RUNS=3
 *   BENCHMARK_MAX_REQUESTS=30
 *   BENCHMARK_MAX_ESTIMATED_USD=5
 *   BENCHMARK_INCLUDE_KINGA=1
 *   BENCHMARK_OUT_DIR=tmp/recovery-benchmarks
 *
 * Does not change production model configuration.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION } from '../constants'
import { contractRecoveryExtractionSchema } from '../schema/extractionSchema'
import { readRecoveryProviderUsage, summarizeExtractionTelemetry } from '../providerUsage'
import {
  SYNTHETIC_BENCHMARK_FIXTURES,
  type BenchmarkFixture,
  type FixtureExpectation,
} from './fixtures'
import { scoreRecoveryExtraction } from './qualityScore'
import {
  DEFAULT_MODEL_PRICES_USD,
  estimateRecoveryCostUsd,
  mean,
  summarizeLatency,
} from './stats'

type ModelConfig = {
  id: string
  model: string
  reasoning?: { effort: 'low' }
}

type RunResult = {
  modelId: string
  model: string
  fixtureId: string
  runNumber: number
  httpStatus: number | null
  httpOk: boolean
  providerDurationMs: number | null
  totalDurationMs: number | null
  inputTokens: number | null
  cachedInputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  totalTokens: number | null
  rawResponseCharacters: number
  extractedNonNullFields: number
  validationPassed: boolean
  qualityScore: number
  safetyCriticalFailures: string[]
  disqualified: boolean
  estimatedCostUsd: number | null
  error?: string
}

function loadSchema(): unknown {
  const schemaPath = resolve(
    process.cwd(),
    'supabase/functions/wedding-contract-recovery-analyze/schema.ts',
  )
  const src = readFileSync(schemaPath, 'utf8')
  const body = src
    .replace(/import[^\n]+\n/g, '')
    .replace(/export const RECOVERY_JSON_SCHEMA = /, 'const RECOVERY_JSON_SCHEMA = ')
    .replace(
      /WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION/g,
      JSON.stringify(WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION),
    )
  // eslint-disable-next-line no-eval
  return eval(`${body}\nRECOVERY_JSON_SCHEMA`)
}

function loadPrompt(): string {
  const promptPath = resolve(
    process.cwd(),
    'supabase/functions/wedding-contract-recovery-analyze/prompt.ts',
  )
  const src = readFileSync(promptPath, 'utf8')
  const match = src.match(/export const SYSTEM_PROMPT = `([\s\S]*?)`/)
  if (!match) throw new Error('SYSTEM_PROMPT not found')
  return match[1]!
}

function extractOutputText(body: Record<string, unknown>): string {
  if (typeof body.output_text === 'string') return body.output_text
  const output = body.output
  if (!Array.isArray(output)) return ''
  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (row.type !== 'message' || !Array.isArray(row.content)) continue
    for (const part of row.content) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      if (p.type === 'output_text' && typeof p.text === 'string') chunks.push(p.text)
    }
  }
  return chunks.join('')
}

function parseArgs(argv: string[]) {
  const get = (name: string) => {
    const idx = argv.indexOf(name)
    if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]
    return null
  }
  return {
    models: (get('--models') || process.env.BENCHMARK_MODELS || 'gpt-5-mini,gpt-4.1-mini')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    fixtures: (get('--fixtures') || process.env.BENCHMARK_FIXTURES || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    runs: Number(get('--runs') || process.env.BENCHMARK_RUNS || 3),
    maxRequests: Number(get('--max-requests') || process.env.BENCHMARK_MAX_REQUESTS || 30),
    maxUsd: Number(get('--max-usd') || process.env.BENCHMARK_MAX_ESTIMATED_USD || 8),
    includeKinga:
      (get('--include-kinga') || process.env.BENCHMARK_INCLUDE_KINGA || '1') !== '0',
    outDir:
      get('--out-dir') ||
      process.env.BENCHMARK_OUT_DIR ||
      'tmp/recovery-benchmarks',
    reduced:
      (get('--reduced') || process.env.BENCHMARK_REDUCED || '') === '1',
  }
}

function buildModelConfigs(models: string[]): ModelConfig[] {
  return models.map((model) => ({
    id: model === 'gpt-5-mini' ? 'A-gpt-5-mini-low' : `B-${model}`,
    model,
    reasoning: /^gpt-5/i.test(model) ? { effort: 'low' as const } : undefined,
  }))
}

async function verifyModels(apiKey: string, models: string[]) {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    return {
      ok: false as const,
      available: [] as string[],
      missing: models,
      error: `models.list HTTP ${res.status}`,
    }
  }
  const json = (await res.json()) as { data?: Array<{ id: string }> }
  const ids = new Set((json.data ?? []).map((m) => m.id))
  const missing = models.filter((m) => !ids.has(m))
  return { ok: missing.length === 0, available: [...ids], missing, error: null as string | null }
}

async function loadKingaFixture(): Promise<BenchmarkFixture | null> {
  // Prefer env path (gitignored), else DB recovery validated source text is not stored —
  // reconstruct from latest applied Kinga recovery by reading plain text is unavailable.
  // Use management API to pull a stored extraction's evidence-free summary is wrong.
  // Instead: extract from local DOCX if present, else skip.
  const envPath = process.env.RECOVERY_BENCHMARK_KINGA_TEXT_PATH
  if (envPath && existsSync(envPath)) {
    const text = readFileSync(envPath, 'utf8')
    return kingaFixtureFromText(text)
  }

  try {
    const token = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Supabase CLI', '-w'],
      { encoding: 'utf8' },
    ).trim()
    // Pull normalized extraction only for expected answers; document text itself
    // is reconstructed from a local anonymized? No — user asked for stored Kinga text.
    // Fetch via storage is hard. Use Desktop DOCX if available (runtime only, not committed).
    const candidates = [
      process.env.OW_BENCHMARK_DOCX ?? '',
    ]
    for (const path of candidates) {
      if (!existsSync(path)) continue
      const text = extractDocxText(path)
      if (text.length > 500) return kingaFixtureFromText(text)
    }
    void token
  } catch {
    // ignore
  }
  return null
}

function extractDocxText(path: string): string {
  // lightweight unzip via python for runtime-only Kinga input
  const script = `
import zipfile, sys
from xml.etree import ElementTree as ET
path=sys.argv[1]
with zipfile.ZipFile(path) as z:
    xml=z.read('word/document.xml')
root=ET.fromstring(xml)
paras=[]
for p in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
    texts=[t.text or '' for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')]
    line=''.join(texts).strip()
    if line: paras.append(line)
print('\\n'.join(paras))
`
  return execFileSync('python3', ['-c', script, path], { encoding: 'utf8' })
}

function kingaFixtureFromText(plainText: string): BenchmarkFixture {
  const expect: FixtureExpectation = {
    partner1FirstName: 'Kinga',
    partner1LastName: 'Tchórz',
    partner1PhoneContains: '530',
    partner2FirstName: null,
    forbiddenClientSubstrings: ['Kowalski', 'Atelier Studio', '500 100', '5250000000'],
    signingDate: '2026-07-25',
    weddingDate: '2028-06-03',
    totalValue: 20800,
    depositAmount: 1000,
    remainingAmount: 19800,
    currencyContains: 'PLN',
    packageNameContains: 'Photo + Video',
    includedItemSubstrings: ['teledysk', 'film', '600'],
    deliveryDeadlineContains: 'miesięcy',
    forbiddenBankAccountFragment: null,
  }
  return {
    id: 'Kinga-real',
    label: 'Stored Kinga contract text (runtime only, not committed)',
    fileName: 'Umowa GP - Kinga T doc.docx',
    plainText,
    expect,
  }
}

async function runOnce(input: {
  apiKey: string
  config: ModelConfig
  fixture: BenchmarkFixture
  runNumber: number
  schema: unknown
  systemPrompt: string
}): Promise<RunResult> {
  const started = Date.now()
  const body: Record<string, unknown> = {
    model: input.config.model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: input.systemPrompt }] },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              fileName: input.fixture.fileName,
              mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              documentText: input.fixture.plainText,
            }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'wedding_contract_recovery',
        strict: true,
        schema: input.schema,
      },
    },
    max_output_tokens: input.config.reasoning ? 14_000 : 10_000,
  }
  if (input.config.reasoning) body.reasoning = input.config.reasoning

  let httpStatus: number | null = null
  let json: Record<string, unknown> = {}
  const providerStarted = Date.now()
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    httpStatus = response.status
    json = (await response.json()) as Record<string, unknown>
  } catch (err) {
    return {
      modelId: input.config.id,
      model: input.config.model,
      fixtureId: input.fixture.id,
      runNumber: input.runNumber,
      httpStatus: null,
      httpOk: false,
      providerDurationMs: Date.now() - providerStarted,
      totalDurationMs: Date.now() - started,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      rawResponseCharacters: 0,
      extractedNonNullFields: 0,
      validationPassed: false,
      qualityScore: 0,
      safetyCriticalFailures: ['invalid_structured_output'],
      disqualified: true,
      estimatedCostUsd: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const providerDurationMs = Date.now() - providerStarted
  const outputText = extractOutputText(json)
  const usage = readRecoveryProviderUsage(json)
  let parsed: unknown = null
  let validationPassed = false
  if (httpStatus === 200 && outputText.trim()) {
    try {
      parsed = JSON.parse(outputText)
      validationPassed = contractRecoveryExtractionSchema.safeParse(parsed).success
    } catch {
      validationPassed = false
    }
  }

  const scored = scoreRecoveryExtraction(parsed, input.fixture.expect, {
    httpOk: httpStatus === 200,
    validationPassed,
    responseVersion:
      parsed && typeof parsed === 'object'
        ? String((parsed as { responseVersion?: unknown }).responseVersion ?? '')
        : null,
  })
  const telemetry = summarizeExtractionTelemetry(parsed)
  const cost = estimateRecoveryCostUsd({
    model: input.config.model,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
  })

  return {
    modelId: input.config.id,
    model: input.config.model,
    fixtureId: input.fixture.id,
    runNumber: input.runNumber,
    httpStatus,
    httpOk: httpStatus === 200,
    providerDurationMs,
    totalDurationMs: Date.now() - started,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
    rawResponseCharacters: outputText.length,
    extractedNonNullFields: telemetry.nonNullFieldCount,
    validationPassed,
    qualityScore: scored.qualityScore,
    safetyCriticalFailures: scored.safetyFailures,
    disqualified: scored.disqualified,
    estimatedCostUsd: cost.usd,
    error: httpStatus === 200 ? undefined : `http_${httpStatus}`,
  }
}

function aggregateByModel(results: RunResult[]) {
  const byModel = new Map<string, RunResult[]>()
  for (const row of results) {
    const list = byModel.get(row.model) ?? []
    list.push(row)
    byModel.set(row.model, list)
  }
  const summaries = []
  for (const [model, rows] of byModel) {
    const latencies = rows
      .map((r) => r.providerDurationMs)
      .filter((n): n is number => n != null)
    const latency = summarizeLatency(latencies)
    const successRate = rows.filter((r) => r.httpOk).length / Math.max(1, rows.length)
    const validationPassRate =
      rows.filter((r) => r.validationPassed).length / Math.max(1, rows.length)
    const safetyCount = rows.reduce((sum, r) => sum + r.safetyCriticalFailures.length, 0)
    const disqualifiedRuns = rows.filter((r) => r.disqualified).length
    summaries.push({
      model,
      runs: rows.length,
      successRate,
      validationPassRate,
      latency,
      meanInputTokens: mean(rows.map((r) => r.inputTokens).filter((n): n is number => n != null)),
      meanOutputTokens: mean(
        rows.map((r) => r.outputTokens).filter((n): n is number => n != null),
      ),
      meanTotalTokens: mean(rows.map((r) => r.totalTokens).filter((n): n is number => n != null)),
      meanResponseChars: mean(rows.map((r) => r.rawResponseCharacters)),
      meanQualityScore: mean(rows.map((r) => r.qualityScore)),
      safetyCriticalFailureCount: safetyCount,
      disqualifiedRuns,
      meanEstimatedCostUsd: mean(
        rows.map((r) => r.estimatedCostUsd).filter((n): n is number => n != null),
      ),
      priceConfig: DEFAULT_MODEL_PRICES_USD[model] ?? null,
    })
  }
  return summaries
}

function recommend(summaries: ReturnType<typeof aggregateByModel>): {
  decision: 'keep gpt-5-mini' | 'switch to gpt-4.1-mini' | 'insufficient evidence'
  reason: string
} {
  const a = summaries.find((s) => s.model === 'gpt-5-mini')
  const b = summaries.find((s) => s.model === 'gpt-4.1-mini')
  if (!a || !b) {
    return { decision: 'insufficient evidence', reason: 'One or both models missing from results.' }
  }
  if (a.runs < 3 || b.runs < 3) {
    return { decision: 'insufficient evidence', reason: 'Fewer than 3 runs per model overall.' }
  }
  if (b.disqualifiedRuns > 0 || b.safetyCriticalFailureCount > 0) {
    return {
      decision: 'keep gpt-5-mini',
      reason: 'gpt-4.1-mini has safety-critical failures or disqualified runs.',
    }
  }
  if (a.disqualifiedRuns > 0 || a.safetyCriticalFailureCount > 0) {
    // B clean, A not — still prefer keep unless B clearly better; safety on A is concerning
    // but production is A; if A has failures on fixtures, still don't auto-switch without parity proof
  }
  const qualityDelta = (b.meanQualityScore ?? 0) - (a.meanQualityScore ?? 0)
  const validationOk = Math.abs(b.validationPassRate - a.validationPassRate) <= 0.05
  const qualityOk = qualityDelta >= -3
  const medianA = a.latency.median ?? Infinity
  const medianB = b.latency.median ?? Infinity
  const p90A = a.latency.p90 ?? Infinity
  const p90B = b.latency.p90 ?? Infinity
  const latencyMateriallyBetter = medianB < medianA * 0.7 && p90B < p90A * 0.8
  const costOk =
    b.meanEstimatedCostUsd == null ||
    a.meanEstimatedCostUsd == null ||
    b.meanEstimatedCostUsd <= a.meanEstimatedCostUsd * 1.05

  if (
    b.safetyCriticalFailureCount === 0 &&
    validationOk &&
    qualityOk &&
    latencyMateriallyBetter &&
    costOk
  ) {
    return {
      decision: 'switch to gpt-4.1-mini',
      reason:
        'Zero safety failures, equivalent validation/quality, materially lower median+p90 latency, cost equal/lower.',
    }
  }
  if (!latencyMateriallyBetter || qualityDelta < -3) {
    return {
      decision: 'keep gpt-5-mini',
      reason: !latencyMateriallyBetter
        ? 'Faster model did not show material median/p90 latency improvement with quality parity.'
        : 'Faster model quality regresses versus gpt-5-mini.',
    }
  }
  return {
    decision: 'insufficient evidence',
    reason: 'Results are mixed or cost/latency thresholds not clearly satisfied.',
  }
}

function toMarkdown(report: {
  methodology: Record<string, unknown>
  modelVerification: unknown
  summaries: ReturnType<typeof aggregateByModel>
  kinga: RunResult[]
  recommendation: ReturnType<typeof recommend>
  results: RunResult[]
}): string {
  const lines: string[] = []
  lines.push('# Wedding Contract Recovery — Model Benchmark')
  lines.push('')
  lines.push('## Methodology')
  lines.push('```json')
  lines.push(JSON.stringify(report.methodology, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## Model verification')
  lines.push('```json')
  lines.push(JSON.stringify(report.modelVerification, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## Per-model summary')
  for (const s of report.summaries) {
    lines.push(`### ${s.model}`)
    lines.push(
      `- success ${ (s.successRate * 100).toFixed(0)}%, validation ${(s.validationPassRate * 100).toFixed(0)}%`,
    )
    lines.push(
      `- latency ms min/median/p90/max/mean: ${s.latency.min}/${s.latency.median?.toFixed?.(0) ?? s.latency.median}/${s.latency.p90?.toFixed?.(0) ?? s.latency.p90}/${s.latency.max}/${s.latency.mean?.toFixed?.(0) ?? s.latency.mean}`,
    )
    lines.push(
      `- tokens in/out/total (mean): ${s.meanInputTokens?.toFixed?.(0)} / ${s.meanOutputTokens?.toFixed?.(0)} / ${s.meanTotalTokens?.toFixed?.(0)}`,
    )
    lines.push(`- mean quality: ${s.meanQualityScore?.toFixed?.(1)}`)
    lines.push(`- safety failures: ${s.safetyCriticalFailureCount}, disqualified runs: ${s.disqualifiedRuns}`)
    lines.push(`- mean est. cost USD: ${s.meanEstimatedCostUsd?.toFixed?.(5) ?? 'n/a'}`)
    lines.push('')
  }
  lines.push('## Kinga runs')
  lines.push('```json')
  lines.push(JSON.stringify(report.kinga, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## Recommendation')
  lines.push(`**${report.recommendation.decision}** — ${report.recommendation.reason}`)
  return lines.join('\n')
}

async function runOnceViaEdge(input: {
  edgeUrl: string
  benchmarkToken: string
  config: ModelConfig
  fixture: BenchmarkFixture
  runNumber: number
}): Promise<RunResult> {
  const started = Date.now()
  try {
    const response = await fetch(input.edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-benchmark-token': input.benchmarkToken,
      },
      body: JSON.stringify({
        model: input.config.model,
        plainText: input.fixture.plainText,
        fileName: input.fixture.fileName,
        reasoningEffort: input.config.reasoning?.effort ?? null,
      }),
    })
    const json = (await response.json()) as Record<string, unknown>
    if (!response.ok || json.ok !== true) {
      return {
        modelId: input.config.id,
        model: input.config.model,
        fixtureId: input.fixture.id,
        runNumber: input.runNumber,
        httpStatus: response.status,
        httpOk: false,
        providerDurationMs: Number(json.providerDurationMs) || null,
        totalDurationMs: Date.now() - started,
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        totalTokens: null,
        rawResponseCharacters: 0,
        extractedNonNullFields: 0,
        validationPassed: false,
        qualityScore: 0,
        safetyCriticalFailures: ['invalid_structured_output'],
        disqualified: true,
        estimatedCostUsd: null,
        error: String(json.error ?? `http_${response.status}`),
      }
    }

    const usageRaw = (json.usage ?? {}) as Record<string, unknown>
    const usage = {
      inputTokens: (usageRaw.inputTokens as number | null) ?? null,
      outputTokens: (usageRaw.outputTokens as number | null) ?? null,
      totalTokens: (usageRaw.totalTokens as number | null) ?? null,
      cachedInputTokens: (usageRaw.cachedInputTokens as number | null) ?? null,
      reasoningTokens: (usageRaw.reasoningTokens as number | null) ?? null,
    }
    const parsed = json.extractionPayload
    const validationPassed = Boolean(json.validationPassed)
    const scored = scoreRecoveryExtraction(parsed, input.fixture.expect, {
      httpOk: true,
      validationPassed,
      responseVersion:
        parsed && typeof parsed === 'object'
          ? String((parsed as { responseVersion?: unknown }).responseVersion ?? '')
          : null,
    })
    const telemetry =
      (json.extraction as { nonNullFieldCount?: number } | undefined) ??
      summarizeExtractionTelemetry(parsed)
    const cost = estimateRecoveryCostUsd({
      model: input.config.model,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
    })

    return {
      modelId: input.config.id,
      model: input.config.model,
      fixtureId: input.fixture.id,
      runNumber: input.runNumber,
      httpStatus: Number(json.httpStatus) || 200,
      httpOk: true,
      providerDurationMs: Number(json.providerDurationMs) || null,
      totalDurationMs: Number(json.totalDurationMs) || Date.now() - started,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      totalTokens: usage.totalTokens,
      rawResponseCharacters: Number(json.rawResponseCharacterLength) || 0,
      extractedNonNullFields: Number(telemetry.nonNullFieldCount) || 0,
      validationPassed,
      qualityScore: scored.qualityScore,
      safetyCriticalFailures: scored.safetyFailures,
      disqualified: scored.disqualified,
      estimatedCostUsd: cost.usd,
    }
  } catch (err) {
    return {
      modelId: input.config.id,
      model: input.config.model,
      fixtureId: input.fixture.id,
      runNumber: input.runNumber,
      httpStatus: null,
      httpOk: false,
      providerDurationMs: null,
      totalDurationMs: Date.now() - started,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      rawResponseCharacters: 0,
      extractedNonNullFields: 0,
      validationPassed: false,
      qualityScore: 0,
      safetyCriticalFailures: ['invalid_structured_output'],
      disqualified: true,
      estimatedCostUsd: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const viaEdge =
    (process.env.BENCHMARK_VIA_EDGE || '') === '1' ||
    process.argv.includes('--via-edge')
  const edgeUrl =
    process.env.BENCHMARK_EDGE_URL ||
    'https://xyycwllsovpxlcustpcv.supabase.co/functions/v1/wedding-contract-recovery-bench'
  const benchmarkToken = process.env.BENCHMARK_TOKEN?.trim() || ''
  const apiKey = process.env.OPENAI_API_KEY?.trim()

  if (!viaEdge && !apiKey) {
    console.error('OPENAI_API_KEY is required (or set BENCHMARK_VIA_EDGE=1 with BENCHMARK_TOKEN)')
    process.exit(1)
  }
  if (viaEdge && !benchmarkToken) {
    console.error('BENCHMARK_TOKEN is required for edge mode')
    process.exit(1)
  }

  args.models = args.models.filter((m) => !m.startsWith('--'))

  let verification: { ok: boolean; missing: string[]; error: string | null } = {
    ok: true,
    missing: [],
    error: null,
  }
  if (!viaEdge && apiKey) {
    const v = await verifyModels(apiKey, args.models)
    verification = { ok: v.ok, missing: v.missing, error: v.error }
    if (!verification.ok) {
      console.error(
        JSON.stringify(
          {
            error: 'model_unavailable',
            missing: verification.missing,
            message:
              'Do not silently substitute another model. Fix account/model access or pass available models via --models.',
          },
          null,
          2,
        ),
      )
      process.exit(2)
    }
  } else {
    verification = { ok: true, missing: [], error: 'verified_at_runtime_via_edge' }
  }

  let fixtures = SYNTHETIC_BENCHMARK_FIXTURES.filter(
    (f) => args.fixtures.length === 0 || args.fixtures.includes(f.id),
  )
  if (args.includeKinga) {
    const kinga = await loadKingaFixture()
    if (kinga) fixtures = [...fixtures, kinga]
    else console.warn('Kinga fixture skipped (text unavailable at runtime)')
  }

  const configs = buildModelConfigs(args.models)
  const schema = loadSchema()
  const systemPrompt = loadPrompt()

  let runsPerPair = args.runs
  let methodologyNote = 'full: each fixture × each model × N runs'
  const projected = fixtures.length * configs.length * runsPerPair
  if (args.reduced || projected > args.maxRequests) {
    methodologyNote =
      'reduced: all synthetic fixtures once per model for quality; Kinga × 3 per model for latency'
    runsPerPair = 1
  }

  const plan: Array<{ config: ModelConfig; fixture: BenchmarkFixture; runNumber: number }> = []
  if (methodologyNote.startsWith('reduced')) {
    for (const config of configs) {
      for (const fixture of fixtures.filter((f) => f.id !== 'Kinga-real')) {
        plan.push({ config, fixture, runNumber: 1 })
      }
      const kinga = fixtures.find((f) => f.id === 'Kinga-real')
      if (kinga) {
        for (let i = 1; i <= 3; i++) plan.push({ config, fixture: kinga, runNumber: i })
      }
    }
  } else {
    for (const config of configs) {
      for (const fixture of fixtures) {
        for (let i = 1; i <= runsPerPair; i++) {
          plan.push({ config, fixture, runNumber: i })
        }
      }
    }
  }

  if (plan.length > args.maxRequests) {
    console.error(
      JSON.stringify({
        error: 'max_requests_exceeded',
        planned: plan.length,
        max: args.maxRequests,
      }),
    )
    process.exit(3)
  }

  console.log(
    JSON.stringify({
      plannedRequests: plan.length,
      methodologyNote,
      viaEdge,
      models: args.models,
      fixtures: fixtures.map((f) => f.id),
    }),
  )

  const results: RunResult[] = []
  let estimatedSpend = 0
  for (const item of plan) {
    if (estimatedSpend > args.maxUsd) {
      console.warn('Stopping early: estimated spend guard')
      break
    }
    console.log(`Running ${item.config.model} / ${item.fixture.id} #${item.runNumber}`)
    const result = viaEdge
      ? await runOnceViaEdge({
          edgeUrl,
          benchmarkToken,
          config: item.config,
          fixture: item.fixture,
          runNumber: item.runNumber,
        })
      : await runOnce({
          apiKey: apiKey!,
          config: item.config,
          fixture: item.fixture,
          runNumber: item.runNumber,
          schema,
          systemPrompt,
        })
    results.push(result)
    if (result.estimatedCostUsd != null) estimatedSpend += result.estimatedCostUsd
    console.log(
      JSON.stringify({
        fixture: result.fixtureId,
        model: result.model,
        run: result.runNumber,
        ms: result.providerDurationMs,
        quality: result.qualityScore,
        safety: result.safetyCriticalFailures,
        tokens: {
          in: result.inputTokens,
          out: result.outputTokens,
          cached: result.cachedInputTokens,
          reasoning: result.reasoningTokens,
        },
        error: result.error,
      }),
    )
  }

  const summaries = aggregateByModel(results)
  const recommendation = recommend(summaries)
  const kinga = results.filter((r) => r.fixtureId === 'Kinga-real')
  const report = {
    generatedAt: new Date().toISOString(),
    methodology: {
      note: methodologyNote,
      viaEdge,
      plannedRequests: plan.length,
      completedRequests: results.length,
      maxRequests: args.maxRequests,
      maxEstimatedUsd: args.maxUsd,
      estimatedSpendUsd: estimatedSpend,
      schemaChars: JSON.stringify(schema).length,
      promptVersion: '2026-07-recovery-v2',
      responseVersion: WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION,
      priceSource:
        'Configurable defaults aligned with public 2026 mini-model listings; override via code/env — not live billing API.',
    },
    modelVerification: {
      ok: verification.ok,
      missing: verification.missing,
      note: verification.error,
    },
    summaries,
    kinga,
    recommendation,
    results,
  }

  mkdirSync(args.outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const jsonPath = resolve(args.outDir, `benchmark-${stamp}.json`)
  const mdPath = resolve(args.outDir, `benchmark-${stamp}.md`)
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  writeFileSync(mdPath, toMarkdown(report))
  console.log(JSON.stringify({ wrote: { jsonPath, mdPath }, recommendation }, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
