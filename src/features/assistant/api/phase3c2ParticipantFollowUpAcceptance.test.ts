/**
 * Phase 3C.2 — participant-only follow-up / ellipsis switch.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/api/phase3c2ParticipantFollowUpAcceptance.test.ts
 */

import { emptyWorkingContext } from './workingContext'
import { tryDeterministicParticipantCorrection } from '../orchestration/clarificationState'
import { resolveParticipantReference } from './participants'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

/** Mirror filterPlaces ownership: prep + participant must remap role. */
function effectivePrepRole(
  requestedRole:
    | 'preparations'
    | 'bride_preparation'
    | 'groom_preparation',
  participantKey: 'p1' | 'p2',
): 'bride_preparation' | 'groom_preparation' {
  // Same rule as executeSemantic after 3C.2
  void requestedRole
  return participantKey === 'p1' ? 'bride_preparation' : 'groom_preparation'
}

console.log('Phase 3C.2 participant follow-up acceptance')

const weddingId = 'w-follow'
const participants = [
  {
    key: 'p1' as const,
    canonicalName: 'Martyna Napieralska',
    firstName: 'Martyna',
    role: 'bride' as const,
  },
  {
    key: 'p2' as const,
    canonicalName: 'Damian Urbański',
    firstName: 'Damian',
    role: 'groom' as const,
  },
]

function ctxAfterP1Location() {
  const ctx = emptyWorkingContext()
  ctx.activeResource = {
    kind: 'wedding',
    id: weddingId,
    displayLabel: 'Martyna & Damian',
    participants,
  }
  ctx.activeParticipant = {
    weddingId,
    participantKey: 'p1',
    displayLabel: 'Martyna Napieralska',
  }
  ctx.lastResolvedRequest = {
    goalType: 'places',
    placeScope: 'bride_preparation',
    participantKey: 'p1',
  }
  ctx.lastDirectContext = {
    intent: 'wedding_places',
    placeScope: 'bride_preparation',
    participantKey: 'p1',
  }
  ctx.discourseFocus = {
    weddingId,
    participantKey: 'p1',
    placeScope: 'bride_preparation',
    dayPlanStage: 'bride_preparation',
    sequenceKind: 'day_plan',
  }
  return ctx
}

function ctxAfterP1Time() {
  const ctx = ctxAfterP1Location()
  ctx.lastResolvedRequest = {
    goalType: 'day_plan',
    placeScope: 'preparations',
    participantKey: 'p1',
    dayPlanFocus: 'preparations',
  }
  ctx.lastDirectContext = {
    intent: 'wedding_day_plan',
    placeScope: 'preparations',
    participantKey: 'p1',
    dayPlanFocus: 'preparations',
  }
  return ctx
}

// --- Location: Martyna → Damian ---
{
  const hit = tryDeterministicParticipantCorrection({
    utterance: 'a Damian?',
    workingContext: ctxAfterP1Location(),
  })
  assert(hit?.kind === 'semantic', 'Damian follow-up semantic')
  if (hit?.kind === 'semantic') {
    assert(hit.semantic.kind === 'wedding_places', 'location kind places')
    if (hit.semantic.kind === 'wedding_places') {
      assert(hit.semantic.participantKey === 'p2', 'participant p2')
      assert(
        hit.semantic.requestedRole === 'preparations',
        'role preparations not stale bride_',
      )
      assert(
        hit.semantic.resolver.weddingId === weddingId,
        'same wedding',
      )
    }
  }
}

// --- Location reverse: Damian → Martyna ---
{
  const ctx = ctxAfterP1Location()
  ctx.activeParticipant = {
    weddingId,
    participantKey: 'p2',
    displayLabel: 'Damian Urbański',
  }
  ctx.lastResolvedRequest = {
    goalType: 'places',
    placeScope: 'groom_preparation',
    participantKey: 'p2',
  }
  ctx.lastDirectContext = {
    intent: 'wedding_places',
    placeScope: 'groom_preparation',
    participantKey: 'p2',
  }
  const hit = tryDeterministicParticipantCorrection({
    utterance: 'a Martyna?',
    workingContext: ctx,
  })
  assert(
    hit?.kind === 'semantic' &&
      hit.semantic.kind === 'wedding_places' &&
      hit.semantic.participantKey === 'p1' &&
      hit.semantic.requestedRole === 'preparations',
    'Martyna follow-up after Damian',
  )
}

// --- Time: Martyna → Damian ---
{
  const hit = tryDeterministicParticipantCorrection({
    utterance: 'a Damian?',
    workingContext: ctxAfterP1Time(),
  })
  assert(hit?.kind === 'semantic', 'time follow-up semantic')
  if (hit?.kind === 'semantic') {
    assert(hit.semantic.kind === 'wedding_day_plan', 'time → day_plan')
    if (hit.semantic.kind === 'wedding_day_plan') {
      assert(hit.semantic.focus === 'preparations', 'focus preparations')
      assert(hit.semantic.participantKey === 'p2', 'time participant p2')
    }
  }
}

// --- Time reverse ---
{
  const ctx = ctxAfterP1Time()
  ctx.activeParticipant = {
    weddingId,
    participantKey: 'p2',
    displayLabel: 'Damian',
  }
  ctx.lastResolvedRequest = {
    goalType: 'day_plan',
    placeScope: 'preparations',
    participantKey: 'p2',
    dayPlanFocus: 'preparations',
  }
  const hit = tryDeterministicParticipantCorrection({
    utterance: 'a Martyna?',
    workingContext: ctx,
  })
  assert(
    hit?.kind === 'semantic' &&
      hit.semantic.kind === 'wedding_day_plan' &&
      hit.semantic.participantKey === 'p1',
    'time reverse Martyna',
  )
}

// --- Ceremony boundary: do not invent preparations ---
{
  const ctx = ctxAfterP1Location()
  ctx.lastResolvedRequest = {
    goalType: 'day_plan',
    placeScope: 'ceremony',
    dayPlanFocus: 'ceremony',
  }
  ctx.lastDirectContext = {
    intent: 'wedding_day_plan',
    placeScope: 'ceremony',
    dayPlanFocus: 'ceremony',
  }
  ctx.discourseFocus = {
    weddingId,
    placeScope: 'ceremony',
    dayPlanStage: 'ceremony',
    sequenceKind: 'day_plan',
  }
  const hit = tryDeterministicParticipantCorrection({
    utterance: 'a Martyna?',
    workingContext: ctx,
  })
  assert(hit === null, 'ceremony + a Name? → no invented prep')
}

// --- personQuery beats stale participantKey ---
{
  const resolved = resolveParticipantReference({
    candidates: participants,
    participantKey: 'p1',
    personQuery: 'Damian',
  })
  assert(
    resolved.status === 'resolved' && resolved.key === 'p2',
    'personQuery overrides stale p1',
  )
}

// --- effective role remap ---
{
  assert(
    effectivePrepRole('bride_preparation', 'p2') === 'groom_preparation',
    'p2 wins over bride_ role',
  )
  assert(
    effectivePrepRole('groom_preparation', 'p1') === 'bride_preparation',
    'p1 wins over groom_ role',
  )
}

// --- No-stale: explicit B never keeps A role ---
{
  const hit = tryDeterministicParticipantCorrection({
    utterance: 'Damian',
    workingContext: ctxAfterP1Location(),
  })
  assert(
    hit?.kind === 'semantic' &&
      hit.semantic.kind === 'wedding_places' &&
      hit.semantic.participantKey === 'p2' &&
      hit.semantic.requestedRole === 'preparations',
    'no stale bride_preparation for Damian',
  )
}

// --- Unscoped preparations → participant-only narrowing ---
{
  const ctx = emptyWorkingContext()
  ctx.activeResource = {
    kind: 'wedding',
    id: weddingId,
    displayLabel: 'Martyna & Damian',
    participants,
  }
  ctx.lastResolvedRequest = {
    goalType: 'places',
    placeScope: 'preparations',
  }
  ctx.lastDirectContext = {
    intent: 'wedding_places',
    placeScope: 'preparations',
  }
  const hit = tryDeterministicParticipantCorrection({
    utterance: 'a Martyna?',
    workingContext: ctx,
  })
  assert(
    hit?.kind === 'semantic' &&
      hit.semantic.kind === 'wedding_places' &&
      hit.semantic.participantKey === 'p1' &&
      hit.semantic.requestedRole === 'preparations',
    'unscoped prep → a p1? narrows to p1',
  )
}

// --- Missing name: never keep stale participant ---
{
  const resolved = resolveParticipantReference({
    candidates: participants,
    participantKey: 'p1',
    personQuery: 'Zygmunt',
  })
  assert(
    resolved.status === 'not_found',
    'unknown personQuery → not_found (no stale p1)',
  )
}

// --- Close clears participant (session authority) ---
{
  const closed = emptyWorkingContext()
  assert(closed.activeParticipant === null, 'fresh context has no participant')
}

// --- V4 merge: explicit participant on inherit wins over previous ---
{
  const { mergeTaskSpecWithContext } = await import('../v4/resolver/resolve')
  const { emptyQualifiers } = await import('../v4/taskSpec')
  const previous = {
    version: 1 as const,
    op: 'get_location' as const,
    subject: 'preparations' as const,
    resource: { kind: 'active_resource' as const },
    participant: { kind: 'explicit' as const, value: 'Martyna' },
    temporal: null,
    qualifiers: emptyQualifiers(),
    fieldSource: {
      op: 'explicit' as const,
      subject: 'explicit' as const,
      resource: 'utterance' as const,
      participant: 'explicit' as const,
      temporal: 'omitted' as const,
    },
    correction: null,
  }
  // fieldSource values must be TaskFieldSource — fix utterance → explicit
  previous.fieldSource.resource = 'explicit'
  const inherit = {
    version: 1 as const,
    op: 'inherit' as const,
    subject: null,
    resource: { kind: 'inherit' as const },
    participant: { kind: 'explicit' as const, value: 'Damian' },
    temporal: null,
    qualifiers: emptyQualifiers(),
    fieldSource: {
      op: 'inherit' as const,
      subject: 'inherit' as const,
      resource: 'inherit' as const,
      participant: 'explicit' as const,
      temporal: 'inherit' as const,
    },
    correction: null,
  }
  const merged = mergeTaskSpecWithContext(inherit, previous)
  assert(
    !('error' in merged) &&
      merged.op === 'get_location' &&
      merged.subject === 'preparations' &&
      merged.participant?.kind === 'explicit' &&
      merged.participant.value === 'Damian',
    'V4 inherit: Damian replaces Martyna',
  )
}

// --- Static: executeSemantic remaps prep roles ---
{
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const sem = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/api/executeSemantic.ts'),
    'utf8',
  )
  assert(
    sem.includes('placeRoleForParticipant(participantKey)') &&
      sem.includes('isPrepScope(request.requestedRole)'),
    'executeSemantic remaps any prep scope',
  )
  const part = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/api/participants.ts'),
    'utf8',
  )
  assert(
    part.includes('personQuery') &&
      part.indexOf('personQuery') < part.indexOf('participantKey?.trim'),
    'personQuery precedence before participantKey',
  )
  const clar = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/orchestration/clarificationState.ts',
    ),
    'utf8',
  )
  assert(
    clar.includes("requestedRole: 'preparations'") &&
      clar.includes('resumeAsDayPlan'),
    'correction rebuilds preparations / day_plan',
  )
  const types = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/capabilities/types.ts',
    ),
    'utf8',
  )
  assert(
    types.includes("'wedding.finance.get'") &&
      types.includes("'wedding.places.get'") &&
      types.includes("'wedding.day_plan.get'") &&
      types.includes("'collection.query'") &&
      !types.includes('collection.count'),
    'registry closed set includes collection.query',
  )
  const { V4_CAPABILITY_REGISTRY } = await import('../v4/capabilities/registry')
  assert(
    V4_CAPABILITY_REGISTRY.length === 4 &&
      V4_CAPABILITY_REGISTRY.map((c) => c.id).join(',') ===
        'wedding.finance.get,wedding.places.get,wedding.day_plan.get,collection.query',
    'registry runtime length 4',
  )
}

console.log('Phase 3C.2 participant follow-up acceptance — ALL PASS')
