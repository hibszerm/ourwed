import { supabase } from '@/lib/supabase'
import { throwOnError, toDateString } from '@/lib/supabase/helpers'
import type { WeddingContact } from '@/types/wedding'

interface ContactRow {
  id: string
  wedding_id: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
  created_at: string
}

function mapRow(row: ContactRow): WeddingContact {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    name: row.name,
    role: row.role ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    createdAt: toDateString(row.created_at) || row.created_at,
  }
}

export interface CreateContactInput {
  weddingId: string
  name: string
  role?: string
  phone?: string
  email?: string
}

export interface UpdateContactInput {
  name?: string
  role?: string | null
  phone?: string | null
  email?: string | null
}

export const contactService = {
  async listByWeddingId(weddingId: string): Promise<WeddingContact[]> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('wedding_id', weddingId)
      .order('created_at', { ascending: true })

    throwOnError(error)
    return ((data ?? []) as ContactRow[]).map(mapRow)
  },

  async create(input: CreateContactInput): Promise<WeddingContact> {
    const name = input.name.trim()
    if (!name) throw new Error('Podaj imię i nazwisko kontaktu.')

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        wedding_id: input.weddingId,
        name,
        role: input.role?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
      })
      .select('*')
      .single()

    throwOnError(error)
    return mapRow(data as ContactRow)
  },

  async update(id: string, input: UpdateContactInput): Promise<WeddingContact> {
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) throw new Error('Podaj imię i nazwisko kontaktu.')
      patch.name = name
    }
    if (input.role !== undefined) patch.role = input.role?.trim() || null
    if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
    if (input.email !== undefined) patch.email = input.email?.trim() || null

    const { data, error } = await supabase
      .from('contacts')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    throwOnError(error)
    return mapRow(data as ContactRow)
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    throwOnError(error)
  },
}
