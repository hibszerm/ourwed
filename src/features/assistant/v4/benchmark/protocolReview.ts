/**
 * Phase 2.6 — Correction protocol validity review (analysis only).
 * Frozen before model A/B. Does NOT change TaskSpec / resolver / prompt.
 *
 * Question: must every correction emit op=correction + patch?
 */

export type CorrectionProtocolClass =
  | 'strict_patch_required'
  | 'functional_equivalence_possible'
  | 'negative_not_correction'

export const CORRECTION_PROTOCOL_REVIEW = {
  version: 'phase26-freeze-1',
  summary: {
    everyCorrectionRequiresOpCorrection: false,
    reason:
      'Metric-only swaps under the same get_amount family can often be expressed as an explicit new get_amount subject with inherit resource/temporal, yielding the same resolver end-state. Participant and temporal collection corrections usually require patch/inherit of the prior op+scope.',
  },
  classes: {
    participant: {
      class: 'strict_patch_required' as CorrectionProtocolClass,
      why:
        'Omitted preparations/location scope must survive (e.g. Bartek→Maks). Standalone get_location(Maks) without preparations loses critical context.',
      examples: ['miałem na myśli Maksa', 'nie Julia, Maks', 'nie o Julkę mi chodzi'],
    },
    temporal_collection: {
      class: 'strict_patch_required' as CorrectionProtocolClass,
      why:
        'Prior count/list/rank + subject must survive; only temporal changes (sierpień→wrzesień).',
      examples: ['nie sierpień, wrzesień', 'źle powiedziałem, wrzesień'],
    },
    temporal_schedule: {
      class: 'strict_patch_required' as CorrectionProtocolClass,
      why:
        'Prior assignment/schedule op+subject should survive; temporal-only patch is the clean encoding.',
      examples: ['nie jutro, w sobotę', 'wróć, miałem na myśli sobotę'],
    },
    metric_same_family: {
      class: 'functional_equivalence_possible' as CorrectionProtocolClass,
      why:
        'Previous get_amount(contract_value|remaining) + "nie wartość, tylko wpłaty" can be safely represented as get_amount(paid) + inherit resource/temporal. Relational op=correction is preferred for WorkingContext continuity, but end-state after merge can match.',
      examples: [
        'nie wartość, tylko ile wpłacili',
        'nie ile zostało, tylko ile już dali',
        'bardziej chodziło mi o to ile już dostałem',
      ],
      safeEquivalentShape:
        'get_amount + subject=paid|payment|deposit + resource inherit/active_resource',
    },
    stage_subject: {
      class: 'strict_patch_required' as CorrectionProtocolClass,
      why:
        'Subject swap under same location/time op (ceremony→reception) should keep resource binding; patch is safest.',
      examples: ['nie ceremonię, salę', 'nie sala, kościół'],
    },
    resource_rank: {
      class: 'strict_patch_required' as CorrectionProtocolClass,
      why:
        'Rank metric swap or resource retarget must preserve collection/rank structure.',
      examples: ['nie najdroższe, tylko z największą dopłatą', 'nie tę parę, tę drugą'],
    },
    negative_followup: {
      class: 'negative_not_correction' as CorrectionProtocolClass,
      why:
        'Explicit new facet with "a …?" is a new request / override, not a repair of prior meaning.',
      examples: [
        'a ile już wpłacili?',
        'a ceremonia gdzie?',
        'a w sobotę?',
        'a termin?',
      ],
    },
  },
  scoringPolicy: {
    relationalCorrectionAccuracy:
      'op===correction (+ patch slot/value). Used for correctionDetection/Precision/Recall/F1/Patch.',
    functionalEndStateAccuracy:
      'Would merge/resolve yield the intended final semantic request? Accepts dual shapes only for metric_same_family when inherit/resource is preserved.',
    doNotLoosenRelationalGates:
      'Phase 3 still prefers relational encoding; equivalence is diagnostic, not a free pass on correctionDetection.',
  },
} as const

/** Metric subjects that may safely swap via explicit get_amount + inherit. */
export const METRIC_EQUIVALENCE_SUBJECTS = new Set([
  'paid',
  'payment',
  'deposit',
  'remaining',
  'contract_value',
])
