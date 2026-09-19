/**
 * CRA2 — Registry completeness and capability-boundary acceptance.
 */

import assert from 'node:assert/strict'
import { WeddingReadContext } from '../adapters/WeddingReadContext'
import { inspectAdapters, inspectConcept } from '../adapters/inspectAdapters'
import { sessionInspectAdapters } from '../adapters/sessionInspectAdapters'
import { checkTurnPlanCapability } from '../capability/checkTurnPlanCapability'
import {
  ALL_CONCEPT_KEYS,
  ALL_RELATION_KEYS,
  DR1_SELECTOR_TO_CONCEPT,
  MONEY_MEASURE_TO_CONCEPT,
  V6_BUSINESS_CONCEPTS,
  buildPlannerConceptCatalogText,
  type ConceptKey,
} from '../registry'
import { V6_WEDDING_PLACE_DETAIL_SELECTORS } from '../detail/weddingPlaceDetail'
import type { Wedding } from '@/types/wedding'

let assertions = 0
function check(condition: unknown, message: string): asserts condition {
  assertions += 1
  assert.ok(condition, message)
}

const wedding = {
  id: 'cra2-registry',
  couple: {
    partner1: 'Anna',
    partner2: 'Jan',
    partner1Phone: '+48 500 100 200',
    partner2Phone: '+48 500 300 400',
    partner1Email: 'anna@example.test',
    partner2Email: 'jan@example.test',
    partner1Address: 'Kwiatowa 1',
    partner1PostalCode: '30-001',
    partner1City: 'Kraków',
    partner2Address: 'Leśna 2',
    partner2PostalCode: '30-002',
    partner2City: 'Kraków',
    email: '',
    phone: '',
    venue: '',
    city: 'Kraków',
  },
  date: '2027-06-12',
  ceremonyTime: '15:00',
  status: 'active',
  workflowStage: 'contract',
  packageName: 'Reportaż',
  price: 12_000,
  depositAmount: 2_000,
  currency: 'PLN',
  packageItems: [],
  coverageHours: 10,
  travelFeeStatus: 'charged',
  travelFeeAmount: 500,
  checklist: [],
  schedule: [],
  payments: [],
  finances: [],
  questionnaires: {
    contractData: { status: 'completed' },
    weddingQuestionnaire: { status: 'sent' },
  },
  contract: { status: 'signed' },
  notes: [],
  deliverables: [],
  timeline: [],
  accentColor: '#000000',
  createdAt: '2026-01-01T00:00:00.000Z',
} satisfies Wedding

const ctx = new WeddingReadContext(wedding.id, {
  seeded: {
    wedding,
    payments: [],
    contract: wedding.contract,
    tasks: [],
    sessions: [],
    extras: [],
    contacts: [],
    prewedding: null,
    operationalDay: {
      status: 'ok',
      weddingId: wedding.id,
      displayName: 'Anna i Jan',
      slots: [
        {
          role: 'ceremony',
          label: 'Ceremonia',
          name: 'Kościół św. Anny',
          address: 'Kwiatowa 3, Kraków',
          time: '15:00',
          participantKey: null,
        },
        {
          role: 'reception',
          label: 'Wesele',
          name: 'Dwór',
          address: 'Leśna 4, Kraków',
          time: '17:00',
          participantKey: null,
        },
        {
          role: 'bride_preparation',
          label: 'Przygotowania panny młodej',
          name: 'Dom panny młodej',
          address: 'Kwiatowa 1, Kraków',
          time: '11:00',
          participantKey: 'partner1',
        },
        {
          role: 'groom_preparation',
          label: 'Przygotowania pana młodego',
          name: 'Hotel',
          address: 'Leśna 2, Kraków',
          time: '12:00',
          participantKey: 'partner2',
        },
      ],
    },
  },
})

check(ALL_CONCEPT_KEYS.length === 89, 'ALL_CONCEPT_KEYS must remain frozen at 89')
check(
  V6_BUSINESS_CONCEPTS.length === 89,
  'V6_BUSINESS_CONCEPTS must remain frozen at 89',
)
check(
  new Set(ALL_CONCEPT_KEYS).size === ALL_CONCEPT_KEYS.length,
  'concept keys must be unique',
)

for (const concept of V6_BUSINESS_CONCEPTS) {
  const operations = concept.operations as readonly string[]
  if (concept.resource === 'SESSION') {
    check(
      typeof sessionInspectAdapters[concept.adapterId] === 'function' ||
        (operations.length === 1 &&
          operations[0] === 'list_related' &&
          'relationKey' in concept),
      `session adapter coverage missing for ${concept.key}`,
    )
  } else {
    check(
      typeof inspectAdapters[concept.adapterId] === 'function' ||
        (operations.length === 1 &&
          operations[0] === 'list_related' &&
          'relationKey' in concept),
      `adapter coverage missing for ${concept.key}`,
    )
  }
  if (operations.includes('filter')) {
    check('filterShape' in concept, `${concept.key} must define filterShape`)
  }
  if (operations.includes('sort')) {
    check(
      'sortKey' in concept && concept.sortKey === true,
      `${concept.key} must be a sort key`,
    )
  }
  if (operations.includes('list_related')) {
    check('relationKey' in concept, `${concept.key} must define relationKey`)
  }
  if ('relationKey' in concept) {
    check(
      ALL_RELATION_KEYS.includes(concept.relationKey),
      `${concept.key} has an unknown relationKey`,
    )
  }
  check(concept.privacy !== 'SENS', `${concept.key} must not expose SENS data`)
}

for (const concept of V6_BUSINESS_CONCEPTS) {
  if (concept.resource !== 'WEDDING') continue
  if (!(concept.operations as readonly string[]).includes('inspect')) continue
  const result = await inspectConcept(ctx, concept.key)
  check(result.valueType === concept.returnType, `${concept.key} is callable`)
}

const plannerCatalog = buildPlannerConceptCatalogText()
check(plannerCatalog.length > 0, 'planner catalog must not be empty')
for (const key of [
  'FIN.DEPOSIT_PAID',
  'CONTACT.BRIDE_PHONE',
  'PLACE.CEREMONY_ADDRESS',
]) {
  check(plannerCatalog.includes(key), `planner catalog must contain ${key}`)
}

const contactPrivateSuffixes = /_(phone|email|address)$/
for (const concept of V6_BUSINESS_CONCEPTS) {
  if (
    concept.key.startsWith('CONTACT.') &&
    contactPrivateSuffixes.test(concept.adapterId)
  ) {
    check(concept.privacy === 'PII', `${concept.key} must be PII`)
  }
}

check(
  Object.keys(DR1_SELECTOR_TO_CONCEPT).length === 8,
  'DR1 map must contain eight selectors',
)
for (const selector of V6_WEDDING_PLACE_DETAIL_SELECTORS) {
  check(
    typeof DR1_SELECTOR_TO_CONCEPT[selector] === 'string',
    `DR1 selector ${selector} must map to a concept`,
  )
}
assert.deepEqual(MONEY_MEASURE_TO_CONCEPT, {
  contract_value: 'FIN.CONTRACT_VALUE',
  paid_amount: 'FIN.TOTAL_PAID',
  remaining_amount: 'FIN.REMAINING_TO_PAY',
})
assertions += 1

function inspectPlan(concepts: unknown[]) {
  return {
    steps: [
      {
        id: 'inspect',
        kind: 'INSPECT_RESOURCE',
        inputFromStep: null,
        inputHandle: 'col_test',
        concepts,
      },
    ],
    output: { kind: 'DETAIL', fromStep: 'inspect' },
  }
}

check(
  checkTurnPlanCapability(inspectPlan(['UNKNOWN.CONCEPT'])).verdict ===
    'UNSUPPORTED',
  'unknown inspect concept must be rejected',
)
check(
  checkTurnPlanCapability({
    steps: [
      {
        id: 'filter',
        kind: 'TRANSFORM_COLLECTION',
        inputFromStep: null,
        inputHandle: 'col_test',
        ops: [
          {
            op: 'ConceptFilter',
            predicate: {
              concept: 'WORKFLOW.STAGE',
              cmp: 'eq',
              value: 'contract',
            },
          },
        ],
      },
    ],
    output: { kind: 'COLLECTION', fromStep: 'filter' },
  }).verdict === 'UNSUPPORTED',
  'WORKFLOW.STAGE filter must be rejected',
)
check(
  checkTurnPlanCapability(inspectPlan(['TASK.OPEN_LIST'])).verdict ===
    'UNSUPPORTED',
  'list-related-only TASK.OPEN_LIST inspect must be rejected',
)

// Compile-time reinforcement that registry keys are the closed ConceptKey union.
const typedKeys: readonly ConceptKey[] = ALL_CONCEPT_KEYS
check(typedKeys.length === 89, 'all keys must satisfy ConceptKey')

console.log(`v6Cra2RegistryAcceptance PASS (${assertions} checks)`)
