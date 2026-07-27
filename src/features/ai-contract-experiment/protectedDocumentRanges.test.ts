/**
 * Protected document range detection tests.
 * Run: npm run test:protected-document-ranges
 */

import { extractBankAccountRanges } from './bankAccountDetector'
import { NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import { protectedRangesForBlock } from './protectedDocumentRanges'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

async function main() {
  const para37 = NOWICCY_FIXTURE.para37Remuneration
  const accounts = extractBankAccountRanges(para37)
  assert(accounts.length === 1, 'bank account detected')
  assert(
    accounts[0]!.sourceText === NOWICCY_FIXTURE.providerBankAccountMixed,
    'exact account text',
  )

  const moneyStart = para37.indexOf('6 000 zł')
  const accountStart = para37.indexOf(NOWICCY_FIXTURE.providerBankAccountMixed)
  assert(moneyStart < accountStart, 'amount before account')

  const ranges = protectedRangesForBlock({
    blockId: 'para-37',
    text: para37,
    immutableFindings: [
      {
        blockId: 'para-37',
        sourceText: para37,
        classification: 'package_fact',
        reason: 'overbroad',
      },
    ],
  })
  const bank = ranges.find((r) => r.classification === 'provider_bank_account')
  assert(Boolean(bank), 'protected bank range')
  assert(
    !ranges.some((r) => r.start === 0 && r.end >= para37.length - 1),
    'no whole-paragraph protection',
  )

  const wordsStart = para37.indexOf('sześć tysięcy złotych')
  const wordsEnd = wordsStart + 'sześć tysięcy złotych'.length
  const moneyEnd = moneyStart + '6 000 zł'.length
  assert(!(moneyEnd > bank!.start && moneyStart < bank!.end), 'money outside bank')
  assert(!(wordsEnd > bank!.start && wordsStart < bank!.end), 'words outside bank')

  console.log('ok — protectedDocumentRanges')
}

void main()
