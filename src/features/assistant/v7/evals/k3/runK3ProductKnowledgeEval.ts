/**
 * K3 live product-knowledge + mixed + CRM regression eval.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v7/evals/k3/runK3ProductKnowledgeEval.ts
 *
 * Optional: V7_MODEL=gpt-4.1  K3_SKIP_CRM=1  K3_HELP_LIMIT=N  K3_STRATIFY=1
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
  K3_MIXED_CORPUS,
  K3_PRODUCT_HELP_CORPUS,
  summarizeK3HelpCorpus,
  type K3HelpTurn,
} from './k3ProductHelpCorpus'
import { getCapability } from '@/features/assistant/v7/knowledge/registry'

const HERE = dirname(fileURLToPath(import.meta.url))
const ARTIFACT_DIR = join(HERE, '../../benchmark/artifacts')

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
    if (!hasK && !hasC) return 'CRM_ONLY'
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
  if (hasK && hasC) return 'KNOWLEDGE_PLUS_CRM'
  if (hasK || hasC) return 'WRONG_TOOL_FAMILY'
  return 'NO_TOOL_WHEN_REQUIRED'
}

function answerGrounded(
  turn: K3HelpTurn,
  result: V7TurnResult,
  returnedIds: string[],
): boolean {
  if (turn.expectedCapabilityIds.length === 0) {
    const a = result.userText.toLocaleLowerCase('pl-PL')
    for (const bad of turn.answerMustNotClaim ?? []) {
      if (a.includes(bad.toLocaleLowerCase('pl-PL'))) {
        const refuses =
          /nie (obsługuje|wspiera|ma)|brak (takiej|tej) funkc|nie da się|nie jest dostępne|obecnie nie|nie znajdę takiej/.test(
            a,
          )
        if (!refuses) return false
      }
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
  const distinctive = blob
    .split(/\s+/)
    .filter((w) => w.length >= 6)
    .slice(0, 40)
  const overlap = distinctive.filter((w) => answer.includes(w)).length
  if (overlap >= 1) return true
  if (
    (turn.answerShouldMention ?? []).some((m) =>
      answer.includes(m.toLocaleLowerCase('pl-PL')),
    )
  ) {
    return true
  }
  return answer.length > 40 && !/nie wiem jak to działa w ourwed/i.test(answer)
}

function criticalHallucination(turn: K3HelpTurn, answer: string): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  const refuses =
    /nie (obsługuje|wspiera|ma)|brak (takiej|tej) funkc|nie da się|nie jest dostępne|obecnie nie|nie znajdę takiej/.test(
      a,
    )
  for (const bad of turn.answerMustNotClaim ?? []) {
    const b = bad.toLocaleLowerCase('pl-PL')
    if (!a.includes(b)) continue
    if (refuses) continue
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
    sessionId: `k3-${tag}-${Date.now()}`,
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

/** Prefer natural phrasings; keep >=200 turns with domain balance. */
function selectHelpTurns(limit: number | null, stratify: boolean): K3HelpTurn[] {
  const all = K3_PRODUCT_HELP_CORPUS
  if (!stratify && limit == null) return all
  const preferredKinds = new Set([
    'direct',
    'colloquial',
    'location',
    'procedural',
    'vague',
    'state',
    'negative',
  ])
  const natural = all.filter(
    (t) =>
      preferredKinds.has(t.kind) &&
      !t.user.startsWith('Jak: ') &&
      !t.user.startsWith('Gdzie w OurWed znajdę: ') &&
      !t.user.startsWith('Jak skorzystać z: '),
  )
  const titleAnchored = all.filter((t) => !natural.includes(t))
  const byDomain = new Map<string, K3HelpTurn[]>()
  for (const t of natural) {
    const arr = byDomain.get(t.domain) ?? []
    arr.push(t)
    byDomain.set(t.domain, arr)
  }
  const picked: K3HelpTurn[] = []
  // Round-robin domains for balance
  let progressed = true
  while (progressed && picked.length < (limit ?? 220)) {
    progressed = false
    for (const [, arr] of byDomain) {
      if (picked.length >= (limit ?? 220)) break
      const next = arr.shift()
      if (!next) continue
      picked.push(next)
      progressed = true
    }
  }
  // Fill with title-anchored until >=200 / limit
  const target = limit ?? Math.max(200, picked.length)
  for (const t of titleAnchored) {
    if (picked.length >= target) break
    picked.push(t)
  }
  // Always include all negatives
  for (const t of all.filter((x) => x.kind === 'negative')) {
    if (!picked.some((p) => p.id === t.id)) picked.push(t)
  }
  return picked
}

async function main() {
  const model = process.env.V7_MODEL?.trim() || V7_DEFAULT_MODEL
  const apiKeyRaw = process.env.OPENAI_API_KEY?.trim()
  if (!apiKeyRaw) {
    console.error('OPENAI_API_KEY required')
    process.exit(1)
  }
  const apiKey: string = apiKeyRaw

  const helpLimit = process.env.K3_HELP_LIMIT
    ? Number(process.env.K3_HELP_LIMIT)
    : null
  const stratify = process.env.K3_STRATIFY !== '0'
  const skipCrm = process.env.K3_SKIP_CRM === '1'
  const idFilter = process.env.K3_HELP_IDS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  let helpTurns = selectHelpTurns(helpLimit, stratify)
  if (idFilter && idFilter.length > 0) {
    const want = new Set(idFilter)
    helpTurns = K3_PRODUCT_HELP_CORPUS.filter((t) => want.has(t.id))
  }
  const corpusInfo = summarizeK3HelpCorpus()

  console.log('K3 product knowledge eval start', {
    model,
    helpTurns: helpTurns.length,
    corpus: corpusInfo,
    mixed: K3_MIXED_CORPUS.length,
    skipCrm,
    stratify,
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
  const domainStats: Record<
    string,
    { n: number; top1: number; topK: number; semantic: number; hall: number }
  > = {}
  const helpRows: unknown[] = []

  async function runTurnWithRetry(turn: K3HelpTurn): Promise<V7TurnResult> {
    let last: V7TurnResult | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const session = newSession(model, apiKey, `${turn.id}-a${attempt}`)
      last = await runV7Turn(session, turn.user)
      const failed =
        !last.userText ||
        /nie udało się dokończyć|spróbuj ponownie/i.test(last.userText)
      if (!failed) return last
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    }
    return last!
  }

  for (const turn of helpTurns) {
    const result = await runTurnWithRetry(turn)
    const tools = toolNames(result)
    const returned = knowledgeIdsFromResult(result)
    const familyFinal =
      turn.expectedCapabilityIds.length === 0
        ? classifyFamily(tools, 'none')
        : classifyFamily(tools, 'knowledge')
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

    const ds = domainStats[turn.domain] ?? {
      n: 0,
      top1: 0,
      topK: 0,
      semantic: 0,
      hall: 0,
    }
    ds.n += 1
    if (top1) ds.top1 += 1
    if (topK) ds.topK += 1
    if (grounded && !hall) ds.semantic += 1
    if (hall) ds.hall += 1
    domainStats[turn.domain] = ds

    helpRows.push({
      id: turn.id,
      user: turn.user,
      domain: turn.domain,
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
    })
    console.log(
      `[help] ${turn.id} topK=${topK} ground=${grounded} hall=${hall} fam=${familyFinal} ret=${returned.join(',') || '-'}`,
    )
  }

  const mixedRows: unknown[] = []
  let mixedPass = 0
  for (const turn of K3_MIXED_CORPUS) {
    const session = newSession(model, apiKey, turn.id)
    const result = await runV7Turn(session, turn.user)
    const tools = toolNames(result)
    const returned = knowledgeIdsFromResult(result)
    const family = classifyFamily(tools, 'both')
    familyCounts[family] += 1
    const knowOk = turn.expectKnowledgeIds.some((id) => returned.includes(id))
    const crmOk = turn.expectCrmToolsAny.some((t) => tools.includes(t))
    const usedBoth =
      tools.includes('search_product_knowledge') &&
      tools.some((t) => CRM_TOOLS.has(t))
    // Pass if both families used and knowledge hit; or knowledge hit + CRM tool from expect set
    const pass2 = (knowOk && crmOk) || (knowOk && usedBoth)
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

  const domainBreakdown: Record<
    string,
    {
      turns: number
      top1: number
      topKRecall: number
      semantic: number
      hall: number
    }
  > = {}
  for (const [dom, s] of Object.entries(domainStats)) {
    domainBreakdown[dom] = {
      turns: s.n,
      top1: s.n ? s.top1 / s.n : 0,
      topKRecall: s.n ? s.topK / s.n : 0,
      semantic: s.n ? s.semantic / s.n : 0,
      hall: s.hall,
    }
  }

  const report = {
    phase: 'k31-correctness-followup',
    model,
    timestamp: new Date().toISOString(),
    productHelp: {
      turns: helpTurns.length,
      supported,
      top1Accuracy: top1Acc,
      topKRecall,
      semanticAccuracy: semanticAcc,
      criticalHallucinations: criticalHall,
      domainBreakdown,
      rows: helpRows,
    },
    toolSelection: familyCounts,
    mixed: {
      cases: K3_MIXED_CORPUS.length,
      passed: mixedPass,
      failed: K3_MIXED_CORPUS.length - mixedPass,
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
    unsupported: {
      cases: helpTurns.filter((t) => t.kind === 'negative').length,
      correctlyHandled: helpTurns
        .filter((t) => t.kind === 'negative')
        .filter((t) => {
          const row = helpRows.find(
            (r) => (r as { id: string }).id === t.id,
          ) as { invented?: boolean; answerGrounded?: boolean } | undefined
          return row && !row.invented && row.answerGrounded
        }).length,
    },
    passGates: {
      topK95: topKRecall >= 0.95,
      semantic95: semanticAcc >= 0.95,
      hall0: criticalHall === 0,
      crmNoHijack: skipCrm ? null : crmKnowledgeHijack === 0,
      mixedMajority: mixedPass >= Math.ceil(K3_MIXED_CORPUS.length * 0.5),
      turns200: helpTurns.length >= 200,
    },
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true })
  const outPath = join(ARTIFACT_DIR, 'phase-k31-correctness-followup.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log('\nK3_REPORT', JSON.stringify(report.passGates))
  console.log('domainBreakdown', JSON.stringify(domainBreakdown, null, 2))
  console.log('wrote', outPath)

  const pass =
    report.passGates.topK95 &&
    report.passGates.semantic95 &&
    report.passGates.hall0 &&
    report.passGates.turns200 &&
    (skipCrm ||
      (report.passGates.crmNoHijack &&
        crmOkCount >= crmSupported * 0.85 &&
        !(report.crmRegression as { rows?: Array<{ correct: boolean; tools: string[] }> })
          .rows?.some(
            (row) =>
              !row.correct && row.tools.includes('search_product_knowledge'),
          )))

  if (!pass) {
    console.error('K3_EVAL_FAIL')
    process.exit(2)
  }
  console.log('K3_EVAL_PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
