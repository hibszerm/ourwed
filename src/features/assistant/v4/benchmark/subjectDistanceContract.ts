/**
 * Phase 2.7 — Subject / distance / route semantic contract (frozen).
 * Interpretation-only. No capability execution.
 */

export const SUBJECT_DISTANCE_CONTRACT_V27 = {
  version: 'phase28-freeze-1',
  subjectMeaning:
    'subject = the domain thing whose property/action the user asks about (preparations, ceremony, reception, assignment, remaining, …).',
  distance: {
    oneEndpoint: {
      form: 'op=get_distance + subject=<domain target> + optional participant',
      examples: [
        'daleko mam na przygotowania Julii? → get_distance, preparations, participant Julia',
        'ile km na ceremonię? → get_distance, ceremony',
        'ile km na salę? → get_distance, reception',
      ],
      destinationQualifier:
        'NOT required when subject already names the single endpoint. destination=null is correct.',
      notRoute:
        'Do NOT use subject=route merely because the user said daleko/km/trasa do X.',
    },
    twoEndpoint: {
      form: 'op=get_distance + subject=<FROM domain target> + destination=<TO domain target>',
      examples: [
        'ile jest z przygotowań Julii na ceremonię? → get_distance, subject=preparations, participant=Julia, destination=ceremony',
        'jak daleko z kościoła na salę? → get_distance, subject=ceremony, destination=reception',
      ],
      note: 'Implicit photographer/studio start is NOT invented by the interpreter.',
    },
    ellipsis: {
      form: 'Previous domain target + "a daleko?" → get_distance (or inherit) preserving subject/participant via inherit refs',
    },
  },
  routeAsSubject: {
    validWhen:
      'User asks about the path/route itself: "pokaż trasę", "jaką trasą jadę?", "jaka jest trasa z A na B?"',
    invalidWhen:
      'User asks how far / how many km to a domain place — that is get_distance + domain subject.',
    keepSubjectRoute: true,
    reason: 'Needed for explicit route/path questions; not an internal execution synonym for distance.',
  },
  openBooking: {
    rule: '"otwórz wesele/ślub X" → subject=wedding (booking resource), not ceremony/reception place.',
  },
  workday: {
    rule: '"gdzie dzisiaj/w weekend jadę/jem?" → get_location assignment (photographer workday), not reception.',
  },
  equivalenceRules: [
    {
      id: 'one_endpoint_destination_optional',
      rule: 'For get_distance, if subject is preparations|ceremony|reception|assignment and destination is null, treat as equivalent to destination===subject when expectation required destination for one-endpoint cases.',
    },
    {
      id: 'ellipsis_inherit_vs_explicit_op',
      rule: 'When requireInheritSignal, op=inherit is equivalent to expected get_location|get_time|get_amount|get_distance if inherit signals present.',
    },
    {
      id: 'route_not_required_for_one_endpoint',
      rule: 'Expectations must prefer domain subject for one-endpoint distance; subject=route alone is not required.',
    },
  ],
  deicticTwoEndpoint: {
    form: 'Deictic FROM (stamtąd/stąd/tam) + explicit TO → subject=FROM (prior place), destination=TO',
    note: 'Prior preparations is SOURCE; current sala/przyjęcie/ceremonia is DESTINATION. Current TO must not be overwritten.',
  },
} as const
