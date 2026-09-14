/**
 * Session-scoped opaque refs for Assistant V3.
 * Model never invents CRM UUIDs — only refs minted from tenant-owned results.
 */

export type AssistantRefKind =
  | 'wedding'
  | 'session'
  | 'place'
  | 'day_stage'
  | 'task'

export type AssistantOpaqueRef = {
  kind: AssistantRefKind
  /** Opaque token e.g. w1, place_2 — not a database id. */
  token: string
}

type RefEntry = {
  kind: AssistantRefKind
  token: string
  entityId: string
  meta?: Record<string, unknown>
}

export class AssistantRefStore {
  private byToken = new Map<string, RefEntry>()
  private counters: Record<AssistantRefKind, number> = {
    wedding: 0,
    session: 0,
    place: 0,
    day_stage: 0,
    task: 0,
  }

  mint(
    kind: AssistantRefKind,
    entityId: string,
    meta?: Record<string, unknown>,
  ): string {
    this.counters[kind] += 1
    const prefix =
      kind === 'wedding'
        ? 'w'
        : kind === 'session'
          ? 's'
          : kind === 'place'
            ? 'place'
            : kind === 'day_stage'
              ? 'stage'
              : 'task'
    const token = `${prefix}_${this.counters[kind]}`
    this.byToken.set(token, { kind, token, entityId, meta })
    return token
  }

  resolve(token: string): RefEntry | null {
    return this.byToken.get(token) ?? null
  }

  /** Bound snapshot for planner observations — no addresses/money. */
  observe(token: string): Record<string, unknown> | null {
    const e = this.byToken.get(token)
    if (!e) return null
    return {
      ref: e.token,
      kind: e.kind,
      displayLabel:
        typeof e.meta?.displayLabel === 'string' ? e.meta.displayLabel : null,
      date: typeof e.meta?.date === 'string' ? e.meta.date : null,
      role: typeof e.meta?.role === 'string' ? e.meta.role : null,
      participantKey:
        typeof e.meta?.participantKey === 'string'
          ? e.meta.participantKey
          : null,
    }
  }

  clear() {
    this.byToken.clear()
  }
}
