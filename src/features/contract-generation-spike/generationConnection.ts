/** In-memory browser handle for the currently mounted generation flow only. */
export type GenerationConnection = {
  requestId: string
  sessionId?: string
  saveToken?: string
}

export type GenerationUiRunState = 'active' | 'ready' | 'terminal'
export type GenerationUiRun = GenerationConnection & { state: GenerationUiRunState }
export type GenerationUiResult = 'awaiting_input' | 'processing' | 'ready' | 'failed' | 'discarded'

/** Accepts only current-run results and makes ready/failure monotonic for that run. */
export function advanceGenerationUiRun(
  current: GenerationUiRun | null,
  connection: GenerationConnection,
  result: GenerationUiResult,
  sessionId?: string,
): GenerationUiRun | null {
  if (!current || current.requestId !== connection.requestId || current.state !== 'active') return null
  if (current.sessionId && sessionId && current.sessionId !== sessionId) return null
  if (current.sessionId && connection.sessionId && current.sessionId !== connection.sessionId) return null
  const nextState = result === 'ready' ? 'ready'
    : result === 'failed' || result === 'discarded' ? 'terminal'
      : 'active'
  return {
    ...current,
    ...(sessionId ? { sessionId } : {}),
    state: nextState,
  }
}
