/**
 * Template shape requirements tests.
 * Run: npm run test:template-shape-requirements
 */

import { approveAllValidMappings } from './experimentalMappingApproval'
import {
  minimalExperimentResult,
  nowiccyEightPendingMappings,
} from './experimentalTestFixtures'
import { deriveExperimentalTemplateRequirements } from './templateShapeRequirements'
import { evaluateExperimentalMappingReadiness } from './mappingReadiness'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  const mappings = nowiccyEightPendingMappings()
  const result = minimalExperimentResult(mappings)
  const allApproved = approveAllValidMappings(mappings)

  const requirements = deriveExperimentalTemplateRequirements({
    blocks: result.indexedBlocks,
    mappings: allApproved,
    response: result.structuredMapping,
  })

  assert(
    requirements.universallyRequired.includes('couple_full_names'),
    'universal couple',
  )
  assert(
    requirements.conditionalRequired.some((c) => c.fieldKey === 'client_address'),
    '8 client address conditional',
  )
  assert(
    requirements.conditionalRequired.some((c) => c.fieldKey === 'client_phone'),
    '9 client phone conditional',
  )
  assert(
    requirements.conditionalRequired.some((c) => c.fieldKey === 'reception_location'),
    'reception conditional',
  )
  assert(
    !requirements.conditionalRequired.some((c) => c.fieldKey === 'preparation_location'),
    'preparation not required',
  )
  assert(
    !requirements.conditionalRequired.some((c) => c.fieldKey === 'ceremony_location'),
    'ceremony not required',
  )
  assert(
    requirements.stageLabelsOnly.some((s) => s.fieldKey === 'preparation_location'),
    'preparation stage label',
  )
  assert(
    requirements.stageLabelsOnly.some((s) => s.fieldKey === 'ceremony_location'),
    'ceremony stage label',
  )

  const readiness = evaluateExperimentalMappingReadiness({
    blocks: result.indexedBlocks,
    response: result.structuredMapping,
    mappings: allApproved,
  })
  assertEq(readiness, 'ready', '13 nowiccy ready')

  console.log('ok — templateShapeRequirements')
}

void main()
