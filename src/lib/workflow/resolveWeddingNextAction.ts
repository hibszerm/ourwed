/**
 * Shared wedding Next Action resolver (Phase 1A / 1B.1 lifecycle).
 *
 * Pure, business-state-driven recommendation — exactly one action or null.
 * Does NOT mutate workflowStage, create tasks, or call APIs.
 *
 * Next Action = concrete work the photographer can do now.
 * Waiting on the couple / awareness belongs to status + Attention — not here.
 *
 * Lifecycle gates (proximity never bypasses unfinished commercial work):
 * A. Contract data / contract (send Q → generate → mark signed)
 * B. Deposit when required
 * C. Pre-wedding prep window (send; waiting ⇒ null)
 * D. Operational completion only after pre-wedding completed
 *    (Apply → locations → ceremony time → cockpit when imminent)
 *
 * Legacy consumers (migrate in later phases):
 * - `getNextRecommendedAction` in workflowEngine.ts (stage-gated)
 * - `pickPrimaryAction` in buildWeddingProgressSummary.ts (LEGACY; Overview CTA
 *   now uses this resolver via WeddingNextActionCard)
 */

import { resolveStopTime } from '@/features/wedding-day/operationalDayPlan'
import type { OperationalTimeMap } from '@/features/wedding-day/operationalDayPlan'
import { hasPaidDepositPayment } from '@/lib/finance/hasPaidDepositPayment'
import { getAgreedDeposit } from '@/lib/utils/commercial'
import { getDaysUntil } from '@/lib/utils/dates'
import type { WeddingPlace } from '@/types/travel'
import type { QuestionnaireStatus, Wedding } from '@/types/wedding'

/**
 * Same proximity window as Overview `buildWeddingProgressSummary` (≤21 days).
 */
export const PRE_WEDDING_PREP_WINDOW_DAYS = 21

/** Mirrors WeddingWorkspaceTab — kept local so lib does not import UI modules. */
export type WeddingNextActionTab =
  | 'overview'
  | 'wedding_day'
  | 'contract_finance'
  | 'pre_wedding_questionnaire'
  | 'activity'

export type WeddingNextActionId =
  | 'send_contract_questionnaire'
  | 'generate_contract'
  | 'mark_contract_signed'
  | 'record_deposit'
  | 'send_prewedding'
  | 'review_apply'
  | 'complete_core_locations'
  | 'set_ceremony_time'
  | 'open_cockpit'

export type WeddingNextActionPriority = 'blocker' | 'preparation' | 'imminent'

/**
 * Declarative destination for Phase 1B UI wiring.
 * No React callbacks — serializable metadata only.
 */
export type WeddingNextActionDestination =
  | { kind: 'wedding_tab'; tab: WeddingNextActionTab }
  | { kind: 'route'; path: string }
  | { kind: 'modal'; intent: 'send_contract_questionnaire' | 'add_deposit' }
  | { kind: 'editor'; section: 'locations' | 'wedding' | 'finances' }
  | { kind: 'cockpit' }

export type WeddingNextAction = {
  id: WeddingNextActionId
  title: string
  description?: string
  priority: WeddingNextActionPriority
  destination: WeddingNextActionDestination
}

/**
 * Optional already-resolved context — never fetched inside the resolver.
 * Callers (Phase 1B+) supply Apply count, places, operational clocks, etc.
 */
export type WeddingNextActionContext = {
  /** Override hydrated wedding.questionnaires.weddingQuestionnaire.status */
  preweddingStatus?: QuestionnaireStatus | null
  /** Canonical WeddingPlace rows for this wedding */
  places?: WeddingPlace[]
  /** Operational stop clocks keyed by place id / studio */
  operationalTimes?: OperationalTimeMap
  /** Questionnaire ceremony seed (HH:MM), when known */
  questionnaireCeremonyTime?: string | null
  /**
   * Count of canonical Apply candidates only
   * (`buildWeddingDaySyncCandidates` length). Note-only mappings must not count.
   */
  canonicalApplyCandidateCount?: number
  /**
   * Calendar date YYYY-MM-DD for proximity tests.
   * Defaults to local today when omitted.
   */
  today?: string
}

function hasContractPartyData(wedding: Wedding): boolean {
  const c = wedding.couple
  const bride =
    [c.partner1FirstName, c.partner1LastName]
      .filter(Boolean)
      .join(' ')
      .trim() || c.partner1?.trim()
  const groom =
    [c.partner2FirstName, c.partner2LastName]
      .filter(Boolean)
      .join(' ')
      .trim() || c.partner2?.trim()
  const contact = Boolean(
    c.partner1Phone?.trim() ||
      c.phone?.trim() ||
      c.partner1Email?.trim() ||
      c.email?.trim(),
  )
  return Boolean(bride && groom && contact)
}

function contractQuestionnaireStatus(wedding: Wedding): QuestionnaireStatus {
  return wedding.questionnaires?.contractData?.status ?? 'not_sent'
}

function preweddingStatus(
  wedding: Wedding,
  ctx: WeddingNextActionContext,
): QuestionnaireStatus {
  if (ctx.preweddingStatus !== undefined && ctx.preweddingStatus !== null) {
    return ctx.preweddingStatus
  }
  return wedding.questionnaires?.weddingQuestionnaire?.status ?? 'not_sent'
}

function daysUntilWedding(wedding: Wedding, ctx: WeddingNextActionContext): number {
  if (!wedding.date?.trim()) return Number.POSITIVE_INFINITY
  if (ctx.today) {
    const target = new Date(wedding.date)
    target.setHours(0, 0, 0, 0)
    const today = new Date(ctx.today)
    today.setHours(0, 0, 0, 0)
    return Math.ceil(
      (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    )
  }
  return getDaysUntil(wedding.date)
}

/** Upcoming prep window: wedding day through 21 days out (not past). */
function isInPrepWindow(days: number): boolean {
  return Number.isFinite(days) && days >= 0 && days <= PRE_WEDDING_PREP_WINDOW_DAYS
}

function isImminent(days: number): boolean {
  return days === 0 || days === 1
}

function isPast(days: number): boolean {
  return Number.isFinite(days) && days < 0
}

function placeFilled(place: WeddingPlace | undefined, legacy: string | undefined): boolean {
  if (place) {
    const name = place.label?.trim()
    const addr = place.formattedAddress?.trim()
    if (name || addr) return true
  }
  return Boolean(legacy?.trim())
}

/** Core locations for V1 blockers: ceremony + reception only. Prep is optional. */
export function hasCoreLocations(
  wedding: Wedding,
  places: WeddingPlace[] = [],
): boolean {
  const byRole = new Map(places.map((p) => [p.role, p]))
  const ceremonyOk = placeFilled(
    byRole.get('ceremony'),
    wedding.ceremonyLocation,
  )
  const receptionOk = placeFilled(
    byRole.get('reception'),
    wedding.receptionLocation,
  )
  return ceremonyOk && receptionOk
}

/**
 * Ceremony time readiness — same precedence as Plan dnia / Cockpit:
 * operational override → wedding.ceremonyTime → questionnaire seed.
 */
export function hasResolvedCeremonyTime(
  wedding: Wedding,
  ctx: WeddingNextActionContext,
): boolean {
  const places = ctx.places ?? []
  const ceremony = places.find((p) => p.role === 'ceremony')
  const override =
    ceremony && ctx.operationalTimes
      ? ctx.operationalTimes[ceremony.id]
      : undefined
  const resolved = resolveStopTime(
    override,
    ctx.questionnaireCeremonyTime,
    wedding.ceremonyTime,
  )
  return Boolean(resolved.time)
}

function action(partial: WeddingNextAction): WeddingNextAction {
  return partial
}

/**
 * PHASE D — operational completion.
 * Only callable after pre-wedding questionnaire is completed.
 */
function resolveOperationalAction(args: {
  applyCount: number
  coreLocationsOk: boolean
  ceremonyTimeOk: boolean
  days: number
  allowCockpit: boolean
}): WeddingNextAction | null {
  const {
    applyCount,
    coreLocationsOk,
    ceremonyTimeOk,
    days,
    allowCockpit,
  } = args

  if (applyCount > 0) {
    return action({
      id: 'review_apply',
      title: 'Przejrzyj aktualizacje z ankiety',
      description:
        'Zastosuj kanoniczne zmiany z ankiety do danych operacyjnych.',
      priority: 'preparation',
      destination: {
        kind: 'wedding_tab',
        tab: 'pre_wedding_questionnaire',
      },
    })
  }

  if (!coreLocationsOk) {
    return action({
      id: 'complete_core_locations',
      title: 'Uzupełnij lokalizacje',
      description: 'Uzupełnij miejsce ceremonii i przyjęcia.',
      priority: 'preparation',
      destination: { kind: 'editor', section: 'locations' },
    })
  }

  if (!ceremonyTimeOk) {
    return action({
      id: 'set_ceremony_time',
      title: 'Ustaw godzinę ceremonii',
      description: 'Ustal godzinę ceremonii w danych ślubu lub planie dnia.',
      priority: 'preparation',
      destination: { kind: 'editor', section: 'wedding' },
    })
  }

  if (allowCockpit && isImminent(days) && coreLocationsOk && ceremonyTimeOk) {
    return action({
      id: 'open_cockpit',
      title: 'Otwórz tryb dnia ślubu',
      description: 'Przejdź do operacyjnego trybu dnia ślubu.',
      priority: 'imminent',
      destination: { kind: 'cockpit' },
    })
  }

  return null
}

/**
 * Resolve the single highest-priority Next Action for a wedding.
 * Priority is deterministic and independent of workflowStage.
 *
 * Ordering (1B.1):
 * A. Legal create — send contract Q (not_sent) / generate (none + party/Q ok)
 *    Waiting contract Q (`sent` without party) → null (no fake CTA)
 * B. Mark signed / record deposit — always before ops, even when imminent
 * C. Prep window — send pre-wedding; sent/waiting → null
 * D. After pre-wedding completed — Apply → locations → time → cockpit
 * Past: only remaining legal/commercial; no invented delivery
 */
export function resolveWeddingNextAction(
  wedding: Wedding,
  context: WeddingNextActionContext = {},
): WeddingNextAction | null {
  const contractQ = contractQuestionnaireStatus(wedding)
  const contractStatus = wedding.contract?.status ?? 'none'
  const partyOk = contractQ === 'completed' || hasContractPartyData(wedding)
  const agreedDeposit = getAgreedDeposit(wedding)
  const depositPaid = hasPaidDepositPayment(wedding.payments ?? [])
  const preStatus = preweddingStatus(wedding, context)
  const places = context.places ?? []
  const days = daysUntilWedding(wedding, context)
  const prepWindow = isInPrepWindow(days)
  const past = isPast(days)
  const applyCount = Math.max(0, context.canonicalApplyCandidateCount ?? 0)
  const coreLocationsOk = hasCoreLocations(wedding, places)
  const ceremonyTimeOk = hasResolvedCeremonyTime(wedding, context)

  // --- PHASE A: Contract data / contract ---

  if (contractQ === 'not_sent') {
    return action({
      id: 'send_contract_questionnaire',
      title: 'Wyślij ankietę do umowy',
      description: 'Zbierz dane pary potrzebne do wygenerowania umowy.',
      priority: 'blocker',
      destination: { kind: 'modal', intent: 'send_contract_questionnaire' },
    })
  }

  if (partyOk && contractStatus === 'none') {
    return action({
      id: 'generate_contract',
      title: 'Wygeneruj umowę',
      description: 'Dane są gotowe — utwórz dokument umowy.',
      priority: 'blocker',
      destination: {
        kind: 'route',
        path: `/sluby/${wedding.id}/umowy/nowa`,
      },
    })
  }

  // Waiting on couple for contract questionnaire — no invented CTA / no ops leap.
  if (contractQ === 'sent' && contractStatus === 'none' && !partyOk) {
    return null
  }

  if (contractStatus === 'generated' || contractStatus === 'sent') {
    return action({
      id: 'mark_contract_signed',
      title: 'Oznacz umowę jako podpisaną',
      description: 'Potwierdź podpis w zakładce Umowa i finanse.',
      priority: 'blocker',
      destination: { kind: 'wedding_tab', tab: 'contract_finance' },
    })
  }

  // --- PHASE B: Deposit ---

  if (agreedDeposit > 0 && !depositPaid) {
    return action({
      id: 'record_deposit',
      title: 'Zarejestruj zadatek',
      description: 'Zarejestruj otrzymany zadatek w płatnościach zlecenia.',
      priority: 'blocker',
      destination: { kind: 'modal', intent: 'add_deposit' },
    })
  }

  // Past wedding: unresolved legal/commercial only — no ops / delivery invented work.
  if (past) return null

  // --- PHASE C: Pre-wedding preparation ---

  if (prepWindow) {
    if (preStatus === 'not_sent') {
      return action({
        id: 'send_prewedding',
        title: 'Wyślij ankietę przedślubną',
        description: 'Wyślij parze ankietę ze szczegółami dnia ślubu.',
        priority: 'preparation',
        destination: {
          kind: 'wedding_tab',
          tab: 'pre_wedding_questionnaire',
        },
      })
    }

    // Sent / opened / in_progress mapped to `sent` — waiting on the couple.
    if (preStatus !== 'completed') {
      return null
    }

    // --- PHASE D (prep window): operational after completion ---
    return resolveOperationalAction({
      applyCount,
      coreLocationsOk,
      ceremonyTimeOk,
      days,
      allowCockpit: true,
    })
  }

  // --- Outside prep window (>21 days): quiet unless completed soft ops ---

  if (preStatus === 'completed') {
    if (applyCount > 0) {
      return action({
        id: 'review_apply',
        title: 'Przejrzyj aktualizacje z ankiety',
        description:
          'Zastosuj kanoniczne zmiany z ankiety do danych operacyjnych.',
        priority: 'preparation',
        destination: {
          kind: 'wedding_tab',
          tab: 'pre_wedding_questionnaire',
        },
      })
    }

    if (!coreLocationsOk) {
      return action({
        id: 'complete_core_locations',
        title: 'Uzupełnij lokalizacje',
        description: 'Uzupełnij miejsce ceremonii i przyjęcia.',
        priority: 'preparation',
        destination: { kind: 'editor', section: 'locations' },
      })
    }
  }

  return null
}
