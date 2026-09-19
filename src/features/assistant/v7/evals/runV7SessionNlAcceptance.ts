/**
 * V7 Session natural-language acceptance (~15 turns, gpt-5.6-sol).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v7/evals/runV7SessionNlAcceptance.ts
 *
 * Grades against fixture CRM semantics — no phrase patches.
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
import {
  buildV7FixtureDeps,
  V7_FIXTURE_TODAY,
} from './v7FixtureUniverse'

/** gpt-5.x chat.completions + tools: no temperature/max_tokens; reasoning_effort=none. */
function makeSolCompatFetch(): typeof fetch {
  return async (input, init) => {
    if (init?.body && typeof init.body === 'string') {
      const body = JSON.parse(init.body) as Record<string, unknown>
      delete body.temperature
      delete body.max_tokens
      body.max_completion_tokens = 1200
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
  /** Soft content needles (any/all). */
  mustIncludeAny?: string[]
  mustIncludeAll?: string[]
  mustRefuseWrite?: boolean
  mustClarify?: boolean
  /** Fail if answer claims free hour / slot availability. */
  forbidTimeAvailabilityClaim?: boolean
  /** Fail if invents free day when session occupies it. */
  mustAcknowledgeSessionOccupancy?: boolean
  mustAcknowledgeFreeDay?: boolean
}

const TURNS: Expect[] = [
  {
    id: 'A',
    user: 'Jakie mam sesje w tym miesiącu?',
    supportedUnambiguous: true,
    mustIncludeAny: ['20 września', 'Sesja 20 września', 'września', 'Sopot'],
  },
  {
    id: 'B',
    user: 'Pokaż mi najbliższą.',
    supportedUnambiguous: true,
    mustIncludeAny: ['20 września', 'Sesja 20 września', 'Sopot'],
  },
  {
    id: 'C',
    user: 'A gdzie ona jest?',
    supportedUnambiguous: true,
    mustIncludeAny: ['Sopot', 'Plaża'],
  },
  {
    id: 'D',
    user: 'Do jakiego wesela jest przypisana?',
    supportedUnambiguous: true,
    mustIncludeAny: ['Kasia', 'Tomek', 'Katarzyna', 'Tomasz', 'Dąb', 'Król'],
  },
  {
    id: 'E',
    user: 'Jakie sesje mam do tego wesela?',
    supportedUnambiguous: true,
    // Related sessions for Kasia & Tomek — s-sept-twenty
    mustIncludeAny: ['20 września', 'Sesja 20 września', 'sesj'],
  },
  {
    id: 'F',
    user: 'Czy mam jakąś sesję 20 września?',
    supportedUnambiguous: true,
    mustIncludeAny: ['tak', 'masz', 'jest', 'Sesja 20 września'],
  },
  {
    id: 'G',
    user: 'Czy mam wtedy jakieś wesele?',
    supportedUnambiguous: true,
    // 2026-09-20 has no wedding in fixture
    mustIncludeAny: ['nie', 'brak', 'żadnego', 'nie masz'],
  },
  {
    id: 'H',
    user: 'Czyli mogę wtedy przyjąć sesję?',
    supportedUnambiguous: true,
    // Date-level: session already exists on that day — not free
    mustAcknowledgeSessionOccupancy: true,
    forbidTimeAvailabilityClaim: true,
  },
  {
    id: 'zero',
    user: 'Jakie mam sesje w styczniu 2099?',
    supportedUnambiguous: true,
    mustIncludeAny: ['brak', 'nie masz', 'żadnych', '0', 'pust'],
  },
  {
    id: 'ambig',
    user: 'A co z tą drugą?',
    supportedUnambiguous: false,
    mustClarify: true,
  },
  {
    id: 'write',
    user: 'Umów mi sesję na 18 września.',
    supportedUnambiguous: false,
    mustRefuseWrite: true,
  },
  {
    id: 'free-day-check',
    user: 'Czy 21 września mam wesele albo sesję?',
    supportedUnambiguous: true,
    mustAcknowledgeFreeDay: true,
    forbidTimeAvailabilityClaim: true,
  },
  {
    id: 'oct-sessions',
    user: 'Jakie mam sesje w październiku?',
    supportedUnambiguous: true,
    mustIncludeAny: ['Julia', 'narzeczeńska', 'rodzinna', 'konflikt'],
  },
  {
    id: 'oct-wedding-sessions',
    user: 'Jakie sesje mam do wesela Julii i Adama?',
    supportedUnambiguous: true,
    mustIncludeAny: ['narzeczeńska', 'Julia', 'Park', 'Łazienki'],
  },
  {
    id: 'dual-occupancy',
    user: 'Czy 12 października jest zajęty?',
    supportedUnambiguous: true,
    // Both wedding and session on that day
    mustIncludeAny: ['tak', 'zajęt', 'wesele', 'sesj'],
    forbidTimeAvailabilityClaim: true,
  },
]

function includesLoose(answer: string, needle: string): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  const n = needle.toLocaleLowerCase('pl-PL')
  if (a.includes(n)) return true
  // Polish stems (Sopot→Sopocie drops t; Plaża→plaży)
  if (n.length >= 4) {
    const stem = n.slice(0, 4)
    if (a.includes(stem)) return true
  }
  return false
}

function looksLikeRefuse(answer: string): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  return (
    a.includes('nie mog') ||
    a.includes('nie wspier') ||
    a.includes('nie jest jeszcze') ||
    a.includes('nie są jeszcze') ||
    a.includes('nie umawiam') ||
    a.includes('nie tworzę') ||
    a.includes('nie dodaj') ||
    a.includes('tylko do odczytu') ||
    a.includes('read-only') ||
    a.includes('nie zapis')
  )
}

function looksLikeClarify(answer: string): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  return (
    a.includes('?') &&
    (a.includes('które') ||
      a.includes('która') ||
      a.includes('doprecyz') ||
      a.includes('sprecyz') ||
      a.includes('o którą') ||
      a.includes('o którą ses') ||
      a.includes('którą'))
  )
}

function claimsTimeAvailability(answer: string): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  return (
    /woln[ey].{0,20}\d{1,2}[:.]\d{2}/.test(a) ||
    /masz wolne o/.test(a) ||
    /wolny termin o/.test(a) ||
    /możesz o \d/.test(a)
  )
}

function score(
  expect: Expect,
  result: V7TurnResult,
): { correct: boolean; failureClass?: string } {
  const answer = result.userText
  if (!result.ok) {
    return { correct: false, failureClass: 'turn_not_ok' }
  }
  if (containsV7InternalLeak(answer)) {
    return { correct: false, failureClass: 'internal_debug_leak' }
  }
  if (
    result.toolCalls.some((t) =>
      /create|update|delete|write|upsert|mutate/i.test(t.name),
    )
  ) {
    return { correct: false, failureClass: 'unsafe_write' }
  }
  if (expect.forbidTimeAvailabilityClaim && claimsTimeAvailability(answer)) {
    return { correct: false, failureClass: 'false_time_availability' }
  }

  if (!expect.supportedUnambiguous) {
    if (expect.mustRefuseWrite) {
      return looksLikeRefuse(answer)
        ? { correct: true }
        : { correct: false, failureClass: 'expected_write_refuse' }
    }
    if (expect.mustClarify) {
      return looksLikeClarify(answer) || looksLikeRefuse(answer)
        ? { correct: true }
        : { correct: false, failureClass: 'expected_clarify' }
    }
    return { correct: true }
  }

  if (expect.mustAcknowledgeSessionOccupancy) {
    const a = answer.toLocaleLowerCase('pl-PL')
    const acknowledges =
      a.includes('sesj') ||
      a.includes('zajęt') ||
      a.includes('masz już') ||
      a.includes('już jest') ||
      a.includes('nie jest wolny') ||
      a.includes('nie możesz') ||
      a.includes('nie wolny')
    const wronglyFree =
      (a.includes('możesz') || a.includes('wolny') || a.includes('wolne')) &&
      !a.includes('sesj') &&
      !a.includes('zajęt')
    if (wronglyFree || !acknowledges) {
      return { correct: false, failureClass: 'false_availability_from_no_wedding' }
    }
    return { correct: true }
  }

  if (expect.mustAcknowledgeFreeDay) {
    const a = answer.toLocaleLowerCase('pl-PL')
    const free =
      a.includes('nie masz') ||
      a.includes('brak') ||
      a.includes('żadnego') ||
      a.includes('żadnej') ||
      a.includes('wolny') ||
      a.includes('nic nie ma')
    if (!free) {
      return { correct: false, failureClass: 'missed_free_day' }
    }
    return { correct: true }
  }

  if (expect.mustIncludeAll) {
    for (const n of expect.mustIncludeAll) {
      if (!includesLoose(answer, n)) {
        return { correct: false, failureClass: 'missing_expected_content' }
      }
    }
  }
  if (expect.mustIncludeAny && expect.mustIncludeAny.length > 0) {
    if (!expect.mustIncludeAny.some((n) => includesLoose(answer, n))) {
      return { correct: false, failureClass: 'missing_expected_content' }
    }
  }
  return { correct: true }
}

async function main() {
  const model =
    process.env.V7_MODEL?.trim() || 'gpt-5.6-sol'
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.error('OPENAI_API_KEY required')
    process.exit(1)
  }

  const store = new V7ResourceSetStore({
    sessionId: 'v7-session-nl',
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
    console.log(
      `[${turn.id}] ${scored.correct ? 'PASS' : 'FAIL'} ${turn.user}`,
    )
    if (!scored.correct) {
      console.log('  failure:', scored.failureClass)
      console.log('  answer:', result.userText.slice(0, 400))
      console.log('  tools:', result.toolCalls.map((t) => t.name).join(','))
    }
  }

  const supported = scores.filter((s) => s.supportedUnambiguous)
  const supportedCorrect = supported.filter((s) => s.correct).length
  const pct =
    supported.length === 0
      ? 0
      : (100 * supportedCorrect) / supported.length
  const allCorrect = scores.filter((s) => s.correct).length
  const verdict = pct >= 95 ? 'SESSION V7 PASS' : 'SESSION V7 NO-GO'

  const report = {
    verdict,
    model,
    todayKey: V7_FIXTURE_TODAY,
    supportedCorrect,
    supportedTotal: supported.length,
    supportedPct: Number(pct.toFixed(2)),
    allCorrect,
    allTotal: scores.length,
    scores,
  }

  const outDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'phase-v7-session-nl.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ verdict, supportedPct: report.supportedPct, outPath }, null, 2))
  process.exit(verdict === 'SESSION V7 PASS' ? 0 : 2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
