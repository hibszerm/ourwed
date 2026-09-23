import assert from 'node:assert/strict'
import { selectReplayExtrasPlacement } from './replayExtrasPlacementEvidence'

const stale = { sourceBlockId: 'para-30', side: 'after' as const }
const live = { sourceBlockId: 'para-32', side: 'after' as const }

const overridden = selectReplayExtrasPlacement({
  requiresPlacement: true,
  liveV7: { placement: live, evidencePath: 'accepted-v7/G01-provider-output.json' },
  synthetic: stale,
  syntheticPath: 'replay-fixture.ts:G01',
})
assert.deepEqual(overridden.placement, live, 'accepted V7 evidence overrides stale synthetic fixture')
assert.equal(overridden.source, 'LIVE_V7_PROVIDER_EVIDENCE')
assert.equal(overridden.modelSelectedBoundary, true)

for (const [goldenId, sourceBlockId] of [['G01', 'para-32'], ['G03', 'para-116'], ['G05', 'para-25']] as const) {
  const decision = selectReplayExtrasPlacement({
    requiresPlacement: true,
    liveV7: { placement: { sourceBlockId, side: 'after' }, evidencePath: `accepted-v7/${goldenId}-provider-output.json` },
  })
  assert.equal(decision.placement?.sourceBlockId, sourceBlockId, `${goldenId} accepted live placement`)
  assert.equal(decision.placement?.side, 'after')
  assert.equal(decision.source, 'LIVE_V7_PROVIDER_EVIDENCE')
}

const syntheticOnly = selectReplayExtrasPlacement({ requiresPlacement: true, synthetic: stale })
assert.equal(syntheticOnly.source, 'SYNTHETIC_OFFLINE_PLACEMENT')
assert.equal(syntheticOnly.modelSelectedBoundary, false, 'synthetic placement is never reported as model selected')

const noExtras = selectReplayExtrasPlacement({ requiresPlacement: false, synthetic: stale })
assert.equal(noExtras.placement, null)
assert.equal(noExtras.source, 'NOT_REQUIRED')

console.log('PASS accepted live V7 placement overrides stale synthetic fixtures with explicit provenance')
console.log('PASS G01/G03/G05 retain accepted V7 source block decisions')
console.log('PASS synthetic offline placement is never reported as model selected')
