/**
 * Quality fixes: client agreement, location policy, money words, multi-field,
 * location grammar warning, diff word boundaries.
 * Run: npm run test:ai-contract-transform-quality
 */

import { expectedClientAgreementForm } from './clientAgreement'
import { computeMinimalPhraseEdit, computeTextEdits } from './blockDiffEngine'
import {
  classifyRawEdit,
  multiFieldReplacementExplained,
} from './changeClassifier'
import { verifyGuardedTransformation } from './guardedVerifier'
import {
  hasPossibleLocationGrammarIssue,
  preferredLocationInsertionHint,
} from './locationInsertionPolicy'
import { polishContractMoneyWords } from './polishContractMoneyWords'
import { buildProtectedContractData } from './protectedContractData'
import {
  REAL_SHAPED_DATASET,
  SAMPLE_DATASET,
  fixtureBadPrzyUl,
  fixtureK_allowedOnly,
  fixtureRealShapedSourceBlocks,
  fixtureRealShapedTransformed,
  fixtureSourceBlocks,
} from './fixtures/transformFixtures'
import { sanitizeTransformationDataset } from './transformationDataset'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function main() {
  // --- 1. Client-count agreement ---
  assertEq(
    expectedClientAgreementForm({ personCount: 1, gender: 'female' }),
    'zwaną',
    'one female',
  )
  assertEq(
    expectedClientAgreementForm({ personCount: 1, gender: 'male' }),
    'zwanym',
    'one male',
  )
  assertEq(
    expectedClientAgreementForm({ personCount: 2 }),
    'zwani',
    'two clients',
  )

  const agreementEdit = classifyRawEdit({
    edit: {
      sourceStart: 0,
      sourceEnd: 5,
      sourceText: 'zwaną',
      replacementText: 'zwani',
    },
    dataset: SAMPLE_DATASET,
    protectedData: { exactProtectedValues: [], protectedPatterns: [] },
    mode: 'guarded',
  })
  assertEq(
    agreementEdit.classification,
    'allowed_grammatical_adjustment',
    'agreement allowed',
  )

  // --- 2. Location insertion policy ---
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

  // --- 3. Polish money words ---
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

  // --- 4. Multi-field client paragraph ---
  const source = fixtureSourceBlocks()
  const dataset = sanitizeTransformationDataset(SAMPLE_DATASET)
  const protectedData = buildProtectedContractData({
    blocks: source,
    blockTexts: source.map((b) => b.text),
    knownProviderValues: ['Studio Foto Test Sp. z o.o.'],
  })
  const k = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: fixtureK_allowedOnly(source),
    dataset,
    protectedData,
  })
  assert(
    k.status === 'safe_to_generate' || k.status === 'review_required',
    `K multi-field not blocked (was ${k.status})`,
  )
  assert(
    !k.blockingIssues.some((i) => i.startsWith('sentence_structure_change')),
    'no sentence_structure block on client para',
  )

  const clientSrc =
    'z Aleksandrą Biłas, zam. ul. Stara 1, 30-001 Kraków, tel. 603 306 423, zwaną dalej Parą Młodą'
  const clientTgt =
    'z Anną Kowalską i Janem Kowalskim, zam. ul. Przykładowa 12, 00-001 Warszawa, tel. 500 100 200, zwani dalej Parą Młodą'
  assert(
    multiFieldReplacementExplained({
      sourceText: clientSrc,
      replacementText: clientTgt,
      dataset,
    }),
    'multi-field explained',
  )
  const clientEdits = computeTextEdits(clientSrc, clientTgt)
  assert(clientEdits.length >= 2, `expected multiple edits, got ${clientEdits.length}`)

  // --- 5. Location grammar warning + ceremony review ---
  const realSource = fixtureRealShapedSourceBlocks()
  const realProtected = buildProtectedContractData({
    blocks: realSource,
    blockTexts: realSource.map((b) => b.text),
    knownProviderValues: ['Studio Foto Test Sp. z o.o.'],
  })
  const realDataset = sanitizeTransformationDataset(REAL_SHAPED_DATASET)
  const good = verifyGuardedTransformation({
    sourceBlocks: realSource,
    transformedBlocks: fixtureRealShapedTransformed(realSource),
    dataset: realDataset,
    protectedData: realProtected,
  })
  assert(
    good.status === 'safe_to_generate' || good.status === 'review_required',
    `real-shaped not blocked (was ${good.status})`,
  )
  assert(
    !good.blockingIssues.some((i) => i.startsWith('sentence_structure_change:para-0')),
    'client para not sentence-blocked',
  )
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

  const badPrzy = verifyGuardedTransformation({
    sourceBlocks: realSource,
    transformedBlocks: fixtureBadPrzyUl(realSource),
    dataset: realDataset,
    protectedData: realProtected,
  })
  assert(
    badPrzy.reviewIssues.some((i) =>
      i.includes('possible_location_grammar_issue'),
    ) ||
      badPrzy.diffs.some((d) =>
        d.changes.some(
          (c) => c.classification === 'possible_location_grammar_issue',
        ),
      ),
    'przy ul. → grammar warning',
  )
  assert(badPrzy.status !== 'safe_to_generate', 'bad przy ul. not auto-safe')

  // Ceremony long location → review or safe, not blocked for structure alone
  const ceremonyDiff = good.diffs.find((d) => d.blockId === 'para-3')
  if (ceremonyDiff) {
    for (const c of ceremonyDiff.changes) {
      assert(
        c.classification !== 'sentence_structure_change' ||
          c.severity !== 'blocking',
        'ceremony location not hard-blocked as sentence rewrite',
      )
    }
  }

  // --- 6. Diff boundary off-by-one ---
  const a = computeMinimalPhraseEdit('Retyrada', 'Polska')
  assert(a != null, 'edit exists')
  assertEq(a!.sourceText, 'Retyrada', 'final a preserved source')
  assertEq(a!.replacementText, 'Polska', 'final a preserved target')

  const pl = computeMinimalPhraseEdit('w Retyradzie', 'w Polsce')
  assert(pl != null, 'polish multibyte edit')
  assert(pl!.sourceText.includes('Retyradzie'), 'full polish source word')
  assert(pl!.replacementText.includes('Polsce'), 'full polish target word')

  const punct = computeMinimalPhraseEdit('Retyrada.', 'Polska.')
  assertEq(punct!.sourceText, 'Retyrada', 'punct after preserved via suffix')
  assertEq(punct!.replacementText, 'Polska', 'punct after target')
  assert(
    !punct!.sourceText.endsWith('Retyrad') || punct!.sourceText === 'Retyrada',
    'no truncated Retyrad',
  )

  console.log('ok — ai-contract-transform-quality')
}

main()
