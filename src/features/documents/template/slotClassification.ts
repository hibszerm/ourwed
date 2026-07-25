/**
 * Canonical slot identity, requirement defaults, and detection classification.
 * Readiness is driven by THIS template's evidence — not the full registry.
 */

import { SystemVariableRegistry } from '@/lib/variables/registry'
import { SLOT_PATTERNS } from './slotBinder'
import { MONEY_KEY_CANONICAL } from './contractMoneyPairs'
import type {
  TemplateSlot,
  TemplateSlotDetectionStatus,
  TemplateSlotRequirement,
} from './types'

/** Keys that are required WHEN they have source evidence in this contract. */
const DEFAULT_REQUIRED_KEYS = new Set([
  'couple_full_names',
  'bride_full_name',
  'groom_full_name',
  'partner1_full_name',
  'partner2_full_name',
  'wedding_date',
  // company_name is NOT auto-required: provider data is immutable in uploaded
  // templates unless the user explicitly links it to the company profile.
  'package_name',
  'package_price',
  'contract_price',
  'contract_value_formatted',
  'contract_value_words',
  'deposit_amount',
  'agreed_deposit_formatted',
  'agreed_deposit_words',
  'remaining_after_deposit_formatted',
  'remaining_after_deposit_words',
])

/** Keys that are optional even when detected (unless user forces required). */
const DEFAULT_OPTIONAL_KEYS = new Set([
  'bride_email',
  'groom_email',
  'bride_phone',
  'groom_phone',
  'bride_address',
  'groom_address',
  'bride_pesel',
  'groom_pesel',
  'company_iban',
  'company_bank_account',
  'company_swift',
  'company_vat',
  'company_regon',
  'company_logo',
  'company_signature',
  'company_stamp',
  'company_website',
  'company_instagram',
  'company_facebook',
  'marketing_consent',
  'preparation_location',
  'coverage_end_time',
  'coverage_hours',
  'working_hours',
  'overtime_rate',
  'overtime_rate_formatted',
  'overtime_rate_words',
  'overtime_price',
  'delivery_time',
  'delivery_term_text',
  'delivery_months',
  'delivery_days',
  'final_payment_due_date',
  'final_payment_due_date_long',
  'included_services',
  'included_services_text',
  'package_items_count',
  'film_delivery_method',
  'film_delivery_format',
  'usb_included',
  'album_included',
  'online_gallery',
  'travel_fee',
  'mileage_limit',
  'mileage_price',
  'accommodation',
  'videographers_count',
  'photographers_count',
  'drone_included',
  'assistants',
  'number_of_revisions',
  'engagement_session',
  'wedding_session',
  'schedule',
  'wedding_schedule',
  'ceremony_time',
  'food_for_crew',
  'additional_notes',
  'company_nip',
  'company_phone',
  'company_address',
  'company_email',
  'company_representative',
  'payment_deadline',
  'remaining_payment',
  'remaining_to_pay',
  'remaining_to_pay_formatted',
  'remaining_to_pay_words',
  'film_duration',
  'contract_execution_date',
  'contract_execution_date_long',
  'company_city',
  'company_city_locative',
  'contract_city',
])

/** Component / alias keys that collapse into a fuller parent when present. */
const COMPONENT_PARENT: Record<string, string> = {
  bride_first_name: 'bride_full_name',
  bride_last_name: 'bride_full_name',
  groom_first_name: 'groom_full_name',
  groom_last_name: 'groom_full_name',
  'bride.name': 'bride_full_name',
  'groom.name': 'groom_full_name',
  'couple.partner1': 'partner1_full_name',
  'couple.partner2': 'partner2_full_name',
}

/**
 * Resolve a registry / alias / legacy key to one canonical slot id.
 */
export function canonicalRegistryKey(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed

  const fromComponent = COMPONENT_PARENT[trimmed]
  if (fromComponent) return fromComponent

  const moneyCanon = MONEY_KEY_CANONICAL[trimmed]
  if (moneyCanon) return moneyCanon

  const pattern = SLOT_PATTERNS.find(
    (p) =>
      p.registryKey === trimmed ||
      p.aliases?.includes(trimmed),
  )
  if (pattern) return pattern.registryKey

  const def = SystemVariableRegistry.get(trimmed)
  if (def) {
    const parent = COMPONENT_PARENT[def.id]
    if (parent) return parent
    const moneyFromDef = MONEY_KEY_CANONICAL[def.id]
    if (moneyFromDef) return moneyFromDef
    return def.id
  }

  return trimmed
}

export function defaultRequirementForKey(
  registryKey: string,
): TemplateSlotRequirement {
  const canonical = canonicalRegistryKey(registryKey)
  if (DEFAULT_OPTIONAL_KEYS.has(canonical)) return 'optional'
  if (DEFAULT_REQUIRED_KEYS.has(canonical)) return 'required'
  // Locations with physical pattern evidence default to required when bound;
  // when only semantically guessed → optional until user confirms.
  if (
    canonical === 'ceremony_location' ||
    canonical === 'reception_location' ||
    canonical === 'preparation_location'
  ) {
    return 'optional'
  }
  return 'optional'
}

export function hasSourceEvidence(slot: TemplateSlot): boolean {
  if (slot.physicallyBound) return true
  if (slot.leftAnchor && slot.rightAnchor) return true
  if (slot.originalText && slot.originalText.trim().length > 0) return true
  if (slot.allowedRange || (slot.startOffset != null && slot.endOffset != null)) {
    return true
  }
  // exampleText alone is NOT evidence — generic scrapes (any phone/price in the
  // document) must not invent required slots. Bind by example first; then
  // physicallyBound / originalText count.
  return false
}

/**
 * Classify a single slot after binding attempt.
 */
export function classifySlotDetection(
  slot: TemplateSlot,
  opts?: { patternMatchedInText?: boolean },
): {
  detectionStatus: TemplateSlotDetectionStatus
  requirement: TemplateSlotRequirement
  detectionReason: string
} {
  if (slot.dismissedAsNotPresent) {
    return {
      detectionStatus: 'not_present',
      requirement: slot.requirement ?? 'optional',
      detectionReason: 'Marked as not present in this contract by the user.',
    }
  }

  // Provider immutable template text — never required for generation
  if (
    slot.variableClassification === 'template_constant' ||
    slot.variableClassification === 'ignored_non_variable'
  ) {
    return {
      detectionStatus: 'optional_unbound',
      requirement: 'optional',
      detectionReason:
        slot.detectionReason ??
        'Dane usługodawcy w szablonie — niezmienne domyślnie.',
    }
  }

  const requirement =
    slot.requirement ??
    defaultRequirementForKey(slot.registryKey ?? slot.id)

  if (slot.physicallyBound) {
    return {
      detectionStatus: 'bound',
      requirement,
      detectionReason: 'Physical paragraph span is bound.',
    }
  }

  if (slot.needsConfirmation || slot.detectionStatus === 'ambiguous') {
    return {
      detectionStatus: 'ambiguous',
      requirement: slot.requirement ?? 'optional',
      detectionReason:
        slot.detectionReason ??
        'Mid-confidence detection — confirm in configuration before treating as required.',
    }
  }

  if (slot.detectionStatus === 'duplicate_alias') {
    return {
      detectionStatus: 'duplicate_alias',
      requirement,
      detectionReason: 'Alias of another canonical slot — not counted separately.',
    }
  }

  const evidence = hasSourceEvidence(slot)
  const patternHit = Boolean(opts?.patternMatchedInText)

  if (!evidence && !patternHit) {
    return {
      detectionStatus: 'false_positive',
      requirement: 'optional',
      detectionReason:
        'No source-text evidence (value, anchors, or placeholder). Likely a registry false positive.',
    }
  }

  if (evidence || patternHit) {
    if (requirement === 'required') {
      return {
        detectionStatus: 'required_unbound',
        requirement: 'required',
        detectionReason: patternHit
          ? 'Pattern anchors found in the document but the editable span is not bound.'
          : 'Source evidence exists but no safe physical binding was persisted.',
      }
    }
    return {
      detectionStatus: 'optional_unbound',
      requirement: 'optional',
      detectionReason:
        'Detected in this contract as optional — does not block readiness while unbound.',
    }
  }

  return {
    detectionStatus: 'ambiguous',
    requirement: 'optional',
    detectionReason: 'Detection is ambiguous; treated as optional until confirmed.',
  }
}

/**
 * Deduplicate slots by canonical registry key.
 * Prefer physically bound, then higher confidence, then required.
 */
export function dedupeSlotsByCanonicalKey(slots: TemplateSlot[]): TemplateSlot[] {
  const best = new Map<string, TemplateSlot>()
  const extras: TemplateSlot[] = []

  const score = (s: TemplateSlot) => {
    let n = 0
    if (s.physicallyBound) n += 100
    if (s.requirement === 'required') n += 10
    if (hasSourceEvidence(s)) n += 20
    if (typeof s.confidence === 'number') n += s.confidence
    return n
  }

  for (const slot of slots) {
    if (!slot.registryKey) {
      extras.push(slot)
      continue
    }
    const canonical = canonicalRegistryKey(slot.registryKey)
    const normalized: TemplateSlot = {
      ...slot,
      registryKey: canonical,
      aliases: [
        ...new Set([
          ...(slot.aliases ?? []),
          slot.registryKey,
          canonical,
        ].filter((k) => k !== canonical)),
      ],
    }
    const prev = best.get(canonical)
    if (!prev || score(normalized) > score(prev)) {
      if (prev) {
        extras.push({
          ...prev,
          detectionStatus: 'duplicate_alias',
          enabled: false,
          detectionReason: `Duplicate alias of ${canonical}.`,
        })
      }
      best.set(canonical, normalized)
    } else {
      extras.push({
        ...normalized,
        detectionStatus: 'duplicate_alias',
        enabled: false,
        detectionReason: `Duplicate alias of ${canonical}.`,
      })
    }
  }

  return [...best.values(), ...extras]
}

export function patternMatchedInDocument(
  registryKey: string,
  joinedText: string,
): boolean {
  const canonical = canonicalRegistryKey(registryKey)
  const pattern = SLOT_PATTERNS.find(
    (p) =>
      p.registryKey === canonical ||
      p.aliases?.includes(registryKey) ||
      p.aliases?.includes(canonical),
  )
  if (!pattern) return false
  const leftHit = pattern.leftAnchors.some((a) => a && joinedText.includes(a))
  const rightHit = pattern.rightAnchors.some((a) => a && joinedText.includes(a))
  return leftHit || rightHit
}
