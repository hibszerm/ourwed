/**
 * Assistant V2.1 — wedding participant candidates for semantic interpretation.
 * Names/roles come from authoritative OurWed couple + place conventions:
 * partner1 ↔ bride ↔ bride_preparation
 * partner2 ↔ groom ↔ groom_preparation
 *
 * Nickname resolution is the model's job. This module only validates keys
 * and matches exact/near name forms (no alias dictionary).
 */

import type { Wedding } from '@/types/wedding'
import { polishPersonSearchQueries } from './intentParse'

export type AssistantParticipantKey = 'p1' | 'p2'

export type AssistantParticipantCandidate = {
  key: AssistantParticipantKey
  /** Full display name as stored (partner1 / partner2). */
  canonicalName: string
  firstName: string
  /** Authoritative CRM convention — not inferred from given name. */
  role: 'bride' | 'groom'
}

export type AssistantLastDirectContext = {
  intent:
    | 'wedding_places'
    | 'wedding_day_plan'
    | 'wedding_finances'
    | 'wedding_tasks'
    | 'wedding_next_action'
    | 'open_wedding'
    | 'open_session'
    | 'schedule'
  placeScope?:
    | 'preparations'
    | 'bride_preparation'
    | 'groom_preparation'
    | 'ceremony'
    | 'reception'
    | 'all'
  participantKey?: AssistantParticipantKey | null
  dayPlanFocus?: 'ceremony' | 'preparations' | 'full' | 'earliest' | null
  financeAspect?: 'remaining' | 'paid' | 'contract_value' | 'overview' | null
}

function firstToken(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name.trim()
}

export function participantsFromCouple(input: {
  partner1: string | null | undefined
  partner2: string | null | undefined
}): AssistantParticipantCandidate[] {
  const out: AssistantParticipantCandidate[] = []
  const p1 = input.partner1?.trim()
  const p2 = input.partner2?.trim()
  if (p1) {
    out.push({
      key: 'p1',
      canonicalName: p1,
      firstName: firstToken(p1),
      role: 'bride',
    })
  }
  if (p2) {
    out.push({
      key: 'p2',
      canonicalName: p2,
      firstName: firstToken(p2),
      role: 'groom',
    })
  }
  return out
}

export function participantsFromWedding(
  wedding: Pick<Wedding, 'couple'>,
): AssistantParticipantCandidate[] {
  return participantsFromCouple({
    partner1: wedding.couple?.partner1,
    partner2: wedding.couple?.partner2,
  })
}

/** Bounded payload for the model — identity only. */
export function participantsForModel(
  candidates: AssistantParticipantCandidate[],
): Array<{
  key: AssistantParticipantKey
  canonicalName: string
  firstName: string
  role: 'bride' | 'groom'
}> {
  return candidates.map((c) => ({
    key: c.key,
    canonicalName: c.canonicalName,
    firstName: c.firstName,
    role: c.role,
  }))
}

function normalizePersonToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/**
 * Match personQuery to a candidate by canonical/first name forms only.
 * Does NOT understand nicknames (Maks≠Maksymilian) — that is model-side.
 */
export function matchParticipantByNameQuery(
  candidates: AssistantParticipantCandidate[],
  personQuery: string | null | undefined,
): AssistantParticipantKey | 'ambiguous' | null {
  const q = personQuery?.trim()
  if (!q || candidates.length === 0) return null

  const roleHit = matchParticipantByRoleLanguage(q)
  if (roleHit) {
    const byRole = candidates.find((c) => c.role === roleHit)
    return byRole?.key ?? null
  }

  const variants = new Set(
    polishPersonSearchQueries(q).map(normalizePersonToken).filter(Boolean),
  )
  variants.add(normalizePersonToken(q))

  const hits = candidates.filter((c) => {
    const names = new Set(
      [
        c.canonicalName,
        c.firstName,
        ...polishPersonSearchQueries(c.canonicalName),
        ...polishPersonSearchQueries(c.firstName),
      ]
        .map(normalizePersonToken)
        .filter(Boolean),
    )
    // Exact token match only — no prefix/nickname heuristics (model handles those).
    return [...variants].some((v) => names.has(v))
  })

  if (hits.length === 1) return hits[0]!.key
  if (hits.length > 1) return 'ambiguous'
  return null
}

export function matchParticipantByRoleLanguage(
  text: string,
): 'bride' | 'groom' | null {
  const t = text.toLowerCase()
  if (/\bpann[ay]\s+młod/i.test(t) || /\bbride\b/i.test(t)) return 'bride'
  if (/\bpan\s+młod/i.test(t) || /\bgroom\b/i.test(t)) return 'groom'
  return null
}

export type ParticipantResolveResult =
  | { status: 'resolved'; key: AssistantParticipantKey }
  | { status: 'ambiguous' }
  | { status: 'not_found' }
  | { status: 'none' }

/**
 * Deterministic participant resolution for executor.
 * Precedence: explicit personQuery (current utterance) > participantKey > role.
 * Stale participantKey must not override a current personQuery match.
 */
export function resolveParticipantReference(input: {
  candidates: AssistantParticipantCandidate[]
  participantKey?: string | null
  participantRole?: 'bride' | 'groom' | null
  personQuery?: string | null
}): ParticipantResolveResult {
  const { candidates } = input
  if (candidates.length === 0) return { status: 'none' }

  if (input.personQuery?.trim()) {
    const matched = matchParticipantByNameQuery(candidates, input.personQuery)
    if (matched === 'ambiguous') return { status: 'ambiguous' }
    if (matched) return { status: 'resolved', key: matched }
    // Explicit name present but no match — fail closed (do not keep stale key)
    return { status: 'not_found' }
  }

  const keyRaw = input.participantKey?.trim()
  if (keyRaw === 'p1' || keyRaw === 'p2') {
    if (candidates.some((c) => c.key === keyRaw)) {
      return { status: 'resolved', key: keyRaw }
    }
    return { status: 'not_found' }
  }

  if (input.participantRole === 'bride' || input.participantRole === 'groom') {
    const hit = candidates.find((c) => c.role === input.participantRole)
    if (hit) return { status: 'resolved', key: hit.key }
    return { status: 'not_found' }
  }

  return { status: 'none' }
}

export function placeRoleForParticipant(
  key: AssistantParticipantKey,
): 'bride_preparation' | 'groom_preparation' {
  return key === 'p1' ? 'bride_preparation' : 'groom_preparation'
}

export function participantKeyForPlaceRole(
  role: string,
): AssistantParticipantKey | null {
  if (role === 'bride_preparation' || role === 'preparation') return 'p1'
  if (role === 'groom_preparation') return 'p2'
  return null
}
