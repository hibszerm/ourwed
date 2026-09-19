/**
 * Dev-only Thinking Orbs state fixture for Phase 2G.2 art direction.
 * NOT shipped as product UI — written to tmp/ for visual selection.
 *
 * Run:
 *   npx vitest run src/features/assistant/assistantUxPresentation2g2Acceptance.test.ts
 */

import { ThinkingOrb, type OrbState } from 'thinking-orbs'

export const ORB_STATE_FIXTURE_STATES = [
  'working',
  'searching',
  'solving',
  'listening',
  'connecting',
  'weaving',
  'composing',
  'breathing',
  'shaping',
] as const satisfies readonly OrbState[]

export function OrbStateFixtureGrid() {
  return (
    <div
      data-testid="assistant-orb-state-fixture"
      data-dev-only="true"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 28,
        padding: 32,
        background: '#f7f3ec',
        color: '#2c2622',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {ORB_STATE_FIXTURE_STATES.map((state) => (
        <div
          key={state}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <ThinkingOrb state={state} size={64} theme="light" />
          <code style={{ fontSize: 12 }}>{state}</code>
        </div>
      ))}
    </div>
  )
}
