/**
 * Client address / phone boundary refinement tests.
 * Run: npm run test:client-contact-boundary-refinement
 */

import {
  refineClientAddressBoundary,
  refineClientPhoneBoundary,
} from './clientContactBoundaryRefinement'
import { resolveExactSpan } from './mappingBoundaryResolver'
import { NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import type { StructuredAiFieldProposal } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function proposal(
  fieldKey: StructuredAiFieldProposal['fieldKey'],
  exactValue: string,
): StructuredAiFieldProposal {
  return {
    fieldKey,
    blockId: 'client-cell',
    exactValue,
    evidenceText: NOWICCY_FIXTURE.clientContactCell,
    contextBefore: '',
    contextAfter: '',
    semanticRole: 'test',
    confidence: 'high',
    reasoning: 'test',
    pairedFieldGroup: null,
  }
}

async function main() {
  const cell = NOWICCY_FIXTURE.clientContactCell

  const address = refineClientAddressBoundary({
    aiExactValue: 'zam. os. Piastowskie 5/9, 61-136 Poznań',
    blockText: cell,
  })
  assert(address?.resolvedExactValue === 'os. Piastowskie 5/9, 61-136 Poznań', '13 strip zam.')
  assert(address?.resolutionMethod === 'refined_by_validator', '13 refined')

  const phone = refineClientPhoneBoundary({
    aiExactValue: 'tel. 502 118 774',
    blockText: cell,
  })
  assert(phone?.resolvedExactValue === '502 118 774', '14 strip tel.')

  const names = resolveExactSpan({
    proposal: proposal('couple_full_names', NOWICCY_FIXTURE.clientParty),
    blockText: cell,
  })
  const addressSpan = resolveExactSpan({
    proposal: proposal('client_address', 'zam. os. Piastowskie 5/9, 61-136 Poznań'),
    blockText: cell,
  })
  const phoneSpan = resolveExactSpan({
    proposal: proposal('client_phone', '502 118 774'),
    blockText: cell,
  })
  assert(names.span.status === 'resolved', 'names resolved')
  assert(addressSpan.span.status === 'resolved', 'address resolved')
  assert(phoneSpan.span.status === 'resolved', 'phone resolved')

  const ranges = [
    names.span,
    addressSpan.span,
    phoneSpan.span,
  ].filter((s) => s.status === 'resolved')
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i]!
      const b = ranges[j]!
      const overlap = a.start! < b.end! && b.start! < a.end!
      assert(!overlap, '15 non-overlapping bindings')
    }
  }

  assert(cell.includes(', zam. '), '16 preserves zam label')
  assert(cell.includes(', tel. '), '16 preserves tel label')

  console.log('ok — clientContactBoundaryRefinement')
}

void main()
