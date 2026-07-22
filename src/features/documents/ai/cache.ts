import type { AiDocumentAnalysisResult } from './types'

/**
 * Analysis cache — avoid duplicate Gemini calls for the same document text.
 * In-memory now; swap implementation for Supabase persistence later.
 */

export interface DocumentAnalysisCache {
  get(contentHash: string): Promise<AiDocumentAnalysisResult | null>
  set(contentHash: string, result: AiDocumentAnalysisResult): Promise<void>
  clear(): Promise<void>
}

const memory = new Map<string, AiDocumentAnalysisResult>()

export const memoryDocumentAnalysisCache: DocumentAnalysisCache = {
  async get(contentHash) {
    const hit = memory.get(contentHash)
    if (!hit) return null
    return { ...hit, fromCache: true }
  },
  async set(contentHash, result) {
    memory.set(contentHash, {
      ...result,
      contentHash,
      fromCache: false,
    })
  },
  async clear() {
    memory.clear()
  },
}

/** Active cache backend — replace with persistent store when ready. */
export const activeDocumentAnalysisCache: DocumentAnalysisCache =
  memoryDocumentAnalysisCache
