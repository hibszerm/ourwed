/**
 * GuideDiscoveryModalHost — marker-before-mount and marker-after-mount sequences.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/onboarding/guide/guideDiscoveryModalHostAcceptance.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  clearGuideDiscoveryEligible,
  markGuideDiscoveryEligibleIfFirstBooking,
  readGuideDiscoveryEligible,
  retainGuideDiscoveryEligibleSnapshot,
  subscribeGuideDiscoveryEligible,
} from '@/lib/guideDiscovery/eligibleSession'
import { shouldShowGuideDiscoveryModal } from '@/features/onboarding/guide/guideDiscoveryRules'

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
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
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
    },
    configurable: true,
  })
}

installMemorySessionStorage()

const preference = {
  discovered: false,
  modalDismissed: false,
  sidebarVisible: true,
}

function hostOpen(input: {
  discoveryEligible: boolean
  delayElapsed: boolean
  showingFirstRunHome?: boolean
}): boolean {
  const eligible = shouldShowGuideDiscoveryModal({
    preference,
    discoveryEligible: input.discoveryEligible,
    showingFirstRunHome: input.showingFirstRunHome ?? false,
    isCalmOperationalSurface: true,
  })
  return eligible && input.delayElapsed
}

run('A: marker exists BEFORE host mount → eligible on first read → opens after delay', () => {
  clearGuideDiscoveryEligible()
  markGuideDiscoveryEligibleIfFirstBooking(0)

  // Host mounts later on Dashboard — first snapshot must see existing marker.
  const snapshotAtMount = readGuideDiscoveryEligible()
  assert(snapshotAtMount === true, 'mount snapshot reads existing marker')

  assert(
    hostOpen({ discoveryEligible: snapshotAtMount, delayElapsed: false }) ===
      false,
    'not open before delay',
  )
  assert(
    hostOpen({ discoveryEligible: snapshotAtMount, delayElapsed: true }) ===
      true,
    'open after mount-scoped delay',
  )
})

run('B: marker written AFTER host mount → retain/notify updates subscriber', () => {
  clearGuideDiscoveryEligible()
  let seen = readGuideDiscoveryEligible()
  assert(seen === false, 'starts false')

  const unsub = subscribeGuideDiscoveryEligible(() => {
    seen = readGuideDiscoveryEligible()
  })

  // Host already mounted; create path writes marker then (or mount retain) notifies.
  markGuideDiscoveryEligibleIfFirstBooking(0)
  assert(seen === true, 'subscriber saw late write')

  // Mount retain must notify even when value unchanged (already "1").
  let retainCalls = 0
  const unsub2 = subscribeGuideDiscoveryEligible(() => {
    retainCalls += 1
    seen = readGuideDiscoveryEligible()
  })
  retainGuideDiscoveryEligibleSnapshot()
  assert(retainCalls === 1, 'retain notifies without requiring a new write')
  assert(seen === true, 'still eligible')
  assert(
    hostOpen({ discoveryEligible: seen, delayElapsed: true }) === true,
    'opens after late marker + delay elapsed',
  )

  unsub()
  unsub2()
})

run('host source: mount-scoped delay + retain on mount + client getSnapshot', () => {
  const host = readFileSync(
    resolve(
      process.cwd(),
      'src/features/onboarding/guide/GuideDiscoveryModalHost.tsx',
    ),
    'utf8',
  )
  assert(host.includes('retainGuideDiscoveryEligibleSnapshot'), 'retain on mount')
  assert(host.includes('useSyncExternalStore'), 'external store')
  assert(host.includes('setDelayElapsed(true)'), 'delay sets elapsed')
  assert(host.includes('}, [])'), 'mount-scoped delay deps')
  assert(!host.includes('() => false'), 'no hard-coded false server snapshot')
  assert(
    host.includes('subscribeGuideDiscoveryEligible,\n    readGuideDiscoveryEligible,\n    readGuideDiscoveryEligible'),
    'client+server snapshot both read session',
  )
})

console.log('\nAll GuideDiscoveryModalHost acceptance checks passed.')
