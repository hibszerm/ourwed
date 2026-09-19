/**
 * V6-VF1 — Static acceptance (no live API).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { VF1_CASES } from './vf1VerifierRegression'
import {
  V6_SEMANTIC_VERIFIER_SYSTEM_PROMPT,
  V6_SEMANTIC_VERIFIER_MODEL,
  V6_SEMANTIC_VERIFIER_REASONING,
} from '../../verification/semanticVerifier'

describe('V6-VF1 verifier guidance', () => {
  it('keeps gpt-5 / low', () => {
    expect(V6_SEMANTIC_VERIFIER_MODEL).toBe('gpt-5')
    expect(V6_SEMANTIC_VERIFIER_REASONING).toBe('low')
  })

  it('adds inherited collection scope guidance without weakening root-reset negatives', () => {
    expect(V6_SEMANTIC_VERIFIER_SYSTEM_PROMPT).toContain(
      'Inherited collection / resource scope',
    )
    expect(V6_SEMANTIC_VERIFIER_SYSTEM_PROMPT).toContain(
      'Do NOT require the current Draft TurnPlan to restate',
    )
    expect(V6_SEMANTIC_VERIFIER_SYSTEM_PROMPT).toContain(
      'EXPLICIT GLOBAL/ROOT SCOPE RESET',
    )
    expect(V6_SEMANTIC_VERIFIER_SYSTEM_PROMPT).toContain(
      'Replacing a prior constraint with a different incompatible constraint',
    )
  })

  it('Edge mirror stays aligned', () => {
    const edge = readFileSync(
      resolve(
        process.cwd(),
        'supabase/functions/ai-assistant/v6SemanticVerifier.ts',
      ),
      'utf8',
    )
    expect(edge).toContain('place.name is the supported place/location field')
    expect(edge).toContain('EXPLICIT GLOBAL/ROOT SCOPE RESET')
    expect(edge).toContain('Inherited collection / resource scope')
    expect(edge).toContain("V6_SEMANTIC_VERIFIER_MODEL = 'gpt-5'")
  })

  it('regression corpus has 8 denotational cases', () => {
    expect(VF1_CASES).toHaveLength(8)
    const faithful = VF1_CASES.filter((c) => c.gold === 'FAITHFUL')
    const notFaithful = VF1_CASES.filter((c) => c.gold === 'NOT_FAITHFUL')
    expect(faithful).toHaveLength(5)
    expect(notFaithful).toHaveLength(3)
    expect(VF1_CASES.some((c) => c.id === 'vf1-v3-root-empty-prior')).toBe(
      true,
    )
  })
})
