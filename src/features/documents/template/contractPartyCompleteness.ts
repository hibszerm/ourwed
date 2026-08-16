/**
 * Structured party-clause completeness (provider + client).
 *
 * Provider-side data in an uploaded photographer template is immutable by default.
 * Client/couple data remains dynamic when physically present.
 */

import { canonicalizeParagraphText } from './canonicalParagraph'
import { CLIENT_PARTY_CLAUSE_CUE_RE } from './clientPartyRolePhrases'
import type { IndexedParagraph } from './extractDocxParagraphs'
import { segmentCompanyPartyClause } from './segmentCompanyClause'
import type { TemplateSlot } from './types'
import { devInfoArgs } from '@/lib/debug/devConsole'

export type ProviderPartyMode =
  | 'immutable_template'
  | 'dynamic_profile'
  | 'mixed'

export type ClientPartyMode = 'dynamic' | 'missing' | 'not_present'

export interface PartyCompletenessReport {
  providerEntitiesDetected: string[]
  clientEntitiesDetected: string[]
  unsupportedEntityRequirements: string[]
  missingProfileValues: string[]
  generationBlocked: boolean
  blockingReasons: string[]
  /** Human messages for analysisWarnings. */
  warnings: string[]
  requiredRepresentativeCount: number
  providerPartyMode: ProviderPartyMode
  clientPartyMode: ClientPartyMode
}

/**
 * Count natural-person names listed after „pod firmą … s.c.” until seat.
 */
export function countInlineCompanyRepresentatives(
  paragraphs: IndexedParagraph[],
): number {
  let max = 0
  for (const p of paragraphs) {
    const text = canonicalizeParagraphText(p.text)
    const firm = /(?:pod\s+)?firm[aą]\s+/iu.exec(text)
    if (!firm || firm.index == null) continue
    const seg = segmentCompanyPartyClause(text, firm.index, firm[0].length)
    max = Math.max(max, seg.representatives.length)
  }
  return max
}

function isDynamicProviderSlot(s: TemplateSlot): boolean {
  if (s.sourceHint !== 'company') return false
  if (s.enabled === false) return false
  if (s.dismissedAsNotPresent) return false
  if (
    s.variableClassification === 'template_constant' ||
    s.variableClassification === 'ignored_non_variable'
  ) {
    return false
  }
  return (
    s.variableClassification === 'dynamic_candidate' ||
    s.physicallyBound === true
  )
}

function isImmutableProviderSlot(s: TemplateSlot): boolean {
  return (
    s.sourceHint === 'company' &&
    (s.variableClassification === 'template_constant' ||
      s.variableClassification === 'ignored_non_variable')
  )
}

export function analyzePartyCompleteness(input: {
  paragraphs: IndexedParagraph[]
  slots: TemplateSlot[]
  /** How many owner/representative names the company profile can supply (usually 1). */
  profileRepresentativeCapacity?: number
}): PartyCompletenessReport {
  const joined = input.paragraphs
    .map((p) => canonicalizeParagraphText(p.text))
    .join('\n')
  const capacity = input.profileRepresentativeCapacity ?? 1

  const providerEntitiesDetected: string[] = []
  const clientEntitiesDetected: string[] = []
  const unsupportedEntityRequirements: string[] = []
  const missingProfileValues: string[] = []
  const blockingReasons: string[] = []
  const warnings: string[] = []

  const hasProviderCue =
    /firm[aą]|działalność\s+gospodarcz|Kamerzyst|Filmowc|Wykonawc|Fotograf/i.test(
      joined,
    )
  const hasClientCue =
    CLIENT_PARTY_CLAUSE_CUE_RE.test(joined) ||
    /Panna\s+Młoda|Pan\s+Młody/i.test(joined)

  const boundDynamic = (key: string) =>
    input.slots.some(
      (s) =>
        s.registryKey === key &&
        isDynamicProviderSlot(s) &&
        s.physicallyBound &&
        s.physicalSpanSafety !== 'unsafe',
    )
  const anyClientSlot = (key: string) =>
    input.slots.some(
      (s) =>
        s.registryKey === key &&
        s.enabled !== false &&
        s.variableClassification !== 'template_constant',
    )

  if (hasProviderCue) {
    for (const p of input.paragraphs) {
      const text = canonicalizeParagraphText(p.text)
      const firm = /(?:pod\s+)?firm[aą]\s+/iu.exec(text)
      if (!firm || firm.index == null) continue
      const seg = segmentCompanyPartyClause(text, firm.index, firm[0].length)
      if (seg.companyName) providerEntitiesDetected.push('company_name')
      if (seg.representatives.length > 0) {
        providerEntitiesDetected.push('company_representative')
      }
      if (seg.cityLocative) providerEntitiesDetected.push('company_city_locative')
      if (seg.address) providerEntitiesDetected.push('company_address')
    }
  }

  for (const key of [
    'company_name',
    'company_nip',
    'company_address',
    'company_city_locative',
    'company_representative',
  ] as const) {
    if (boundDynamic(key) && !providerEntitiesDetected.includes(key)) {
      providerEntitiesDetected.push(key)
    }
  }

  const dynamicProviderSlots = input.slots.filter(isDynamicProviderSlot)
  const immutableProviderSlots = input.slots.filter(isImmutableProviderSlot)

  let providerPartyMode: ProviderPartyMode = 'immutable_template'
  if (dynamicProviderSlots.length > 0 && immutableProviderSlots.length > 0) {
    providerPartyMode = 'mixed'
  } else if (dynamicProviderSlots.length > 0) {
    providerPartyMode = 'dynamic_profile'
  } else {
    providerPartyMode = 'immutable_template'
  }

  const requiredRepresentativeCount = countInlineCompanyRepresentatives(
    input.paragraphs,
  )
  const dynamicRepSlots = dynamicProviderSlots.filter(
    (s) =>
      s.registryKey === 'company_representative' ||
      (s.registryKey?.startsWith('company_representative_') ?? false),
  )
  if (
    dynamicRepSlots.length > 0 &&
    requiredRepresentativeCount >= 2 &&
    capacity < requiredRepresentativeCount
  ) {
    unsupportedEntityRequirements.push(
      `company_representatives:${requiredRepresentativeCount}`,
    )
    blockingReasons.push(
      `Dynamic representative slots require ${requiredRepresentativeCount} partners; profile capacity is ${capacity}`,
    )
    warnings.push(
      `Ten szablon wymaga danych co najmniej ${requiredRepresentativeCount} wspólników lub reprezentantów firmy, których nie ma w profilu firmy.`,
    )
    missingProfileValues.push('company_representative')
  }

  const unsafeDynamicCompany = input.slots.some(
    (s) =>
      s.registryKey === 'company_name' &&
      isDynamicProviderSlot(s) &&
      (s.physicalSpanSafety === 'unsafe' ||
        (Boolean(s.originalText) &&
          s.originalText!.length > 60 &&
          /prowadząc|spółki cywilnej|z siedzibą|przy ul/i.test(
            s.originalText!,
          ))),
  )
  if (unsafeDynamicCompany) {
    blockingReasons.push(
      'Dynamic company_name physical span is unsafe (clause-level capture)',
    )
    warnings.push(
      'Nazwa firmy została wykryta w zbyt szerokim zakresie — zawęź slot przed generacją.',
    )
  }

  if (hasProviderCue && providerPartyMode === 'immutable_template') {
    warnings.push(
      'Dane firmy i reprezentantów zapisane w szablonie pozostaną bez zmian w generowanych umowach.',
    )
  }

  const clientBound = (key: string) =>
    input.slots.some(
      (s) =>
        s.registryKey === key &&
        s.physicallyBound &&
        s.physicalSpanSafety !== 'unsafe' &&
        s.enabled !== false,
    )

  if (clientBound('couple_full_names') || clientBound('partner1_full_name')) {
    clientEntitiesDetected.push('couple')
  }
  if (
    clientBound('partner1_full_name') ||
    anyClientSlot('partner1_full_name') ||
    anyClientSlot('bride_full_name')
  ) {
    clientEntitiesDetected.push('partner1')
  }
  if (
    clientBound('partner2_full_name') ||
    anyClientSlot('partner2_full_name') ||
    anyClientSlot('groom_full_name')
  ) {
    clientEntitiesDetected.push('partner2')
  }

  const hasPartner1 =
    clientBound('partner1_full_name') ||
    clientBound('bride_full_name') ||
    anyClientSlot('partner1_full_name')
  const hasPartner2 =
    clientBound('partner2_full_name') ||
    clientBound('groom_full_name') ||
    anyClientSlot('partner2_full_name')
  const hasCoupleComposite = clientBound('couple_full_names')

  let clientPartyMode: ClientPartyMode = 'not_present'
  if (hasClientCue) {
    if (hasCoupleComposite || hasPartner1 || hasPartner2) {
      clientPartyMode = 'dynamic'
      if (hasPartner1 && !hasPartner2 && !hasCoupleComposite) {
        warnings.push(
          'Wykryto dane pierwszej strony klienta — brak drugiej osoby (partner2). Sprawdź, czy umowa ma jedną stronę zamawiającą.',
        )
      }
      const clientGaps: string[] = []
      if (
        input.slots.some(
          (s) =>
            (s.registryKey === 'bride_phone' ||
              s.registryKey === 'bride_email' ||
              s.registryKey === 'groom_phone' ||
              s.registryKey === 'groom_email') &&
            (!s.originalText || !s.originalText.trim()) &&
            s.needsConfirmation &&
            !s.physicallyBound,
        )
      ) {
        clientGaps.push('telefon / e-mail (pusty placeholder)')
      }
      if (clientGaps.length > 0) {
        warnings.push(
          `Dane pary wykryte; pozostałe luki: ${clientGaps.join(', ')}.`,
        )
      }
    } else {
      clientPartyMode = 'missing'
      blockingReasons.push(
        'Client party clause present but no couple/partner slot bound',
      )
      warnings.push(
        'Wykryto klauzulę strony klienta (pary młodej), ale nie powiązano bezpiecznie danych pary.',
      )
    }
  }

  for (const s of input.slots) {
    if (
      s.registryKey === 'company_name' &&
      isDynamicProviderSlot(s) &&
      s.originalText &&
      s.originalText.length > 80
    ) {
      blockingReasons.push(
        'Dynamic company_name source longer than safe trade-name length',
      )
    }
  }

  const generationBlocked = blockingReasons.length > 0

  devInfoArgs('[contract-party-completeness]', {
    providerEntitiesDetected: [...new Set(providerEntitiesDetected)],
    clientEntitiesDetected: [...new Set(clientEntitiesDetected)],
    unsupportedEntityRequirements,
    missingProfileValues,
    generationBlocked,
    requiredRepresentativeCount,
    providerPartyMode,
    clientPartyMode,
  })

  return {
    providerEntitiesDetected: [...new Set(providerEntitiesDetected)],
    clientEntitiesDetected: [...new Set(clientEntitiesDetected)],
    unsupportedEntityRequirements,
    missingProfileValues,
    generationBlocked,
    blockingReasons,
    warnings,
    requiredRepresentativeCount,
    providerPartyMode,
    clientPartyMode,
  }
}

/** @deprecated Prefer analyzePartyCompleteness — kept for callers. */
export function hasVisiblePartyIdentityWithoutSlot(
  paragraphs: IndexedParagraph[],
  slots: TemplateSlot[],
): boolean {
  return (
    analyzePartyCompleteness({ paragraphs, slots }).clientPartyMode ===
    'missing'
  )
}
