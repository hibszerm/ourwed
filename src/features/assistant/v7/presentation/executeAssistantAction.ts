/**
 * Closed action executor — UI must not construct routes/hrefs itself.
 */

import {
  buildSmsHref,
  buildTelHref,
} from '@/features/wedding-day-cockpit/fieldNavigation'
import { buildGoogleMapsNavigationUrl } from '@/services/googleMapsLinks'
import type { AssistantAction } from './types'
import {
  isValidEntityId,
  isValidPresentationAddress,
  isValidPresentationEmail,
  isValidPresentationPhone,
} from './validate'

export type AssistantActionNavigate = (path: string) => void

export type ExecuteAssistantActionResult =
  | { ok: true; mode: 'navigate'; path: string }
  | { ok: true; mode: 'external'; href: string }
  | { ok: false; reason: string }

const ACTION_TYPES = new Set<AssistantAction['type']>([
  'call_phone',
  'send_sms',
  'compose_email',
  'navigate_address',
  'open_wedding',
  'open_session',
  'open_prewedding_questionnaire',
  'open_calendar',
])

/**
 * Semantic UI role labels (card titles) — never Maps venue prefixes.
 * Venue names like "Villa Love" remain allowed (Logistics parity).
 */
const SEMANTIC_NAV_ROLE_LABELS = new Set(
  [
    'Telefon panny młodej',
    'Telefon pana młodego',
    'E-mail panny młodej',
    'E-mail pana młodego',
    'Adres panny młodej',
    'Adres pana młodego',
    'Adres ceremonii',
    'Adres przyjęcia',
    'Przygotowania panny młodej',
    'Przygotowania pana młodego',
    'Lokalizacja sesji',
  ].map((s) => s.toLowerCase()),
)

function venueLabelForNavigation(label: string | undefined): string | undefined {
  const trimmed = label?.trim()
  if (!trimmed) return undefined
  if (SEMANTIC_NAV_ROLE_LABELS.has(trimmed.toLowerCase())) return undefined
  return trimmed
}

function openExternal(href: string): void {
  if (typeof window === 'undefined') return
  window.location.assign(href)
}

/**
 * Execute a closed AssistantAction.
 * Returns structured result for tests; performs side effects when `navigate` provided
 * (or default window.assign for external).
 */
export function executeAssistantAction(
  action: AssistantAction,
  options?: {
    navigate?: AssistantActionNavigate
    /** When false, skip window side effects (tests). Default true. */
    apply?: boolean
  },
): ExecuteAssistantActionResult {
  const apply = options?.apply !== false
  const navigate = options?.navigate

  if (!action || typeof action !== 'object' || !('type' in action)) {
    return { ok: false, reason: 'invalid_action' }
  }
  if (!ACTION_TYPES.has(action.type)) {
    return { ok: false, reason: 'unsupported_action_type' }
  }

  // Reject smuggled URL fields if present on a widened object.
  const widened = action as AssistantAction & {
    url?: unknown
    href?: unknown
    route?: unknown
  }
  if (widened.url != null || widened.href != null || widened.route != null) {
    return { ok: false, reason: 'arbitrary_url_rejected' }
  }

  switch (action.type) {
    case 'call_phone': {
      if (!isValidPresentationPhone(action.phone)) {
        return { ok: false, reason: 'invalid_phone' }
      }
      const href = buildTelHref(action.phone)
      if (!href) return { ok: false, reason: 'invalid_phone' }
      if (apply) openExternal(href)
      return { ok: true, mode: 'external', href }
    }
    case 'send_sms': {
      if (!isValidPresentationPhone(action.phone)) {
        return { ok: false, reason: 'invalid_phone' }
      }
      const href = buildSmsHref(action.phone)
      if (!href) return { ok: false, reason: 'invalid_phone' }
      if (apply) openExternal(href)
      return { ok: true, mode: 'external', href }
    }
    case 'compose_email': {
      if (!isValidPresentationEmail(action.email)) {
        return { ok: false, reason: 'invalid_email' }
      }
      const email = action.email.trim()
      const mailto = `mailto:${email}`
      if (apply) openExternal(mailto)
      return { ok: true, mode: 'external', href: mailto }
    }
    case 'navigate_address': {
      if (!isValidPresentationAddress(action.address)) {
        return { ok: false, reason: 'invalid_address' }
      }
      // Phase 2J — same navigation primitive as wedding Logistics Nawiguj.
      // Strip semantic role labels; venue names still pass through.
      const href = buildGoogleMapsNavigationUrl({
        formattedAddress: action.address.trim(),
        label: venueLabelForNavigation(action.label),
      })
      if (!href) return { ok: false, reason: 'maps_unavailable' }
      if (apply) {
        if (typeof window !== 'undefined') {
          window.open(href, '_blank', 'noopener,noreferrer')
        }
      }
      return { ok: true, mode: 'external', href }
    }
    case 'open_wedding': {
      if (!isValidEntityId(action.weddingId)) {
        return { ok: false, reason: 'invalid_entity_id' }
      }
      const path = `/sluby/${action.weddingId.trim()}`
      if (apply && navigate) navigate(path)
      return { ok: true, mode: 'navigate', path }
    }
    case 'open_session': {
      if (!isValidEntityId(action.sessionId)) {
        return { ok: false, reason: 'invalid_entity_id' }
      }
      const path = `/sesje/${action.sessionId.trim()}`
      if (apply && navigate) navigate(path)
      return { ok: true, mode: 'navigate', path }
    }
    case 'open_prewedding_questionnaire': {
      if (!isValidEntityId(action.weddingId)) {
        return { ok: false, reason: 'invalid_entity_id' }
      }
      const path = `/sluby/${action.weddingId.trim()}?tab=pre_wedding_questionnaire`
      if (apply && navigate) navigate(path)
      return { ok: true, mode: 'navigate', path }
    }
    case 'open_calendar': {
      // Calendar date deep-link is not supported — open /kalendarz only.
      void action.date
      const path = '/kalendarz'
      if (apply && navigate) navigate(path)
      return { ok: true, mode: 'navigate', path }
    }
    default: {
      const _exhaustive: never = action
      void _exhaustive
      return { ok: false, reason: 'unsupported_action_type' }
    }
  }
}

/** UI-owned Polish labels — never produced by projection. */
export function labelForAssistantAction(action: AssistantAction): string {
  switch (action.type) {
    case 'call_phone':
      return 'Zadzwoń'
    case 'send_sms':
      return 'SMS'
    case 'compose_email':
      return 'Napisz mail'
    case 'navigate_address':
      return 'Nawiguj'
    case 'open_wedding':
      return 'Otwórz zlecenie'
    case 'open_session':
      return 'Otwórz sesję'
    case 'open_prewedding_questionnaire':
      return 'Otwórz ankietę'
    case 'open_calendar':
      return 'Otwórz kalendarz'
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}
