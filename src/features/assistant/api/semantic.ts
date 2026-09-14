/**
 * Helpers for AssistantSemanticRequest continuation.
 */

import type {
  AssistantSemanticRequest,
  WeddingResolver,
} from '../types'

export type { AssistantSemanticRequest, WeddingResolver, PlaceRoleFilter, SessionResolver } from '../types'

/** Attach a selected wedding to a pending semantic request (choice continuation). */
export function withResolvedWedding(
  request: AssistantSemanticRequest,
  weddingId: string,
): AssistantSemanticRequest {
  switch (request.kind) {
    case 'wedding_finances':
    case 'wedding_places':
    case 'wedding_day_plan':
    case 'wedding_tasks':
    case 'wedding_next_action':
    case 'open_wedding':
    case 'open_resource':
      return {
        ...request,
        resolver: {
          personQuery: request.resolver.personQuery,
          dateHint: request.resolver.dateHint,
          weddingId,
        },
      } as AssistantSemanticRequest
    case 'prepare_create_task':
      return { ...request, weddingId }
    default:
      return request
  }
}

export function getWeddingResolver(
  request: AssistantSemanticRequest,
): WeddingResolver | null {
  switch (request.kind) {
    case 'wedding_finances':
    case 'wedding_places':
    case 'wedding_day_plan':
    case 'wedding_tasks':
    case 'wedding_next_action':
    case 'open_wedding':
    case 'open_resource':
      return request.resolver
    case 'prepare_create_task':
      return {
        personQuery: request.weddingQuery,
        dateHint: null,
        weddingId: request.weddingId,
      }
    default:
      return null
  }
}
