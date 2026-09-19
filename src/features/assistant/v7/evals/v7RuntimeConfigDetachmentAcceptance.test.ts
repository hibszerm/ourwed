/**
 * C2B — Golden V7 path must not invoke historical V5 runtime-config
 * or arm V6 shadow state. Historical branches keep refreshAssistantRuntime.
 *
 *   npx vitest run src/features/assistant/v7/evals/v7RuntimeConfigDetachmentAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isV7Visible,
  isV7OwnerCanaryVisible,
  setV7GlobalFlagForTests,
} from '../canary/v7ShadowGate'
import {
  isV6EmergencyVisible,
  setV6EmergencyFlagForTests,
} from '../../v6/canary/ownerCanaryGate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../../../../../')

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

const AUTH = '11111111-2222-3333-4444-555555555555'

describe('C2B Golden V7 runtime-config detachment', () => {
  it('routing: authenticated + V7 global ON → V7; V6 emergency remains gated', () => {
    setV7GlobalFlagForTests(true)
    setV6EmergencyFlagForTests(false)
    expect(isV7Visible(AUTH)).toBe(true)
    expect(isV7OwnerCanaryVisible(AUTH)).toBe(true)
    expect(isV6EmergencyVisible(AUTH)).toBe(false)
    setV7GlobalFlagForTests(null)
    setV6EmergencyFlagForTests(null)
  })

  it('Host: V7-visible turn skips assistant_runtime_config and V6 shadow arm', () => {
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    const runQuery = host.slice(host.indexOf('const runQuery = useCallback'))
    const v7If = runQuery.indexOf('if (isV7OwnerCanaryVisible(authUserId))')
    const v7Turn = runQuery.indexOf('await runV7OwnerVisibleTurn(')
    const v7Return = runQuery.indexOf('return', v7Turn)
    const refresh = runQuery.indexOf('await refreshAssistantRuntime()')
    const v7Block = runQuery.slice(v7If, v7Return)

    expect(v7If).toBeGreaterThan(-1)
    expect(v7Turn).toBeGreaterThan(v7If)
    expect(refresh).toBeGreaterThan(v7Return)

    expect(v7Block).toContain('runV7OwnerVisibleTurn')
    expect(v7Block).not.toContain('refreshAssistantRuntime')
    expect(v7Block).not.toContain('fetchAssistantRuntimeConfig')
    expect(v7Block).not.toContain("mode: 'assistant_runtime_config'")
    expect(v7Block).not.toContain('setV6ShadowSessionOpen(true)')
    expect(v7Block).toContain('setV6ShadowSessionOpen(false)')
  })

  it('Host: open/keyboard skip legacy runtime arm when V7 global is ON', () => {
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    expect(host).toContain('armLegacyRuntimeIfNeeded')
    const helper = host.slice(
      host.indexOf('const armLegacyRuntimeIfNeeded'),
      host.indexOf('const openAssistant'),
    )
    expect(helper).toContain('isV7GlobalFlagEnabled()')
    expect(helper).toContain('return')
    expect(helper).toContain('refreshAssistantRuntime()')
    const openBody = host.slice(
      host.indexOf('const openAssistant = useCallback'),
      host.indexOf('const recordV5AuthorityDecision'),
    )
    expect(openBody).toContain('armLegacyRuntimeIfNeeded()')
    expect(openBody).not.toContain('void refreshAssistantRuntime()')
  })

  it('historical fetch + V7 agent step remain; V5/V6 engines not deleted', () => {
    const fetch = readSrc('src/features/assistant/v4/authority/fetchRuntimeMode.ts')
    const invoke = readSrc('src/features/assistant/v7/agent/invokeStep.ts')
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    expect(fetch).toContain("mode: 'assistant_runtime_config'")
    expect(invoke).toContain("mode: 'v7_agent_step'")
    expect(host).toContain('runV5GoalSpecShadow')
    expect(host).toContain('enqueueAndAwaitV6ShadowTurn')
    expect(host).toContain('isV6OwnerCanaryVisible')
  })
})
