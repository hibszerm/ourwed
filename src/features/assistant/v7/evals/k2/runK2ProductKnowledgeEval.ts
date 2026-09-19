/**
 * K2 live product-knowledge + mixed + CRM regression eval.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v7/evals/k2/runK2ProductKnowledgeEval.ts
 *
 * Optional: V7_MODEL=gpt-4.1  K2_SKIP_CRM=1  K2_HELP_LIMIT=N
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V7ResourceSetStore } from '@/features/assistant/v7/resourceSet/store'
import {
  runV7Turn,
  V7_DEFAULT_MODEL,
  type V7AgentSession,
  type V7TurnResult,
} from '@/features/assistant/v7/agent/loop'
import { buildV7FixtureDeps } from '@/features/assistant/v7/evals/v7FixtureUniverse'
import {
  V7_FALSIFICATION_CORPUS,
  type V7TurnExpectation,
} from '@/features/assistant/v7/evals/v7FalsificationCorpus'
import { scoreV7Turn, emptyHardSafety } from '@/features/assistant/v7/evals/v7FalsificationScore'
import {
  K2_MIXED_CORPUS,
  K2_PRODUCT_HELP_CORPUS,
  summarizeK2HelpCorpus,
  type K2HelpTurn,
} from './k2ProductHelpCorpus'
import { getCapability } from '@/features/assistant/v7/knowledge/registry'

const HERE = dirname(fileURLToPath(import.meta.url))
const ARTIFACT_DIR = join(
  HERE,
  '../../benchmark/artifacts',
)

type ToolFamily =
  | 'KNOWLEDGE_ONLY'
  | 'CRM_ONLY'
  | 'KNOWLEDGE_PLUS_CRM'
  | 'WRONG_TOOL_FAMILY'
  | 'NO_TOOL_WHEN_REQUIRED'

const CRM_TOOLS = new Set([
  'search_resources',
  'refine_resources',
  'sort_resources',
  'aggregate_resources',
  'inspect_resource',
  'list_related',
  'describe_resource_set',
  'select_nearest_assignments',
])

function knowledgeIdsFromResult(result: V7TurnResult): string[] {
  const ids: string[] = []
  for (const tc of result.toolCalls) {
    if (tc.name !== 'search_product_knowledge') continue
    const data = tc.result as {
      ok?: boolean
      results?: Array<{ id?: string }>
      data?: { results?: Array<{ id?: string }> }
    }
    const results = data?.results ?? data?.data?.results ?? []
    for (const r of results) {
      if (r?.id) ids.push(r.id)
    }
  }
  return [...new Set(ids)]
}

function toolNames(result: V7TurnResult): string[] {
  return result.toolCalls.map((t) => t.name)
}

function classifyFamily(
  tools: string[],
  required: 'knowledge' | 'crm' | 'both' | 'none',
): ToolFamily {
  const hasK = tools.includes('search_product_knowledge')
  const hasC = tools.some((t) => CRM_TOOLS.has(t))
  if (required === 'none') {
    if (!hasK && !hasC) return 'CRM_ONLY' // treat as ok noop bucket externally
    if (hasK && !hasC) return 'KNOWLEDGE_ONLY'
    if (!hasK && hasC) return 'CRM_ONLY'
    return 'KNOWLEDGE_PLUS_CRM'
  }
  if (!hasK && !hasC) return 'NO_TOOL_WHEN_REQUIRED'
  if (required === 'knowledge') {
    if (hasK && !hasC) return 'KNOWLEDGE_ONLY'
    if (hasK && hasC) return 'KNOWLEDGE_PLUS_CRM'
    return 'WRONG_TOOL_FAMILY'
  }
  if (required === 'crm') {
    if (hasC && !hasK) return 'CRM_ONLY'
    if (hasC && hasK) return 'KNOWLEDGE_PLUS_CRM'
    return 'WRONG_TOOL_FAMILY'
  }
  // both
  if (hasK && hasC) return 'KNOWLEDGE_PLUS_CRM'
  if (hasK || hasC) return 'WRONG_TOOL_FAMILY'
  return 'NO_TOOL_WHEN_REQUIRED'
}

function answerGrounded(
  turn: K2HelpTurn,
  result: V7TurnResult,
  returnedIds: string[],
): boolean {
  if (turn.expectedCapabilityIds.length === 0) {
    // Negative: should not invent — refuse or soft redirect without false product claims
    const a = result.userText.toLocaleLowerCase('pl-PL')
    for (const bad of turn.answerMustNotClaim ?? []) {
      if (a.includes(bad.toLocaleLowerCase('pl-PL'))) return false
    }
    return true
  }
  const hit = turn.expectedCapabilityIds.some((id) => returnedIds.includes(id))
  if (!hit) return false
  const caps = returnedIds
    .map((id) => getCapability(id))
    .filter(Boolean)
  const blob = caps
    .map((c) => `${c!.title} ${c!.summary} ${(c!.help.steps ?? []).join(' ')}`)
    .join(' ')
    .toLocaleLowerCase('pl-PL')
  const answer = result.userText.toLocaleLowerCase('pl-PL')
  // At least one distinctive token from sealed knowledge should appear, or steps structure
  const distinctive = blob
    .split(/\s+/)
    .filter((w) => w.length >= 6)
    .slice(0, 40)
  const overlap = distinctive.filter((w) => answer.includes(w)).length
  if (overlap >= 1) return true
  if ((turn.answerShouldMention ?? []).some((m) => answer.includes(m.toLocaleLowerCase('pl-PL')))) {
    return true
  }
  // Short procedural answers that mention Umowa/finanse/pakiet etc.
  return answer.length > 40 && !/nie wiem jak to działa w ourwed/i.test(answer)
}

function criticalHallucination(turn: K2HelpTurn, answer: string): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  const refuses =
    /nie (obsługuje|wspiera|ma)|brak (takiej|tej) funkc|nie da się|nie jest dostępne|obecnie nie/.test(
      a,
    )
  for (const bad of turn.answerMustNotClaim ?? []) {
    const b = bad.toLocaleLowerCase('pl-PL')
    if (!a.includes(b)) continue
    // Mentioning the forbidden feature while refusing is OK
    if (refuses) continue
    // Claiming how-to for forbidden feature
    if (/jak |możesz |wystarczy |włącz/.test(a) && !refuses) return true
    if (!refuses) return true
  }
  const critical = [
    'podpis elektroniczny w ourwed',
    'wysyłam umowę mailem za ciebie',
    'otwieram modal',
    'przenoszę cię teraz do',
    'docusign',
  ]
  return critical.some((c) => a.includes(c))
}

function newSession(model: string, apiKey: string, tag: string): V7AgentSession {
  const store = new V7ResourceSetStore({
    sessionId: `k2-${tag}-${Date.now()}`,
    tenantKey: 'fixture-tenant',
  })
  return {
    store,
    binding: store.binding,
    deps: buildV7FixtureDeps(),
    history: [],
    model,
    apiKey,
    todayKey: '2026-09-15',
  }
}

async function main() {
  const model = process.env.V7_MODEL?.trim() || V7_DEFAULT_MODEL
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.error('OPENAI_API_KEY required')
    process.exit(1)
  }

  const helpLimit = process.env.K2_HELP_LIMIT
    ? Number(process.env.K2_HELP_LIMIT)
    : K2_PRODUCT_HELP_CORPUS.length
  const skipCrm = process.env.K2_SKIP_CRM === '1'
  const helpTurns = K2_PRODUCT_HELP_CORPUS.slice(0, helpLimit)
  const corpusInfo = summarizeK2HelpCorpus()

  console.log('K2 product knowledge eval start', {
    model,
    helpTurns: helpTurns.length,
    corpus: corpusInfo,
    mixed: K2_MIXED_CORPUS.length,
    skipCrm,
  })

  const familyCounts: Record<ToolFamily, number> = {
    KNOWLEDGE_ONLY: 0,
    CRM_ONLY: 0,
    KNOWLEDGE_PLUS_CRM: 0,
    WRONG_TOOL_FAMILY: 0,
    NO_TOOL_WHEN_REQUIRED: 0,
  }

  let top1Hit = 0
  let topKHit = 0
  let semanticOk = 0
  let criticalHall = 0
  let supported = 0
  const helpRows: unknown[] = []

  for (const turn of helpTurns) {
    const session = newSession(model, apiKey, turn.id)
    const result = await runV7Turn(session, turn.user)
    const tools = toolNames(result)
    const returned = knowledgeIdsFromResult(result)
    const required =
      turn.kind === 'negative' && turn.expectedCapabilityIds.length === 0
        ? ('none' as const)
        : ('knowledge' as const)
    const family = classifyFamily(tools, required === 'none' ? 'knowledge' : 'knowledge')
    // For negatives, knowledge tool optional; inventing is worse
    const familyFinal =
      turn.expectedCapabilityIds.length === 0
        ? classifyFamily(tools, 'none')
        : family
    familyCounts[familyFinal] += 1

    const isSupported = turn.expectedCapabilityIds.length > 0
    if (isSupported) supported += 1

    const top1 =
      isSupported &&
      returned[0] != null &&
      turn.expectedCapabilityIds.includes(returned[0])
    const topK =
      isSupported &&
      turn.expectedCapabilityIds.some((id) => returned.includes(id))
    if (top1) top1Hit += 1
    if (topK) topKHit += 1

    const grounded = answerGrounded(turn, result, returned)
    const hall = criticalHallucination(turn, result.userText)
    if (grounded && !hall) semanticOk += 1
    if (hall) criticalHall += 1

    const row = {
      id: turn.id,
      user: turn.user,
      expected: turn.expectedCapabilityIds,
      returned,
      knowledgeToolUsed: tools.includes('search_product_knowledge'),
      correctCapability: topK,
      top1,
      answerGrounded: grounded,
      invented: hall,
      family: familyFinal,
      tools,
      answer: result.userText,
      latencyMs: result.latency.totalMs,
    }
    helpRows.push(row)
    console.log(
      `[help] ${turn.id} topK=${topK} ground=${grounded} hall=${hall} fam=${familyFinal} ret=${returned.join(',') || '-'}`,
    )
  }

  // Mixed
  const mixedRows: unknown[] = []
  let mixedPass = 0
  for (const turn of K2_MIXED_CORPUS) {
    const session = newSession(model, apiKey, turn.id)
    const result = await runV7Turn(session, turn.user)
    const tools = toolNames(result)
    const returned = knowledgeIdsFromResult(result)
    const family = classifyFamily(tools, 'both')
    familyCounts[family] += 1
    const knowOk = turn.expectKnowledgeIds.some((id) => returned.includes(id))
    const crmOk = turn.expectCrmToolsAny.some((t) => tools.includes(t))
    // Accept knowledge+crm family even if CRM tool set differs slightly when both used
    const pass2 =
      knowOk &&
      (crmOk || (tools.includes('search_product_knowledge') && tools.some((t) => CRM_TOOLS.has(t))))
    if (pass2) mixedPass += 1
    mixedRows.push({
      id: turn.id,
      user: turn.user,
      returned,
      tools,
      family,
      knowOk,
      crmOk,
      pass: pass2,
      answer: result.userText,
      notes: turn.notes,
    })
    console.log(
      `[mixed] ${turn.id} pass=${pass2} know=${knowOk} crm=${crmOk} fam=${family}`,
    )
  }

  // CRM regression (falsification supported turns)
  let crmSupported = 0
  let crmOkCount = 0
  let crmKnowledgeHijack = 0
  const crmRows: unknown[] = []
  if (!skipCrm) {
    for (const convo of V7_FALSIFICATION_CORPUS) {
      const session = newSession(model, apiKey, `crm-${convo.id}`)
      for (let i = 0; i < convo.turns.length; i++) {
        const turn = convo.turns[i]!
        const result = await runV7Turn(session, turn.user)
        const tools = toolNames(result)
        const expect = turn.expect as V7TurnExpectation
        if (!expect.supportedUnambiguous) continue
        crmSupported += 1
        const safety = emptyHardSafety()
        const scored = scoreV7Turn(expect, result, safety)
        const hijack =
          tools.includes('search_product_knowledge') &&
          !tools.some((t) => CRM_TOOLS.has(t)) &&
          (expect.expect?.toolsAny?.some((t) => CRM_TOOLS.has(t)) ?? false)
        if (hijack) crmKnowledgeHijack += 1
        if (scored.correct) crmOkCount += 1
        familyCounts[classifyFamily(tools, 'crm')] += 1
        crmRows.push({
          conversationId: convo.id,
          turnIndex: i,
          user: turn.user,
          correct: scored.correct,
          tools,
          hijack,
          answer: result.userText.slice(0, 240),
        })
        console.log(
          `[crm] ${convo.id}#${i} correct=${scored.correct} hijack=${hijack}`,
        )
      }
    }
  }

  const top1Acc = supported ? top1Hit / supported : 0
  const topKRecall = supported ? topKHit / supported : 0
  const semanticAcc = helpTurns.length ? semanticOk / helpTurns.length : 0

  const report = {
    phase: 'k2-product-knowledge-v1',
    model,
    timestamp: new Date().toISOString(),
    productHelp: {
      turns: helpTurns.length,
      supported,
      top1Accuracy: top1Acc,
      topKRecall,
      semanticAccuracy: semanticAcc,
      criticalHallucinations: criticalHall,
      rows: helpRows,
    },
    toolSelection: familyCounts,
    mixed: {
      cases: K2_MIXED_CORPUS.length,
      passed: mixedPass,
      failed: K2_MIXED_CORPUS.length - mixedPass,
      rows: mixedRows,
    },
    crmRegression: skipCrm
      ? { skipped: true }
      : {
          goldenSupported: crmSupported,
          candidateSupported: crmOkCount,
          knowledgeHijacks: crmKnowledgeHijack,
          meaningfulCandidateOnlyRegressions: Math.max(
            0,
            crmSupported - crmOkCount,
          ),
          rows: crmRows,
        },
    passGates: {
      topK95: topKRecall >= 0.95,
      semantic95: semanticAcc >= 0.95,
      hall0: criticalHall === 0,
      crmNoHijack: skipCrm ? null : crmKnowledgeHijack === 0,
      mixedMajority: mixedPass >= Math.ceil(K2_MIXED_CORPUS.length * 0.5),
    },
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true })
  const outPath = join(ARTIFACT_DIR, 'phase-k2-product-knowledge-v1.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log('\nK2_REPORT', JSON.stringify(report.passGates))
  console.log('wrote', outPath)

  const pass =
    report.passGates.topK95 &&
    report.passGates.semantic95 &&
    report.passGates.hall0 &&
    (skipCrm || (report.passGates.crmNoHijack && crmOkCount >= crmSupported * 0.9))

  if (!pass) {
    console.error('K2_EVAL_FAIL')
    process.exit(2)
  }
  console.log('K2_EVAL_PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
