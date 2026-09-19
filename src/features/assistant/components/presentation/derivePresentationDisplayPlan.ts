/**
 * Presentation display policy — SELECTS from existing contract evidence.
 * Never mutates the Presentation Contract / never invents actions.
 *
 * Phase 2I — result references (answer) vs evidence references (contract).
 */

import type {
  AssistantAction,
  AssistantPresentationTurn,
  AssistantReference,
} from '../../v7/presentation/types'
import { type PresentationIntent } from './classifyPresentationIntent'
import { resolveEffectivePresentationIntent } from './resolveEffectivePresentationIntent'
import {
  isSelectionPresentationUtterance,
  selectPresentationResultRefs,
} from './selectPresentationResultRefs'

export type PresentationDisplayMode =
  | 'direct_inline'
  | 'context_cards'
  | 'collection'
  | 'fallback'

export type PresentationDisplayPlan = {
  intent: PresentationIntent
  /** Lexical intent before follow-up inheritance (Phase 2H.1). */
  rawIntent: PresentationIntent
  inherited: boolean
  mode: PresentationDisplayMode
  /**
   * References selected for card/collection rendering (shallow copies with filtered actions).
   * Empty when using direct_inline only. These are RESULT refs, not full evidence.
   */
  displayReferences: AssistantReference[]
  /** Actions rendered inline under prose (existing actions only). */
  inlineActions: AssistantAction[]
}

function refsOf(
  turn: AssistantPresentationTurn,
  kind: AssistantReference['kind'],
): AssistantReference[] {
  return (turn.references ?? []).filter((r) => r.kind === kind)
}

function cloneRef(
  ref: AssistantReference,
  actions: AssistantAction[],
): AssistantReference {
  return {
    id: ref.id,
    kind: ref.kind,
    label: ref.label,
    detail: ref.detail,
    entityId: ref.entityId,
    actions: [...actions],
  }
}

function actionsOfTypes(
  ref: AssistantReference,
  types: ReadonlySet<AssistantAction['type']>,
): AssistantAction[] {
  return ref.actions.filter((a) => types.has(a.type))
}

/** Digits-only phone compare; conservative email/address whitespace normalize. */
export function scalarValueInMessage(
  message: string,
  value: string,
  kind: 'phone' | 'email' | 'address',
): boolean {
  if (!value.trim() || !message) return false
  if (kind === 'phone') {
    const digMsg = message.replace(/\D/g, '')
    const digVal = value.replace(/\D/g, '')
    if (digVal.length < 7) return false
    return digMsg.includes(digVal)
  }
  const norm = (s: string) =>
    s
      .toLocaleLowerCase('pl-PL')
      .replace(/\s+/g, ' ')
      .replace(/[.,;]+/g, ' ')
      .trim()
  return norm(message).includes(norm(value))
}

function valueFromPhoneRef(ref: AssistantReference): string | null {
  for (const a of ref.actions) {
    if (a.type === 'call_phone' || a.type === 'send_sms') return a.phone
  }
  return null
}

function valueFromEmailRef(ref: AssistantReference): string | null {
  for (const a of ref.actions) {
    if (a.type === 'compose_email') return a.email
  }
  return null
}

function valueFromAddressRef(ref: AssistantReference): string | null {
  for (const a of ref.actions) {
    if (a.type === 'navigate_address') return a.address
  }
  return null
}

const PHONE_ACTIONS = new Set<AssistantAction['type']>([
  'call_phone',
  'send_sms',
])
const EMAIL_ACTIONS = new Set<AssistantAction['type']>(['compose_email'])
const ADDRESS_ACTIONS = new Set<AssistantAction['type']>(['navigate_address'])
const QUESTIONNAIRE_ACTIONS = new Set<AssistantAction['type']>([
  'open_prewedding_questionnaire',
])
const WEDDING_OPEN = new Set<AssistantAction['type']>(['open_wedding'])
const SESSION_OPEN = new Set<AssistantAction['type']>(['open_session'])
const CALENDAR_OPEN = new Set<AssistantAction['type']>(['open_calendar'])
const NAVIGATE = new Set<AssistantAction['type']>(['navigate_address'])

function fallbackPlan(
  intent: PresentationIntent,
  turn: AssistantPresentationTurn,
  meta: { rawIntent: PresentationIntent; inherited: boolean },
): PresentationDisplayPlan {
  return {
    intent,
    rawIntent: meta.rawIntent,
    inherited: meta.inherited,
    mode: 'fallback',
    displayReferences: [...(turn.references ?? [])],
    inlineActions: [],
  }
}

function withMeta(
  plan: Omit<PresentationDisplayPlan, 'rawIntent' | 'inherited'>,
  meta: { rawIntent: PresentationIntent; inherited: boolean },
): PresentationDisplayPlan {
  return { ...plan, rawIntent: meta.rawIntent, inherited: meta.inherited }
}

function collectionPlanFromNavigable(
  intent: PresentationIntent,
  turn: AssistantPresentationTurn,
  meta: { rawIntent: PresentationIntent; inherited: boolean },
  utterance: string,
): PresentationDisplayPlan | null {
  const selection = selectPresentationResultRefs({
    utterance,
    evidenceReferences: turn.references ?? [],
    selectionQuery: false,
  })
  // Only promote MANY → collection here. Single-entity stays with intent cases
  // (avoid turning general+1-wedding evidence into a wedding card).
  if (selection.cardinality !== 'many') return null
  return withMeta(
    {
      intent,
      mode: 'collection',
      displayReferences: selection.resultReferences.map((r) =>
        cloneRef(
          r,
          actionsOfTypes(
            r,
            r.kind === 'session' ? SESSION_OPEN : WEDDING_OPEN,
          ),
        ),
      ),
      inlineActions: [],
    },
    meta,
  )
}

function selectionResultPlan(
  intent: PresentationIntent,
  turn: AssistantPresentationTurn,
  meta: { rawIntent: PresentationIntent; inherited: boolean },
  utterance: string,
): PresentationDisplayPlan {
  const selection = selectPresentationResultRefs({
    utterance,
    evidenceReferences: turn.references ?? [],
    selectionQuery: true,
  })
  if (selection.cardinality === 'one' && selection.resultReferences[0]) {
    const r = selection.resultReferences[0]
    return withMeta(
      {
        intent,
        mode: 'context_cards',
        displayReferences: [
          cloneRef(
            r,
            actionsOfTypes(
              r,
              r.kind === 'session' ? SESSION_OPEN : WEDDING_OPEN,
            ),
          ),
        ],
        inlineActions: [],
      },
      meta,
    )
  }
  // Prose carries the winner; do not render comparison/evidence rows.
  return withMeta(
    {
      intent,
      mode: 'direct_inline',
      displayReferences: [],
      inlineActions: [],
    },
    meta,
  )
}

/**
 * Derive a display-only plan from utterance + frozen presentation turn.
 * Does not mutate `presentationTurn`.
 *
 * Phase 2H.1: optional previousEffectiveIntent enables elliptical phone/email/address
 * follow-ups (e.g. "a jego?") without changing the Presentation Contract.
 *
 * Phase 2I: selection queries reduce evidence→result; structure-first collection
 * when ≥2 navigable result entities exist regardless of soft follow-up wording.
 */
export function derivePresentationDisplayPlan(input: {
  utterance: string
  presentationTurn: AssistantPresentationTurn
  previousEffectiveIntent?: PresentationIntent | null
}): PresentationDisplayPlan {
  const turn = input.presentationTurn
  const resolved = resolveEffectivePresentationIntent({
    utterance: input.utterance,
    previousEffectiveIntent: input.previousEffectiveIntent ?? null,
  })
  const intent = resolved.effectiveIntent
  const meta = {
    rawIntent: resolved.rawIntent,
    inherited: resolved.inherited,
  }
  const message = turn.message ?? ''

  if (turn.status === 'error') {
    return fallbackPlan(intent, turn, meta)
  }

  // Phase 2I — ranking/selection: current-turn result cardinality overrides
  // collection evidence dumps (does not affect phone/email/address inheritance).
  if (
    isSelectionPresentationUtterance(input.utterance) &&
    intent !== 'phone' &&
    intent !== 'email' &&
    intent !== 'address'
  ) {
    return selectionResultPlan(intent, turn, meta, input.utterance)
  }

  switch (intent) {
    case 'phone': {
      const phones = refsOf(turn, 'phone')
      if (phones.length !== 1) return fallbackPlan(intent, turn, meta)
      const phone = phones[0]!
      const actions = actionsOfTypes(phone, PHONE_ACTIONS)
      if (actions.length === 0) return fallbackPlan(intent, turn, meta)
      const value = valueFromPhoneRef(phone)
      const inProse = value
        ? scalarValueInMessage(message, value, 'phone')
        : false
      if (inProse) {
        return withMeta(
          {
            intent,
            mode: 'direct_inline',
            displayReferences: [],
            inlineActions: actions,
          },
          meta,
        )
      }
      // Value once via compact phone card only (no wedding).
      return withMeta(
        {
          intent,
          mode: 'context_cards',
          displayReferences: [cloneRef(phone, actions)],
          inlineActions: [],
        },
        meta,
      )
    }

    case 'email': {
      const emails = refsOf(turn, 'email')
      if (emails.length !== 1) return fallbackPlan(intent, turn, meta)
      const email = emails[0]!
      const actions = actionsOfTypes(email, EMAIL_ACTIONS)
      if (actions.length === 0) return fallbackPlan(intent, turn, meta)
      const value = valueFromEmailRef(email)
      const inProse = value
        ? scalarValueInMessage(message, value, 'email')
        : false
      if (inProse) {
        return withMeta(
          {
            intent,
            mode: 'direct_inline',
            displayReferences: [],
            inlineActions: actions,
          },
          meta,
        )
      }
      return withMeta(
        {
          intent,
          mode: 'context_cards',
          displayReferences: [cloneRef(email, actions)],
          inlineActions: [],
        },
        meta,
      )
    }

    case 'address': {
      const addresses = refsOf(turn, 'address')
      if (addresses.length === 0) return fallbackPlan(intent, turn, meta)
      if (addresses.length === 1) {
        const addr = addresses[0]!
        const actions = actionsOfTypes(addr, ADDRESS_ACTIONS)
        if (actions.length === 0) return fallbackPlan(intent, turn, meta)
        const value = valueFromAddressRef(addr)
        const inProse = value
          ? scalarValueInMessage(message, value, 'address')
          : false
        if (inProse) {
          return withMeta(
            {
              intent,
              mode: 'direct_inline',
              displayReferences: [],
              inlineActions: actions,
            },
            meta,
          )
        }
        return withMeta(
          {
            intent,
            mode: 'context_cards',
            displayReferences: [cloneRef(addr, actions)],
            inlineActions: [],
          },
          meta,
        )
      }
      // Multi-address: keep separate address cards, no wedding
      return withMeta(
        {
          intent,
          mode: 'context_cards',
          displayReferences: addresses.map((a) =>
            cloneRef(a, actionsOfTypes(a, ADDRESS_ACTIONS)),
          ),
          inlineActions: [],
        },
        meta,
      )
    }

    case 'questionnaire': {
      const withQ = (turn.references ?? []).filter((r) =>
        r.actions.some((a) => a.type === 'open_prewedding_questionnaire'),
      )
      if (withQ.length === 0) return fallbackPlan(intent, turn, meta)
      return withMeta(
        {
          intent,
          mode: 'context_cards',
          displayReferences: withQ.map((r) =>
            cloneRef(r, actionsOfTypes(r, QUESTIONNAIRE_ACTIONS)),
          ),
          inlineActions: [],
        },
        meta,
      )
    }

    case 'finance': {
      const weddings = refsOf(turn, 'wedding')
      if (weddings.length === 0) {
        return withMeta(
          {
            intent,
            mode: 'direct_inline',
            displayReferences: [],
            inlineActions: [],
          },
          meta,
        )
      }
      return withMeta(
        {
          intent,
          mode: 'context_cards',
          displayReferences: weddings.map((w) =>
            cloneRef(w, actionsOfTypes(w, WEDDING_OPEN)),
          ),
          inlineActions: [],
        },
        meta,
      )
    }

    case 'distance': {
      // Direct route/distance: prefer navigate; suppress wedding provenance cards.
      const addresses = refsOf(turn, 'address')
      if (addresses.length === 1) {
        const addr = addresses[0]!
        const actions = actionsOfTypes(addr, ADDRESS_ACTIONS)
        if (actions.length > 0) {
          const value = valueFromAddressRef(addr)
          const inProse = value
            ? scalarValueInMessage(message, value, 'address')
            : true
          if (inProse || actions.length > 0) {
            return withMeta(
              {
                intent,
                mode: 'direct_inline',
                displayReferences: [],
                inlineActions: actions,
              },
              meta,
            )
          }
        }
      }
      if (addresses.length > 1) {
        return withMeta(
          {
            intent,
            mode: 'context_cards',
            displayReferences: addresses.map((a) =>
              cloneRef(a, actionsOfTypes(a, ADDRESS_ACTIONS)),
            ),
            inlineActions: [],
          },
          meta,
        )
      }
      return withMeta(
        {
          intent,
          mode: 'direct_inline',
          displayReferences: [],
          inlineActions: [],
        },
        meta,
      )
    }

    case 'collection': {
      const structured = collectionPlanFromNavigable(
        intent,
        turn,
        meta,
        input.utterance,
      )
      if (structured) return structured
      return fallbackPlan(intent, turn, meta)
    }

    case 'aggregate': {
      const calendars = refsOf(turn, 'calendar')
      if (calendars.length === 1) {
        const cal = calendars[0]!
        const actions = actionsOfTypes(cal, CALENDAR_OPEN)
        if (actions.length > 0) {
          return withMeta(
            {
              intent,
              mode: 'direct_inline',
              displayReferences: [],
              inlineActions: actions,
            },
            meta,
          )
        }
      }
      return withMeta(
        {
          intent,
          mode: 'direct_inline',
          displayReferences: [],
          inlineActions: [],
        },
        meta,
      )
    }

    case 'calendar': {
      // Schedule / "co mam jutro" — wedding/session cards with open + calendar
      const weddings = refsOf(turn, 'wedding')
      const sessions = refsOf(turn, 'session')
      const calendars = refsOf(turn, 'calendar')
      const display: AssistantReference[] = []
      for (const w of weddings) {
        const acts = [
          ...actionsOfTypes(w, WEDDING_OPEN),
          ...calendars.flatMap((c) => actionsOfTypes(c, CALENDAR_OPEN)),
        ]
        // Dedupe calendar actions by type
        const seen = new Set<string>()
        const unique = acts.filter((a) => {
          const key = a.type
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        if (unique.length) display.push(cloneRef(w, unique))
      }
      for (const s of sessions) {
        const acts = [
          ...actionsOfTypes(s, SESSION_OPEN),
          ...calendars.flatMap((c) => actionsOfTypes(c, CALENDAR_OPEN)),
        ]
        const seen = new Set<string>()
        const unique = acts.filter((a) => {
          if (seen.has(a.type)) return false
          seen.add(a.type)
          return true
        })
        if (unique.length) display.push(cloneRef(s, unique))
      }
      if (display.length === 0 && calendars.length) {
        return withMeta(
          {
            intent,
            mode: 'direct_inline',
            displayReferences: [],
            inlineActions: calendars.flatMap((c) =>
              actionsOfTypes(c, CALENDAR_OPEN),
            ),
          },
          meta,
        )
      }
      if (display.length === 0) return fallbackPlan(intent, turn, meta)
      // Phase 2I: multi schedule entities → compact collection, not N cards
      if (display.length >= 2) {
        return withMeta(
          {
            intent,
            mode: 'collection',
            displayReferences: display.map((r) =>
              cloneRef(
                r,
                actionsOfTypes(
                  r,
                  r.kind === 'session' ? SESSION_OPEN : WEDDING_OPEN,
                ),
              ),
            ),
            inlineActions: [],
          },
          meta,
        )
      }
      return withMeta(
        {
          intent,
          mode: 'context_cards',
          displayReferences: display,
          inlineActions: [],
        },
        meta,
      )
    }

    case 'wedding': {
      // Structure-first: mixed wedding+session result sets stay one collection
      const structured = collectionPlanFromNavigable(
        intent,
        turn,
        meta,
        input.utterance,
      )
      if (structured) return structured
      const weddings = refsOf(turn, 'wedding')
      if (weddings.length === 0) return fallbackPlan(intent, turn, meta)
      return withMeta(
        {
          intent,
          mode: 'context_cards',
          displayReferences: weddings.map((w) =>
            cloneRef(w, actionsOfTypes(w, WEDDING_OPEN)),
          ),
          inlineActions: [],
        },
        meta,
      )
    }

    case 'session': {
      const structured = collectionPlanFromNavigable(
        intent,
        turn,
        meta,
        input.utterance,
      )
      if (structured) return structured
      const sessions = refsOf(turn, 'session')
      if (sessions.length === 0) return fallbackPlan(intent, turn, meta)
      const display = sessions.map((s) => {
        const acts = [...actionsOfTypes(s, SESSION_OPEN)]
        if (s.entityId) {
          for (const a of refsOf(turn, 'address')) {
            if (a.entityId === s.entityId) {
              acts.push(...actionsOfTypes(a, NAVIGATE))
            }
          }
        }
        return cloneRef(s, acts)
      })
      return withMeta(
        {
          intent,
          mode: 'context_cards',
          displayReferences: display,
          inlineActions: [],
        },
        meta,
      )
    }

    case 'general':
    default: {
      // Structure-first collection even when follow-up wording is soft/general
      const structured = collectionPlanFromNavigable(
        intent,
        turn,
        meta,
        input.utterance,
      )
      if (structured) return structured
      return fallbackPlan(intent, turn, meta)
    }
  }
}
