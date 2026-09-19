/**
 * Presentation-only context-card grouping.
 * Does not mutate references, projection, or action payloads.
 */

import type { AssistantAction, AssistantReference } from '../../v7/presentation/types'
import { formatPresentationCalendarLabel } from './formatPresentationDate'

export type ContextCardModel = {
  id: string
  /** Primary kind drives header icon. */
  kind: AssistantReference['kind']
  title: string
  subtitle: string | null
  /** Extra value lines (phone, email, address). */
  valueLines: string[]
  actions: AssistantAction[]
  /** Underlying reference ids — association preserved. */
  memberRefIds: string[]
  memberKinds: AssistantReference['kind'][]
}

function valueFromActions(actions: AssistantAction[]): string | null {
  for (const a of actions) {
    if (a.type === 'call_phone' || a.type === 'send_sms') return a.phone
    if (a.type === 'compose_email') return a.email
    if (a.type === 'navigate_address') return a.address
  }
  return null
}

function titleFor(ref: AssistantReference): string {
  if (ref.kind === 'calendar' && ref.label) {
    return formatPresentationCalendarLabel(ref.label)
  }
  if (ref.label?.trim()) return ref.label.trim()
  switch (ref.kind) {
    case 'phone':
      return 'Telefon'
    case 'email':
      return 'E-mail'
    case 'address':
      return 'Adres'
    case 'wedding':
      return 'Zlecenie'
    case 'session':
      return 'Sesja'
    case 'calendar':
      return 'Kalendarz'
    default:
      return 'Szczegóły'
  }
}

function splitAddressLines(address: string): string[] {
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return [parts.slice(0, -1).join(', '), parts[parts.length - 1]!]
  }
  return [address]
}

function cardFromRefs(refs: AssistantReference[], id: string): ContextCardModel {
  const primary = refs[0]!
  const actions = refs.flatMap((r) => r.actions)

  if (refs.length === 1) {
    const value = valueFromActions(primary.actions)
    const valueLines =
      primary.kind === 'address' && value
        ? splitAddressLines(value)
        : value
          ? [value]
          : []
    const showValues =
      primary.kind === 'phone' ||
      primary.kind === 'email' ||
      primary.kind === 'address'

    const hasQuestionnaire = primary.actions.some(
      (a) => a.type === 'open_prewedding_questionnaire',
    )
    const hasOpenWedding = primary.actions.some(
      (a) => a.type === 'open_wedding',
    )

    let title = titleFor(primary)
    let subtitle: string | null = null
    if (primary.kind === 'wedding') {
      if (hasQuestionnaire) {
        title = 'Ankieta przedślubna'
        subtitle = primary.label?.trim() || 'Zlecenie'
      } else {
        subtitle = 'Zlecenie'
      }
    }
    void hasOpenWedding

    return {
      id,
      kind: primary.kind,
      title,
      subtitle,
      valueLines: showValues ? valueLines : [],
      actions,
      memberRefIds: [primary.id],
      memberKinds: [primary.kind],
    }
  }

  // Wedding + calendar
  const wedding = refs.find((r) => r.kind === 'wedding')
  const calendar = refs.find((r) => r.kind === 'calendar')
  if (wedding && calendar) {
    const dateLabel = calendar.label
      ? formatPresentationCalendarLabel(calendar.label)
      : null
    return {
      id,
      kind: 'wedding',
      title: titleFor(wedding),
      subtitle: dateLabel ? `Zlecenie · ${dateLabel}` : 'Zlecenie',
      valueLines: [],
      actions,
      memberRefIds: refs.map((r) => r.id),
      memberKinds: refs.map((r) => r.kind),
    }
  }

  // Session + calendar (+ optional same-entity address)
  const session = refs.find((r) => r.kind === 'session')
  if (session) {
    const cal = refs.find((r) => r.kind === 'calendar')
    const addrs = refs.filter((r) => r.kind === 'address')
    const dateLabel = cal?.label
      ? formatPresentationCalendarLabel(cal.label)
      : null
    const addrLines = addrs.flatMap((a) => {
      const v = valueFromActions(a.actions)
      return v ? splitAddressLines(v) : []
    })
    return {
      id,
      kind: 'session',
      title: titleFor(session),
      subtitle: dateLabel,
      valueLines: addrLines,
      actions,
      memberRefIds: refs.map((r) => r.id),
      memberKinds: refs.map((r) => r.kind),
    }
  }

  // Fallback: use first as primary
  return {
    id,
    kind: primary.kind,
    title: titleFor(primary),
    subtitle: null,
    valueLines: [],
    actions,
    memberRefIds: refs.map((r) => r.id),
    memberKinds: refs.map((r) => r.kind),
  }
}

/**
 * Build visual context cards from deterministic references.
 * Wedding+calendar and session(+calendar/+same-entity address) may share a card.
 * Addresses with different values never merge with each other.
 */
export function buildContextCards(
  references: AssistantReference[],
): ContextCardModel[] {
  const remaining = [...references]
  const cards: ContextCardModel[] = []
  let seq = 0

  const take = (pred: (r: AssistantReference) => boolean): AssistantReference[] => {
    const out: AssistantReference[] = []
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (pred(remaining[i]!)) {
        out.unshift(remaining[i]!)
        remaining.splice(i, 1)
      }
    }
    return out
  }

  // Wedding + at most one calendar
  while (remaining.some((r) => r.kind === 'wedding')) {
    const wedding = take((r) => r.kind === 'wedding')[0]!
    const group = [wedding]
    const calIdx = remaining.findIndex((r) => r.kind === 'calendar')
    if (calIdx >= 0) {
      group.push(remaining[calIdx]!)
      remaining.splice(calIdx, 1)
    }
    cards.push(cardFromRefs(group, `ctx-${seq++}`))
  }

  // Session + matching address(es) by entityId + one calendar
  while (remaining.some((r) => r.kind === 'session')) {
    const session = take((r) => r.kind === 'session')[0]!
    const group = [session]
    if (session.entityId) {
      const addrs = take(
        (r) => r.kind === 'address' && r.entityId === session.entityId,
      )
      group.push(...addrs)
    }
    const calIdx = remaining.findIndex((r) => r.kind === 'calendar')
    if (calIdx >= 0) {
      group.push(remaining[calIdx]!)
      remaining.splice(calIdx, 1)
    }
    cards.push(cardFromRefs(group, `ctx-${seq++}`))
  }

  // Remaining calendar alone
  for (const cal of take((r) => r.kind === 'calendar')) {
    cards.push(cardFromRefs([cal], `ctx-${seq++}`))
  }

  // Phone / email / address / leftover — one card each (addresses never merged)
  for (const ref of [...remaining]) {
    const idx = remaining.indexOf(ref)
    if (idx >= 0) remaining.splice(idx, 1)
    cards.push(cardFromRefs([ref], `ctx-${seq++}`))
  }

  return cards
}
