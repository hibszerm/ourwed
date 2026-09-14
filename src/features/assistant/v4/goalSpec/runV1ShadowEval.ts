/**
 * V1 — Shadow eval: one Luna GoalSpec → RAW vs VALIDATED Binder/DQ fork.
 *
 *   G8_MODEL=gpt-5.6-luna G8_FOCUSED=1 npx tsx --env-file=.env.local \
 *     --tsconfig tsconfig.app.json \
 *     src/features/assistant/v4/goalSpec/runV1ShadowEval.ts
 *
 * Never prints/logs the API key. No product cutover. One API call per case.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery, type DomainQuery } from '../domainQuery/domainQuery'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { compileBoundGoalToDomainQuery } from './compileBoundGoalToDomainQuery'
import {
  normalizeDomainQuerySemantics,
  scoreGoalSpecAgainstExpected,
} from './compareGoalSpecSemantics'
import {
  G8_FOCUSED_EVAL_CORPUS,
  g8FocusedCorpusStats,
} from './g8FocusedEvalCorpus'
import { G8_LIVE_EVAL_CORPUS, type G8LiveEvalCase } from './g8LiveEvalCorpus'
import { ASSISTANT_V5_GOALSPEC_JSON_SCHEMA } from './goalSpecSchema'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from './goalSpecInterpreterPrompt'
import { parseFlatGoalSpecPayload } from './goalSpecSchema'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'
import type { GoalSpec } from './goalSpec'
import {
  validateGoalSpecConsistency,
  type TypedCorrection,
  type ValidateGoalSpecConsistencyResult,
} from './validateGoalSpec'

type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function resolveEvalModel() {
  const model = (process.env.G8_MODEL ?? 'gpt-5.6-luna').trim()
  if (model === 'gpt-5.6-luna') {
    return {
      model,
      requestParams: { max_completion_tokens: 900 },
      notes: [
        'gpt-5.6-luna uses max_completion_tokens',
        'temperature default (1)',
      ],
    }
  }
  return {
    model,
    requestParams: { temperature: 0, max_tokens: 900 },
    notes: [],
  }
}

async function callOpenAIGoalSpecOnce(
  utterance: string,
  semanticContext: unknown,
  modelCfg: ReturnType<typeof resolveEvalModel>,
): Promise<
  | { ok: true; goalSpec: GoalSpec; usage: Usage | null }
  | { ok: false; error: string; kind: 'provider' | 'schema'; usage: Usage | null }
> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, error: 'missing_openai_key', kind: 'provider', usage: null }
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelCfg.model,
      ...modelCfg.requestParams,
      messages: [
        { role: 'system', content: V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            utterance,
            semanticContextSummary: semanticContext,
            locale: 'pl-PL',
          }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'assistant_v5_goal_spec',
          strict: true,
          schema: ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
        },
      },
    }),
  })
  const body = await res.json().catch(() => null)
  const usage = (body?.usage as Usage | undefined) ?? null
  if (!res.ok) {
    const code = body?.error?.code ?? body?.error?.type ?? `http_${res.status}`
    return {
      ok: false,
      error: `provider_${res.status}_${String(code)}`,
      kind: 'provider',
      usage,
    }
  }
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return { ok: false, error: 'empty_content', kind: 'provider', usage }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false, error: 'json_parse', kind: 'schema', usage }
  }
  const goal = parseFlatGoalSpecPayload(parsed)
  if (!goal) {
    return { ok: false, error: 'schema_error', kind: 'schema', usage }
  }
  return {
    ok: true,
    goalSpec: normalizeGoalSpecTemporal(goal, '2026-09-13'),
    usage,
  }
}

async function callOpenAIGoalSpec(
  utterance: string,
  semanticContext: unknown,
  modelCfg: ReturnType<typeof resolveEvalModel>,
) {
  let last = await callOpenAIGoalSpecOnce(utterance, semanticContext, modelCfg)
  for (let attempt = 0; attempt < 3 && !last.ok; attempt++) {
    if (last.kind === 'schema') return last
    const transient =
      last.error.includes('429') ||
      last.error.includes('rate') ||
      last.error.includes('500') ||
      last.error.includes('502') ||
      last.error.includes('503') ||
      last.error.includes('empty_content')
    if (!transient) return last
    await sleep(800 * Math.pow(2, attempt))
    last = await callOpenAIGoalSpecOnce(utterance, semanticContext, modelCfg)
  }
  return last
}

function dateBindingFromTemporal(
  temporal: string | null | undefined,
): DomainQuery['dateBinding'] {
  if (!temporal) return null
  const t = temporal.toLowerCase()
  const year = t.match(/\b(20\d{2})\b/)
  if (year) {
    const y = year[1]
    return {
      dimension: 'wedding.date',
      range: { from: `${y}-01-01`, to: `${y}-12-31` },
    }
  }
  if (t.includes('sierp')) {
    return {
      dimension: 'wedding.date',
      range: { from: '2026-08-01', to: '2026-08-31' },
    }
  }
  if (t.includes('wrześ') || t.includes('wrzes')) {
    return {
      dimension: 'wedding.date',
      range: { from: '2026-09-01', to: '2026-09-30' },
    }
  }
  return null
}

function activeQueryForCase(c: G8LiveEvalCase): DomainQuery | null {
  if (!c.expect.executable || !c.expect.inheritActiveCollection) return null
  const place = c.semanticContext?.previousGoalSummary?.placeName
  const temporal = c.semanticContext?.previousGoalSummary?.temporalExpression
  const relations = place
    ? [
        {
          relation: 'place' as const,
          field: 'place.name' as const,
          op: 'contains' as const,
          value: place,
        },
      ]
    : []
  return emptyDomainQuery({
    aggregate: 'count',
    relations,
    dateBinding: dateBindingFromTemporal(temporal),
  })
}

type BranchOutcome = {
  goal: GoalSpec
  score: ReturnType<typeof scoreGoalSpecAgainstExpected>
  binderStatus: 'bound' | 'needs_clarification' | 'unsupported' | 'error'
  boundGoalAgree: boolean | null
  domainQueryAgree: boolean | null
  failDims: string[]
  executableOk: boolean
  clarificationOk: boolean
  safeOutcome: boolean
}

function evaluateBranch(
  goal: GoalSpec,
  c: G8LiveEvalCase,
): BranchOutcome {
  const score = scoreGoalSpecAgainstExpected(
    goal,
    c.expect as Parameters<typeof scoreGoalSpecAgainstExpected>[1],
  )
  let boundGoalAgree: boolean | null = null
  let domainQueryAgree: boolean | null = null

  const ctxQ = activeQueryForCase(c)
  const bound = bindGoalSpec(
    goal,
    makeGoalBinderContext({ activeCollectionQuery: ctxQ }),
  )

  let binderStatus: BranchOutcome['binderStatus']
  if (c.expect.executable) {
    if (bound.status === 'bound') {
      binderStatus = 'bound'
      boundGoalAgree = true
      const compiled = compileBoundGoalToDomainQuery(bound.goal)
      domainQueryAgree = compiled.status === 'success'
      if (compiled.status === 'success' && domainQueryAgree) {
        const n = normalizeDomainQuerySemantics(compiled.query)
        if (c.expect.aggregation != null) {
          domainQueryAgree =
            n.aggregate === c.expect.aggregation ||
            (c.expect.aggregation === 'list' && n.aggregate === null)
        }
        if (domainQueryAgree && c.expect.measure !== undefined) {
          domainQueryAgree = n.measure === c.expect.measure
        }
      }
      score.domainQueryAgree = domainQueryAgree
    } else if (bound.status === 'needs_clarification') {
      binderStatus = 'needs_clarification'
      boundGoalAgree = false
      domainQueryAgree = false
      score.domainQueryAgree = false
    } else {
      binderStatus = 'unsupported'
      boundGoalAgree = false
      domainQueryAgree = false
      score.domainQueryAgree = false
    }
  } else {
    binderStatus =
      bound.status === 'bound'
        ? 'bound'
        : bound.status === 'needs_clarification'
          ? 'needs_clarification'
          : 'unsupported'
  }

  const dimEntries: Array<[string, boolean]> = [
    ['requestKind', score.requestKind],
    ['aggregation', score.aggregation],
    ['measure', score.measure],
    ['source', score.source],
    ['temporal', score.temporal],
    ['relation', score.relation],
    ['ambiguity', score.ambiguity],
    ['correction', score.correction],
    ['ellipsis', score.ellipsis],
  ]
  const failDims = dimEntries.filter(([, ok]) => !ok).map(([k]) => k)
  if (score.domainQueryAgree === false) failDims.push('domainQuery')

  const executableOk =
    c.expect.executable === true && domainQueryAgree === true
  const clarificationOk =
    c.expect.executable === false &&
    (binderStatus === 'needs_clarification' ||
      (c.expect.ambiguitySlots?.length ?? 0) > 0 && score.ambiguity)
  const safeOutcome = executableOk || clarificationOk === true

  return {
    goal,
    score,
    binderStatus,
    boundGoalAgree,
    domainQueryAgree,
    failDims,
    executableOk,
    clarificationOk: !!clarificationOk,
    safeOutcome,
  }
}

function goalsSemanticallyCloser(
  before: GoalSpec,
  after: GoalSpec,
  c: G8LiveEvalCase,
): 'improved' | 'same' | 'worse' {
  const b = scoreGoalSpecAgainstExpected(
    before,
    c.expect as Parameters<typeof scoreGoalSpecAgainstExpected>[1],
  )
  const a = scoreGoalSpecAgainstExpected(
    after,
    c.expect as Parameters<typeof scoreGoalSpecAgainstExpected>[1],
  )
  const dims = [
    'requestKind',
    'aggregation',
    'measure',
    'temporal',
    'relation',
    'ambiguity',
  ] as const
  let delta = 0
  for (const d of dims) {
    if (b[d] === a[d]) continue
    if (a[d] && !b[d]) delta += 1
    if (!a[d] && b[d]) delta -= 1
  }
  if (delta > 0) return 'improved'
  if (delta < 0) return 'worse'
  return 'same'
}

async function main() {
  const focused = process.env.G8_FOCUSED !== '0'
  const full = process.env.G8_FULL === '1'
  const cases: G8LiveEvalCase[] = full
    ? G8_LIVE_EVAL_CORPUS
    : G8_FOCUSED_EVAL_CORPUS
  const modelCfg = resolveEvalModel()
  const corpusLabel = full ? 'full' : 'focused'

  console.log(
    `V1 shadow eval model=${modelCfg.model} corpus=${corpusLabel} n=${cases.length}`,
  )
  if (!full) console.log(JSON.stringify(g8FocusedCorpusStats()))

  const usageTotals = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    apiCalls: 0,
  }

  type CaseRow = {
    id: string
    utterance: string
    validatorStatus: ValidateGoalSpecConsistencyResult['status']
    corrections: TypedCorrection[]
    issueCodes: string[]
    raw: BranchOutcome
    validated: BranchOutcome
    falseCorrection: boolean
    damagedCorrect: boolean
    unsafeGuess: boolean
    originalGoalSpec: GoalSpec
    validatedGoalSpec: GoalSpec
  }

  const rows: CaseRow[] = []

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!
    process.stdout.write(`  [${i + 1}/${cases.length}] ${c.id}… `)
    const live = await callOpenAIGoalSpec(
      c.utterance,
      c.semanticContext ?? null,
      modelCfg,
    )
    usageTotals.apiCalls += 1
    if (live.usage) {
      usageTotals.prompt_tokens += live.usage.prompt_tokens ?? 0
      usageTotals.completion_tokens += live.usage.completion_tokens ?? 0
      usageTotals.total_tokens += live.usage.total_tokens ?? 0
    }
    if (!live.ok) {
      console.log(`ERR ${live.error}`)
      continue
    }

    const original = live.goalSpec
    const validation = validateGoalSpecConsistency(original, {
      activeCollectionQuery: activeQueryForCase(c),
    })
    const validatedGoal = validation.goal

    const raw = evaluateBranch(original, c)
    const validated = evaluateBranch(validatedGoal, c)

    const closeness =
      validation.status === 'normalized'
        ? goalsSemanticallyCloser(original, validatedGoal, c)
        : 'same'

    // False correction: any normalization that worsens golden agreement
    const falseCorrection =
      validation.status === 'normalized' && closeness === 'worse'

    // Unsafe guess: measure invented when it was null
    const unsafeGuess =
      original.measure == null &&
      validatedGoal.measure != null &&
      validation.status === 'normalized'

    const damagedCorrect =
      raw.safeOutcome &&
      raw.executableOk &&
      (!validated.executableOk || !validated.safeOutcome)

    rows.push({
      id: c.id,
      utterance: c.utterance,
      validatorStatus: validation.status,
      corrections:
        validation.status === 'normalized' ||
        validation.status === 'needs_clarification'
          ? validation.corrections
          : [],
      issueCodes:
        validation.status === 'valid'
          ? []
          : 'issues' in validation
            ? validation.issues.map((x) => x.code)
            : [],
      raw,
      validated,
      falseCorrection,
      damagedCorrect,
      unsafeGuess,
      originalGoalSpec: original,
      validatedGoalSpec: validatedGoal,
    })
    console.log(
      `${validation.status} rawSafe=${raw.safeOutcome} valSafe=${validated.safeOutcome}`,
    )
  }

  const n = rows.length
  const countStatus = (s: ValidateGoalSpecConsistencyResult['status']) =>
    rows.filter((r) => r.validatorStatus === s).length

  const rawDq =
    rows.filter((r) => r.raw.domainQueryAgree === true).length /
    Math.max(1, rows.filter((r) => r.raw.domainQueryAgree !== null).length)
  const valDq =
    rows.filter((r) => r.validated.domainQueryAgree === true).length /
    Math.max(
      1,
      rows.filter((r) => r.validated.domainQueryAgree !== null).length,
    )

  const rawBg =
    rows.filter((r) => r.raw.boundGoalAgree === true).length /
    Math.max(1, rows.filter((r) => r.raw.boundGoalAgree !== null).length)
  const valBg =
    rows.filter((r) => r.validated.boundGoalAgree === true).length /
    Math.max(
      1,
      rows.filter((r) => r.validated.boundGoalAgree !== null).length,
    )

  const rawSafe = rows.filter((r) => r.raw.safeOutcome).length / Math.max(1, n)
  const valSafe =
    rows.filter((r) => r.validated.safeOutcome).length / Math.max(1, n)

  const normalizedRows = rows.filter((r) => r.validatorStatus === 'normalized')
  const trueNorm = normalizedRows.filter((r) => !r.falseCorrection).length
  const normPrecision =
    normalizedRows.length === 0 ? null : trueNorm / normalizedRows.length

  const summary = {
    phase: 'V1',
    model: modelCfg.model,
    modelNotes: modelCfg.notes,
    corpus: corpusLabel,
    n,
    validatorActions: {
      untouched: countStatus('valid'),
      normalized: countStatus('normalized'),
      needs_clarification: countStatus('needs_clarification'),
      invalid: countStatus('invalid'),
    },
    falseCorrectionCount: rows.filter((r) => r.falseCorrection).length,
    unsafeGuessCount: rows.filter((r) => r.unsafeGuess).length,
    damagedCorrectCount: rows.filter((r) => r.damagedCorrect).length,
    normalizationPrecision: normPrecision,
    boundGoal: { raw: rawBg * 100, validated: valBg * 100 },
    domainQuery: { raw: rawDq * 100, validated: valDq * 100 },
    safeOutcomeRate: { raw: rawSafe * 100, validated: valSafe * 100 },
    usage: usageTotals,
    safetyGate: {
      falsePositiveNormalization: rows.filter((r) => r.falseCorrection).length,
      unsafeGuesses: rows.filter((r) => r.unsafeGuess).length,
      damagedCorrect: rows.filter((r) => r.damagedCorrect).length,
    },
  }

  const outDir = resolve(
    process.cwd(),
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(
    outDir,
    `phase-v1-shadow-${corpusLabel}-${modelCfg.model}.json`,
  )
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        ...summary,
        cases: rows.map((r) => ({
          id: r.id,
          utterance: r.utterance,
          validatorStatus: r.validatorStatus,
          corrections: r.corrections,
          issueCodes: r.issueCodes,
          falseCorrection: r.falseCorrection,
          damagedCorrect: r.damagedCorrect,
          unsafeGuess: r.unsafeGuess,
          raw: {
            binderStatus: r.raw.binderStatus,
            boundGoalAgree: r.raw.boundGoalAgree,
            domainQueryAgree: r.raw.domainQueryAgree,
            failDims: r.raw.failDims,
            safeOutcome: r.raw.safeOutcome,
            executableOk: r.raw.executableOk,
            clarificationOk: r.raw.clarificationOk,
          },
          validated: {
            binderStatus: r.validated.binderStatus,
            boundGoalAgree: r.validated.boundGoalAgree,
            domainQueryAgree: r.validated.domainQueryAgree,
            failDims: r.validated.failDims,
            safeOutcome: r.validated.safeOutcome,
            executableOk: r.validated.executableOk,
            clarificationOk: r.validated.clarificationOk,
          },
          originalGoalSpec: r.originalGoalSpec,
          validatedGoalSpec: r.validatedGoalSpec,
        })),
      },
      null,
      2,
    ),
  )

  console.log('\n=== V1 SHADOW SUMMARY ===')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`artifact: ${outPath}`)

  const safetyOk =
    summary.safetyGate.falsePositiveNormalization === 0 &&
    summary.safetyGate.unsafeGuesses === 0 &&
    summary.safetyGate.damagedCorrect === 0
  const improved =
    summary.safeOutcomeRate.validated > summary.safeOutcomeRate.raw + 0.5 ||
    summary.domainQuery.validated > summary.domainQuery.raw + 0.5 ||
    (summary.validatorActions.normalized > 0 &&
      (summary.normalizationPrecision ?? 0) === 1)

  if (!safetyOk) {
    console.log('SAFETY GATE FAILED — do not run full corpus')
    process.exitCode = 2
  } else if (!improved && focused && !full) {
    console.log(
      'FOCUSED VALUE WEAK — per V1 policy STOP before full 86-case run',
    )
  } else if (safetyOk && improved && focused && !full) {
    console.log(
      'FOCUSED POSITIVE — full run allowed via G8_FULL=1 (not auto-started)',
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
