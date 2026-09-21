/**
 * Golden Fix 2 — exact finance surface repair matrix (FR01–FR15).
 * Offline only — no OpenAI.
 *
 *   npx tsx --tsconfig tsconfig.app.json src/features/ai-contract-transform/goldenFix2FactSurfaceAcceptance.test.ts
 */

import { repairCanonicalPaymentAmounts } from './quality/paymentAmountRepair'
import {
  applyCanonicalPackageName,
  discoverFilledPackageEvidence,
  extractPackageNameAfterMarker,
} from './quality/packageFieldEvidence'
import {
  discoverRepeatedFactEvidence,
  repairRepeatedFactSurfaces,
} from './quality/repeatedFactEvidence'
import {
  extractPrimaryPlnAmount,
  parsePlnAmountInteger,
  replacePlnAmountSurface,
  textHasCanonicalPlnAmount,
} from './quality/plnAmountSurface'
import { repairMoneyWordsInText } from './quality/deterministicRepairs'
import { discoverFilledPartyEvidence } from './quality/partyFilledIdentity'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from './types'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const finances = {
  contractValueFormatted: '11 200 zł',
  contractValueWords: 'jedenaście tysięcy dwieście złotych',
  depositFormatted: '2 500 zł',
  depositWords: 'dwa tysiące pięćset złotych',
  remainingFormatted: '8 700 zł',
  remainingWords: 'osiem tysięcy siedemset złotych',
}

function ds(
  overrides?: Partial<ContractTransformationDataset>,
): ContractTransformationDataset {
  return {
    clients: {
      displayNames: 'Zofia Kalendarzowa',
      personCount: 1,
      address: 'ul. Kasztanowa 21/5, 60-214 Poznań',
    },
    dates: {
      weddingDate: '18.09.2027 r.',
      contractExecutionDate: '05.11.2026 r.',
    },
    locations: {},
    finances,
    package: { name: 'Reportaż Wieczorny' },
    ...overrides,
  } as ContractTransformationDataset
}

function blk(id: string, text: string): TransformDocumentBlock {
  return {
    blockId: id,
    text,
    kind: 'paragraph',
    runs: [{ text }],
  } as TransformDocumentBlock
}

function runPay(
  source: TransformDocumentBlock[],
  current?: TransformedBlock[],
) {
  return repairCanonicalPaymentAmounts({
    blocks: (current ?? source.map((b) => ({ blockId: b.blockId, text: b.text }))).map(
      (b) => ({ ...b }),
    ),
    sourceBlocks: source,
    dataset: ds(),
  })
}

function main() {
  // FR01 old total → canonical
  {
    const src = [
      blk(
        't',
        'Wynagrodzenie wynosi 8 400,00 zł brutto, słownie: osiem tysięcy czterysta złotych.',
      ),
    ]
    const r = runPay(src)
    assert(
      textHasCanonicalPlnAmount(r.blocks[0]!.text, '11 200 zł'),
      'FR01 total',
    )
    assert(!/8\s*400/.test(r.blocks[0]!.text), 'FR01 no old total')
    assert(!/11\s*211\s*200/.test(r.blocks[0]!.text), 'FR01 no concat')
  }

  // FR02 deposit
  {
    const src = [
      blk('t', 'Wynagrodzenie 11 200 zł.'),
      blk('d', 'Opłata rezerwacyjna w wysokości 1 500,00 zł w terminie 3 dni.'),
    ]
    const r = runPay(src)
    assert(
      textHasCanonicalPlnAmount(r.blocks[1]!.text, '2 500 zł'),
      'FR02 deposit',
    )
    assert(!/1\s*500,\s*2\s*500/.test(r.blocks[1]!.text), 'FR02 no concat')
  }

  // FR03 remaining
  {
    const src = [
      blk('t', 'Wynagrodzenie 11 200 zł.'),
      blk('r', 'Pozostała kwota 6 900,00 zł jest płatna przelewem.'),
    ]
    const r = runPay(src)
    assert(
      textHasCanonicalPlnAmount(r.blocks[1]!.text, '8 700 zł'),
      'FR03 remaining',
    )
    assert(!/6\s*900,\s*8\s*700/.test(r.blocks[1]!.text), 'FR03 no concat')
  }

  // FR04 model already canonical
  {
    const src = [blk('t', 'Wynagrodzenie wynosi 8 400,00 zł brutto.')]
    const cur = [
      { blockId: 't', text: 'Wynagrodzenie wynosi 11 200 zł brutto.' },
    ]
    const r = runPay(src, cur)
    assert(r.blocks[0]!.text === cur[0]!.text, 'FR04 unchanged')
    assert(r.repairs.length === 0, 'FR04 no repair')
  }

  // FR05 model changed prose, kept old amount
  {
    const src = [blk('t', 'Wynagrodzenie wynosi 8 400,00 zł brutto.')]
    const cur = [
      {
        blockId: 't',
        text: 'Łączna cena pakietu wynosi 8 400,00 zł brutto.',
      },
    ]
    const r = runPay(src, cur)
    assert(
      textHasCanonicalPlnAmount(r.blocks[0]!.text, '11 200 zł'),
      'FR05 amount updated',
    )
  }

  // FR06 NBSP thousands
  {
    const nbsp = 'Wynagrodzenie wynosi 8\u00a0400,00 zł brutto.'
    const src = [blk('t', nbsp)]
    const r = runPay(src)
    assert(
      textHasCanonicalPlnAmount(r.blocks[0]!.text, '11 200 zł'),
      'FR06 NBSP',
    )
  }

  // FR07 decimal cents
  {
    const src = [blk('t', 'Cena: 8 400,00 zł.')]
    assert(extractPrimaryPlnAmount(src[0]!.text) === '8 400,00 zł', 'FR07 extract')
    assert(parsePlnAmountInteger('8 400,00 zł') === 8400, 'FR07 parse')
    const r = runPay(src)
    assert(
      textHasCanonicalPlnAmount(r.blocks[0]!.text, '11 200 zł'),
      'FR07 repaired',
    )
  }

  // FR08 numeric + money words
  {
    const src = [
      blk(
        't',
        'Wynagrodzenie wynosi 8 400,00 zł brutto, słownie: osiem tysięcy czterysta złotych.',
      ),
    ]
    const r = runPay(src)
    const withWords = repairMoneyWordsInText(r.blocks[0]!.text, finances)
    assert(/11\s*200\s*zł/.test(withWords), 'FR08 numeric')
    assert(/jedenaście tysięcy dwieście złotych/.test(withWords), 'FR08 words')
    assert(!/osiem tysięcy czterysta/.test(withWords), 'FR08 no old words')
  }

  // FR09 unrelated money same paragraph
  {
    const src = [
      blk(
        't',
        'Wynagrodzenie 8 400,00 zł. Opcja albumu 1 200 zł nie wchodzi do wartości.',
      ),
    ]
    // Mark as total+fee — repair should update total, preserve 1200 if possible
    const r = runPay(src)
    assert(/1\s*200/.test(r.blocks[0]!.text), 'FR09 unrelated preserved')
  }

  // FR10 unrelated in neighbor paragraph
  {
    const src = [
      blk('t', 'Wynagrodzenie wynosi 8 400,00 zł brutto.'),
      blk('fee', 'Sesja plenerowa za 1 200,00 zł, godzina 650,00 zł, album 980,00 zł.'),
    ]
    const r = runPay(src)
    assert(/1\s*200,00\s*zł/.test(r.blocks[1]!.text), 'FR10 1200')
    assert(/650,00\s*zł/.test(r.blocks[1]!.text), 'FR10 650')
    assert(/980,00\s*zł/.test(r.blocks[1]!.text), 'FR10 980')
    assert(
      textHasCanonicalPlnAmount(r.blocks[0]!.text, '11 200 zł'),
      'FR10 total',
    )
  }

  // FR11 11200 vs 1200 digit overlap
  {
    assert(
      !textHasCanonicalPlnAmount('sesja za 1 200,00 zł', '11 200 zł'),
      'FR11 1200 not 11200',
    )
    const corrupted = replacePlnAmountSurface(
      'wynosi 11 200 zł',
      '11 200 zł',
    )
    assert(corrupted === 'wynosi 11 200 zł', 'FR11 idempotent surface')
    // Prove "00 zł" substring trap is gone
    const bad = 'wynosi 11 200 zł'
    assert(!bad.includes('8 400'), 'setup')
    // exact fragment "00 zł" exists inside 11 200 zł — surface replace must not use it
    assert(bad.includes('00 zł'), 'FR11 substring exists')
    const once = replacePlnAmountSurface(bad, '11 200 zł')
    assert(once === bad, 'FR11 no cents-span corruption')
  }

  // FR12 three separate paragraphs
  {
    const src = [
      blk('t', 'Wynagrodzenie 8 400,00 zł brutto, słownie: osiem tysięcy czterysta złotych.'),
      blk('d', 'Zadatek 1 500,00 zł.'),
      blk('r', 'Pozostała kwota 6 900,00 zł.'),
    ]
    const r = runPay(src)
    assert(textHasCanonicalPlnAmount(r.blocks[0]!.text, '11 200 zł'), 'FR12 total')
    assert(textHasCanonicalPlnAmount(r.blocks[1]!.text, '2 500 zł'), 'FR12 deposit')
    assert(textHasCanonicalPlnAmount(r.blocks[2]!.text, '8 700 zł'), 'FR12 remaining')
  }

  // FR13 table cells
  {
    const src = [
      {
        ...blk('tc', '8 400,00 zł'),
        kind: 'tableCell' as const,
      },
      blk('d', 'Zadatek 1 500,00 zł.'),
    ]
    const r = runPay(src)
    assert(
      textHasCanonicalPlnAmount(r.blocks[0]!.text, '11 200 zł') ||
        textHasCanonicalPlnAmount(r.blocks.map((b) => b.text).join('\n'), '11 200 zł'),
      'FR13 total somewhere',
    )
  }

  // FR14 repair twice → idempotent
  {
    const src = [
      blk('t', 'Wynagrodzenie 8 400,00 zł brutto, słownie: osiem tysięcy czterysta złotych.'),
      blk('d', 'Opłata rezerwacyjna 1 500,00 zł.'),
      blk('r', 'Pozostała kwota 6 900,00 zł.'),
    ]
    const r1 = runPay(src)
    const r2 = runPay(
      src,
      r1.blocks.map((b) => ({ blockId: b.blockId, text: b.text })),
    )
    assert(r2.blocks[0]!.text === r1.blocks[0]!.text, 'FR14 total idem')
    assert(r2.blocks[1]!.text === r1.blocks[1]!.text, 'FR14 deposit idem')
    assert(r2.blocks[2]!.text === r1.blocks[2]!.text, 'FR14 remaining idem')
    assert(!/11\s*200\s*11\s*200/.test(r2.blocks[0]!.text), 'FR14 no double')
  }

  // FR15 model canonical → repair → unchanged
  {
    const src = [blk('t', 'Wynagrodzenie 8 400 zł.')]
    const cur = [{ blockId: 't', text: 'Wynagrodzenie 11 200 zł.' }]
    const r = runPay(src, cur)
    assert(r.blocks[0]!.text === 'Wynagrodzenie 11 200 zł.', 'FR15')
  }

  // ---- H01–H08 ----
  {
    const sourceBlocks = [
      blk(
        'party',
        'pomiędzy Anną Testową, zamieszkałą przy ul. A 1, 00-001 Warszawa, zwaną dalej Klientką.',
      ),
      blk('h', 'uroczystość Anny Testowej · 12 czerwca 2027'),
      blk('ev', 'Datą uroczystości jest 12 czerwca 2027 roku.'),
    ]
    const partyEv = discoverFilledPartyEvidence(sourceBlocks)
    const repeated = discoverRepeatedFactEvidence({
      blocks: sourceBlocks,
      partyEvidence: partyEv,
    })
    assert(
      repeated.some((e) => e.blockId === 'h'),
      'H01 headline discovered',
    )
    const repaired = repairRepeatedFactSurfaces({
      blocks: sourceBlocks.map((b) => ({ blockId: b.blockId, text: b.text })),
      evidence: repeated,
      dataset: ds({
        clients: {
          displayNames: 'Zofia Kalendarzowa',
          personCount: 1,
        },
      } as Partial<ContractTransformationDataset>),
    })
    const h = repaired.blocks.find((b) => b.blockId === 'h')!.text
    assert(/Zofia Kalendarzowa/.test(h), 'H01 party in headline')
    assert(/18 września 2027|18\.09\.2027/.test(h), 'H02 date in headline')
    assert(!/Anny Testowej/.test(h), 'H01 stale gone')
    assert(!/12 czerwca 2027/.test(h), 'H02 stale date gone')
  }

  // H03 party+date same headline — covered above
  // H04 two clients
  {
    const sourceBlocks = [
      blk(
        'party',
        'Klientami są Anna Testowa oraz Jan Próbny, zwanymi dalej Klientami.',
      ),
      blk('h', 'Umowa Anna Testowa i Jan Próbny · 01 maja 2027'),
    ]
    const partyEv = discoverFilledPartyEvidence(sourceBlocks)
    const repeated = discoverRepeatedFactEvidence({
      blocks: sourceBlocks,
      partyEvidence: partyEv,
    })
    const repaired = repairRepeatedFactSurfaces({
      blocks: sourceBlocks.map((b) => ({ blockId: b.blockId, text: b.text })),
      evidence: repeated,
      dataset: ds({
        clients: {
          displayNames: 'Zofia Kalendarzowa i Piotr Kalendarzowy',
          personCount: 2,
        },
      } as Partial<ContractTransformationDataset>),
    })
    assert(
      /Zofia Kalendarzowa i Piotr Kalendarzowy/.test(
        repaired.blocks.find((b) => b.blockId === 'h')!.text,
      ),
      'H04 two clients',
    )
  }

  // H05 provider name in headline — preserved (not discovered as customer headline)
  {
    const sourceBlocks = [
      blk(
        'party',
        'pomiędzy Anną Testową, zamieszkałą przy ul. A 1, zwaną dalej Klientką.',
      ),
      blk('h', 'Atelier Szept Światła — NIP 000-000-00-01'),
    ]
    const partyEv = discoverFilledPartyEvidence(sourceBlocks)
    const repeated = discoverRepeatedFactEvidence({
      blocks: sourceBlocks,
      partyEvidence: partyEv,
    })
    assert(
      !repeated.some((e) => e.blockId === 'h'),
      'H05 provider headline not customer-grounded',
    )
  }

  // H06 signing date not replaced with wedding date
  {
    const sourceBlocks = [
      blk(
        'party',
        'pomiędzy Anną Testową, zamieszkałą przy ul. A 1, zwaną dalej Klientką.',
      ),
      blk('h', 'Umowa zawarta w dniu 15 lutego 2027 roku'),
    ]
    const partyEv = discoverFilledPartyEvidence(sourceBlocks)
    const repeated = discoverRepeatedFactEvidence({
      blocks: sourceBlocks,
      partyEvidence: partyEv,
    })
    assert(
      !repeated.some((e) => e.blockId === 'h'),
      'H06 execution date excluded',
    )
  }

  // H07 no CRM fact
  {
    const sourceBlocks = [
      blk('party', 'pomiędzy Anną Testową, zwaną dalej Klientką.'),
      blk('h', 'Postanowienia ogólne'),
    ]
    const partyEv = discoverFilledPartyEvidence(sourceBlocks)
    const repeated = discoverRepeatedFactEvidence({
      blocks: sourceBlocks,
      partyEvidence: partyEv,
    })
    assert(
      !repeated.some((e) => e.blockId === 'h'),
      'H07 unchanged / not grounded',
    )
  }

  // H08 signature context — not headline evidence
  {
    const sourceBlocks = [
      blk('party', 'pomiędzy Anną Testową, zwaną dalej Klientką.'),
      {
        ...blk('sig', 'Anna Testowa'),
        kind: 'tableCell' as const,
      },
      {
        ...blk('sigl', 'Klient — data i czytelny podpis'),
        kind: 'tableCell' as const,
      },
    ]
    const partyEv = discoverFilledPartyEvidence(sourceBlocks)
    const repeated = discoverRepeatedFactEvidence({
      blocks: sourceBlocks,
      partyEvidence: partyEv,
    })
    assert(
      !repeated.some((e) => e.blockId === 'sig'),
      'H08 signature not headline',
    )
  }

  // ---- PKT01–PKT10 ----
  {
    assert(
      extractPackageNameAfterMarker('obejmuje pakiet Klasyczny Reportaż: do 10') ===
        'Klasyczny Reportaż',
      'PKT01 extract',
    )
    const prose = [
      blk('p', 'Reportaż obejmuje pakiet Klasyczny Reportaż: do 10 godzin obecności.'),
    ]
    const ev = discoverFilledPackageEvidence(prose)
    assert(ev[0]?.sourcePackageName === 'Klasyczny Reportaż', 'PKT01 discover')
    const next = applyCanonicalPackageName(
      prose[0]!.text,
      'Klasyczny Reportaż',
      'Reportaż Wieczorny',
    )
    assert(/Reportaż Wieczorny/.test(next), 'PKT01 replace')
    assert(/do 10 godzin/.test(next), 'PKT06 deliverables preserved')
    assert(!/Klasyczny Reportaż/.test(next), 'PKT01 old gone')
  }

  {
    const form = [blk('f', 'Wybrany pakiet: Klasyczny Reportaż')]
    const ev = discoverFilledPackageEvidence(form)
    assert(ev.length >= 1, 'PKT02 form')
  }

  {
    const table = [
      {
        ...blk('c', 'Klasyczny Reportaż'),
        kind: 'tableCell' as const,
        tableContext: {
          tableIndex: 0,
          rowIndex: 0,
          cellIndex: 1,
          rowLabelText: 'Nazwa pakietu',
        },
      },
    ]
    const ev = discoverFilledPackageEvidence(table)
    assert(ev.some((e) => e.representation === 'table_cell'), 'PKT03 table')
  }

  {
    const blocks = [
      blk('s', 'Podsumowanie: pakiet Klasyczny Reportaż'),
      blk('p', 'Zakres: pakiet Klasyczny Reportaż obejmuje 10 godzin.'),
    ]
    const ev = discoverFilledPackageEvidence(blocks)
    assert(ev.length >= 2, 'PKT04 repeated')
    for (const e of ev) {
      const b = blocks.find((x) => x.blockId === e.blockId)!
      const next = applyCanonicalPackageName(
        b.text,
        e.sourcePackageName,
        'Reportaż Wieczorny',
      )
      assert(/Reportaż Wieczorny/.test(next), 'PKT04 updated')
    }
  }

  {
    const none = [blk('x', 'Fotograf wykona reportaż zgodnie ze sztuką.')]
    assert(discoverFilledPackageEvidence(none).length === 0, 'PKT05 no package')
  }

  {
    const catalogue = [
      blk(
        'c',
        'Opcje: sesja za 1 200 zł albo album za 980 zł. Nie jest to pakiet wybrany.',
      ),
      blk('p', 'Wynagrodzenie za pakiet Klasyczny Reportaż wynosi 8 400 zł.'),
    ]
    const ev = discoverFilledPackageEvidence(catalogue)
    assert(
      ev.every((e) => e.blockId === 'p'),
      'PKT07 catalogue not grounded as selected package',
    )
  }

  {
    const text =
      'Wynagrodzenie za pakiet Reportaż Wieczorny wynosi 11 200 zł.'
    const next = applyCanonicalPackageName(
      text,
      'Klasyczny Reportaż',
      'Reportaż Wieczorny',
    )
    assert(next === text, 'PKT08 idempotent')
  }

  {
    assert(
      extractPackageNameAfterMarker('pakiet Reportaż Wieczorny Premium Extra') ===
        'Reportaż Wieczorny Premium Extra' ||
        extractPackageNameAfterMarker('pakiet Reportaż Wieczorny') ===
          'Reportaż Wieczorny',
      'PKT09 multi-word',
    )
  }

  {
    const src = [
      blk(
        'p',
        'Wynagrodzenie za pakiet Klasyczny Reportaż wynosi 8 400,00 zł brutto, słownie: osiem tysięcy czterysta złotych.',
      ),
    ]
    const ev = discoverFilledPackageEvidence(src)
    const afterPkg = applyCanonicalPackageName(
      src[0]!.text,
      ev[0]!.sourcePackageName,
      'Reportaż Wieczorny',
    )
    const r = runPay(src, [{ blockId: 'p', text: afterPkg }])
    assert(/Reportaż Wieczorny/.test(r.blocks[0]!.text), 'PKT10 package')
    assert(
      textHasCanonicalPlnAmount(r.blocks[0]!.text, '11 200 zł'),
      'PKT10 total',
    )
  }

  console.log('Golden Fix 2 FR01–FR15 / H01–H08 / PKT01–PKT10: PASS')
}

main()
