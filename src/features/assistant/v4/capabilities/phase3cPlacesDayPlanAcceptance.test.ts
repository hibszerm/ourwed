/**
 * Phase 3C — places + day-plan capability acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/v4/capabilities/phase3cPlacesDayPlanAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeTaskSpec } from '../expect'
import type { ResolvedTask } from '../resolver/types'
import {
  isAnyV4CapabilityExecutionEnabled,
  isAssistantV4FinanceExecutionEnabled,
  isAssistantV4ShadowEnabled,
} from '../flag'
import { isV4CapabilityEnabled } from './availability'
import {
  assertUniqueCapabilityIds,
  V4_CAPABILITY_REGISTRY,
} from './registry'
import { selectV4Capability } from './selector'
import { V4_CAPABILITY_IDS } from './types'
import { isWeddingPlacesShapedTask } from './places/weddingPlacesCapability'
import { isWeddingDayPlanShapedTask } from './dayPlan/weddingDayPlanCapability'
import { compareV4PlaceWithV3Response } from '../execution/comparePlaceShadow'
import { compareV4TimeWithV3Response } from '../execution/compareTimeShadow'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function resolvedTask(input: {
  op: 'get_location' | 'get_time' | 'get_amount' | 'get_distance' | 'rank' | 'prepare_create' | 'get_next'
  subject:
    | 'preparations'
    | 'ceremony'
    | 'reception'
    | 'remaining'
    | 'contract_value'
    | 'route'
    | 'task'
    | 'day_plan'
  weddingId?: string
  participantKey?: 'p1' | 'p2' | null
  collection?: boolean
}): ResolvedTask {
  const merged = makeTaskSpec({
    op: input.op,
    subject: input.subject,
    resource: { kind: 'active_resource' },
  })
  return {
    status: 'resolved',
    op: input.op,
    subject: input.subject,
    resource:
      input.weddingId === undefined
        ? null
        : {
            kind: 'wedding',
            id: input.weddingId,
            label: 'Test',
          },
    participant: input.participantKey
      ? { key: input.participantKey, label: input.participantKey }
      : null,
    temporal: null,
    qualifiers: merged.qualifiers,
    sequence: null,
    collection: input.collection ? { resource: 'weddings' } : null,
    sourceTaskSpec: merged,
    mergedTaskSpec: merged,
  }
}

console.log('Phase 3C places + day-plan acceptance')

assert(isAssistantV4ShadowEnabled() === false, 'shadow default off in test env')
assert(
  isAssistantV4FinanceExecutionEnabled() === false,
  'finance default off',
)
assert(
  isAnyV4CapabilityExecutionEnabled() === false,
  'any capability default off',
)
assert(
  isV4CapabilityEnabled('wedding.places.get') === false,
  'places disabled default',
)
assert(
  isV4CapabilityEnabled('wedding.day_plan.get') === false,
  'day_plan disabled default',
)

assertUniqueCapabilityIds()
assert(V4_CAPABILITY_REGISTRY.length === 4, 'exactly 4 capabilities')
assert(
  V4_CAPABILITY_IDS.join(',') ===
    'wedding.finance.get,wedding.places.get,wedding.day_plan.get,collection.query',
  'closed id set',
)

// --- Ownership: same subject, different op ---
{
  const loc = selectV4Capability(
    resolvedTask({
      op: 'get_location',
      subject: 'ceremony',
      weddingId: 'w1',
    }),
  )
  assert(loc.status === 'selected', 'ceremony location selected')
  if (loc.status === 'selected') {
    assert(loc.capability.id === 'wedding.places.get', '→ places')
  }

  const time = selectV4Capability(
    resolvedTask({
      op: 'get_time',
      subject: 'ceremony',
      weddingId: 'w1',
    }),
  )
  assert(time.status === 'selected', 'ceremony time selected')
  if (time.status === 'selected') {
    assert(time.capability.id === 'wedding.day_plan.get', '→ day_plan')
  }
}
{
  const loc = selectV4Capability(
    resolvedTask({
      op: 'get_location',
      subject: 'preparations',
      weddingId: 'w1',
      participantKey: 'p1',
    }),
  )
  assert(loc.status === 'selected', 'prep location selected')
  if (loc.status === 'selected') {
    assert(loc.capability.id === 'wedding.places.get', 'prep → places')
  }
  const time = selectV4Capability(
    resolvedTask({
      op: 'get_time',
      subject: 'preparations',
      weddingId: 'w1',
      participantKey: 'p1',
    }),
  )
  assert(time.status === 'selected', 'prep time selected')
  if (time.status === 'selected') {
    assert(time.capability.id === 'wedding.day_plan.get', 'prep → day_plan')
  }
}

// --- Finance still unique ---
{
  const fin = selectV4Capability(
    resolvedTask({
      op: 'get_amount',
      subject: 'remaining',
      weddingId: 'w1',
    }),
  )
  assert(fin.status === 'selected', 'remaining selected')
  if (fin.status === 'selected') {
    assert(fin.capability.id === 'wedding.finance.get', '→ finance only')
  }
}

// --- Wrong-scope → none (rank is Phase 3D collection.query) ---
{
  const rankSel = selectV4Capability(
    resolvedTask({ op: 'rank', subject: 'contract_value', collection: true }),
  )
  assert(
    rankSel.status === 'selected' &&
      rankSel.capability.id === 'collection.query',
    'rank → collection.query',
  )
}
for (const task of [
  resolvedTask({ op: 'get_distance', subject: 'route', weddingId: 'w1' }),
  resolvedTask({ op: 'prepare_create', subject: 'task', weddingId: 'w1' }),
  resolvedTask({ op: 'get_next', subject: 'day_plan', weddingId: 'w1' }),
]) {
  const sel = selectV4Capability(task)
  assert(sel.status === 'no_match', `no match for ${task.op}`)
}

// --- Shaped helpers ---
assert(
  isWeddingPlacesShapedTask(
    resolvedTask({
      op: 'get_location',
      subject: 'reception',
      weddingId: 'w1',
    }),
  ),
  'places shaped',
)
assert(
  !isWeddingPlacesShapedTask(
    resolvedTask({
      op: 'get_time',
      subject: 'reception',
      weddingId: 'w1',
    }),
  ),
  'time not places',
)
assert(
  isWeddingDayPlanShapedTask(
    resolvedTask({
      op: 'get_time',
      subject: 'reception',
      weddingId: 'w1',
    }),
  ),
  'day plan shaped',
)

// --- Missing wedding id still selects places (clarification via buildInput) ---
{
  const sel = selectV4Capability(
    resolvedTask({
      op: 'get_location',
      subject: 'ceremony',
      weddingId: '',
    }),
  )
  assert(sel.status === 'selected', 'places shaped with empty id selects')
}

// --- Compare harness: places ---
{
  const cmp = compareV4PlaceWithV3Response({
    v4: {
      status: 'success',
      capabilityId: 'wedding.places.get',
      observation: {
        kind: 'place',
        resource: { kind: 'wedding', id: 'w1' },
        role: 'ceremony',
        participantKey: null,
        label: 'Ceremonia',
        name: 'Kościół',
        address: 'ul. Test 1',
        set: true,
      },
      selectionMs: 0,
      executionMs: 1,
    },
    v3: {
      kind: 'places',
      wedding: {
        id: 'w1',
        displayName: 'A',
        date: null,
        locationLine: null,
        partner1: null,
        partner2: null,
      },
      places: [
        {
          role: 'ceremony',
          label: 'Ceremonia',
          name: 'Kościół',
          address: 'ul. Test 1',
          time: null,
        },
      ],
      focusRole: 'ceremony',
    },
  })
  assert(cmp.resolvedSameResource === true, 'place same resource')
  assert(cmp.roleSame === true, 'place same role')
  assert(cmp.placeSame === true, 'place same identity')
}

// --- Compare harness: times ---
{
  const cmp = compareV4TimeWithV3Response({
    v4: {
      status: 'success',
      capabilityId: 'wedding.day_plan.get',
      observation: {
        kind: 'time',
        resource: { kind: 'wedding', id: 'w1' },
        role: 'ceremony',
        participantKey: null,
        time: '15:00',
      },
      selectionMs: 0,
      executionMs: 1,
    },
    v3: {
      kind: 'day_plan',
      wedding: {
        id: 'w1',
        displayName: 'A',
        date: null,
        locationLine: null,
        partner1: null,
        partner2: null,
      },
      stops: [
        {
          key: 'c1',
          title: 'Ceremonia',
          time: '15:00',
          placeName: 'Kościół',
          address: null,
          role: 'ceremony',
        },
      ],
      focus: 'ceremony',
    },
  })
  assert(cmp.resolvedSameResource === true, 'time same resource')
  assert(cmp.roleSame === true, 'time same role')
  assert(cmp.timeSame === true, 'time same clock')
}

// --- Security / architecture static ---
{
  const placesSrc = read(
    'src/features/assistant/v4/capabilities/places/weddingPlacesCapability.ts',
  )
  assert(placesSrc.includes('loadOperationalWeddingDay'), 'places SoT loader')
  assert(!placesSrc.includes('service_role'), 'places no service_role')
  assert(!placesSrc.includes('ownerId'), 'places no ownerId')

  const daySrc = read(
    'src/features/assistant/v4/capabilities/dayPlan/weddingDayPlanCapability.ts',
  )
  assert(daySrc.includes('loadOperationalWeddingDay'), 'day SoT loader')
  assert(!daySrc.includes("'get_next'"), 'no get_next execution')

  const loadSrc = read(
    'src/features/assistant/v4/capabilities/loadOperationalWeddingDay.ts',
  )
  assert(loadSrc.includes('buildOperationalDayStops'), 'canonical builder')
  assert(loadSrc.includes('weddingPlaceService'), 'places service')
  assert(loadSrc.includes('weddingOperationalTimesService'), 'times service')
  assert(loadSrc.includes('Never accepts ownerId'), 'identity forbid')

  const flagSrc = read('src/features/assistant/v4/flag.ts')
  assert(
    flagSrc.includes('VITE_ASSISTANT_V4_EXECUTION_CAPABILITIES'),
    'capabilities allowlist flag',
  )

  const shadowSrc = read('src/features/assistant/v4/shadow.ts')
  assert(
    shadowSrc.includes('runV4CapabilityExecution'),
    'shadow uses registry runtime',
  )
  assert(
    shadowSrc.includes('isAnyV4CapabilityExecutionEnabled'),
    'any-capability gate',
  )
  assert(
    shadowSrc.includes('completeAssistantV4FinanceShadowComparison'),
    'finance compare compat kept',
  )

  const stateSrc = read(
    'src/features/assistant/v4/resolver/shadowState.ts',
  )
  assert(
    stateSrc.includes('lastCapabilityExecution'),
    'generalized last execution',
  )
  assert(!stateSrc.includes('lastPlaceExecution'), 'no lastPlaceExecution')
  assert(!stateSrc.includes('lastTimeExecution'), 'no lastTimeExecution')
}

console.log('Phase 3C places + day-plan acceptance — ALL PASS')
