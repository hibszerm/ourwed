/**
 * Phase 2E/2F/2G.1 — restrained processing indicator for "Sprawdzam…".
 * Uses thinking-orbs (libraries.dev) at native OrbSize 20 — never the hero 64.
 * Library freezes animation under prefers-reduced-motion.
 */

import { ASSISTANT_LOADING } from '../copy'
import { AssistantThinkingOrb } from './AssistantThinkingOrb'
import styles from './Assistant.module.css'

export function AssistantProcessingIndicator() {
  return (
    <div
      className={styles.loading}
      role="status"
      data-testid="assistant-processing"
      data-phase="2f"
    >
      <span className={styles.loadingOrb} aria-hidden>
        <AssistantThinkingOrb variant="processing" aria-label={ASSISTANT_LOADING} />
      </span>
      <span>{ASSISTANT_LOADING}</span>
    </div>
  )
}
