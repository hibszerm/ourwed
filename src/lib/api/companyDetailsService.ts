/**
 * Company Details service — single persistence API for company identity.
 * All modules must read company data through this service (or VariableResolver).
 * Never duplicate company fields in other tables.
 */

import { resolveStudioUserId } from '@/lib/api/studioUser'
import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError } from '@/lib/supabase/helpers'
import type {
  CompanyDetails,
  UpsertCompanyDetailsInput,
} from '@/types/company'

interface CompanyDetailsRow {
  id: string
  user_id: string
  company_name: string | null
  owner_name: string | null
  nip: string | null
  regon: string | null
  vat_id: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  country: string
  phone: string | null
  email: string | null
  website: string | null
  instagram: string | null
  facebook: string | null
  bank_account: string | null
  iban: string | null
  swift: string | null
  logo_path: string | null
  signature_path: string | null
  stamp_path: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: CompanyDetailsRow): CompanyDetails {
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    ownerName: row.owner_name,
    nip: row.nip,
    regon: row.regon,
    vatId: row.vat_id,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country || 'Polska',
    phone: row.phone,
    email: row.email,
    website: row.website,
    instagram: row.instagram,
    facebook: row.facebook,
    bankAccount: row.bank_account,
    iban: row.iban,
    swift: row.swift,
    logoPath: row.logo_path,
    signaturePath: row.signature_path,
    stampPath: row.stamp_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}

export function formatCompanyAddress(details: CompanyDetails): string {
  const line1 = details.address?.trim() || ''
  const line2 = [details.postalCode, details.city]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ')
  const line3 =
    details.country && details.country !== 'Polska' ? details.country : ''
  return [line1, line2, line3].filter(Boolean).join(', ')
}

export const companyDetailsService = {
  async get(): Promise<CompanyDetails | null> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('studio_details')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    throwOnError(error)
    return data ? mapRow(data as CompanyDetailsRow) : null
  },

  async upsert(input: UpsertCompanyDetailsInput): Promise<CompanyDetails> {
    const userId = await resolveStudioUserId()
    const payload = {
      user_id: userId,
      company_name: trimOrNull(input.companyName),
      owner_name: trimOrNull(input.ownerName),
      nip: trimOrNull(input.nip),
      regon: trimOrNull(input.regon),
      vat_id: trimOrNull(input.vatId),
      address: trimOrNull(input.address),
      postal_code: trimOrNull(input.postalCode),
      city: trimOrNull(input.city),
      country: trimOrNull(input.country) || 'Polska',
      phone: trimOrNull(input.phone),
      email: trimOrNull(input.email),
      website: trimOrNull(input.website),
      instagram: trimOrNull(input.instagram),
      facebook: trimOrNull(input.facebook),
      bank_account: trimOrNull(input.bankAccount),
      iban: trimOrNull(input.iban),
      swift: trimOrNull(input.swift),
      logo_path:
        input.logoPath === undefined ? undefined : trimOrNull(input.logoPath),
      signature_path:
        input.signaturePath === undefined
          ? undefined
          : trimOrNull(input.signaturePath),
      stamp_path:
        input.stampPath === undefined
          ? undefined
          : trimOrNull(input.stampPath),
      updated_at: nowIso(),
    }

    const { data: existing, error: existingError } = await supabase
      .from('studio_details')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    throwOnError(existingError)

    if (existing?.id) {
      const patch = { ...payload }
      delete (patch as { user_id?: string }).user_id
      if (input.logoPath === undefined) {
        delete (patch as { logo_path?: string }).logo_path
      }
      if (input.signaturePath === undefined) {
        delete (patch as { signature_path?: string }).signature_path
      }
      if (input.stampPath === undefined) {
        delete (patch as { stamp_path?: string }).stamp_path
      }
      const { data, error } = await supabase
        .from('studio_details')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single()
      throwOnError(error)
      return mapRow(data as CompanyDetailsRow)
    }

    const { data, error } = await supabase
      .from('studio_details')
      .insert({
        ...payload,
        logo_path: trimOrNull(input.logoPath),
        signature_path: trimOrNull(input.signaturePath),
        stamp_path: trimOrNull(input.stampPath),
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapRow(data as CompanyDetailsRow)
  },

  async uploadAsset(
    kind: 'logo' | 'signature' | 'stamp',
    file: File,
  ): Promise<string> {
    const userId = await resolveStudioUserId()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${userId}/company/${kind}-${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('document-files')
      .upload(path, file, { upsert: true, contentType: file.type })
    throwOnError(error)
    return path
  },

  async getPublicUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null
    const { data } = supabase.storage.from('document-files').getPublicUrl(path)
    return data.publicUrl || null
  },
}
