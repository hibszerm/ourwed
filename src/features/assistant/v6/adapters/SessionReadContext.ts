/**
 * Session read context — canonical Session CRM reads for V7 Session resource.
 * Mirrors WeddingReadContext binding discipline (preserve service receivers).
 */

import { sessionService } from '@/lib/api/sessionService'
import { weddingService } from '@/lib/api/weddingService'
import type { Session } from '@/types/session'
import type { Wedding } from '@/types/wedding'

export type SessionReadContextOverrides = {
  loadSession?: (sessionId: string) => Promise<Session | null>
  loadLinkedWedding?: (weddingId: string) => Promise<Wedding | null>
  seeded?: Partial<{
    session: Session | null
    linkedWedding: Wedding | null
  }>
}

type CacheKey = keyof NonNullable<SessionReadContextOverrides['seeded']>

export class SessionReadContext {
  readonly sessionId: string
  private readonly overrides: SessionReadContextOverrides
  private readonly cache = new Map<CacheKey, Promise<unknown>>()

  constructor(sessionId: string, options: SessionReadContextOverrides = {}) {
    this.sessionId = sessionId
    this.overrides = options
  }

  private once<T>(key: CacheKey, load: () => Promise<T>): Promise<T> {
    const current = this.cache.get(key)
    if (current) return current as Promise<T>
    const seeded = this.overrides.seeded
    const promise =
      seeded && Object.prototype.hasOwnProperty.call(seeded, key)
        ? Promise.resolve(seeded[key] as T)
        : load()
    this.cache.set(key, promise)
    return promise
  }

  getSession(): Promise<Session | null> {
    return this.once('session', () =>
      this.overrides.loadSession
        ? this.overrides.loadSession(this.sessionId)
        : sessionService.getById(this.sessionId),
    )
  }

  async getLinkedWedding(): Promise<Wedding | null> {
    return this.once('linkedWedding', async () => {
      if (this.overrides.loadLinkedWedding) {
        const session = await this.getSession()
        const wid = session?.linkedWeddingId
        if (!wid) return null
        return this.overrides.loadLinkedWedding(wid)
      }
      const session = await this.getSession()
      const wid = session?.linkedWeddingId
      if (!wid) return null
      return weddingService.getById(wid)
    })
  }
}
