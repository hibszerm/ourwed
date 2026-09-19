/**
 * Phase 2G.3 — Thinking Orbs presentation variants.
 *
 * libraries.dev/orbs demo source evidence (assets/orbs-*.js):
 *   w = [
 *     { state: "solving",   label: "Solving…." },
 *     { state: "composing", label: "Thinking…." },
 *   ]
 * Top-right hero pill labelled "Thinking…." → state="composing".
 *
 * NOT searching. NOT breathing (different aria-label "Thinking…" but ring geometry).
 *
 * Package: thinking-orbs@0.3.1 (latest stable; no upgrade — no larger native size).
 * OrbSize: 64 | 20 only. Canvas = size × min(2, devicePixelRatio).
 */

import { ThinkingOrb } from 'thinking-orbs'
import styles from './Assistant.module.css'

/** Demo label "Thinking…." → API state (libraries.dev/orbs hero row). */
export const ASSISTANT_HERO_ORB_STATE = 'composing' as const

/** Same Thinking-demo geometry at inline scale for processing continuity. */
export const ASSISTANT_PROCESSING_ORB_STATE = 'composing' as const

export const ASSISTANT_DEMO_THINKING_LABEL = 'Thinking….' as const

export type AssistantThinkingOrbVariant = 'processing' | 'hero'

export function AssistantThinkingOrb({
  variant,
  'aria-label': ariaLabel,
}: {
  variant: AssistantThinkingOrbVariant
  'aria-label'?: string
}) {
  if (variant === 'hero') {
    return (
      <span
        className={styles.thinkingOrbHero}
        data-testid="assistant-thinking-orb"
        data-variant="hero"
        data-phase="2g3"
        data-orb-size="64"
        data-orb-state={ASSISTANT_HERO_ORB_STATE}
        data-demo-label={ASSISTANT_DEMO_THINKING_LABEL}
        aria-hidden={ariaLabel ? undefined : true}
      >
        <ThinkingOrb
          state={ASSISTANT_HERO_ORB_STATE}
          size={64}
          theme="light"
          speed={1}
          paused={false}
          aria-label={ariaLabel}
        />
      </span>
    )
  }

  return (
    <span
      className={styles.thinkingOrbProcessing}
      data-testid="assistant-thinking-orb"
      data-variant="processing"
      data-orb-size="20"
      data-orb-state={ASSISTANT_PROCESSING_ORB_STATE}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <ThinkingOrb
        state={ASSISTANT_PROCESSING_ORB_STATE}
        size={20}
        theme="light"
        speed={1}
        paused={false}
        aria-label={ariaLabel}
      />
    </span>
  )
}
