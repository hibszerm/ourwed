export type GenerationConnection = {
  requestId: string
  sessionId?: string
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function generationConnectionKey(weddingId: string): string {
  return `contract-generation-session:${weddingId}`
}

export function readGenerationConnection(storage: KeyValueStorage, weddingId: string): GenerationConnection | null {
  try {
    const value = storage.getItem(generationConnectionKey(weddingId))
    if (!value) return null
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const connection = parsed as Record<string, unknown>
    if (typeof connection.requestId !== 'string' || !connection.requestId.trim()) return null
    if (connection.sessionId !== undefined && (typeof connection.sessionId !== 'string' || !connection.sessionId.trim())) return null
    if (Object.keys(connection).some((key) => key !== 'requestId' && key !== 'sessionId')) return null
    return {
      requestId: connection.requestId,
      ...(typeof connection.sessionId === 'string' ? { sessionId: connection.sessionId } : {}),
    }
  } catch {
    return null
  }
}

export function writeGenerationConnection(storage: KeyValueStorage, weddingId: string, connection: GenerationConnection): void {
  storage.setItem(generationConnectionKey(weddingId), JSON.stringify(connection))
}

export function clearGenerationConnection(storage: KeyValueStorage, weddingId: string): void {
  storage.removeItem(generationConnectionKey(weddingId))
}
