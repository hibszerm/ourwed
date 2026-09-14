/**
 * PAGE CONTEXT vs CONVERSATION CONTEXT
 *
 * PAGE CONTEXT — derived from current route/UI. Available on a brand-new
 * Assistant open. Not chat memory. Not persisted across close.
 *
 * CONVERSATION CONTEXT — WorkingContext + V4 shadow session created during
 * the open Assistant session. Destroyed on close.
 *
 * Precedence for V4 resolve (fresh or mid-session):
 *   explicit utterance resource
 *   > conversation activeResource
 *   > page resource (route)
 *   > discovery / clarification
 */

import type { PageContextHint } from '../../types'
import type { V4ShadowContext } from './types'

/**
 * Seed page route resource into shadow context ONLY when conversation has
 * no activeResource yet. Never overrides in-session conversational binding.
 * Never restores closed-session history.
 */
export function applyPageContextToV4ShadowContext(
  ctx: V4ShadowContext,
  pageContext: PageContextHint | null | undefined,
): V4ShadowContext {
  if (!pageContext?.resourceId?.trim()) return ctx
  if (ctx.activeResource) return ctx

  const kind = pageContext.resourceType
  if (kind !== 'wedding' && kind !== 'session') return ctx

  return {
    ...ctx,
    activeResource: {
      kind,
      id: pageContext.resourceId.trim(),
    },
  }
}
