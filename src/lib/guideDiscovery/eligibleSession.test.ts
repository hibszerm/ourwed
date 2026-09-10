/**
 * Guide discovery eligible session — same-tab reactivity + prior-history gate.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/guideDiscovery/eligibleSession.test.ts
 */
import {
  clearGuideDiscoveryEligible,
  GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY,
  markGuideDiscoveryEligibleIfFirstBooking,
  readGuideDiscoveryEligible,
  retainGuideDiscoveryEligibleSnapshot,
  subscribeGuideDiscoveryEligible,
} from '@/lib/guideDiscovery/eligibleSession'
import {
  shouldAnimateGuideCompass,
  shouldShowGuideDiscoveryModal,
} from '@/features/onboarding/guide/guideDiscoveryRules'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    throw err
  }
}

function installMemorySessionStorage() {
  const store = new Map<string, string>()
  const sessionStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    key() {
      return null
    },
    get length() {
      return store.size
    },
  }
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStorage,
    configurable: true,
  })
  return store
}

installMemorySessionStorage()
clearGuideDiscoveryEligible()

run('prior history 0 → marker written', () => {
  clearGuideDiscoveryEligible()
  markGuideDiscoveryEligibleIfFirstBooking(0)
  assert(readGuideDiscoveryEligible() === true, 'eligible')
  assert(
    sessionStorage.getItem(GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY) === '1',
    'storage',
  )
})

run('prior history 1 → no new eligibility', () => {
  clearGuideDiscoveryEligible()
  markGuideDiscoveryEligibleIfFirstBooking(1)
  assert(readGuideDiscoveryEligible() === false, 'not eligible')
})

run('same-tab subscriber notified on mark', () => {
  clearGuideDiscoveryEligible()
  let calls = 0
  const unsub = subscribeGuideDiscoveryEligible(() => {
    calls += 1
  })
  markGuideDiscoveryEligibleIfFirstBooking(0)
  assert(calls === 1, `notified once, got ${calls}`)
  markGuideDiscoveryEligibleIfFirstBooking(0)
  assert(calls === 1, 'idempotent mark does not re-notify')
  unsub()
})

run('same-tab subscriber notified on clear', () => {
  clearGuideDiscoveryEligible()
  markGuideDiscoveryEligibleIfFirstBooking(0)
  let calls = 0
  const unsub = subscribeGuideDiscoveryEligible(() => {
    calls += 1
  })
  clearGuideDiscoveryEligible()
  assert(calls === 1, 'clear notifies')
  assert(readGuideDiscoveryEligible() === false, 'cleared')
  clearGuideDiscoveryEligible()
  assert(calls === 1, 'idempotent clear')
  unsub()
})

run('manual-create path: prior 0 + marker → modal + compass', () => {
  clearGuideDiscoveryEligible()
  markGuideDiscoveryEligibleIfFirstBooking(0)
  const preference = {
    discovered: false,
    modalDismissed: false,
    sidebarVisible: true,
  }
  assert(
    shouldShowGuideDiscoveryModal({
      preference,
      discoveryEligible: readGuideDiscoveryEligible(),
      showingFirstRunHome: false,
      isCalmOperationalSurface: true,
    }),
    'modal eligible after first booking marker',
  )
  assert(
    shouldAnimateGuideCompass({
      preference,
      isGuideRouteActive: false,
      prefersReducedMotion: false,
      isGuidePreparationComplete: false,
    }),
    'compass attention while preparation incomplete',
  )
})

run('create page uses authoritative countWeddingHistory before mutate', () => {
  const create = readFileSync(
    resolve(process.cwd(), 'src/pages/NewWeddingPage.tsx'),
    'utf8',
  )
  assert(create.includes('countWeddingHistory'), 'authoritative prior')
  assert(
    create.includes('markGuideDiscoveryEligibleIfFirstBooking(priorHistoryCount)'),
    'marks with prior',
  )
  const markIdx = create.indexOf(
    'markGuideDiscoveryEligibleIfFirstBooking(priorHistoryCount)',
  )
  const countIdx = create.indexOf('countWeddingHistory')
  const mutateIdx = create.indexOf('mutateAsync')
  assert(countIdx > 0 && markIdx > 0 && mutateIdx > 0, 'wiring present')
  assert(countIdx < mutateIdx, 'count before mutate')
  assert(
    create.includes('isFullCreatePartialError'),
    'partial branch still marks',
  )
})

run('host subscribes to same-tab eligible store', () => {
  const host = readFileSync(
    resolve(
      process.cwd(),
      'src/features/onboarding/guide/GuideDiscoveryModalHost.tsx',
    ),
    'utf8',
  )
  assert(host.includes('useSyncExternalStore'), 'external store')
  assert(host.includes('subscribeGuideDiscoveryEligible'), 'subscribe')
  assert(host.includes('readGuideDiscoveryEligible'), 'read')
  assert(host.includes('retainGuideDiscoveryEligibleSnapshot'), 'retain')
})

run('retain notifies subscribers without rewriting storage', () => {
  clearGuideDiscoveryEligible()
  markGuideDiscoveryEligibleIfFirstBooking(0)
  let calls = 0
  const unsub = subscribeGuideDiscoveryEligible(() => {
    calls += 1
  })
  retainGuideDiscoveryEligibleSnapshot()
  assert(calls === 1, 'retain notifies')
  assert(readGuideDiscoveryEligible() === true, 'still eligible')
  unsub()
})

console.log('\nAll eligibleSession regression checks passed.')
