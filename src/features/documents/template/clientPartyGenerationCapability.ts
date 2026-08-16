/**
 * Template client-party generation capability.
 *
 * Separates:
 * - what wedding values are required (semantic capability)
 * - what physical replacement operations exist (canonical bindings)
 *
 * One composite physical span may require two wedding persons.
 */

import {
  isClientPartyIdentityKey,
  isClientPartyAddressKey,
  isClientPartyPhoneKey,
} from './clientPartyReadiness'
import { isSlotPhysicallyBound, type TemplateSlot } from './types'
import { devInfoArgs } from '@/lib/debug/devConsole'

export type ClientPartyPhysicalMode =
  | 'composite'
  | 'separate_persons'
  | 'single_person'
  | 'none'

export type ClientPartyGenerationCapability = {
  physicalMode: ClientPartyPhysicalMode
  /** How many wedding person full names this template needs as input. */
  expectedPersonCount: 0 | 1 | 2
  compositeBindingKey?: 'couple_full_names'
  person1BindingKey?: string
  person2BindingKey?: string
  semanticAliases: string[]
  /** Separator used when composing a shared/composite display value. */
  separator: string
  physicalIdentityBindingCount: number
}

const PARTNER1_KEYS = [
  'bride_full_name',
  'partner1_full_name',
  'client_full_name',
  'client_name',
] as const

const PARTNER2_KEYS = ['groom_full_name', 'partner2_full_name'] as const

function boundIdentitySlots(slots: TemplateSlot[]): TemplateSlot[] {
  return slots.filter((s) => {
    if (s.enabled === false || !isSlotPhysicallyBound(s) || !s.registryKey) {
      return false
    }
    if (isClientPartyIdentityKey(s.registryKey)) return true
    // Legacy review aliases treated as identity for generation capability.
    return (
      s.registryKey === 'client_name' ||
      s.registryKey === 'bride_first_name' ||
      s.registryKey === 'groom_first_name'
    )
  })
}

function inferSeparator(slot: TemplateSlot | undefined): string {
  if (slot?.separator && slot.separator.trim()) return slot.separator
  const original = slot?.originalText ?? ''
  if (/\soraz\s/i.test(original)) return ' oraz '
  if (/\s&\s/.test(original)) return ' & '
  if (/\s\/\s/.test(original)) return ' / '
  if (/,\s[^,]+\s/.test(original) && !/\si\s/i.test(original)) return ', '
  return ' i '
}

/**
 * Derive generation capability from persisted canonical physical bindings.
 */
export function deriveClientPartyGenerationCapability(
  slots: TemplateSlot[],
): ClientPartyGenerationCapability {
  const identity = boundIdentitySlots(slots)
  const keys = new Set(
    identity.map((s) => s.registryKey!).filter(Boolean),
  )
  const aliases = [
    ...new Set(identity.flatMap((s) => s.aliases ?? [])),
  ]

  const composite = identity.find((s) => s.registryKey === 'couple_full_names')
  const hasComposite = Boolean(composite)
  const person1Key =
    PARTNER1_KEYS.find((k) => keys.has(k)) ??
    (keys.has('client_name') ? 'client_name' : undefined)
  const person2Key = PARTNER2_KEYS.find((k) => keys.has(k))

  if (hasComposite && !person1Key && !person2Key) {
    return {
      physicalMode: 'composite',
      expectedPersonCount: 2,
      compositeBindingKey: 'couple_full_names',
      semanticAliases: aliases,
      separator: inferSeparator(composite),
      physicalIdentityBindingCount: identity.length,
    }
  }

  if (person1Key && person2Key) {
    return {
      physicalMode: 'separate_persons',
      expectedPersonCount: 2,
      person1BindingKey: person1Key,
      person2BindingKey: person2Key,
      compositeBindingKey: hasComposite ? 'couple_full_names' : undefined,
      semanticAliases: aliases,
      separator: inferSeparator(composite),
      physicalIdentityBindingCount: identity.length,
    }
  }

  if (person1Key || person2Key) {
    return {
      physicalMode: 'single_person',
      expectedPersonCount: 1,
      person1BindingKey: person1Key,
      person2BindingKey: person2Key,
      semanticAliases: aliases,
      separator: inferSeparator(composite),
      physicalIdentityBindingCount: identity.length,
    }
  }

  if (hasComposite) {
    // Composite plus stray individual — still composite-owned.
    return {
      physicalMode: 'composite',
      expectedPersonCount: 2,
      compositeBindingKey: 'couple_full_names',
      person1BindingKey: person1Key,
      person2BindingKey: person2Key,
      semanticAliases: aliases,
      separator: inferSeparator(composite),
      physicalIdentityBindingCount: identity.length,
    }
  }

  return {
    physicalMode: 'none',
    expectedPersonCount: 0,
    semanticAliases: aliases,
    separator: ' i ',
    physicalIdentityBindingCount: 0,
  }
}

export type ClientPartyWeddingNames = {
  person1FullName: string
  person2FullName: string
}

export type ClientPartyGenerationPreflight =
  | { ready: true; missing: []; failureCode: null; composedCoupleValue: string | null }
  | {
      ready: false
      missing: string[]
      failureCode:
        | 'missing_wedding_person_2'
        | 'missing_wedding_person_1'
        | 'missing_template_identity'
        | 'internal_inconsistency'
      message: string
      composedCoupleValue: string | null
    }

export function composeCoupleFullNamesValue(input: {
  person1FullName: string
  person2FullName: string
  separator: string
}): string | null {
  const p1 = input.person1FullName.trim()
  const p2 = input.person2FullName.trim()
  if (p1 && p2) return `${p1}${input.separator}${p2}`
  if (p1) return p1
  if (p2) return p2
  return null
}

/**
 * Validate wedding values against template capability — never against raw
 * physical partner-slot counts alone.
 */
export function preflightClientPartyGeneration(input: {
  capability: ClientPartyGenerationCapability
  wedding: ClientPartyWeddingNames
}): ClientPartyGenerationPreflight {
  const p1 = input.wedding.person1FullName.trim()
  const p2 = input.wedding.person2FullName.trim()
  const composed = composeCoupleFullNamesValue({
    person1FullName: p1,
    person2FullName: p2,
    separator: input.capability.separator,
  })

  if (input.capability.physicalMode === 'none') {
    return {
      ready: false,
      missing: ['client_party_identity'],
      failureCode: 'missing_template_identity',
      message:
        'Szablon umowy nie zawiera prawidłowo rozpoznanego pola danych klientów.',
      composedCoupleValue: null,
    }
  }

  if (input.capability.expectedPersonCount >= 1 && !p1) {
    return {
      ready: false,
      missing: ['person1'],
      failureCode: 'missing_wedding_person_1',
      message:
        'W danych ślubu brakuje pierwszej osoby wymaganej przez ten wzór umowy.',
      composedCoupleValue: composed,
    }
  }

  if (input.capability.expectedPersonCount === 2 && !p2) {
    return {
      ready: false,
      missing: ['person2'],
      failureCode: 'missing_wedding_person_2',
      message:
        'W danych ślubu brakuje drugiej osoby wymaganej przez ten wzór umowy.',
      composedCoupleValue: composed,
    }
  }

  if (
    input.capability.physicalMode === 'composite' &&
    input.capability.expectedPersonCount === 2 &&
    p1 &&
    p2 &&
    !composed
  ) {
    return {
      ready: false,
      missing: ['couple_full_names'],
      failureCode: 'internal_inconsistency',
      message:
        'Nie udało się przygotować danych klientów do wygenerowania umowy.',
      composedCoupleValue: null,
    }
  }

  return {
    ready: true,
    missing: [],
    failureCode: null,
    composedCoupleValue: composed,
  }
}

/** Paragraphs that may contain client-party identity text after generation. */
export function selectClientPartyAuditParagraphs(input: {
  paragraphs: Array<{ index?: number; text: string }>
  slots: TemplateSlot[]
}): Array<{ index?: number; text: string }> {
  const identityParas = new Set<number>()
  for (const slot of boundIdentitySlots(input.slots)) {
    if (slot.paragraphIndex != null) identityParas.add(slot.paragraphIndex)
  }
  for (const slot of input.slots) {
    if (!slot.registryKey || !isSlotPhysicallyBound(slot)) continue
    if (
      isClientPartyAddressKey(slot.registryKey) ||
      isClientPartyPhoneKey(slot.registryKey)
    ) {
      if (slot.paragraphIndex != null) identityParas.add(slot.paragraphIndex)
    }
  }

  const CLIENT_CUE =
    /Parą\s+Młod|Parą\s+Mlod|zwan\w*\s+dalej|Panna\s+Młod|Pan\s+Młod|Zamawiając|Klientami|Klientem|Klientką|Klientów|Klientami/iu
  const PROVIDER_ONLY =
    /\b(Fotografem|Kamerzyst[aą]|Filmowcem|Wykonawc[aą])\b/iu

  const selected = input.paragraphs.filter((p) => {
    const idx = p.index
    if (idx != null && identityParas.has(idx)) return true
    if (!CLIENT_CUE.test(p.text)) return false
    // Drop pure provider closing formulae when identity paragraphs exist.
    if (identityParas.size > 0 && PROVIDER_ONLY.test(p.text)) {
      if (!/Klient|Parą\s+Młod|Zamawiając|Panna\s+Młod|Pan\s+Młod/i.test(p.text)) {
        return false
      }
    }
    return true
  })

  if (selected.length > 0) return selected
  // Fallback: whole document — never audit provider-only slice alone.
  return input.paragraphs
}

export function logPackageContractGenerationClientPartyTrace(input: {
  weddingId?: string | null
  wedding: ClientPartyWeddingNames
  templateId?: string | null
  templateVersionId?: string | null
  slots: TemplateSlot[]
  capability: ClientPartyGenerationCapability
  resolved: Record<string, string>
  preflight: ClientPartyGenerationPreflight
}): void {
  const physicalBindingKeys = input.slots
    .filter((s) => s.registryKey && isSlotPhysicallyBound(s))
    .map((s) => s.registryKey!)
  devInfoArgs('[package-contract-generation-client-party-trace]', {
    wedding: {
      id: input.weddingId ?? null,
      person1: {
        fullName: input.wedding.person1FullName,
        present: Boolean(input.wedding.person1FullName.trim()),
      },
      person2: {
        fullName: input.wedding.person2FullName,
        present: Boolean(input.wedding.person2FullName.trim()),
      },
    },
    template: {
      id: input.templateId ?? null,
      versionId: input.templateVersionId ?? null,
      physicalBindingKeys,
      semanticAliases: input.capability.semanticAliases,
    },
    clientPartyCapability: {
      physicalMode: input.capability.physicalMode,
      hasCompositeIdentity: Boolean(input.capability.compositeBindingKey),
      hasPerson1Identity: Boolean(input.capability.person1BindingKey),
      hasPerson2Identity: Boolean(input.capability.person2BindingKey),
      recognizedPersonCount: input.capability.physicalIdentityBindingCount,
      expectedPersonCount: input.capability.expectedPersonCount,
    },
    resolvedValues: {
      couple_full_names: input.resolved.couple_full_names ?? null,
      partner1_full_name: input.resolved.partner1_full_name ?? null,
      partner2_full_name: input.resolved.partner2_full_name ?? null,
    },
    preflight: {
      ready: input.preflight.ready,
      missing: input.preflight.missing,
      failureCode: input.preflight.failureCode,
    },
  })
}
