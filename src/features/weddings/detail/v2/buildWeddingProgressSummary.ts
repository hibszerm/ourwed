/**
 * Derived Wedding Overview progress — presentation only.
 * Domains: Umowa + Przygotowania (payments live in the financial band).
 *
 * Phase 1B: Overview primary CTA uses `resolveWeddingNextAction` via
 * WeddingNextActionCard. `pickPrimaryAction` / `primaryAction` are LEGACY —
 * not the live Overview CTA source; kept for progress-summary consumers/tests.
 * Shared proximity window constant: PRE_WEDDING_PREP_WINDOW_DAYS (21).
 */
import { getCountdownParts } from '@/lib/utils/dates'
import type { WeddingPlace } from '@/types/travel'
import type { QuestionnaireStatus, Wedding } from '@/types/wedding'
import { getWeddingLocationItems } from './weddingWorkspaceSelectors'

export type ProgressStatusTone =
  | 'complete'
  | 'current'
  | 'attention'
  | 'not_started'
  | 'not_applicable'

export type ProgressGroupId = 'contract' | 'preparation'

export type ProgressEmphasis = 'high' | 'normal' | 'quiet'

export interface ProgressStatusItem {
  id: string
  label: string
  tone: ProgressStatusTone
  detail?: string
}

export interface ProgressStatusGroup {
  id: ProgressGroupId
  title: string
  items: ProgressStatusItem[]
  emphasis: ProgressEmphasis
}

export type ProgressPrimaryActionId =
  | 'send_prewedding'
  | 'open_prewedding'
  | 'send_contract_questionnaire'

export interface WeddingProgressSummary {
  groups: ProgressStatusGroup[]
  attentionCount: number
  primaryAction: {
    id: ProgressPrimaryActionId
    label: string
  } | null
  proximity: 'far' | 'near' | 'past'
}

function hasContractPartyData(wedding: Wedding): boolean {
  const c = wedding.couple
  const bride = [c.partner1FirstName, c.partner1LastName]
    .filter(Boolean)
    .join(' ')
    .trim() || c.partner1?.trim()
  const groom = [c.partner2FirstName, c.partner2LastName]
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

function proximityForDate(date: string): 'far' | 'near' | 'past' {
  if (!date?.trim()) return 'far'
  const { days, isPast, isToday } = getCountdownParts(date)
  if (isPast) return 'past'
  if (isToday || days <= 21) return 'near'
  return 'far'
}

function buildContractGroup(wedding: Wedding): ProgressStatusGroup {
  const items: ProgressStatusItem[] = []
  const q = wedding.questionnaires?.contractData
  const partyOk = q?.status === 'completed' || hasContractPartyData(wedding)

  if (q?.status === 'completed') {
    items.push({
      id: 'contract-data',
      label: 'Dane do umowy otrzymane',
      tone: 'complete',
    })
  } else if (partyOk) {
    items.push({
      id: 'contract-data',
      label: 'Dane do umowy uzupełnione',
      tone: 'complete',
    })
  } else if (q?.status === 'sent') {
    items.push({
      id: 'contract-data',
      label: 'Oczekuje na dane do umowy',
      tone: 'current',
    })
  } else {
    items.push({
      id: 'contract-data',
      label: 'Dane do umowy niekompletne',
      tone: 'attention',
    })
  }

  const contractStatus = wedding.contract?.status ?? 'none'
  if (contractStatus === 'signed') {
    items.push({
      id: 'contract-signed',
      label: 'Umowa podpisana',
      tone: 'complete',
    })
  } else if (contractStatus === 'sent' || contractStatus === 'generated') {
    items.push({
      id: 'contract-generated',
      label: 'Umowa wygenerowana',
      tone: 'complete',
    })
    items.push({
      id: 'contract-signed',
      label: 'Oczekuje na podpis',
      tone: 'current',
    })
  } else {
    items.push({
      id: 'contract-generated',
      label: 'Umowa nie wygenerowana',
      tone: partyOk ? 'attention' : 'not_started',
    })
  }

  return {
    id: 'contract',
    title: 'Umowa',
    items,
    emphasis: 'normal',
  }
}

function buildPreparationGroup(
  wedding: Wedding,
  places: WeddingPlace[],
  preweddingOverride?: QuestionnaireStatus | null,
): ProgressStatusGroup {
  const items: ProgressStatusItem[] = []
  const preStatus =
    preweddingOverride ??
    wedding.questionnaires?.weddingQuestionnaire?.status ??
    null

  if (!preStatus || preStatus === 'not_sent') {
    items.push({
      id: 'prewedding',
      label: 'Ankieta przedślubna niewysłana',
      tone: preStatus === 'not_sent' ? 'attention' : 'not_started',
    })
  } else if (preStatus === 'completed') {
    items.push({
      id: 'prewedding',
      label: 'Ankieta przedślubna wypełniona',
      tone: 'complete',
    })
    items.push({
      id: 'wedding-day-data',
      label: 'Dane dnia ślubu zatwierdzone',
      tone: 'complete',
    })
  } else if (preStatus === 'sent') {
    items.push({
      id: 'prewedding',
      label: 'Ankieta przedślubna wysłana',
      tone: 'current',
    })
  } else {
    items.push({
      id: 'prewedding',
      label: 'Ankieta przedślubna niewysłana',
      tone: 'attention',
    })
  }

  const locations = getWeddingLocationItems(wedding, places)
  const reception = locations.find((l) => l.role === 'reception')
  const ceremony = locations.find((l) => l.role === 'ceremony')
  const filledCore =
    Boolean(reception && !reception.empty) &&
    Boolean(ceremony && !ceremony.empty)

  if (locations.every((l) => l.empty)) {
    items.push({
      id: 'locations',
      label: 'Lokalizacje wymagają uzupełnienia',
      tone: 'attention',
    })
  } else if (filledCore) {
    items.push({
      id: 'locations',
      label: 'Lokalizacje uzupełnione',
      tone: 'complete',
    })
  } else {
    items.push({
      id: 'locations',
      label: 'Lokalizacje wymagają uzupełnienia',
      tone: 'attention',
      detail: !reception || reception.empty
        ? 'Brakuje miejsca przyjęcia'
        : !ceremony || ceremony.empty
          ? 'Brakuje miejsca ceremonii'
          : undefined,
    })
  }

  return {
    id: 'preparation',
    title: 'Przygotowania',
    items,
    emphasis: 'normal',
  }
}

function applyEmphasis(
  groups: ProgressStatusGroup[],
  proximity: 'far' | 'near' | 'past',
): ProgressStatusGroup[] {
  return groups.map((group) => {
    const hasAttention = group.items.some(
      (i) => i.tone === 'attention' || i.tone === 'current',
    )
    let emphasis: ProgressEmphasis

    if (proximity === 'past') {
      emphasis =
        group.id === 'preparation'
          ? 'quiet'
          : hasAttention
            ? 'normal'
            : 'quiet'
    } else if (proximity === 'near') {
      emphasis =
        group.id === 'preparation'
          ? 'high'
          : group.id === 'contract' && !hasAttention
            ? 'quiet'
            : 'normal'
    } else {
      emphasis =
        group.id === 'contract'
          ? 'high'
          : hasAttention
            ? 'normal'
            : 'quiet'
    }

    return { ...group, emphasis }
  })
}

/** @deprecated Phase 1B — Overview CTA uses resolveWeddingNextAction. Kept for summary field/tests. */
function pickPrimaryAction(
  wedding: Wedding,
  proximity: 'far' | 'near' | 'past',
  preweddingOverride?: QuestionnaireStatus | null,
): WeddingProgressSummary['primaryAction'] {
  const preStatus =
    preweddingOverride ??
    wedding.questionnaires?.weddingQuestionnaire?.status ??
    null
  const contractQ = wedding.questionnaires?.contractData

  if (proximity === 'near' || proximity === 'past') {
    if (!preStatus || preStatus === 'not_sent') {
      return { id: 'send_prewedding', label: 'Przygotuj ankietę przedślubną' }
    }
    if (preStatus === 'sent') {
      return { id: 'open_prewedding', label: 'Otwórz ankietę przedślubną' }
    }
  }

  if (contractQ?.status === 'not_sent') {
    return {
      id: 'send_contract_questionnaire',
      label: 'Wyślij ankietę do umowy',
    }
  }

  return null
}

export function buildWeddingProgressSummary(
  wedding: Wedding,
  places: WeddingPlace[],
  options?: { preweddingStatus?: QuestionnaireStatus | null },
): WeddingProgressSummary {
  const proximity = proximityForDate(wedding.date)
  const preOverride = options?.preweddingStatus
  const groups = applyEmphasis(
    [
      buildContractGroup(wedding),
      buildPreparationGroup(wedding, places, preOverride),
    ],
    proximity,
  )

  const attentionCount = groups.reduce(
    (n, g) =>
      n +
      g.items.filter((i) => i.tone === 'attention' || i.tone === 'current')
        .length,
    0,
  )

  return {
    groups,
    attentionCount,
    primaryAction: pickPrimaryAction(wedding, proximity, preOverride),
    proximity,
  }
}
