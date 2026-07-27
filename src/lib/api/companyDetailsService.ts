/**
 * Company Details service — single persistence API for company identity.
 * All modules must read company data through this service (or VariableResolver).
 * Never duplicate company fields in other tables.
 */

import { resolveStudioUserId } from '@/lib/api/studioUser'
import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError } from '@/lib/supabase/helpers'
import { normalizeContractQuestionnaireConfig } from '@/lib/forms/contractQuestionnaireSnapshot'
import type {
  CompanyDetails,
  UpsertCompanyDetailsInput,
} from '@/types/company'
import type { ContractQuestionnaireConfig } from '@/types/contractQuestionnaire'

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
  signature_updated_at?: string | null
  questionnaire_config?: unknown
  created_at: string
  updated_at: string
}

function mapRow(row: CompanyDetailsRow): CompanyDetails {
  const rawConfig = row.questionnaire_config
  const hasConfig =
    rawConfig != null &&
    typeof rawConfig === 'object' &&
    !Array.isArray(rawConfig) &&
    Object.keys(rawConfig as object).length > 0

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
    signatureUpdatedAt: row.signature_updated_at ?? null,
    questionnaireConfig: hasConfig
      ? normalizeContractQuestionnaireConfig(rawConfig)
      : null,
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
    const payload: Record<string, unknown> = {
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

    if (input.questionnaireConfig !== undefined) {
      payload.questionnaire_config =
        input.questionnaireConfig === null
          ? {}
          : (input.questionnaireConfig as ContractQuestionnaireConfig)
    }

    const { data: existing, error: existingError } = await supabase
      .from('studio_details')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    throwOnError(existingError)

    if (existing?.id) {
      const patch = { ...payload }
      delete patch.user_id
      if (input.logoPath === undefined) {
        delete patch.logo_path
      }
      if (input.signaturePath === undefined) {
        delete patch.signature_path
      }
      if (input.stampPath === undefined) {
        delete patch.stamp_path
      }
      if (input.questionnaireConfig === undefined) {
        delete patch.questionnaire_config
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
        questionnaire_config:
          input.questionnaireConfig === undefined ||
          input.questionnaireConfig === null
            ? {}
            : input.questionnaireConfig,
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
    const ext =
      kind === 'signature'
        ? 'png'
        : file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${userId}/company/${kind}-${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('document-files')
      .upload(path, file, {
        upsert: false,
        contentType: file.type || 'image/png',
      })
    throwOnError(error)
    return path
  },

  /** Private preview / download — never use a permanent public URL. */
  async getSignedUrl(
    path: string | null | undefined,
    expiresInSeconds = 3600,
  ): Promise<string | null> {
    if (!path) return null
    const { data, error } = await supabase.storage
      .from('document-files')
      .createSignedUrl(path, expiresInSeconds)
    throwOnError(error)
    return data?.signedUrl ?? null
  },

  /**
   * @deprecated Bucket is private — prefer getSignedUrl.
   * Kept for callers that still expect a URL string shape.
   */
  async getPublicUrl(path: string | null | undefined): Promise<string | null> {
    return companyDetailsService.getSignedUrl(path)
  },

  async removeStorageObject(path: string | null | undefined): Promise<void> {
    if (!path) return
    const { error } = await supabase.storage
      .from('document-files')
      .remove([path])
    // Ignore missing objects so replace/delete stay idempotent
    if (error && !/not\s*found|404/i.test(error.message)) {
      throwOnError(error)
    }
  },

  /**
   * Independently save a signature PNG: upload first, then update DB,
   * then remove the previous object.
   */
  async saveSignature(file: File): Promise<CompanyDetails> {
    const current = await companyDetailsService.get()
    const previousPath = current?.signaturePath ?? null
    const path = await companyDetailsService.uploadAsset('signature', file)
    const userId = await resolveStudioUserId()
    const stamp = nowIso()

    if (current?.id) {
      const { data, error } = await supabase
        .from('studio_details')
        .update({
          signature_path: path,
          signature_updated_at: stamp,
          updated_at: stamp,
        })
        .eq('id', current.id)
        .select('*')
        .single()
      throwOnError(error)
      if (previousPath && previousPath !== path) {
        await companyDetailsService.removeStorageObject(previousPath)
      }
      return mapRow(data as CompanyDetailsRow)
    }

    const { data, error } = await supabase
      .from('studio_details')
      .insert({
        user_id: userId,
        signature_path: path,
        signature_updated_at: stamp,
        country: 'Polska',
        questionnaire_config: {},
        updated_at: stamp,
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapRow(data as CompanyDetailsRow)
  },

  async deleteSignature(): Promise<CompanyDetails | null> {
    const current = await companyDetailsService.get()
    if (!current) return null
    const previousPath = current.signaturePath
    const stamp = nowIso()
    const { data, error } = await supabase
      .from('studio_details')
      .update({
        signature_path: null,
        signature_updated_at: null,
        updated_at: stamp,
      })
      .eq('id', current.id)
      .select('*')
      .single()
    throwOnError(error)
    await companyDetailsService.removeStorageObject(previousPath)
    return mapRow(data as CompanyDetailsRow)
  },
}
