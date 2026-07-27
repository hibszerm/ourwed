/**
 * Financial consistency verifier.
 * Run: npm run test:ai-contract-transform-financial-consistency
 */

import { polishContractMoneyWords } from '../polishContractMoneyWords'
import { buildProtectedContractData } from '../protectedContractData'
import { verifyFinancialConsistency } from './financialConsistency'
import { runPostReconstructionQualityGate } from './buildQualityReport'
import {
  COMPLETENESS_DATASET,
  completenessFullyCorrected,
  completenessPartialUnsafe,
  completenessSourceBlocks,
} from '../fixtures/completenessFixture'
import { blocksFromPlainParagraphs } from '../indexDocxForTransform'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function main() {
  assert(
    polishContractMoneyWords(10_500) === 'dziesięć tysięcy pięćset złotych',
    '10 500 words',
  )
  assert(
    polishContractMoneyWords(1_000) === 'tysiąc złotych',
    '1000 not jeden tysiąc',
  )

  const source = completenessSourceBlocks()
  const protectedData = buildProtectedContractData({
    blocks: source,
    knownProviderValues: ['Studio Foto Test Sp. z o.o.'],
  })

  const bad = verifyFinancialConsistency({
    dataset: COMPLETENESS_DATASET,
    transformedBlocks: completenessPartialUnsafe(source),
  })
  assert(
    bad.issues.some((i) => i.code === 'payment_structure_mismatch'),
    'one-time vs deposit',
  )
  assert(bad.summary.status === 'fail', 'financial fail')

  const good = verifyFinancialConsistency({
    dataset: COMPLETENESS_DATASET,
    transformedBlocks: completenessFullyCorrected(source),
  })
  assert(good.summary.totalPriceMatches, 'total matches')
  assert(good.summary.moneyWordsMatch, 'words match')
  assert(good.summary.depositMatches === true, 'deposit matches')
  assert(good.summary.remainingMatches === true, 'remaining matches')
  assert(good.summary.paymentStructureMatches === true, 'structure matches')
  assert(good.summary.status === 'pass', 'financial pass')

  // Arithmetic mismatch in dataset itself
  const arith = verifyFinancialConsistency({
    dataset: {
      ...COMPLETENESS_DATASET,
      finances: {
        ...COMPLETENESS_DATASET.finances,
        remainingFormatted: '8 000 zł',
      },
    },
    transformedBlocks: completenessFullyCorrected(source),
  })
  assert(
    arith.issues.some((i) => i.code === 'payment_arithmetic_mismatch'),
    'arithmetic',
  )

  // Price without package scope → review
  const priceOnly = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: completenessFullyCorrected(source),
    dataset: COMPLETENESS_DATASET,
    protectedData,
    mode: 'full_ai',
  })
  assert(
    priceOnly.report.businessConsistency.packageScopeIssues.some(
      (i) => i.code === 'price_changed_without_explicit_service_scope',
    ) ||
      priceOnly.report.reviewIssues.some(
        (i) => i.code === 'price_changed_without_explicit_service_scope',
      ),
    'price without scope review',
  )

  // Explicit scope mismatch (price changed, table unchanged)
  const withScope = runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: completenessFullyCorrected(source),
    dataset: {
      ...COMPLETENESS_DATASET,
      package: {
        name: 'Foto Standard',
        explicitServiceScope: {
          rows: [{ material: 'Film 4K', duration: '12 min', included: 'Tak' }],
        },
      },
    },
    protectedData,
    mode: 'guarded',
  })
  assert(
    withScope.report.blockingIssues.some(
      (i) => i.code === 'package_scope_mismatch',
    ),
    'package_scope_mismatch blocking',
  )
  assert(!withScope.downloadAllowed, 'Mode B blocks scope mismatch')

  // Money words mismatch — deposit clause uses total words
  const wrongDepositWords = blocksFromPlainParagraphs([
    'Wynagrodzenie 10 500 zł (słownie: dziesięć tysięcy pięćset złotych).',
    'Zadatek 1 000 zł (słownie: dziesięć tysięcy pięćset złotych).',
    'Pozostała kwota 9 500 zł (słownie: dziewięć tysięcy pięćset złotych).',
  ])
  const depositWordsCheck = verifyFinancialConsistency({
    dataset: COMPLETENESS_DATASET,
    transformedBlocks: wrongDepositWords.map((b) => ({
      blockId: b.blockId,
      text: b.text,
    })),
  })
  assert(
    depositWordsCheck.issues.some(
      (i) =>
        i.code === 'money_words_mismatch' &&
        i.canonicalField === 'contract.depositAmount',
    ),
    'deposit paired with total words → money_words_mismatch',
  )

  console.log('ok — ai-contract-transform-financial-consistency')
}

main()
