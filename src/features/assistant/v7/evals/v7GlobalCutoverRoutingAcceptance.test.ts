/**
 * V7 global cutover routing acceptance (deterministic).
 *
 * C2F: V6 emergency runtime removed — only V7 or fail-closed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isV7Visible,
  isV7Enabled,
  setV7GlobalFlagForTests,
} from '../canary/v7Gate'

const AUTH_A = '11111111-2222-3333-4444-555555555555'
const AUTH_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('V7 global cutover routing', () => {
  beforeEach(() => {
    setV7GlobalFlagForTests(null)
  })
  afterEach(() => {
    setV7GlobalFlagForTests(null)
  })

  it('A — authenticated user A + V7 global ON → V7', () => {
    setV7GlobalFlagForTests(true)
    expect(isV7Enabled(AUTH_A)).toBe(true)
    expect(isV7Visible(AUTH_A)).toBe(true)
  })

  it('B — authenticated user B + V7 global ON → V7', () => {
    setV7GlobalFlagForTests(true)
    expect(isV7Enabled(AUTH_B)).toBe(true)
  })

  it('C — unauthenticated → no V7', () => {
    setV7GlobalFlagForTests(true)
    expect(isV7Enabled(null)).toBe(false)
    expect(isV7Enabled(undefined)).toBe(false)
    expect(isV7Enabled('')).toBe(false)
  })

  it('D — V7 OFF → fail-closed (no V6 emergency)', () => {
    setV7GlobalFlagForTests(false)
    expect(isV7Enabled(AUTH_A)).toBe(false)
    expect(isV7Enabled(AUTH_B)).toBe(false)
  })

  it('E — V7 ON → V7 for any authenticated user', () => {
    setV7GlobalFlagForTests(true)
    expect(isV7Enabled(AUTH_B)).toBe(true)
  })
})
