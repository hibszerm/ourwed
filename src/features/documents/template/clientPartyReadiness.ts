/**
 * Role-neutral client-party model for package contracts.
 *
 * Canonical readiness: at least one safely replaceable client-party identity
 * binding exists. Gender, grammatical case, bride/groom role, person count,
 * and PESEL are not universal requirements.
 */

export type ClientPartyRole = 'bride' | 'groom' | 'partner' | 'unknown'

export type ClientPartyCapability =
  | 'client_party_identity'
  | 'client_party_address'
  | 'client_party_phone'
  | 'client_party_pesel'

export type ClientPartyPersonView = {
  ordinal: number
  role: ClientPartyRole
  fullNameKeys: string[]
  addressKeys: string[]
  phoneKeys: string[]
  peselKeys: string[]
  boundFullNameKeys: string[]
  boundAddressKeys: string[]
  boundPhoneKeys: string[]
  boundPeselKeys: string[]
}

export type ClientPartyReadinessResult = {
  ready: boolean
  recognizedPersonCount: number
  persons: ClientPartyPersonView[]
  missingRequiredCapabilities: ClientPartyCapability[]
  optionalMissingCapabilities: ClientPartyCapability[]
  /** Actionable diagnostics (capabilities and/or legacy keys). */
  missingRegistryKeys: string[]
  evidence: string[]
}

/** Legacy + current keys that represent a client-party full-name identity. */
export const CLIENT_PARTY_IDENTITY_KEYS = [
  'couple_full_names',
  'partner1_full_name',
  'partner2_full_name',
  'partner_one_full_name',
  'partner_two_full_name',
  'bride_full_name',
  'groom_full_name',
  'client_full_name',
  'customer_full_name',
  'contracting_party_full_name',
  'client_party_person_1_full_name',
  'client_party_person_2_full_name',
] as const

export const CLIENT_PARTY_ADDRESS_KEYS = [
  'bride_address',
  'groom_address',
  'partner1_address',
  'partner2_address',
  'client_address',
  'client_party_person_1_address',
  'client_party_person_2_address',
] as const

export const CLIENT_PARTY_PHONE_KEYS = [
  'bride_phone',
  'groom_phone',
  'partner1_phone',
  'partner2_phone',
  'client_phone',
  'client_party_person_1_phone',
  'client_party_person_2_phone',
] as const

export const CLIENT_PARTY_PESEL_KEYS = [
  'bride_pesel',
  'groom_pesel',
  'partner1_pesel',
  'partner2_pesel',
  'client_pesel',
  'client_party_person_1_pesel',
  'client_party_person_2_pesel',
] as const

const IDENTITY = new Set<string>(CLIENT_PARTY_IDENTITY_KEYS)
const ADDRESS = new Set<string>(CLIENT_PARTY_ADDRESS_KEYS)
const PHONE = new Set<string>(CLIENT_PARTY_PHONE_KEYS)
const PESEL = new Set<string>(CLIENT_PARTY_PESEL_KEYS)

export function isClientPartyIdentityKey(key: string | null | undefined): boolean {
  return Boolean(key && IDENTITY.has(key))
}

export function isClientPartyAddressKey(key: string | null | undefined): boolean {
  return Boolean(key && ADDRESS.has(key))
}

export function isClientPartyPhoneKey(key: string | null | undefined): boolean {
  return Boolean(key && PHONE.has(key))
}

export function isClientPartyPeselKey(key: string | null | undefined): boolean {
  return Boolean(key && PESEL.has(key))
}

export function roleForClientPartyKey(key: string): ClientPartyRole {
  if (key.startsWith('bride_')) return 'bride'
  if (key.startsWith('groom_')) return 'groom'
  if (
    key.includes('partner') ||
    key === 'couple_full_names' ||
    key.startsWith('client_party_person_')
  ) {
    return 'partner'
  }
  return 'unknown'
}

export function personOrdinalForClientPartyKey(key: string): number {
  if (
    key === 'partner2_full_name' ||
    key === 'partner_two_full_name' ||
    key === 'groom_full_name' ||
    key.includes('person_2') ||
    key.startsWith('groom_')
  ) {
    return 2
  }
  if (key === 'couple_full_names') return 1
  return 1
}

/**
 * Normalize any legacy/role-specific key into a capability bucket.
 * Does not invent new persisted keys — evaluation layer only.
 */
export function normalizeClientPartyKey(key: string): {
  capability: ClientPartyCapability | null
  role: ClientPartyRole
  ordinal: number
} {
  if (isClientPartyIdentityKey(key)) {
    return {
      capability: 'client_party_identity',
      role: roleForClientPartyKey(key),
      ordinal: personOrdinalForClientPartyKey(key),
    }
  }
  if (isClientPartyAddressKey(key)) {
    return {
      capability: 'client_party_address',
      role: roleForClientPartyKey(key),
      ordinal: personOrdinalForClientPartyKey(key.replace(/_address$/, '_full_name')),
    }
  }
  if (isClientPartyPhoneKey(key)) {
    return {
      capability: 'client_party_phone',
      role: roleForClientPartyKey(key),
      ordinal: personOrdinalForClientPartyKey(key.replace(/_phone$/, '_full_name')),
    }
  }
  if (isClientPartyPeselKey(key)) {
    return {
      capability: 'client_party_pesel',
      role: roleForClientPartyKey(key),
      ordinal: personOrdinalForClientPartyKey(key.replace(/_pesel$/, '_full_name')),
    }
  }
  return { capability: null, role: 'unknown', ordinal: 1 }
}

function emptyPerson(ordinal: number, role: ClientPartyRole): ClientPartyPersonView {
  return {
    ordinal,
    role,
    fullNameKeys: [],
    addressKeys: [],
    phoneKeys: [],
    peselKeys: [],
    boundFullNameKeys: [],
    boundAddressKeys: [],
    boundPhoneKeys: [],
    boundPeselKeys: [],
  }
}

/**
 * Authoritative client-party readiness.
 *
 * Minimum product requirement: ≥1 physical client-party full-name binding.
 * Address / phone / PESEL follow the template (optional unless present as
 * unbound expected slots — caller may pass templateExpectedKeys).
 */
export function evaluateClientPartyReadiness(input: {
  /** Physically bound registry keys (typically after allowlist). */
  boundRegistryKeys: readonly string[]
  /**
   * Optional: keys the template physically expects (bound or unbound).
   * Used only to report optionalMissingCapabilities — never forces person 2.
   */
  templateRegistryKeys?: readonly string[]
}): ClientPartyReadinessResult {
  const bound = [...new Set(input.boundRegistryKeys.filter(Boolean))]
  const templateKeys = [
    ...new Set((input.templateRegistryKeys ?? bound).filter(Boolean)),
  ]

  const personsByOrdinal = new Map<number, ClientPartyPersonView>()

  const ensure = (ordinal: number, role: ClientPartyRole) => {
    let p = personsByOrdinal.get(ordinal)
    if (!p) {
      p = emptyPerson(ordinal, role)
      personsByOrdinal.set(ordinal, p)
    } else if (p.role === 'unknown' && role !== 'unknown') {
      p.role = role
    } else if (
      p.role !== role &&
      role !== 'unknown' &&
      p.role !== 'partner' &&
      role === 'partner'
    ) {
      // keep more specific role
    } else if (p.role === 'bride' || p.role === 'groom') {
      // keep
    } else if (role !== 'unknown') {
      p.role = role
    }
    return p
  }

  for (const key of templateKeys) {
    const n = normalizeClientPartyKey(key)
    if (!n.capability) continue
    const person = ensure(n.ordinal, n.role)
    if (n.capability === 'client_party_identity') person.fullNameKeys.push(key)
    if (n.capability === 'client_party_address') person.addressKeys.push(key)
    if (n.capability === 'client_party_phone') person.phoneKeys.push(key)
    if (n.capability === 'client_party_pesel') person.peselKeys.push(key)
  }

  for (const key of bound) {
    const n = normalizeClientPartyKey(key)
    if (!n.capability) continue
    const person = ensure(n.ordinal, n.role)
    if (n.capability === 'client_party_identity') {
      if (!person.fullNameKeys.includes(key)) person.fullNameKeys.push(key)
      person.boundFullNameKeys.push(key)
    }
    if (n.capability === 'client_party_address') {
      if (!person.addressKeys.includes(key)) person.addressKeys.push(key)
      person.boundAddressKeys.push(key)
    }
    if (n.capability === 'client_party_phone') {
      if (!person.phoneKeys.includes(key)) person.phoneKeys.push(key)
      person.boundPhoneKeys.push(key)
    }
    if (n.capability === 'client_party_pesel') {
      if (!person.peselKeys.includes(key)) person.peselKeys.push(key)
      person.boundPeselKeys.push(key)
    }
  }

  // Couple composite covers two client identities in one physical span.
  if (bound.includes('couple_full_names')) {
    const p1 = ensure(1, 'partner')
    if (!p1.boundFullNameKeys.includes('couple_full_names')) {
      p1.boundFullNameKeys.push('couple_full_names')
    }
    const p2 = ensure(2, 'partner')
    if (!p2.boundFullNameKeys.includes('couple_full_names')) {
      p2.boundFullNameKeys.push('couple_full_names')
    }
  }

  const persons = [...personsByOrdinal.values()].sort(
    (a, b) => a.ordinal - b.ordinal,
  )

  let recognizedPersonCount = persons.filter(
    (p) => p.boundFullNameKeys.length > 0,
  ).length
  // Composite couple_full_names alone ⇒ two recognised persons.
  if (
    bound.includes('couple_full_names') &&
    !bound.some(
      (k) =>
        k !== 'couple_full_names' &&
        isClientPartyIdentityKey(k),
    )
  ) {
    recognizedPersonCount = Math.max(recognizedPersonCount, 2)
  }

  const hasIdentity = bound.some(isClientPartyIdentityKey)
  const missingRequiredCapabilities: ClientPartyCapability[] = []
  if (!hasIdentity) missingRequiredCapabilities.push('client_party_identity')

  const optionalMissingCapabilities: ClientPartyCapability[] = []
  // PESEL is never a required capability — only note when template had a
  // PESEL key that remained unbound.
  const templatePesel = templateKeys.filter(isClientPartyPeselKey)
  const boundPesel = bound.filter(isClientPartyPeselKey)
  if (templatePesel.length > 0 && boundPesel.length === 0) {
    optionalMissingCapabilities.push('client_party_pesel')
  }

  const missingRegistryKeys =
    missingRequiredCapabilities.length > 0
      ? ['client_party_identity']
      : []

  const evidence: string[] = [
    `recognizedPersonCount=${recognizedPersonCount}`,
    `boundIdentityKeys=${bound.filter(isClientPartyIdentityKey).join(',') || 'none'}`,
    `hasIdentity=${hasIdentity}`,
  ]

  return {
    ready: missingRequiredCapabilities.length === 0,
    recognizedPersonCount,
    persons,
    missingRequiredCapabilities,
    optionalMissingCapabilities,
    missingRegistryKeys,
    evidence,
  }
}

/** Product labels for missing client-party capabilities. */
export const CLIENT_PARTY_CAPABILITY_LABELS: Record<
  ClientPartyCapability,
  string
> = {
  client_party_identity: 'Dane osoby zawierającej umowę',
  client_party_address: 'Adresy zamieszkania',
  client_party_phone: 'Dane kontaktowe',
  client_party_pesel: 'PESEL',
}
