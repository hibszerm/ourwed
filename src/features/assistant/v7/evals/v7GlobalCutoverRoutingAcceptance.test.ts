/**
 * V7 global cutover routing acceptance (deterministic).
 *
 * Cases A–E from cutover gate matrix + mutual exclusivity.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isV7Visible,
  isV7OwnerCanaryVisible,
  setV7GlobalFlagForTests,
} from '../canary/v7ShadowGate'
import {
  isV6EmergencyVisible,
  isV6OwnerCanaryVisible,
  setV6EmergencyFlagForTests,
} from '../../v6/canary/ownerCanaryGate'

const AUTH_A = '11111111-2222-3333-4444-555555555555'
const AUTH_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('V7 global cutover routing', () => {
  beforeEach(() => {
    setV7GlobalFlagForTests(null)
    setV6EmergencyFlagForTests(null)
  })
  afterEach(() => {
    setV7GlobalFlagForTests(null)
    setV6EmergencyFlagForTests(null)
  })

  it('A — authenticated user A + V7 global ON → V7', () => {
    setV7GlobalFlagForTests(true)
    setV6EmergencyFlagForTests(false)
    expect(isV7Visible(AUTH_A)).toBe(true)
    expect(isV7OwnerCanaryVisible(AUTH_A)).toBe(true)
  })

  it('B — authenticated user B + V7 global ON → V7', () => {
    setV7GlobalFlagForTests(true)
    expect(isV7Visible(AUTH_B)).toBe(true)
  })

  it('C — unauthenticated → no V7', () => {
    setV7GlobalFlagForTests(true)
    expect(isV7Visible(null)).toBe(false)
    expect(isV7Visible(undefined)).toBe(false)
    expect(isV7Visible('')).toBe(false)
  })

  it('D — V7 OFF + V6 emergency ON → V6 for any auth user', () => {
    setV7GlobalFlagForTests(false)
    setV6EmergencyFlagForTests(true)
    expect(isV7Visible(AUTH_A)).toBe(false)
    expect(isV7Visible(AUTH_B)).toBe(false)
    expect(isV6EmergencyVisible(AUTH_A)).toBe(true)
    expect(isV6EmergencyVisible(AUTH_B)).toBe(true)
    expect(isV6OwnerCanaryVisible(AUTH_B)).toBe(true)
  })

  it('E — V7 ON + V6 emergency ON → V7 wins (Host checks V7 first)', () => {
    setV7GlobalFlagForTests(true)
    setV6EmergencyFlagForTests(true)
    expect(isV7Visible(AUTH_B)).toBe(true)
    // Host never reaches V6 when V7 visible; both flags may be true in env.
    expect(isV6EmergencyVisible(AUTH_B)).toBe(true)
  })

  it('neither flag → no visible engine for authenticated (Host fail-closed)', () => {
    setV7GlobalFlagForTests(false)
    setV6EmergencyFlagForTests(false)
    expect(isV7Visible(AUTH_B)).toBe(false)
    expect(isV6EmergencyVisible(AUTH_B)).toBe(false)
  })
})
