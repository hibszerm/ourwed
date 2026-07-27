/**
 * Deterministic location + customer address rendering.
 * Run: npm run test:ai-contract-transform-location-rendering
 */

import {
  renderCustomerAddress,
  renderCustomerAddressWithZam,
  renderLocationAfterPreposition,
  renderLocationSummary,
  renderMultiLocationSummary,
  renderPreparationLocationClause,
  renderCeremonyLocationClause,
  renderReceptionLocationClause,
} from './locationRendering'
import { sanitizeDuplicatedLocationWrappers } from './normalize'
import { buildExpectationManifest } from './expectationManifest'
import { buildProtectedContractData } from '../protectedContractData'
import { runPostReconstructionQualityGate } from './buildQualityReport'
import {
  COMPLETENESS_DATASET,
  completenessSourceBlocks,
} from '../fixtures/completenessFixture'
import { blocksFromPlainParagraphs } from '../indexDocxForTransform'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function main() {
  const street = {
    fullAddress: 'ul. Michała Grażyńskiego 5, 41-810 Zabrze',
    city: 'Zabrze',
  }
  const venue = { displayName: 'Pałac Rydzyna', city: 'Rydzyna' }

  assert(
    renderLocationSummary(venue) === 'Pałac Rydzyna, Rydzyna',
    'venue summary',
  )
  assert(
    renderLocationSummary(street) === street.fullAddress,
    'street summary no pod adresem prefix',
  )
  assert(
    renderLocationAfterPreposition(street, 'preparation').startsWith(
      'pod adresem',
    ),
    'street after prep',
  )
  assert(
    renderLocationAfterPreposition(venue, 'reception').includes('obiekcie'),
    'venue neutral inflection',
  )

  const prep = renderPreparationLocationClause(street)
  assert(!/przygotowania:\s*pod adresem:/i.test(prep), 'no bad prep wrapper')
  assert(!/: pod adresem:/i.test(prep), 'no duplicate colon wrapper')

  const ceremony = renderCeremonyLocationClause({
    displayName: 'Bazylika św. Anny',
  })
  assert(!/pod adresem:\s*Bazylika/i.test(ceremony), 'no pod adresem Bazylika')

  const reception = renderReceptionLocationClause({
    fullAddress: 'Lwowska, 34-144 Izdebnik',
    city: 'Izdebnik',
  })
  assert(!/powitanie gości pod adresem:/i.test(reception), 'no welcome wrapper')
  assert(/pod adresem Lwowska/i.test(reception), 'reception street form')

  const multi = renderMultiLocationSummary({
    preparation: street,
    ceremony: { displayName: 'Bazylika św. Anny', city: 'Zabrze' },
    reception: { fullAddress: 'Lwowska, 34-144 Izdebnik', city: 'Izdebnik' },
  })
  assert(multi.includes('przygotowania:'), 'multi prep')
  assert(multi.includes('ceremonia:'), 'multi ceremony')
  assert(multi.includes('przyjęcie:'), 'multi reception')

  const addr = renderCustomerAddress(
    'Juliusza Słowackiego 6/17, 41-800 Zabrze, Polska',
  )
  assert(/^ul\./i.test(addr), 'ul prefix added')
  assert(!/Polska/i.test(addr), 'country stripped')
  assert(
    renderCustomerAddressWithZam(addr).startsWith('zam. ul.'),
    'zam. ul. form',
  )
  assert(
    renderCustomerAddress('ul. Testowa 1, 00-001 Warszawa').startsWith('ul.'),
    'keep existing ul',
  )

  const sanitized = sanitizeDuplicatedLocationWrappers(
    'przygotowania: pod adresem: pod adresem ul. Testowa 1',
  )
  assert(!/pod adresem:\s*pod adresem/i.test(sanitized), 'sanitizer')

  // Missing role when no template slot — review issue
  const plain = blocksFromPlainParagraphs([
    'Umowa bez lokalizacji.',
    'Wynagrodzenie 10 500 zł (słownie: dziesięć tysięcy pięćset złotych).',
    'Zadatek 1 000 zł. Pozostała kwota 9 500 zł.',
  ])
  const protectedData = buildProtectedContractData({ blocks: plain })
  const gate = runPostReconstructionQualityGate({
    sourceBlocks: plain,
    transformedBlocks: plain.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset: COMPLETENESS_DATASET,
    protectedData,
    mode: 'full_ai',
  })
  assert(
    gate.report.locationConsistency.missingRoles.length > 0 ||
      gate.report.reviewIssues.some(
        (i) => i.code === 'location_role_not_represented_in_template',
      ) ||
      gate.report.blockingIssues.some(
        (i) => i.code === 'expected_dataset_value_missing',
      ),
    'missing location role surfaced',
  )

  const source = completenessSourceBlocks()
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: COMPLETENESS_DATASET,
    protectedData: buildProtectedContractData({
      blocks: source,
      knownProviderValues: ['Studio Foto Test Sp. z o.o.'],
    }),
  })
  assert(
    m.requiredFields.some(
      (f) => f.canonicalField === 'wedding.preparationLocation',
    ),
    'prep required',
  )
  assert(
    m.requiredFields.some(
      (f) => f.canonicalField === 'wedding.ceremonyLocation',
    ),
    'ceremony required',
  )
  assert(
    m.requiredFields.some(
      (f) => f.canonicalField === 'wedding.receptionLocation',
    ),
    'reception required',
  )

  console.log('ok — ai-contract-transform-location-rendering')
}

main()
