/**
 * Capability execution availability — registered ≠ enabled.
 *
 * Policy (DEV):
 * 1. If VITE_ASSISTANT_V4_EXECUTION_CAPABILITIES is set → that allowlist (*|all|ids)
 * 2. Else legacy VITE_ASSISTANT_V4_EXECUTION_FINANCE enables only wedding.finance.get
 * 3. Default: all OFF
 */

import {
  isAssistantV4FinanceExecutionEnabled,
  parseV4ExecutionCapabilitiesAllowlist,
} from '../flag'
import type { V4CapabilityId } from './types'
import { V4_CAPABILITY_IDS } from './types'

/** Environment gate per capability. Default: all OFF unless allowlisted. */
export function isV4CapabilityEnabled(id: V4CapabilityId): boolean {
  const allow = parseV4ExecutionCapabilitiesAllowlist()
  if (allow === 'all') return true
  if (allow) {
    return allow.has(id) && (V4_CAPABILITY_IDS as readonly string[]).includes(id)
  }
  if (id === 'wedding.finance.get') {
    return isAssistantV4FinanceExecutionEnabled()
  }
  return false
}
