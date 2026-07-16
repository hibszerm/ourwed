import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'

export type GalleryStatus = 'not_ready' | 'processing' | 'ready' | 'expired'

export interface Gallery {
  id: string
  weddingId: string
  status: GalleryStatus
  galleryUrl?: string
  provider?: string
  providerGalleryId?: string
  expiresAt?: string
  createdAt: string
}

interface GalleryRow {
  id: string
  wedding_id: string
  status: string
  gallery_url: string | null
  provider: string | null
  provider_gallery_id: string | null
  expires_at: string | null
  created_at: string
}

function isGalleryStatus(value: string): value is GalleryStatus {
  return (
    value === 'not_ready' ||
    value === 'processing' ||
    value === 'ready' ||
    value === 'expired'
  )
}

export function mapGalleryRowToModel(row: GalleryRow): Gallery {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    status: isGalleryStatus(row.status) ? row.status : 'not_ready',
    galleryUrl: row.gallery_url ?? undefined,
    provider: row.provider ?? undefined,
    providerGalleryId: row.provider_gallery_id ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
  }
}

export interface CreateGalleryInput {
  weddingId: string
  status?: GalleryStatus
  galleryUrl?: string
  provider?: string
  providerGalleryId?: string
  expiresAt?: string
}

export interface UpdateGalleryInput {
  status?: GalleryStatus
  galleryUrl?: string | null
  provider?: string | null
  providerGalleryId?: string | null
  expiresAt?: string | null
}

export const galleryService = {
  async getByWeddingId(weddingId: string): Promise<Gallery | null> {
    const map = await this.listByWeddingIds([weddingId])
    return map.get(weddingId) ?? null
  },

  async listByWeddingIds(
    weddingIds: string[],
  ): Promise<Map<string, Gallery | null>> {
    const map = new Map<string, Gallery | null>()
    for (const id of weddingIds) map.set(id, null)
    if (weddingIds.length === 0) return map

    const { data, error } = await supabase
      .from('galleries')
      .select('*')
      .in('wedding_id', weddingIds)

    throwOnError(error)

    for (const row of (data ?? []) as GalleryRow[]) {
      map.set(row.wedding_id, mapGalleryRowToModel(row))
    }
    return map
  },

  async create(input: CreateGalleryInput): Promise<Gallery> {
    const { data, error } = await supabase
      .from('galleries')
      .insert({
        wedding_id: input.weddingId,
        status: input.status ?? 'not_ready',
        gallery_url: input.galleryUrl ?? null,
        provider: input.provider ?? null,
        provider_gallery_id: input.providerGalleryId ?? null,
        expires_at: input.expiresAt ?? null,
      })
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się utworzyć galerii.')
    }

    return mapGalleryRowToModel(data as GalleryRow)
  },

  async update(weddingId: string, input: UpdateGalleryInput): Promise<Gallery> {
    const existing = await this.getByWeddingId(weddingId)
    if (!existing) {
      return this.create({
        weddingId,
        status: input.status,
        galleryUrl: input.galleryUrl ?? undefined,
        provider: input.provider ?? undefined,
        providerGalleryId: input.providerGalleryId ?? undefined,
        expiresAt: input.expiresAt ?? undefined,
      })
    }

    const patch: Record<string, unknown> = {}
    if (input.status !== undefined) patch.status = input.status
    if (input.galleryUrl !== undefined) patch.gallery_url = input.galleryUrl
    if (input.provider !== undefined) patch.provider = input.provider
    if (input.providerGalleryId !== undefined) {
      patch.provider_gallery_id = input.providerGalleryId
    }
    if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt

    const { data, error } = await supabase
      .from('galleries')
      .update(patch)
      .eq('wedding_id', weddingId)
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zaktualizować galerii.')
    }

    return mapGalleryRowToModel(data as GalleryRow)
  },
}
