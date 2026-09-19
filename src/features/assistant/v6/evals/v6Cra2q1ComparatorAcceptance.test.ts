/**
 * V6-CRA2Q1 — Registry-derived comparator catalog + capability strictness.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { V6_CAPABILITY_REGISTRY_TEXT } from '../agent/requestedOperations'
import { V6_AGENT_SYSTEM_PROMPT } from '../agent/prompt'
import { checkTurnPlanCapability } from '../capability/checkTurnPlanCapability'
import {
  ALL_CONCEPT_KEYS,
  V6_BUSINESS_CONCEPTS,
  buildPlannerConceptCatalogText,
  getConcept,
  type ConceptKey,
} from '../registry'

function check(cond: unknown, msg: string): asserts cond {
  assert.ok(cond, msg)
}

const catalog = buildPlannerConceptCatalogText()

// C1 — every filterable concept appears with its allowed comparator shape.
const filterable = V6_BUSINESS_CONCEPTS.filter((c) => c.filterShape != null)
check(filterable.length > 0, 'C1: expected filterable concepts')
for (const concept of filterable) {
  const shape = Array.isArray(concept.filterShape)
    ? concept.filterShape.join('|')
    : String(concept.filterShape)
  check(
    catalog.includes(`${concept.key} —`),
    `C1: ${concept.key} missing from catalog`,
  )
  check(
    catalog.includes(`filter:${shape}`),
    `C1: ${concept.key} missing filter:${shape}`,
  )
}

// C2 — CONTACT name concepts expose contains.
check(
  /CONTACT\.BRIDE_NAME[^\n]*filter:contains/.test(catalog),
  'C2: BRIDE_NAME filter:contains',
)
check(
  /CONTACT\.GROOM_NAME[^\n]*filter:contains/.test(catalog),
  'C2: GROOM_NAME filter:contains',
)
check(
  !/CONTACT\.BRIDE_NAME[^\n]*filter:contains\|eq/.test(catalog) &&
    !/CONTACT\.BRIDE_NAME[^\n]*filter:eq/.test(catalog),
  'C2: BRIDE_NAME must not advertise eq',
)

// Planner prompt embeds catalog + comparator rule.
check(
  V6_CAPABILITY_REGISTRY_TEXT.includes('filter:contains'),
  'C1: capability registry embeds filter shapes',
)
check(
  V6_AGENT_SYSTEM_PROMPT.includes('CONTACT.BRIDE_NAME / CONTACT.GROOM_NAME use contains'),
  'C3 guidance: planner prompt teaches contains for names',
)

// C4 — boolean concept allows eq.
const deposit = getConcept('FIN.DEPOSIT_PAID')
check(deposit.filterShape != null, 'C4: FIN.DEPOSIT_PAID filterable')
const depShape = Array.isArray(deposit.filterShape)
  ? deposit.filterShape
  : [deposit.filterShape]
check(depShape.includes('eq'), 'C4: boolean uses eq')
check(catalog.includes('FIN.DEPOSIT_PAID') && catalog.includes('filter:'), 'C4 in catalog')

// C5 — money comparison allows numeric cmps.
const remaining = getConcept('FIN.REMAINING_TO_PAY')
const remShape = Array.isArray(remaining.filterShape)
  ? remaining.filterShape
  : [remaining.filterShape!]
check(remShape.includes('gt') && remShape.includes('gte'), 'C5: money numeric cmps')
check(/FIN\.REMAINING_TO_PAY[^\n]*filter:eq\|neq\|gt\|gte\|lt\|lte/.test(catalog), 'C5 catalog')

// C6 — capability gate still rejects invalid comparator.
const rejectEq = checkTurnPlanCapability({
  steps: [
    {
      id: 's1',
      kind: 'SEARCH_COLLECTION',
      search: {
        source: 'wedding',
        conceptFilters: [
          { concept: 'CONTACT.BRIDE_NAME', cmp: 'eq', value: 'Karolina' },
        ],
        relativeTemporal: null,
        sort: null,
        slice: null,
      },
    },
  ],
  output: { kind: 'COLLECTION', fromStep: 's1' },
})
check(rejectEq.verdict === 'UNSUPPORTED', 'C6: eq on name rejected')
check(
  String(rejectEq.detail).includes('conceptFilters') ||
    String(rejectEq.code).includes('concept'),
  'C6: detail identifies concept filter cmp',
)

const acceptContains = checkTurnPlanCapability({
  steps: [
    {
      id: 's1',
      kind: 'SEARCH_COLLECTION',
      search: {
        source: 'wedding',
        conceptFilters: [
          {
            concept: 'CONTACT.BRIDE_NAME' as ConceptKey,
            cmp: 'contains',
            value: 'Karolina',
          },
        ],
        relativeTemporal: null,
        sort: null,
        slice: null,
      },
    },
  ],
  output: { kind: 'COLLECTION', fromStep: 's1' },
})
check(acceptContains.verdict === 'SUPPORTED', 'C6: contains on name accepted')

// Edge catalog parity for filter shapes (V6 Edge / TurnPlan — wedding resource).
const edgeOps = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-assistant/v6RequestedOperations.ts'),
  'utf8',
)
const edgeFilterable = filterable.filter((c) => c.resource === 'WEDDING')
for (const concept of edgeFilterable) {
  const shape = Array.isArray(concept.filterShape)
    ? concept.filterShape.join('|')
    : String(concept.filterShape)
  check(
    edgeOps.includes(`${concept.key} —`) && edgeOps.includes(`filter:${shape}`),
    `C1 Edge: ${concept.key} filter:${shape}`,
  )
}
check(edgeOps.includes('never eq'), 'Edge teaches never eq for name filters')
check(ALL_CONCEPT_KEYS.length === 89, 'concept count frozen at 89')

console.log(
  `v6Cra2q1ComparatorAcceptance PASS (filterable=${filterable.length})`,
)
