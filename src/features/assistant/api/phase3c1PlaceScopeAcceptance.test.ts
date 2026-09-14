/**
 * Phase 3C.1 — place/time scope + participant prep ownership (visible V3 path).
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/api/phase3c1PlaceScopeAcceptance.test.ts
 */

import {
  parseAssistantSemanticRequest,
  refineSemanticRequestFromUtterance,
} from './intentParse'
import type { AssistantSemanticRequest } from '../types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

console.log('Phase 3C.1 place scope / participant prep acceptance')

// --- Defect A: sala → reception only ---
{
  const raw = parseAssistantSemanticRequest('gdzie jest sala?')
  assert(raw.kind === 'wedding_places', 'sala → places')
  if (raw.kind === 'wedding_places') {
    assert(raw.requestedRole === 'reception', 'sala → reception role')
  }
  const przyjecie = parseAssistantSemanticRequest('gdzie jest przyjęcie?')
  assert(przyjecie.kind === 'wedding_places', 'przyjęcie → places')
  if (przyjecie.kind === 'wedding_places') {
    assert(przyjecie.requestedRole === 'reception', 'przyjęcie → reception')
  }
}

// --- Defect B: participant prep location ---
{
  const raw = parseAssistantSemanticRequest(
    'gdzie Martyna ma przygotowania',
  )
  assert(raw.kind === 'wedding_places', 'prep location → places')
  if (raw.kind === 'wedding_places') {
    assert(raw.requestedRole === 'preparations', 'prep role')
    assert(
      raw.resolver.personQuery?.toLowerCase().includes('martyna') === true,
      'personQuery martyna',
    )
  }
}

// --- Defect C: participant prep time must NOT be ceremony ---
{
  const raw = parseAssistantSemanticRequest(
    'o której Martyna ma przygotowania',
  )
  assert(raw.kind === 'wedding_day_plan', 'prep time → day_plan')
  if (raw.kind === 'wedding_day_plan') {
    assert(raw.focus === 'preparations', 'prep time focus preparations')
    assert(raw.focus !== 'ceremony', 'no ceremony fallback')
    assert(
      raw.resolver.personQuery?.toLowerCase().includes('martyna') === true,
      'personQuery on time',
    )
  }
}

// --- Known good: unscoped prep time + ceremony time ---
{
  const both = parseAssistantSemanticRequest('o której są przygotowania')
  assert(both.kind === 'wedding_day_plan', 'unscoped prep → day_plan')
  if (both.kind === 'wedding_day_plan') {
    assert(both.focus === 'preparations', 'unscoped prep focus')
  }
  const cer = parseAssistantSemanticRequest('o której ceremonia')
  assert(cer.kind === 'wedding_day_plan' && cer.focus === 'ceremony', 'ceremony')
}

// --- Refine repairs Edge misclassification ---
{
  const wrongDayPlan: AssistantSemanticRequest = {
    kind: 'wedding_day_plan',
    resolver: { personQuery: 'Martyna', dateHint: null },
    focus: 'ceremony',
    participantKey: null,
    participantRole: null,
  }
  const fixedLoc = refineSemanticRequestFromUtterance(
    wrongDayPlan,
    'gdzie Martyna ma przygotowania',
  )
  assert(fixedLoc.kind === 'wedding_places', 'refine loc kind')
  if (fixedLoc.kind === 'wedding_places') {
    assert(fixedLoc.requestedRole === 'preparations', 'refine loc role')
  }

  const fixedTime = refineSemanticRequestFromUtterance(
    wrongDayPlan,
    'o której Martyna ma przygotowania',
  )
  assert(fixedTime.kind === 'wedding_day_plan', 'refine time kind')
  if (fixedTime.kind === 'wedding_day_plan') {
    assert(fixedTime.focus === 'preparations', 'refine time focus')
  }

  const wrongAll: AssistantSemanticRequest = {
    kind: 'wedding_places',
    resolver: { personQuery: null, dateHint: null },
    requestedRole: 'all',
    participantKey: null,
    participantRole: null,
  }
  const fixedSala = refineSemanticRequestFromUtterance(
    wrongAll,
    'gdzie jest sala?',
  )
  assert(
    fixedSala.kind === 'wedding_places' &&
      fixedSala.requestedRole === 'reception',
    'refine sala → reception',
  )

  const fromUnrecognized = refineSemanticRequestFromUtterance(
    { kind: 'unrecognized' },
    'gdzie jest sala?',
  )
  assert(
    fromUnrecognized.kind === 'wedding_places' &&
      fromUnrecognized.requestedRole === 'reception',
    'unrecognized sala → reception places',
  )
}

// --- No ceremony fallback when prep requested ---
{
  const edgeCeremonyOnPrep = refineSemanticRequestFromUtterance(
    {
      kind: 'wedding_day_plan',
      resolver: { personQuery: 'X', dateHint: null },
      focus: 'ceremony',
    },
    'o której X ma przygotowania',
  )
  assert(
    edgeCeremonyOnPrep.kind === 'wedding_day_plan' &&
      edgeCeremonyOnPrep.focus === 'preparations',
    'never keep ceremony for prep time',
  )
}

// --- Architecture: refine wired into visible authority path ---
{
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const api = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/api/assistantApi.ts'),
    'utf8',
  )
  assert(
    api.includes('refineSemanticRequestFromUtterance'),
    'assistantApi refines',
  )
  const plan = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/orchestration/executeAgentPlan.ts',
    ),
    'utf8',
  )
  assert(
    plan.includes('refineSemanticRequestFromUtterance'),
    'agent plan refines',
  )
  assert(
    api.includes('utteranceNamesConcreteStage') ||
      api.includes('directNamesConcreteStage'),
    'sequence rewrite guarded',
  )
}

console.log('Phase 3C.1 place scope acceptance — ALL PASS')
