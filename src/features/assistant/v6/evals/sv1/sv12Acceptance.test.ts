/**
 * V6-SV1.2 — Targeted unit checks (no live API).
 */

import { describe, expect, it } from 'vitest'
import { SV2_BLIND_HOLDOUT } from './sv2HoldoutCorpus'
import { checkTurnPlanCapability } from '../../capability/checkTurnPlanCapability'
import { runSv2Counterfactuals } from './sv2Counterfactuals'
import { V6_SEMANTIC_VERIFIER_JSON_SCHEMA } from '../../verification/semanticVerifier'

describe('V6-SV1.2 corpus freeze', () => {
  it('has ~30 blind holdout cases', () => {
    expect(SV2_BLIND_HOLDOUT.length).toBeGreaterThanOrEqual(28)
    expect(SV2_BLIND_HOLDOUT.length).toBeLessThanOrEqual(32)
  })

  it('aligns capability_gold with deterministic gate', () => {
    for (const h of SV2_BLIND_HOLDOUT) {
      const cap = checkTurnPlanCapability(h.draftPlan)
      expect(cap.verdict, h.id).toBe(
        h.capability_gold === 'NOT_RELEVANT' ? cap.verdict : h.capability_gold,
      )
    }
  })

  it('reuses semantic schema without unsupported_requirements', () => {
    expect(
      Object.keys(V6_SEMANTIC_VERIFIER_JSON_SCHEMA.properties),
    ).not.toContain('unsupported_requirements')
  })
})

describe('V6-SV2 counterfactuals', () => {
  it('distinguishes omissions from equivalence', () => {
    const results = runSv2Counterfactuals()
    expect(results.every((r) => r.pass)).toBe(true)
    const top = results.find((r) => r.id === 'cf-top3-shuffle')
    expect(top?.differsSomewhere).toBe(false)
    const dropYear = results.find((r) => r.id === 'cf-drop-year')
    expect(dropYear?.differsSomewhere).toBe(true)
  })
})
