/**
 * Regression: address formatting, preparation locations, money-words repair,
 * generation progress UX contracts.
 *
 * Run: npm run test:contract-generation-quality-fixes
 */

import { stagesToChecklist, LONG_RUNNING_HINT_MS } from '@/features/documents/contract-experience/generationProgressState'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { repairMoneyWordsInText } from '@/features/ai-contract-transform/quality/deterministicRepairs'
import { verifyFinancialConsistency } from '@/features/ai-contract-transform/quality/financialConsistency'
import { polishContractMoneyWords } from '@/features/ai-contract-transform/polishContractMoneyWords'
import { buildContractTransformationDataset } from '@/features/ai-contract-transform/transformationDataset'
import {
  formatPolishPostalAddress,
  hasDuplicatedPostalCity,
} from '@/lib/utils/formatPolishPostalAddress'
import {
  buildPreparationLocationEntries,
  formatPreparationLocationsDisplayText,
} from '@/lib/utils/preparationLocations'
import { amountToWordsPl } from '@/lib/utils/amountToWordsPl'
import { buildReferenceWedding } from '@/lib/dev/referenceWedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

run('A. active progress checklist states + long-running threshold', () => {
  const stages = [
    { id: 'a', label: 'One' },
    { id: 'b', label: 'Sprawdzamy poprawność dokumentu' },
    { id: 'c', label: 'Done' },
  ]
  const mid = stagesToChecklist(stages, 1, false)
  assertEq(mid[0]!.state, 'done', 'prev done')
  assertEq(mid[1]!.state, 'current', 'current')
  assertEq(mid[2]!.state, 'upcoming', 'upcoming')
  const finished = stagesToChecklist(stages, 2, true)
  assertEq(finished[2]!.state, 'done', 'last done when pipeline done')
  assert(LONG_RUNNING_HINT_MS >= 8000 && LONG_RUNNING_HINT_MS <= 10_000, 'hint ms')

  const checklistSrc = readFileSync(
    resolve('src/features/documents/contract-experience/AnimatedChecklist.tsx'),
    'utf8',
  )
  assert(checklistSrc.includes('LoaderCircle'), 'spinner icon')
  assert(checklistSrc.includes('stageSpin'), 'spin class')
  assert(checklistSrc.includes('prefersReduced'), 'reduced motion branch')

  const overlaySrc = readFileSync(
    resolve(
      'src/features/documents/contract-experience/ContractGenerationOverlay.tsx',
    ),
    'utf8',
  )
  assert(overlaySrc.includes('LONG_RUNNING_HINT_MS'), 'uses hint constant')
  assert(overlaySrc.includes('clearTimeout'), 'cleans timer')
  assert(
    overlaySrc.includes('generation-long-running-hint'),
    'hint test id',
  )
})

run('B. no duplicated postal code / city', () => {
  const structured = formatPolishPostalAddress({
    street: 'Wincentego Witosa',
    buildingNumber: '14',
    postalCode: '44-100',
    city: 'Gliwice',
  })
  assertEq(structured, 'ul. Wincentego Witosa 14, 44-100 Gliwice', 'structured')
  assert(!structured.includes('44-100 Gliwice, 44-100'), 'no dup structured')

  const fromFull = formatPolishPostalAddress({
    fullAddress: 'ul. Wincentego Witosa 14, 44-100 Gliwice',
    postalCode: '44-100',
    city: 'Gliwice',
  })
  assertEq(fromFull, 'ul. Wincentego Witosa 14, 44-100 Gliwice', 'full + extras')
  assert(
    !hasDuplicatedPostalCity(fromFull),
    'formatter output not duplicated',
  )
  assert(
    hasDuplicatedPostalCity(
      'ul. Wincentego Witosa 14, 44-100 Gliwice, 44-100, Gliwice',
    ),
    'detects reported duplication',
  )
})

run('C. two preparation locations preserved', () => {
  const bride = '3 Maja 66, 41-800 Zabrze'
  const groom = 'ul. Korfantego 10, 40-001 Katowice'
  const entries = buildPreparationLocationEntries({
    bridePreparationLocation: bride,
    groomPreparationLocation: groom,
    preparationLocation: bride,
  })
  assertEq(entries.length, 2, 'two entries')
  assertEq(entries[0]!.person, 'bride', 'bride')
  assertEq(entries[1]!.person, 'groom', 'groom')
  const display = formatPreparationLocationsDisplayText(entries)
  assert(display.includes('Panny Młodej'), 'bride label')
  assert(display.includes('Pana Młodego'), 'groom label')
  assert(display.includes('Zabrze'), 'bride addr')
  assert(display.includes('Katowice'), 'groom addr')

  const shared = buildPreparationLocationEntries({
    bridePreparationLocation: bride,
    groomPreparationLocation: bride,
    preparationLocation: bride,
  })
  assertEq(shared.length, 1, 'shared collapses')
  assertEq(shared[0]!.person, 'shared', 'shared person')

  const onlyBride = buildPreparationLocationEntries({
    bridePreparationLocation: bride,
    groomPreparationLocation: undefined,
    preparationLocation: bride,
  })
  assertEq(onlyBride.length, 1, 'only bride')

  const wedding = buildReferenceWedding({
    bridePreparationLocation: bride,
    groomPreparationLocation: groom,
    preparationLocation: bride,
  })
  const ds = buildContractTransformationDataset({
    wedding,
    package: { id: 'p', name: 'Video' },
    currentDate: '2026-07-01',
  })
  assertEq(ds.locations.preparationLocations?.length, 2, 'dataset both')
  assert(
    Boolean(ds.locations.preparationDisplayText?.includes('Katowice')),
    'dataset display has groom',
  )
})

run('D. independent amount words in dataset + repair', () => {
  const wedding = buildReferenceWedding({
    price: 11400,
    depositAmount: 1000,
    payments: [],
  })
  const ds = buildContractTransformationDataset({
    wedding,
    package: { id: 'p', name: 'Video' },
    currentDate: '2026-07-01',
  })
  assertEq(ds.finances.contractValueFormatted.includes('11 400'), true, 'total fmt')
  assertEq(ds.finances.depositFormatted?.includes('1 000'), true, 'deposit fmt')
  assertEq(ds.finances.remainingFormatted?.includes('10 400'), true, 'remaining fmt')

  const totalWords = polishContractMoneyWords(11400)
  const depositWords = polishContractMoneyWords(1000)
  const remainingWords = polishContractMoneyWords(10400)
  assertEq(ds.finances.contractValueWords, totalWords, 'total words')
  assertEq(ds.finances.depositWords, depositWords, 'deposit words')
  assertEq(ds.finances.remainingWords, remainingWords, 'remaining words')
  assert(totalWords !== depositWords, 'total ≠ deposit')
  assert(totalWords !== remainingWords, 'total ≠ remaining')
  assert(depositWords !== remainingWords, 'deposit ≠ remaining')

  // Commercial path words (user expectation for 1000)
  assertEq(amountToWordsPl(1000), 'jeden tysiąc złotych', 'amountToWordsPl 1000')
  assertEq(
    amountToWordsPl(11400),
    'jedenaście tysięcy czterysta złotych',
    'amountToWordsPl 11400',
  )
  assertEq(
    amountToWordsPl(10400),
    'dziesięć tysięcy czterysta złotych',
    'amountToWordsPl 10400',
  )

  const broken =
    'Wynagrodzenie 11 400 zł (słownie: jedenaście tysięcy czterysta złotych). ' +
    'Zadatek 1 000 zł (słownie: jedenaście tysięcy czterysta złotych). ' +
    'Pozostała kwota 10 400 zł (słownie: jedenaście tysięcy czterysta złotych).'
  const fixed = repairMoneyWordsInText(broken, ds.finances)
  assert(fixed.includes(`(słownie: ${depositWords})`), `deposit fixed: ${fixed}`)
  assert(fixed.includes(`(słownie: ${remainingWords})`), `remaining fixed`)
  assert(
    fixed.includes(`11 400 zł (słownie: ${totalWords})`),
    'total kept',
  )
})

run('E. quality gate blocks deposit paired with total words', () => {
  const dataset = {
    clients: { displayNames: 'A i B', personCount: 2 as const },
    dates: {
      contractExecutionDate: '01.07.2026 r.',
      weddingDate: '01.08.2026 r.',
    },
    locations: {},
    finances: {
      contractValueFormatted: '11 400 zł',
      contractValueWords: polishContractMoneyWords(11400),
      depositFormatted: '1 000 zł',
      depositWords: polishContractMoneyWords(1000),
      remainingFormatted: '10 400 zł',
      remainingWords: polishContractMoneyWords(10400),
    },
    package: { name: 'Video' },
  }
  const bad = verifyFinancialConsistency({
    dataset,
    transformedBlocks: [
      {
        blockId: '1',
        text:
          'Wynagrodzenie 11 400 zł (słownie: jedenaście tysięcy czterysta złotych). ' +
          'Zadatek 1 000 zł (słownie: jedenaście tysięcy czterysta złotych). ' +
          'Pozostała kwota 10 400 zł.',
      },
    ],
  })
  assert(
    bad.issues.some(
      (i) =>
        i.code === 'money_words_mismatch' &&
        i.canonicalField === 'contract.depositAmount',
    ),
    'deposit/total words mismatch blocking',
  )
})

if (!process.exitCode) {
  console.log('\nAll contract-generation-quality-fixes tests passed.')
}
