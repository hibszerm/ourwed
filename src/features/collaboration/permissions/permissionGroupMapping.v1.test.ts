import assert from 'node:assert/strict'
import {
  PERMISSION_GROUP_MAPPING_V1,
  PERMISSION_GROUP_MAPPING_VERSION,
} from './permissionGroupMapping.v1'

const registryKeys = new Set([
  'wedding.identity',
  'places.address',
  'places.structure',
  'places.location_resolution',
  'schedule.operational_time',
  'schedule.timeline',
  'schedule.completion',
  'brief.curated',
  'brief.artifact',
  'tasks',
  'notes',
  'travel.route',
  'travel.commercial',
])

assert.equal(PERMISSION_GROUP_MAPPING_VERSION, '1')
const groups = Object.values(PERMISSION_GROUP_MAPPING_V1).flat()
assert.equal(new Set(groups).size, groups.length, 'v1 groups cannot overlap')
assert.ok(groups.every((key) => registryKeys.has(key)), 'every group key exists in the registry contract')
assert.deepEqual(PERMISSION_GROUP_MAPPING_V1.places_and_times, [
  'places.address',
  'schedule.operational_time',
])
assert.deepEqual(PERMISSION_GROUP_MAPPING_V1.schedule, ['schedule.timeline', 'schedule.completion'])
assert.ok(!PERMISSION_GROUP_MAPPING_V1.schedule.includes('schedule.operational_time' as never))
assert.deepEqual(PERMISSION_GROUP_MAPPING_V1.travel_plan, ['travel.route'])
assert.ok(!PERMISSION_GROUP_MAPPING_V1.travel_plan.includes('travel.commercial' as never))
assert.ok(!groups.includes('places.structure' as never), 'future place structure cannot silently join v1')
assert.ok(!groups.includes('places.location_resolution' as never), 'future location resolution cannot silently join v1')
assert.ok(!groups.includes('brief.artifact' as never), 'future artifact access cannot silently join v1')

console.log('permissionGroupMapping.v1: PASS')
