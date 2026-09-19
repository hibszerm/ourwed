/**
 * D2.5 — Nowe zgłoszenia empty-state card parity (presentation only).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const panel = read('src/features/dashboard-v3/DashboardV3InquiriesPanel.tsx')
const css = read('src/features/dashboard-v3/DashboardV3InquiriesPanel.module.css')
const hook = read('src/features/questionnaires/hooks/usePendingQuestionnaires.ts')
const attention = read('src/features/dashboard-v3/DashboardV3AttentionPanel.tsx')
const attentionCss = read('src/features/dashboard-v3/DashboardV3AttentionPanel.module.css')
const service = read('src/features/dashboard/attention/studioAttentionService.ts')

// A — zero state structure
assert(panel.includes('showZeroState'), 'A: zero branch')
assert(panel.includes('dashboard-v3-inquiries-empty'), 'A: empty node')
assert(panel.includes('INQUIRIES_EMPTY'), 'A: empty copy')
assert(panel.includes('v3MaterialSecondaryCard'), 'A: outer card')
assert(panel.includes('styles.header'), 'A: header inside panel')
assert(panel.includes('Wszystkie'), 'A: Wszystkie preserved')

// B — populated still uses same shell + list
assert(panel.includes('styles.list'), 'B: list present')
assert(panel.includes('slice(0, 4)'), 'B: preview limit')
assert(panel.includes('handleAccept'), 'B: accept')
assert(panel.includes('handleReject'), 'B: reject')
const zeroIdx = panel.indexOf('dashboard-v3-inquiries-empty')
const listIdx = panel.indexOf('styles.list')
assert(listIdx > zeroIdx, 'B: list after zero branch (mutually exclusive render)')

// C — loading does not use success zero
assert(panel.includes("isLoading && !pendingQuery.data"), 'C: loading gate')
assert(panel.includes('Ładowanie…'), 'C: loading copy')
assert(panel.includes('showZeroState ?'), 'C: zero gated separately')

// D — error cannot claim empty
assert(panel.includes('pendingQuery.isSuccess'), 'D: isSuccess required')
assert(!panel.includes('const empty = !isLoading && pending.length === 0'), 'D: old gate gone')

// E — mobile keeps card chrome
const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
assert(mobile.includes('.emptyPanel'), 'E: mobile emptyPanel exists')
assert(!mobile.includes('.emptyPanel.emptyPanel'), 'E: no double-class override')
const emptyRule = css.match(/\.emptyPanel\s*\{[^}]*\}/g) || []
assert(emptyRule.length >= 1, 'E: emptyPanel rules exist')
assert(emptyRule.every((r) => !r.includes('background: transparent')), 'E: no transparent empty')
assert(emptyRule.every((r) => !r.includes('border-radius: 0')), 'E: no radius wipe')
assert(emptyRule.every((r) => !r.includes('box-shadow: none')), 'E: no shadow wipe')
assert(emptyRule.every((r) => !r.includes('border: 0')), 'E: no border wipe')
assert(!/\.emptyState\s*\{[^}]*min-height/.test(css), 'E: no emptyState min-height')
assert(emptyRule.every((r) => !r.includes('min-height')), 'E: no emptyPanel min-height')

// F — performance / topology freeze
assert(panel.includes('usePendingQuestionnaires'), 'F: same hook')
assert(!panel.includes('useQuery('), 'F: no new RQ in panel')
assert(!panel.includes('supabase'), 'F: no direct DB')
assert(hook.includes('queryKey'), 'F: hook owns key')
assert(!service.includes('pending'), 'F: attention service untouched by pending')

// Attention freeze
assert(attention.includes('showZeroState'), 'Attention zero still gated')
assert(attention.includes('Nic nie wymaga Twojej uwagi'), 'Attention copy frozen')
assert(attentionCss.includes('@container attention'), 'Attention CQ frozen')

console.log('PASS  D2.5 pending empty card parity acceptance')
