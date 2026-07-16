import { resolveStudioUserId } from '@/lib/api/studioUser'
import { supabase } from '@/lib/supabase'
import {
  nowIso,
  throwOnError,
  toOptionalDateString,
} from '@/lib/supabase/helpers'
import type { ContractStatus, WeddingContract } from '@/types/wedding'

interface ContractRow {
  id: string
  wedding_id: string
  status: string
  version: number
  generated_by: string | null
  generated_at: string | null
  signed_at: string | null
  file_url: string | null
  created_at: string
}

function isContractStatus(value: string): value is ContractStatus {
  return (
    value === 'none' ||
    value === 'generated' ||
    value === 'sent' ||
    value === 'signed'
  )
}

export function mapContractRowToModel(row: ContractRow): WeddingContract {
  const status = isContractStatus(row.status) ? row.status : 'none'
  return {
    status,
    generatedAt: toOptionalDateString(row.generated_at),
    signedAt: toOptionalDateString(row.signed_at),
  }
}

export interface CreateContractInput {
  weddingId: string
  status?: ContractStatus
  version?: number
  fileUrl?: string
}

export const contractService = {
  async getByWeddingId(weddingId: string): Promise<WeddingContract | null> {
    const map = await this.listByWeddingIds([weddingId])
    return map.get(weddingId) ?? null
  },

  async listByWeddingIds(
    weddingIds: string[],
  ): Promise<Map<string, WeddingContract | null>> {
    const map = new Map<string, WeddingContract | null>()
    for (const id of weddingIds) map.set(id, null)
    if (weddingIds.length === 0) return map

    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .in('wedding_id', weddingIds)

    throwOnError(error)

    for (const row of (data ?? []) as ContractRow[]) {
      map.set(row.wedding_id, mapContractRowToModel(row))
    }
    return map
  },

  async create(input: CreateContractInput): Promise<WeddingContract> {
    let generatedBy: string | null = null
    try {
      generatedBy = await resolveStudioUserId()
    } catch {
      generatedBy = null
    }

    const status = input.status ?? 'none'
    const now = nowIso()

    const { data, error } = await supabase
      .from('contracts')
      .insert({
        wedding_id: input.weddingId,
        status,
        version: input.version ?? 1,
        generated_by: status === 'none' ? null : generatedBy,
        generated_at: status === 'none' ? null : now,
        file_url: input.fileUrl ?? null,
      })
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się utworzyć umowy.')
    }

    return mapContractRowToModel(data as ContractRow)
  },

  async updateStatus(
    weddingId: string,
    status: ContractStatus,
  ): Promise<WeddingContract> {
    const existing = await this.getRowByWeddingId(weddingId)
    let generatedBy: string | null = existing?.generated_by ?? null
    if (status !== 'none' && !generatedBy) {
      try {
        generatedBy = await resolveStudioUserId()
      } catch {
        generatedBy = null
      }
    }

    const now = nowIso()
    const patch: Record<string, unknown> = {
      status,
      generated_by: generatedBy,
    }

    if (status === 'generated' || status === 'sent' || status === 'signed') {
      patch.generated_at = existing?.generated_at ?? now
    }
    if (status === 'signed') {
      patch.signed_at = now
    }
    if (status === 'none') {
      patch.generated_at = null
      patch.signed_at = null
      patch.generated_by = null
    }

    if (existing) {
      const { data, error } = await supabase
        .from('contracts')
        .update(patch)
        .eq('wedding_id', weddingId)
        .select('*')
        .single()

      throwOnError(error)
      if (!data) throw new Error('Nie udało się zaktualizować umowy.')
      return mapContractRowToModel(data as ContractRow)
    }

    return this.create({ weddingId, status })
  },

  async attachPdf(weddingId: string, fileUrl: string): Promise<WeddingContract> {
    const existing = await this.getRowByWeddingId(weddingId)
    if (!existing) {
      return this.create({ weddingId, status: 'generated', fileUrl })
    }

    const { data, error } = await supabase
      .from('contracts')
      .update({
        file_url: fileUrl,
        status: existing.status === 'none' ? 'generated' : existing.status,
        generated_at: existing.generated_at ?? nowIso(),
      })
      .eq('wedding_id', weddingId)
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się dołączyć pliku umowy.')
    }

    return mapContractRowToModel(data as ContractRow)
  },

  async getRowByWeddingId(weddingId: string): Promise<ContractRow | null> {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('wedding_id', weddingId)
      .maybeSingle()

    throwOnError(error)
    return (data as ContractRow | null) ?? null
  },
}
