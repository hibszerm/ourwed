import { supabase } from '@/lib/supabase'
import type { Couple, Wedding } from '@/types/wedding'
import type { WeddingCorrespondenceEntry } from '@/features/weddings/correspondence/weddingCorrespondence'
import { validateWeddingCorrespondenceEntries } from '@/features/weddings/correspondence/weddingCorrespondence'

export interface WeddingContactsAggregate {
  wedding_id: string
  contacts_revision: string
  bride: { first_name: string | null; last_name: string | null; phone: string | null; email: string | null }
  groom: { first_name: string | null; last_name: string | null; phone: string | null; email: string | null }
  contract_address: string | null
  correspondence: WeddingCorrespondenceEntry[]
}

export interface CollaborativeContactsProjection extends WeddingContactsAggregate {
  access_version: string
  contacts_level: 1 | 2
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REVISION = /^[1-9][0-9]*$/
const ACCESS_VERSION = /^(owner|[1-9][0-9]*)$/
const CHANNELS = new Set(['email', 'instagram', 'facebook'])

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value)
}

function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function parseBase(value: unknown): WeddingContactsAggregate {
  if (!record(value) || !exactKeys(value, [
    'wedding_id', 'contacts_revision', 'bride', 'groom', 'contract_address', 'correspondence',
  ])) throw new Error('INVALID_CONTACTS_PROJECTION')
  if (typeof value.wedding_id !== 'string' || !UUID.test(value.wedding_id)
    || typeof value.contacts_revision !== 'string' || !REVISION.test(value.contacts_revision)
    || !record(value.bride) || !exactKeys(value.bride, ['first_name', 'last_name', 'phone', 'email'])
    || !record(value.groom) || !exactKeys(value.groom, ['first_name', 'last_name', 'phone', 'email'])
    || !nullableText(value.contract_address) || !Array.isArray(value.correspondence)) {
    throw new Error('INVALID_CONTACTS_PROJECTION')
  }
  for (const person of [value.bride, value.groom]) {
    if (Object.values(person).some((field) => !nullableText(field))) throw new Error('INVALID_CONTACTS_PROJECTION')
  }
  const correspondence: WeddingCorrespondenceEntry[] = []
  for (const item of value.correspondence) {
    if (!record(item) || !exactKeys(item, ['id', 'channel', 'value'])
      || typeof item.id !== 'string' || !UUID.test(item.id)
      || typeof item.channel !== 'string' || !CHANNELS.has(item.channel)
      || typeof item.value !== 'string') throw new Error('INVALID_CONTACTS_PROJECTION')
    correspondence.push({ id: item.id, channel: item.channel as WeddingCorrespondenceEntry['channel'], value: item.value })
  }
  return {
    wedding_id: value.wedding_id,
    contacts_revision: value.contacts_revision,
    bride: value.bride as WeddingContactsAggregate['bride'],
    groom: value.groom as WeddingContactsAggregate['groom'],
    contract_address: value.contract_address,
    correspondence,
  }
}

export function parseCollaborativeContactsProjection(value: unknown): CollaborativeContactsProjection {
  if (!record(value) || !exactKeys(value, [
    'wedding_id', 'access_version', 'contacts_level', 'contacts_revision', 'bride', 'groom', 'contract_address', 'correspondence',
  ]) || typeof value.access_version !== 'string' || !ACCESS_VERSION.test(value.access_version)
    || (value.contacts_level !== 1 && value.contacts_level !== 2)) throw new Error('INVALID_CONTACTS_PROJECTION')
  return { ...parseBase({
    wedding_id: value.wedding_id,
    contacts_revision: value.contacts_revision,
    bride: value.bride,
    groom: value.groom,
    contract_address: value.contract_address,
    correspondence: value.correspondence,
  }), access_version: value.access_version, contacts_level: value.contacts_level }
}

export function contactsToCouple(contacts: WeddingContactsAggregate): Couple {
  const brideFirst = contacts.bride.first_name ?? ''
  const brideLast = contacts.bride.last_name ?? ''
  const groomFirst = contacts.groom.first_name ?? ''
  const groomLast = contacts.groom.last_name ?? ''
  const phone = contacts.bride.phone ?? ''
  const email = contacts.bride.email ?? ''
  return {
    partner1: [brideFirst, brideLast].filter(Boolean).join(' '),
    partner2: [groomFirst, groomLast].filter(Boolean).join(' '),
    partner1FirstName: brideFirst || undefined,
    partner1LastName: brideLast || undefined,
    partner2FirstName: groomFirst || undefined,
    partner2LastName: groomLast || undefined,
    partner1Phone: phone || undefined,
    partner1Email: email || undefined,
    partner2Phone: contacts.groom.phone ?? undefined,
    partner2Email: contacts.groom.email ?? undefined,
    phone, email, venue: '', city: '',
  }
}

export function contactsToWeddingPatch(contacts: WeddingContactsAggregate): Partial<Wedding> {
  const couple = contactsToCouple(contacts)
  return {
    couple,
    contractAddress: contacts.contract_address ?? undefined,
    correspondence: contacts.correspondence,
  }
}

export function contactsPayload(contacts: WeddingContactsAggregate) {
  const correspondence = validateWeddingCorrespondenceEntries(contacts.correspondence)
  if (!correspondence.ok) throw new Error(correspondence.error)
  return {
    bride: contacts.bride,
    groom: contacts.groom,
    contract_address: contacts.contract_address,
    correspondence: correspondence.normalized,
  }
}

export const collaborativeContactsService = {
  async getOwner(weddingId: string): Promise<WeddingContactsAggregate> {
    const { data, error } = await supabase.rpc('get_my_wedding_contacts_v3', { p_wedding_id: weddingId })
    if (error) throw error
    return parseBase(data)
  },
  async get(weddingId: string): Promise<CollaborativeContactsProjection> {
    const { data, error } = await supabase.rpc('get_my_collaborative_contacts_v3', { p_wedding_id: weddingId })
    if (error) throw error
    return parseCollaborativeContactsProjection(data)
  },
  async saveShared(input: { weddingId: string; accessVersion: string; contacts: WeddingContactsAggregate }) {
    const { data, error } = await supabase.rpc('update_my_collaborative_contacts_v3', {
      p_wedding_id: input.weddingId,
      p_expected_access_version: input.accessVersion,
      p_expected_contacts_revision: input.contacts.contacts_revision,
      p_contacts: contactsPayload(input.contacts),
    })
    if (error) throw error
    if (!record(data) || data.status !== 'ok' || typeof data.contacts_revision !== 'string' || !REVISION.test(data.contacts_revision)) {
      throw new Error('INVALID_CONTACTS_RESPONSE')
    }
    return data.contacts_revision
  },
  async saveOwner(contacts: WeddingContactsAggregate) {
    const { data, error } = await supabase.rpc('update_my_wedding_contacts_v3', {
      p_wedding_id: contacts.wedding_id,
      p_expected_contacts_revision: contacts.contacts_revision,
      p_contacts: contactsPayload(contacts),
    })
    if (error) throw error
    if (!record(data) || data.status !== 'ok' || typeof data.contacts_revision !== 'string' || !REVISION.test(data.contacts_revision)) {
      throw new Error('INVALID_CONTACTS_RESPONSE')
    }
    return data.contacts_revision
  },
}
