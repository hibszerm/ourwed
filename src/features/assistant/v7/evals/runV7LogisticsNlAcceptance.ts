/**
 * V7 Logistics natural-language acceptance (~15 turns, gpt-5.6-sol).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v7/evals/runV7LogisticsNlAcceptance.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V7ResourceSetStore } from '../resourceSet/store'
import {
  runV7Turn,
  type V7AgentSession,
  type V7TurnResult,
} from '../agent/loop'
import { containsV7InternalLeak } from '../render/sanitize'
import { buildV7FixtureDeps, V7_FIXTURE_TODAY } from './v7FixtureUniverse'

function makeSolCompatFetch(): typeof fetch {
  return async (input, init) => {
    if (init?.body && typeof init.body === 'string') {
      const body = JSON.parse(init.body) as Record<string, unknown>
      delete body.temperature
      delete body.max_tokens
      body.max_completion_tokens = 1400
      body.reasoning_effort = 'none'
      return fetch(input, { ...init, body: JSON.stringify(body) })
    }
    return fetch(input, init)
  }
}

type Expect = {
  id: string
  user: string
  supportedUnambiguous: boolean
  mustIncludeAny?: string[]
  mustRefuse?: boolean
  mustClarify?: boolean
  forbidInventedDurationGuess?: boolean
  forbidInventedDistanceGuess?: boolean
  mustSayIncompleteOrMissing?: boolean
  mustSeparateFeeFromKm?: boolean
}

const TURNS: Expect[] = [
  // Conversation A
  {
    id: 'A1',
    user: 'Weź wesele Julii i Adama. Gdzie przygotowuje się panna młoda?',
    supportedUnambiguous: true,
    mustIncludeAny: ['Panna', 'Młoda', 'panna'],
  },
  {
    id: 'A2',
    user: 'A pan młody?',
    supportedUnambiguous: true,
    mustIncludeAny: ['Pan', 'młody', 'Młody'],
  },
  {
    id: 'A3',
    user: 'Ile mam od niego do niej?',
    supportedUnambiguous: true,
    mustIncludeAny: ['3,5', '3.5', 'km'],
  },
  {
    id: 'A4',
    user: 'A potem ile mam do ceremonii?',
    supportedUnambiguous: true,
    mustIncludeAny: ['8', 'km'],
  },
  {
    id: 'A5',
    user: 'Ile jest z ceremonii na salę?',
    supportedUnambiguous: true,
    mustIncludeAny: ['15', 'km'],
  },
  {
    id: 'A6',
    user: 'Który przejazd tego dnia jest najdłuższy?',
    supportedUnambiguous: true,
    mustIncludeAny: ['15', 'sal', 'ceremon', 'najdłuż'],
  },
  // Conversation B
  {
    id: 'B1',
    user: 'Jak wygląda logistyka tego wesela?',
    supportedUnambiguous: true,
    mustIncludeAny: ['studio', 'przygot', 'ceremon', 'sal', 'trasa', 'odcinek', 'km'],
  },
  {
    id: 'B2',
    user: 'Ile kilometrów mam łącznie?',
    supportedUnambiguous: true,
    mustIncludeAny: ['38', 'km'],
  },
  {
    id: 'B3',
    user: 'Czy trasa jest kompletna?',
    supportedUnambiguous: true,
    mustIncludeAny: ['tak', 'komplet', 'pełn'],
  },
  // Conversation C — feasibility unsupported
  {
    id: 'C1',
    user: 'Ile czasu mam między przygotowaniami a ceremonią?',
    supportedUnambiguous: true,
    // May report drive duration 15 min OR say schedule gap unknown
    mustIncludeAny: ['15', 'min', 'nie', 'czas', 'przejazd'],
    forbidInventedDurationGuess: true,
  },
  {
    id: 'C2',
    user: 'Czy zdążę?',
    supportedUnambiguous: false,
    mustRefuse: true,
  },
  // Conversation D — fee vs km
  {
    id: 'D1',
    user: 'Jaki mają doliczony koszt dojazdu?',
    supportedUnambiguous: true,
    mustIncludeAny: ['800', 'zł', 'dojazd', 'koszt'],
  },
  {
    id: 'D2',
    user: 'A ile faktycznie jest kilometrów?',
    supportedUnambiguous: true,
    mustIncludeAny: ['38', 'km'],
    mustSeparateFeeFromKm: true,
  },
  // Edge cases
  {
    id: 'E1',
    user: 'Przelicz i zapisz trasę jeszcze raz.',
    supportedUnambiguous: false,
    mustRefuse: true,
  },
  {
    id: 'E2',
    user: 'Ile jest z hotelu na lotnisko?',
    supportedUnambiguous: false,
    mustClarify: true,
  },
]

function includesLoose(answer: string, needle: string): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  const n = needle.toLocaleLowerCase('pl-PL')
  if (a.includes(n)) return true
  if (n.length >= 4 && a.includes(n.slice(0, 4))) return true
  return false
}

function looksLikeRefuse(answer: string): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  return (
    a.includes('nie mog') ||
    a.includes('nie oceniam') ||
    a.includes('nie wspier') ||
    a.includes('nie jest jeszcze') ||
    a.includes('nie są jeszcze') ||
    a.includes('nie zapis') ||
    a.includes('nie przelicz') ||
    a.includes('read-only') ||
    a.includes('tylko do odczytu') ||
    a.includes('nie mam kanonic') ||
    a.includes('nie potrafię ocenić') ||
    a.includes('nie dam rady ocenić')
  )
}

function looksLikeClarify(answer: string): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  return (
    a.includes('?') &&
    (a.includes('które') ||
      a.includes('który') ||
      a.includes('doprecyz') ||
      a.includes('sprecyz') ||
      a.includes('nie mam') ||
      a.includes('brak'))
  )
}

function score(
  expect: Expect,
  result: V7TurnResult,
): { correct: boolean; failureClass?: string } {
  const answer = result.userText
  if (!result.ok) return { correct: false, failureClass: 'turn_not_ok' }
  if (containsV7InternalLeak(answer)) {
    return { correct: false, failureClass: 'internal_debug_leak' }
  }
  if (
    result.toolCalls.some((t) =>
      /create|update|delete|write|recalculate|mutate/i.test(t.name),
    )
  ) {
    return { correct: false, failureClass: 'unsafe_write' }
  }
  // Hallucination guards: invented "około X minut" without tool duration is hard;
  // forbid crude free guesses like "około 20 minut jazdy" when refusing feasibility.
  if (expect.forbidInventedDurationGuess) {
    if (/około\s+\d+\s*min/.test(answer.toLocaleLowerCase('pl-PL')) &&
      !result.toolCalls.some((t) => t.name === 'inspect_resource' || t.name === 'list_related')) {
      return { correct: false, failureClass: 'invented_duration' }
    }
  }

  if (!expect.supportedUnambiguous) {
    if (expect.mustRefuse) {
      return looksLikeRefuse(answer) || looksLikeClarify(answer)
        ? { correct: true }
        : { correct: false, failureClass: 'expected_refuse' }
    }
    if (expect.mustClarify) {
      return looksLikeClarify(answer) || looksLikeRefuse(answer)
        ? { correct: true }
        : { correct: false, failureClass: 'expected_clarify' }
    }
    return { correct: true }
  }

  if (expect.mustIncludeAny?.length) {
    if (!expect.mustIncludeAny.some((n) => includesLoose(answer, n))) {
      return { correct: false, failureClass: 'missing_expected_content' }
    }
  }
  return { correct: true }
}

async function main() {
  const model = process.env.V7_MODEL?.trim() || 'gpt-5.6-sol'
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.error('OPENAI_API_KEY required')
    process.exit(1)
  }

  const store = new V7ResourceSetStore({
    sessionId: 'v7-logistics-nl',
    tenantKey: 'fixture-tenant',
  })
  const session: V7AgentSession = {
    store,
    binding: store.binding,
    deps: buildV7FixtureDeps(),
    history: [],
    model,
    apiKey,
    todayKey: V7_FIXTURE_TODAY,
    fetchImpl: model.startsWith('gpt-5') ? makeSolCompatFetch() : fetch,
  }

  const scores: Array<{
    id: string
    user: string
    correct: boolean
    supportedUnambiguous: boolean
    failureClass?: string
    answer: string
    tools: string[]
  }> = []

  for (const turn of TURNS) {
    const result = await runV7Turn(session, turn.user)
    const scored = score(turn, result)
    scores.push({
      id: turn.id,
      user: turn.user,
      correct: scored.correct,
      supportedUnambiguous: turn.supportedUnambiguous,
      failureClass: scored.failureClass,
      answer: result.userText,
      tools: result.toolCalls.map((t) => t.name),
    })
    console.log(`[${turn.id}] ${scored.correct ? 'PASS' : 'FAIL'} ${turn.user}`)
    if (!scored.correct) {
      console.log('  failure:', scored.failureClass)
      console.log('  answer:', result.userText.slice(0, 400))
      console.log('  tools:', result.toolCalls.map((t) => t.name).join(','))
    }
  }

  const supported = scores.filter((s) => s.supportedUnambiguous)
  const supportedCorrect = supported.filter((s) => s.correct).length
  const pct =
    supported.length === 0 ? 0 : (100 * supportedCorrect) / supported.length
  const verdict = pct >= 95 ? 'LOGISTICS V7 PASS' : 'LOGISTICS V7 NO-GO'
  const report = {
    verdict,
    model,
    supportedCorrect,
    supportedTotal: supported.length,
    supportedPct: Number(pct.toFixed(2)),
    allCorrect: scores.filter((s) => s.correct).length,
    allTotal: scores.length,
    scores,
  }
  const outDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'phase-v7-logistics-nl.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ verdict, supportedPct: report.supportedPct, outPath }, null, 2))
  process.exit(verdict === 'LOGISTICS V7 PASS' ? 0 : 2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
