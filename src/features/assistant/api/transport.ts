/**
 * Explicit Assistant transport selection.
 * LOCAL (dev/localhost): deterministic orchestrator — never calls Edge.
 * EDGE (production): Edge Function only — never falls back to local heuristic.
 */

export type AssistantTransport = 'local' | 'edge'

/**
 * Resolve which transport the browser should use.
 * Optional Vite flag: VITE_ASSISTANT_TRANSPORT=local|edge (non-secret).
 */
export function resolveAssistantTransport(options?: {
  /** Test override */
  force?: AssistantTransport
}): AssistantTransport {
  if (options?.force) return options.force

  try {
    const flagged = String(
      import.meta.env?.VITE_ASSISTANT_TRANSPORT ?? '',
    )
      .trim()
      .toLowerCase()
    if (flagged === 'local' || flagged === 'edge') {
      return flagged
    }
  } catch {
    /* ignore */
  }

  try {
    if (import.meta.env?.DEV) return 'local'
    if (import.meta.env?.PROD) return 'edge'
  } catch {
    /* ignore */
  }

  // Safe default for non-Vite harnesses: do not hit remote Edge.
  return 'local'
}

export function isLocalAssistantTransport(
  transport: AssistantTransport = resolveAssistantTransport(),
): boolean {
  return transport === 'local'
}
