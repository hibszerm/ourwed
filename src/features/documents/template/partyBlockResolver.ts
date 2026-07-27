/**
 * Deterministic party-block resolver — wedding partners must appear according
 * to the template's client-party generation capability (composite vs separate).
 */

import type { Wedding } from '@/types/wedding'
import type { TemplateSlot } from './types'
import { isSlotPhysicallyBound } from './types'
import {
  deriveClientPartyGenerationCapability,
  composeCoupleFullNamesValue,
  type ClientPartyGenerationCapability,
} from './clientPartyGenerationCapability'

export type PartyBlockStrategy =
  | 'separate_slots'
  | 'shared_client_slot'
  | 'primary_plus_continuation'
  | 'no_client_party'
  | 'composite_slot'

export interface PartyBlockPlan {
  strategy: PartyBlockStrategy
  partner1Name: string
  partner2Name: string
  /** Values to merge into the resolved bag. */
  overrides: Record<string, string>
  /**
   * When partners have different addresses and the template exposes only one
   * ambiguous address slot — photographer must choose or edit.
   */
  addressAmbiguity: {
    slotKeys: string[]
    partner1Address: string
    partner2Address: string
  } | null
  /** True when both partners are known and the plan represents both. */
  bothPartnersRepresented: boolean
  capability: ClientPartyGenerationCapability
}

const ADDRESS_KEYS = new Set([
  'bride_address',
  'groom_address',
  'partner1_address',
  'partner2_address',
  'client_address',
])

function boundKeys(slots: TemplateSlot[]): Set<string> {
  const out = new Set<string>()
  for (const slot of slots) {
    if (!isSlotPhysicallyBound(slot) || !slot.registryKey) continue
    out.add(slot.registryKey)
  }
  return out
}

function fullName(parts: {
  first?: string
  last?: string
  full?: string
}): string {
  const joined = [parts.first?.trim(), parts.last?.trim()]
    .filter(Boolean)
    .join(' ')
  return joined || parts.full?.trim() || ''
}

function normalizeAddr(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pl-PL')
}

/**
 * Inspect physical slots and compose partner overrides so a known second
 * partner is never silently dropped — without requiring a second physical
 * name slot when the template uses composite `couple_full_names`.
 */
export function resolvePartyBlock(input: {
  slots: TemplateSlot[]
  wedding: Pick<Wedding, 'couple'>
  /** Prefer source separator from the composite slot when omitted. */
  sharedSeparator?: string
}): PartyBlockPlan {
  const c = input.wedding.couple
  const partner1Name = fullName({ full: c.partner1 }) || c.partner1.trim()
  const partner2Name = fullName({ full: c.partner2 }) || c.partner2.trim()
  const capability = deriveClientPartyGenerationCapability(input.slots)
  const sep = input.sharedSeparator ?? capability.separator
  const keys = boundKeys(input.slots)

  const overrides: Record<string, string> = {}
  const combined = composeCoupleFullNamesValue({
    person1FullName: partner1Name,
    person2FullName: partner2Name,
    separator: sep,
  })

  let strategy: PartyBlockStrategy = 'no_client_party'
  let bothPartnersRepresented = !(partner1Name && partner2Name)

  if (capability.physicalMode === 'none') {
    return {
      strategy: 'no_client_party',
      partner1Name,
      partner2Name,
      overrides,
      addressAmbiguity: null,
      bothPartnersRepresented: true,
      capability,
    }
  }

  if (capability.physicalMode === 'composite') {
    strategy = 'composite_slot'
    if (combined) {
      overrides.couple_full_names = combined
      for (const alias of capability.semanticAliases) {
        if (alias !== 'couple_full_names') overrides[alias] = combined
      }
    }
    bothPartnersRepresented = Boolean(partner1Name && partner2Name)
  } else if (capability.physicalMode === 'separate_persons') {
    strategy = 'separate_slots'
    if (partner1Name) {
      overrides.bride_full_name = partner1Name
      overrides.partner1_full_name = partner1Name
      if (capability.person1BindingKey) {
        overrides[capability.person1BindingKey] = partner1Name
      }
    }
    if (partner2Name) {
      overrides.groom_full_name = partner2Name
      overrides.partner2_full_name = partner2Name
      if (capability.person2BindingKey) {
        overrides[capability.person2BindingKey] = partner2Name
      }
    }
    if (combined) overrides.couple_full_names = combined
    bothPartnersRepresented = Boolean(partner1Name && partner2Name)
  } else if (capability.physicalMode === 'single_person') {
    // One physical identity slot: may be a true single-client template, or a
    // legacy shared primary slot that receives both wedding partners when known.
    strategy =
      keys.has('groom_first_name') || keys.has('partner2_first_name')
        ? 'primary_plus_continuation'
        : 'shared_client_slot'
    const value =
      partner1Name && partner2Name
        ? composeCoupleFullNamesValue({
            person1FullName: partner1Name,
            person2FullName: partner2Name,
            separator: sep,
          })
        : partner1Name || partner2Name
    if (value) {
      if (capability.person1BindingKey) {
        overrides[capability.person1BindingKey] = value
      }
      if (capability.person2BindingKey) {
        overrides[capability.person2BindingKey] = value
      }
      overrides.bride_full_name = value
      overrides.partner1_full_name = value
      overrides.client_name = value
      overrides.client_full_name = value
      overrides.couple_full_names = value
    }
    bothPartnersRepresented = Boolean(partner1Name && partner2Name) || Boolean(value)
  }

  const boundAddressKeys = [...ADDRESS_KEYS].filter((k) => keys.has(k))
  const a1 = normalizeAddr(c.partner1Address)
  const a2 = normalizeAddr(c.partner2Address)
  let addressAmbiguity: PartyBlockPlan['addressAmbiguity'] = null
  if (boundAddressKeys.length === 1 && a1 && a2 && a1 !== a2) {
    addressAmbiguity = {
      slotKeys: boundAddressKeys,
      partner1Address: c.partner1Address?.trim() || '',
      partner2Address: c.partner2Address?.trim() || '',
    }
  } else if (
    boundAddressKeys.includes('client_address') &&
    !boundAddressKeys.includes('bride_address') &&
    !boundAddressKeys.includes('groom_address') &&
    a1 &&
    a2 &&
    a1 !== a2
  ) {
    addressAmbiguity = {
      slotKeys: ['client_address'],
      partner1Address: c.partner1Address?.trim() || '',
      partner2Address: c.partner2Address?.trim() || '',
    }
  }

  if (
    !addressAmbiguity &&
    boundAddressKeys.length === 1 &&
    a1 &&
    (!a2 || a1 === a2)
  ) {
    const key = boundAddressKeys[0]!
    overrides[key] = c.partner1Address!.trim()
  }

  return {
    strategy,
    partner1Name,
    partner2Name,
    overrides,
    addressAmbiguity,
    bothPartnersRepresented,
    capability,
  }
}

/**
 * Critical check: wedding partners required by the template capability must
 * appear in the generated client-party region text.
 */
export function auditPartnersRepresented(input: {
  paragraphs: Array<{ text: string }>
  partner1Name: string
  partner2Name: string
  templateHasClientParty: boolean
  /** When 1, only person1 is required in output. */
  expectedPersonCount?: 0 | 1 | 2
}): { ok: boolean; missing: string[] } {
  if (!input.templateHasClientParty) return { ok: true, missing: [] }
  const hay = input.paragraphs.map((p) => p.text).join('\n')
  const missing: string[] = []
  const p1 = input.partner1Name.trim()
  const p2 = input.partner2Name.trim()
  const expected = input.expectedPersonCount ?? 2
  if (expected >= 1 && p1 && !hay.includes(p1)) missing.push(p1)
  if (expected >= 2 && p2 && !hay.includes(p2)) missing.push(p2)
  return { ok: missing.length === 0, missing }
}

export function templateHasClientPartyData(slots: TemplateSlot[]): boolean {
  return deriveClientPartyGenerationCapability(slots).physicalMode !== 'none'
}

/**
 * When the source document has a singular party participle near „Parą Młodą”
 * and both wedding partners will be named, bind an exact physical slot for
 * that participle so „zwaną dalej” → „zwani dalej” stays owned.
 */
export function ensureCouplePartyParticipleSlot(input: {
  slots: TemplateSlot[]
  paragraphs: Array<{ index: number; text: string }>
  bothPartnersRepresented: boolean
}): TemplateSlot[] {
  if (!input.bothPartnersRepresented) return input.slots
  if (
    input.slots.some(
      (s) =>
        s.registryKey === 'couple_party_participle' &&
        isSlotPhysicallyBound(s),
    )
  ) {
    return input.slots
  }

  const extra: TemplateSlot[] = []
  for (const para of input.paragraphs) {
    if (!/Parą Młodą|Parą Mlodą/i.test(para.text)) continue
    const match = /\b(zwaną\s+dalej|zwanego\s+dalej|zwany\s+dalej)\b/iu.exec(
      para.text,
    )
    if (!match || match.index == null) continue
    const originalText = match[0]!
    extra.push({
      id: `auto-couple-participle-${para.index}-${match.index}`,
      label: 'Określenie strony (zwani/zwaną)',
      registryKey: 'couple_party_participle',
      enabled: true,
      physicallyBound: true,
      physicalSpanSafety: 'safe',
      operation: 'replace',
      requirement: 'optional',
      paragraphIndex: para.index,
      startOffset: match.index,
      endOffset: match.index + originalText.length,
      originalText,
      sourceHint: 'couple',
      variableClassification: 'dynamic_candidate',
    } as TemplateSlot)
  }

  return extra.length > 0 ? [...input.slots, ...extra] : input.slots
}

/** Resolved participle for dual-partner contracts. */
export function resolveCouplePartyParticiple(input: {
  bothPartnersRepresented: boolean
  sourceParticiple?: string | null
}): string | null {
  if (!input.bothPartnersRepresented) return null
  const src = input.sourceParticiple?.trim()
  if (src && /^zwani\s+dalej$/iu.test(src)) return src
  return 'zwani dalej'
}
