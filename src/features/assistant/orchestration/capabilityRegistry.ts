/**
 * Assistant V3 capability registry — what OurWed can do (not how users ask).
 */

export const ASSISTANT_CAPABILITY_NAMES = [
  'search_weddings',
  'get_wedding_context',
  'get_wedding_participants',
  'get_wedding_places',
  'get_wedding_day_plan',
  'get_next_day_plan_stage',
  'get_wedding_finances',
  'get_wedding_tasks',
  'get_wedding_next_action',
  'collection_query',
  'calculate_route',
  'get_schedule',
  'search_sessions',
  'prepare_create_wedding',
  'prepare_create_task',
] as const

export type AssistantCapabilityName = (typeof ASSISTANT_CAPABILITY_NAMES)[number]

export type CapabilityMode = 'read' | 'prepare_write'

export type AssistantCapabilityDefinition = {
  name: AssistantCapabilityName
  description: string
  mode: CapabilityMode
  /** Short planner guidance. */
  whenToUse: string
  doesNot: string
  privacyClass: 'identity_meta' | 'structured_fact' | 'prepare_only'
}

export const ASSISTANT_CAPABILITY_REGISTRY: AssistantCapabilityDefinition[] =
  [
    {
      name: 'search_weddings',
      description: 'Find owned weddings by person/date query.',
      mode: 'read',
      whenToUse: 'Need to identify which wedding when no active wedding fits.',
      doesNot: 'Does not return places, money, or routes.',
      privacyClass: 'identity_meta',
    },
    {
      name: 'get_wedding_context',
      description: 'Load wedding identity label/date/partners for an owned wedding.',
      mode: 'read',
      whenToUse: 'Need display context for a resolved weddingRef.',
      doesNot: 'Does not return addresses or finances.',
      privacyClass: 'identity_meta',
    },
    {
      name: 'get_wedding_participants',
      description: 'List p1/p2 participant candidates for an owned wedding.',
      mode: 'read',
      whenToUse: 'Need participant keys for nickname/role resolution.',
      doesNot: 'Does not invent nicknames; model maps nicknames to keys.',
      privacyClass: 'identity_meta',
    },
    {
      name: 'get_wedding_places',
      description:
        'Authoritative wedding locations: bride/groom preparations, ceremony, reception.',
      mode: 'read',
      whenToUse:
        'User asks where something is. Use participantKey for prep. Use reception for "wesele".',
      doesNot: 'Does not calculate travel distance.',
      privacyClass: 'structured_fact',
    },
    {
      name: 'get_wedding_day_plan',
      description: 'Operational day-plan stages and times.',
      mode: 'read',
      whenToUse: 'Ceremony time, full plan, participant prep timing.',
      doesNot: 'Does not invent wedding customs.',
      privacyClass: 'structured_fact',
    },
    {
      name: 'get_next_day_plan_stage',
      description:
        'Next authoritative day-plan stage after a known stage (e.g. after preparations).',
      mode: 'read',
      whenToUse: '"potem", "później", "gdzie potem jadą" when discourse has a stage.',
      doesNot: 'Does not guess church→reception customs; uses ordered plan only.',
      privacyClass: 'structured_fact',
    },
    {
      name: 'get_wedding_finances',
      description: 'Canonical contract value / paid / remaining / deposit.',
      mode: 'read',
      whenToUse: 'Money questions for one wedding.',
      doesNot: 'Does not compute profit or fuel expense.',
      privacyClass: 'structured_fact',
    },
    {
      name: 'get_wedding_tasks',
      description: 'Active tasks for a wedding.',
      mode: 'read',
      whenToUse: 'Task list for a wedding.',
      doesNot: 'Does not create tasks.',
      privacyClass: 'structured_fact',
    },
    {
      name: 'get_wedding_next_action',
      description: 'Existing next-action business rule for a wedding.',
      mode: 'read',
      whenToUse: '"co dalej", "co muszę zrobić".',
      doesNot: 'Does not invent workflow steps.',
      privacyClass: 'structured_fact',
    },
    {
      name: 'collection_query',
      description:
        'Read-only QueryPlan: count/sum/min/max/list over weddings/sessions/assignments.',
      mode: 'read',
      whenToUse: 'Multi-wedding aggregates, ranking, filtered lists.',
      doesNot: 'Does not mutate CRM.',
      privacyClass: 'structured_fact',
    },
    {
      name: 'calculate_route',
      description:
        'READ-ONLY Google route: distance (+ duration) between studio start and a placeRef, or two placeRefs. Does not write travel_segments or travel fees.',
      mode: 'read',
      whenToUse:
        '"daleko", distance to preparations/ceremony/reception after places were resolved.',
      doesNot: 'Does not track fuel cost. Does not mutate travel fee state.',
      privacyClass: 'structured_fact',
    },
    {
      name: 'get_schedule',
      description:
        'Discover the photographer\'s assignments (weddings + sessions) for a date/phrase. Primary capability for first-person workday questions without a named wedding.',
      mode: 'read',
      whenToUse:
        'First-person temporal work: where/what today/tomorrow/weekend/date. Use BEFORE asking which wedding/person. Resource discovery for follow-up places/day-plan.',
      doesNot:
        'Does not ask "ślub czy osoba". Does not resolve participants. Prefer this over clarification when date scope is known.',
      privacyClass: 'structured_fact',
    },
    {
      name: 'search_sessions',
      description: 'Find owned sessions by person query.',
      mode: 'read',
      whenToUse: 'Session open/search.',
      doesNot: 'Does not return wedding places.',
      privacyClass: 'identity_meta',
    },
    {
      name: 'prepare_create_wedding',
      description: 'Prepare wedding create payload for UI confirmation.',
      mode: 'prepare_write',
      whenToUse: 'User asks to create a wedding.',
      doesNot: 'Does not mutate until user confirms in UI.',
      privacyClass: 'prepare_only',
    },
    {
      name: 'prepare_create_task',
      description: 'Prepare task create payload for UI confirmation.',
      mode: 'prepare_write',
      whenToUse: 'User asks to add a task.',
      doesNot: 'Does not mutate until user confirms in UI.',
      privacyClass: 'prepare_only',
    },
  ]

export function getCapability(
  name: string,
): AssistantCapabilityDefinition | null {
  return (
    ASSISTANT_CAPABILITY_REGISTRY.find((c) => c.name === name) ?? null
  )
}

export function capabilityCatalogForPlanner(): Array<{
  name: string
  description: string
  mode: string
  whenToUse: string
  doesNot: string
}> {
  return ASSISTANT_CAPABILITY_REGISTRY.map((c) => ({
    name: c.name,
    description: c.description,
    mode: c.mode,
    whenToUse: c.whenToUse,
    doesNot: c.doesNot,
  }))
}
