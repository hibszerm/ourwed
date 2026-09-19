declare module 'thinking-orbs' {
  import type { ReactNode } from 'react'

  export type OrbState = string

  export function ThinkingOrb(props: Record<string, unknown>): ReactNode

  const ThinkingOrbs: Record<string, unknown>
  export default ThinkingOrbs
}
