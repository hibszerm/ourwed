/**
 * V7 ResourceSet — opaque exact membership handles.
 * Model sees handle + safe description only; never member UUIDs.
 */

export type V7ResourceType = 'wedding' | 'session'

export type V7ResourceSetRecord = {
  handle: string
  sessionId: string
  tenantKey: string
  resourceType: V7ResourceType
  /** Exact ordered CRM ids — never exposed to the model. */
  memberIds: readonly string[]
  count: number
  createdAt: number
  /** Short safe description for model context (no UUIDs). */
  description: string
}

export type V7SessionBinding = {
  sessionId: string
  tenantKey: string
}
