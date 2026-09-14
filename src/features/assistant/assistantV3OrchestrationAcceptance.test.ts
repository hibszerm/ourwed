/**
 * Assistant V3 — deterministic orchestration / capability / correction acceptance.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const registry = read('src/features/assistant/orchestration/capabilityRegistry.ts')
const validate = read('src/features/assistant/orchestration/validateAgentPlan.ts')
const execute = read('src/features/assistant/orchestration/executeAgentPlan.ts')
const routeCap = read('src/features/assistant/capabilities/routeCapabilities.ts')
const dayCap = read('src/features/assistant/capabilities/dayPlanCapabilities.ts')
const semantic = read('src/features/assistant/api/executeSemantic.ts')
const prompt = read('supabase/functions/ai-assistant/prompt.ts')
const schema = read('supabase/functions/ai-assistant/schema.ts')
const types = read('src/features/assistant/types.ts')
const working = read('src/features/assistant/api/workingContext.ts')
const api = read('src/features/assistant/api/assistantApi.ts')

assert(registry.includes('calculate_route'), 'registry has calculate_route')
assert(registry.includes('get_next_day_plan_stage'), 'registry has next stage')
assert(registry.includes('collection_query'), 'registry has collection_query')
assert(!registry.includes('distance_to_preparations'), 'no phrase capability')

assert(validate.includes('ASSISTANT_MAX_PLAN_STEPS = 5'), 'max 5 steps')
assert(validate.includes('prepare_write'), 'write boundary check')

assert(routeCap.includes('travelProvider.getRoute'), 'route uses getRoute')
assert(routeCap.includes('studioTravelSettingsService'), 'studio origin')
assert(!routeCap.includes('travelService.getPlan'), 'no travel plan mutation')
assert(routeCap.includes('metersToDisplayKm'), 'canonical km display')

assert(dayCap.includes('buildOperationalDayStops'), 'day plan SoT')
assert(!dayCap.includes('usually go'), 'no custom inference')

assert(semantic.includes('matchParticipantByNameQuery'), 'participant precedence')
assert(
  semantic.includes('executeOnWedding(request, sessionContext.weddingId)') ||
    semantic.includes(
      'executeOnWedding(request, input.sessionContext.weddingId)',
    ),
  'false not-found bind to session',
)

assert(prompt.includes('domainKind=plan'), 'prompt plan')
assert(prompt.includes('calculate_route'), 'prompt route')
assert(prompt.includes('get_next_day_plan_stage'), 'prompt next stage')
assert(prompt.includes('pendingCorrection'), 'prompt corrections')
assert(prompt.includes('Polish'), 'prompt language')
assert(prompt.includes('data_not_tracked'), 'prompt fuel')

assert(schema.includes("'plan'"), 'schema plan kind')
assert(schema.includes('calculate_route'), 'schema capability')
assert(schema.includes('planGoal'), 'schema planGoal')
assert(schema.includes('steps'), 'schema steps')

assert(types.includes("kind: 'plan'"), 'types plan domain')
assert(types.includes("kind: 'route_distance'"), 'types route response')

assert(working.includes('pendingCorrection'), 'working context V3')
assert(working.includes('discourseFocus'), 'discourseFocus')
assert(working.includes('lastResolvedRequest'), 'lastResolvedRequest')

assert(api.includes('executeAssistantAgentPlan'), 'api executes plans')
assert(execute.includes('executeAssistantAgentPlan'), 'executor exists')
assert(execute.includes("capability === 'calculate_route'"), 'exec route')
assert(execute.includes("capability === 'get_next_day_plan_stage'"), 'exec next')

// Runtime validation of plan DSL
const { validateAssistantAgentPlan } = await import(
  './orchestration/validateAgentPlan.ts'
)

const good = validateAssistantAgentPlan({
  kind: 'plan',
  goal: 'distance to julia prep',
  steps: [
    {
      id: 's1',
      capability: 'get_wedding_places',
      input: {
        personQuery: 'Julia',
        dateHint: '11.09',
        scope: 'preparations',
        participantKey: 'p1',
      },
    },
    {
      id: 's2',
      capability: 'calculate_route',
      input: { originKind: 'studio_start' },
      dependsOn: ['s1'],
    },
  ],
})
assert(good?.steps.length === 2, 'valid distance plan')

const tooLong = validateAssistantAgentPlan({
  kind: 'plan',
  goal: 'x',
  steps: Array.from({ length: 6 }, (_, i) => ({
    id: `s${i}`,
    capability: 'get_schedule',
    input: { datePhrase: 'dziś' },
  })),
})
assert(tooLong === null, 'reject >5 steps')

const writeMiddle = validateAssistantAgentPlan({
  kind: 'plan',
  goal: 'x',
  steps: [
    {
      id: 's1',
      capability: 'prepare_create_task',
      input: { title: 'x' },
    },
    {
      id: 's2',
      capability: 'get_wedding_places',
      input: { scope: 'all' },
    },
  ],
})
assert(writeMiddle === null, 'prepare_write must be last')

const sql = validateAssistantAgentPlan({
  kind: 'plan',
  goal: 'hack',
  steps: [
    {
      id: 's1',
      capability: 'search_weddings',
      input: { ownerId: 'x' },
    },
  ],
})
assert(sql === null, 'reject ownerId')

const unknownCap = validateAssistantAgentPlan({
  kind: 'plan',
  goal: 'x',
  steps: [
    {
      id: 's1',
      capability: 'distance_to_julia',
      input: {},
    },
  ],
})
assert(unknownCap === null, 'reject unknown capability')

console.log('assistantV3OrchestrationAcceptance: PASS')
