/**
 * V7 ephemeral ResourceSet store — session/tenant bound, destroyed on close.
 */

import type {
  V7ResourceSetRecord,
  V7ResourceType,
  V7SessionBinding,
} from './types'

function newHandle(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `rs_${rand}`
}

export class V7ResourceSetStore {
  private readonly byHandle = new Map<string, V7ResourceSetRecord>()
  private closed = false
  readonly binding: V7SessionBinding

  constructor(binding: V7SessionBinding) {
    this.binding = binding
  }

  get isClosed(): boolean {
    return this.closed
  }

  close(): void {
    this.byHandle.clear()
    this.closed = true
  }

  create(input: {
    resourceType: V7ResourceType
    memberIds: readonly string[]
    description: string
  }): V7ResourceSetRecord {
    if (this.closed) {
      throw new Error('V7_SESSION_CLOSED')
    }
    const handle = newHandle()
    const record: V7ResourceSetRecord = {
      handle,
      sessionId: this.binding.sessionId,
      tenantKey: this.binding.tenantKey,
      resourceType: input.resourceType,
      memberIds: Object.freeze([...input.memberIds]),
      count: input.memberIds.length,
      createdAt: Date.now(),
      description: input.description.slice(0, 160),
    }
    this.byHandle.set(handle, record)
    return record
  }

  get(
    handle: string,
    caller: V7SessionBinding,
  ):
    | { ok: true; record: V7ResourceSetRecord }
    | {
        ok: false
        code:
          | 'SESSION_CLOSED'
          | 'UNKNOWN_HANDLE'
          | 'CROSS_SESSION'
          | 'CROSS_TENANT'
      } {
    if (this.closed) return { ok: false, code: 'SESSION_CLOSED' }
    const record = this.byHandle.get(handle)
    if (!record) return { ok: false, code: 'UNKNOWN_HANDLE' }
    if (record.sessionId !== caller.sessionId) {
      return { ok: false, code: 'CROSS_SESSION' }
    }
    if (record.tenantKey !== caller.tenantKey) {
      return { ok: false, code: 'CROSS_TENANT' }
    }
    if (
      record.sessionId !== this.binding.sessionId ||
      record.tenantKey !== this.binding.tenantKey
    ) {
      return { ok: false, code: 'CROSS_SESSION' }
    }
    return { ok: true, record }
  }

  listHandles(): Array<{
    handle: string
    resourceType: V7ResourceType
    count: number
    description: string
  }> {
    if (this.closed) return []
    return [...this.byHandle.values()].map((r) => ({
      handle: r.handle,
      resourceType: r.resourceType,
      count: r.count,
      description: r.description,
    }))
  }
}
