/**
 * C2F — Golden V7 path must not invoke historical V5 runtime-config
 * or V6 emergency/shadow. V5/V6 client runtimes are removed.
 *
 *   npx vitest run src/features/assistant/v7/evals/v7RuntimeConfigDetachmentAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isV7Visible,
  isV7Enabled,
  setV7GlobalFlagForTests,
} from '../canary/v7Gate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../../../../../')

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

const AUTH = '11111111-2222-3333-4444-555555555555'

describe('C2F Golden V7 runtime-config detachment', () => {
  it('routing: authenticated + V7 global ON → V7', () => {
    setV7GlobalFlagForTests(true)
    expect(isV7Visible(AUTH)).toBe(true)
    expect(isV7Enabled(AUTH)).toBe(true)
    setV7GlobalFlagForTests(null)
  })

  it('Host: V7-visible turn skips assistant_runtime_config and has no V6/V5', () => {
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    const runQuery = host.slice(host.indexOf('const runQuery = useCallback'))
    const v7If = runQuery.indexOf('if (isV7Enabled(authUserId))')
    const v7Turn = runQuery.indexOf('await runV7Turn(')
    const v7Return = runQuery.indexOf('return', v7Turn)

    expect(v7If).toBeGreaterThan(-1)
    expect(v7Turn).toBeGreaterThan(v7If)

    const v7Block = runQuery.slice(v7If, v7Return)
    expect(v7Block).toContain('runV7Turn')
    expect(v7Block).not.toContain('refreshAssistantRuntime')
    expect(v7Block).not.toContain('fetchAssistantRuntimeConfig')
    expect(v7Block).not.toContain("mode: 'assistant_runtime_config'")
    expect(v7Block).not.toContain('setV6ShadowSessionOpen')
    expect(host).not.toContain('runV5GoalSpecShadow')
    expect(host).not.toContain('enqueueAndAwaitV6ShadowTurn')
    expect(host).not.toContain('isV6OwnerCanaryVisible')
    expect(host).not.toContain('from \'./v6\'')
  })

  it('Host: open does not arm legacy runtime-config', () => {
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    expect(host).not.toContain('armLegacyRuntimeIfNeeded')
    expect(host).not.toContain('refreshAssistantRuntime')
    expect(host).not.toContain('fetchAssistantRuntimeConfig')
  })

  it('V7 agent step remains; V5/V6 client engines absent', () => {
    const invoke = readSrc('src/features/assistant/v7/agent/invokeStep.ts')
    expect(invoke).toContain("mode: 'v7_agent_step'")
    expect(readSrc('src/features/assistant/AssistantHost.tsx')).not.toContain(
      'runV5GoalSpecShadow',
    )
  })
})
