/**
 * Production quality helpers: location policy, money words, fixture integrity.
 * Run: npm run test:ai-contract-transform-quality
 */

import {
  hasPossibleLocationGrammarIssue,
  preferredLocationInsertionHint,
} from './locationInsertionPolicy'
import { polishContractMoneyWords } from './polishContractMoneyWords'
import {
  REAL_SHAPED_DATASET,
  fixtureBadPrzyUl,
  fixtureRealShapedSourceBlocks,
  fixtureRealShapedTransformed,
} from './fixtures/transformFixtures'
import { sanitizeTransformationDataset } from './transformationDataset'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  // --- Location insertion policy ---
  assertEq(
    preferredLocationInsertionHint({
      fullAddress: 'ul. Lwowska, 34-144 Izdebnik',
    }),
    'pod_adresem',
    'raw address → pod adresem',
  )
  assertEq(
    preferredLocationInsertionHint({ displayName: 'Pałac w Izdebniku' }),
    'display_name',
    'venue name',
  )
  assert(hasPossibleLocationGrammarIssue('przy ul. Lwowska'), 'przy ul. warn')
  assert(
    !hasPossibleLocationGrammarIssue(
      'pod adresem: ul. Lwowska, 34-144 Izdebnik',
    ),
    'pod adresem ok',
  )

  // --- Polish money words ---
  assertEq(polishContractMoneyWords(1000), 'tysiąc złotych', '1000')
  assertEq(polishContractMoneyWords(2000), 'dwa tysiące złotych', '2000')
  assertEq(polishContractMoneyWords(5000), 'pięć tysięcy złotych', '5000')
  assertEq(
    polishContractMoneyWords(10_500),
    'dziesięć tysięcy pięćset złotych',
    '10500',
  )
  assertEq(
    polishContractMoneyWords(21_000),
    'dwadzieścia jeden tysięcy złotych',
    '21000',
  )
  assert(
    !polishContractMoneyWords(1000).includes('jeden tysiąc'),
    'no jeden tysiąc',
  )

  // --- Real-shaped fixture integrity (no Mode B verifier) ---
  const realSource = fixtureRealShapedSourceBlocks()
  sanitizeTransformationDataset(REAL_SHAPED_DATASET)
  const transformedJoined = fixtureRealShapedTransformed(realSource)
    .map((b) => b.text)
    .join('\n')
  assert(transformedJoined.includes('zwani dalej'), 'agreement zwani')
  assert(
    transformedJoined.includes('pod adresem: ul. Michała Grażyńskiego'),
    'prep pod adresem',
  )
  assert(
    transformedJoined.includes('pod adresem: ul. Lwowska'),
    'reception pod adresem',
  )
  assert(!transformedJoined.includes('przy ul. Lwowska'), 'no przy ul. Lwowska')
  assert(transformedJoined.includes('tysiąc złotych'), 'deposit words')
  assert(transformedJoined.includes('Studio Foto Test Sp. z o.o.'), 'provider kept')
  assert(transformedJoined.includes('12 3456 7890'), 'bank kept')
  assert(transformedJoined.includes('800 zł'), 'hour rate kept')
  assert(
    transformedJoined.includes('Kodeksu cywilnego'),
    'legal clause kept',
  )

  const badPrzyJoined = fixtureBadPrzyUl(realSource)
    .map((b) => b.text)
    .join('\n')
  assert(hasPossibleLocationGrammarIssue(badPrzyJoined), 'bad przy ul. flagged')

  console.log('ok — ai-contract-transform-quality')
}

main()
