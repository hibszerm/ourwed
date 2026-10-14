export type CollaborativeReadErrorKind = 'UNAVAILABLE' | 'FORBIDDEN' | 'TRANSIENT' | 'UNKNOWN'

export class CollaborativeReadError extends Error {
  readonly kind: CollaborativeReadErrorKind

  constructor(kind: CollaborativeReadErrorKind) {
    super(kind)
    this.name = 'CollaborativeReadError'
    this.kind = kind
  }
}

function errorFields(error: unknown): { code?: string; message?: string; status?: number } | null {
  if (!error || typeof error !== 'object') return null
  const value = error as Record<string, unknown>
  return {
    ...(typeof value.code === 'string' ? { code: value.code } : {}),
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
    ...(typeof value.status === 'number' ? { status: value.status } : {}),
  }
}

/**
 * Only the edit-state RPC's exact domain error is authoritative. The curated
 * detail RPC signals unavailable access with a successful null result instead.
 */
export function collaborativeReadError(error: unknown, allowUnavailableSignal = false): CollaborativeReadError {
  const fields = errorFields(error)
  if (allowUnavailableSignal && fields?.code === 'P0001' && fields.message === 'UNAVAILABLE') {
    return new CollaborativeReadError('UNAVAILABLE')
  }
  if (allowUnavailableSignal && fields?.code === 'P0001' && fields.message === 'FORBIDDEN') {
    return new CollaborativeReadError('FORBIDDEN')
  }
  if (!fields || fields.status === undefined || fields.status >= 500) {
    return new CollaborativeReadError('TRANSIENT')
  }
  return new CollaborativeReadError('UNKNOWN')
}
