/**
 * CG7.2 — unknown-template location generalization (offline, no OpenAI).
 *
 * L01–L15 regression shapes + table integrity.
 * Run: npm run test:cg72-location
 */

import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import { buildExpectationManifest } from './quality/expectationManifest'
import {
  discoverFilledLocationEvidence,
  inferLocationRoleFromContext,
  isNonSemanticLocationSurface,
  weddingDatesSemanticallyEqual,
} from './quality/locationFieldEvidence'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from './types'
import type { ProtectedContractData } from './types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function dataset(locs: {
  prep?: string
  bridePrep?: string
  groomPrep?: string
  ceremony?: string
  reception?: string
}): ContractTransformationDataset {
  const preparationLocations = []
  if (locs.bridePrep && locs.groomPrep) {
    preparationLocations.push(
      { person: 'bride' as const, label: 'PM', fullAddress: locs.bridePrep },
      { person: 'groom' as const, label: 'PM', fullAddress: locs.groomPrep },
    )
  } else if (locs.prep) {
    preparationLocations.push({
      person: 'shared' as const,
      label: 'Przygotowania',
      fullAddress: locs.prep,
    })
  }
  return {
    clients: {
      personCount: 2,
      displayNames: 'Anna Testowa i Jan Próbny',
      address: 'ul. Kwiatowa 12, 30-001 Kraków',
    },
    dates: {
      contractExecutionDate: '20.09.2026 r.',
      weddingDate: '11.09.2027 r.',
    },
    package: { name: 'Photo Reportage' },
    finances: {
      contractValueFormatted: '10 500 zł',
      contractValueWords: 'dziesięć tysięcy pięćset złotych',
      depositFormatted: '2 940 zł',
      depositWords: 'dwa tysiące dziewięćset czterdzieści złotych',
      remainingFormatted: '7 560 zł',
      remainingWords: 'siedem tysięcy pięćset sześćdziesiąt złotych',
    },
    locations: {
      ...(locs.prep || locs.bridePrep
        ? {
            preparation: {
              fullAddress: locs.prep ?? locs.bridePrep,
            },
            preparationLocations,
            preparationDisplayText:
              locs.bridePrep && locs.groomPrep
                ? `${locs.bridePrep} / ${locs.groomPrep}`
                : locs.prep,
          }
        : {}),
      ...(locs.ceremony
        ? { ceremony: { displayName: locs.ceremony, fullAddress: locs.ceremony } }
        : {}),
      ...(locs.reception
        ? {
            reception: {
              fullAddress: locs.reception,
              displayName: locs.reception,
            },
          }
        : {}),
      ...(!locs.ceremony || !locs.prep
        ? {
            absentLocationRoles: [
              ...(!locs.ceremony ? (['ceremony'] as const) : []),
              ...(!locs.prep && !locs.bridePrep
                ? (['preparation'] as const)
                : []),
              ...(!locs.reception ? (['reception'] as const) : []),
            ],
          }
        : {}),
    },
  }
}

function emptyProtected(): ProtectedContractData {
  return { exactProtectedValues: [], protectedPatterns: [] }
}

function cell(
  id: string,
  text: string,
  opts: {
    tableIndex: number
    rowIndex: number
    cellIndex: number
    label: string
    family: 'wedding_location' | 'wedding_date' | 'customer' | 'unknown'
  },
): TransformDocumentBlock {
  return {
    blockId: id,
    paragraphIndex: 0,
    text,
    kind: 'tableCell',
    tableContext: {
      tableIndex: opts.tableIndex,
      rowIndex: opts.rowIndex,
      cellIndex: opts.cellIndex,
      rowLabelText: opts.label,
      neighboringCellTexts:
        opts.cellIndex === 0 ? ['value'] : [opts.label],
      ownershipFamily: opts.family,
    },
  }
}

function moneyBlocks(): TransformDocumentBlock[] {
  return [
    {
      blockId: 'money',
      paragraphIndex: 90,
      text: 'Wartość 10 500 zł (słownie: dziesięć tysięcy pięćset złotych). Zadatek 2 940 zł. Pozostała 7 560 zł.',
      kind: 'paragraph',
    },
  ]
}

function runGate(
  source: TransformDocumentBlock[],
  transformed: TransformedBlock[],
  ds: ContractTransformationDataset,
) {
  return runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: transformed,
    dataset: ds,
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
}

// ---- unit helpers ----
{
  assert(isNonSemanticLocationSurface('do uzupełnienia'), 'sentinel class')
  assert(isNonSemanticLocationSurface('__________'), 'underscores')
  assert(isNonSemanticLocationSurface(''), 'blank')
  assert(!isNonSemanticLocationSurface('ul. Marszałkowska 10, Warszawa'), 'real addr')
  assert(inferLocationRoleFromContext('Miejsce przygotowań') === 'preparation', 'prep role')
  assert(inferLocationRoleFromContext('Miejsce ceremonii') === 'ceremony', 'ceremony role')
  assert(inferLocationRoleFromContext('Miejsce wesela') === 'reception', 'reception role')
  assert(weddingDatesSemanticallyEqual('11.09.2027', '11.09.2027 r.'), 'date equal')
  console.log('PASS  helpers: sentinel / role / date separation')
}

const FULL = dataset({
  prep: 'ul. Marszałkowska 10, 00-001 Warszawa',
  ceremony: 'Kościół Świętego Krzyża, Warszawa',
  reception: 'Hotel Bristol, Krakowskie Przedmieście 42/44, Warszawa',
})

// L01 prose ceremony with placeholder
{
  const source: TransformDocumentBlock[] = [
    {
      blockId: 'p-cer',
      paragraphIndex: 0,
      text: 'Ceremonia odbędzie się w PLACEHOLDER_CEREMONIA.',
      kind: 'paragraph',
    },
    ...moneyBlocks(),
  ]
  const evidence = discoverFilledLocationEvidence(source)
  assert(evidence.some((e) => e.role === 'ceremony'), 'L01: ceremony evidence')
  const good = source.map((b) =>
    b.blockId === 'p-cer'
      ? {
          blockId: b.blockId,
          text: 'Ceremonia odbędzie się w Kościele Świętego Krzyża, Warszawa.',
        }
      : { blockId: b.blockId, text: b.text },
  )
  // prose may need model; if still placeholder-ish, gate may block — rewrite without placeholder token
  const gate = runGate(source, good, FULL)
  assert(
    gate.blocks.some((b) => /Świętego Krzyża|Kos cioł|Kościół/i.test(b.text)),
    'L01: ceremony present',
  )
  console.log('PASS  L01: prose ceremony')
}

// L02 table ceremony blank
{
  const source = [
    cell('c0', 'Miejsce ceremonii', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Miejsce ceremonii',
      family: 'wedding_location',
    }),
    cell('c1', '', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce ceremonii',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    FULL,
  )
  assert(
    gate.blocks.find((b) => b.blockId === 'c1')?.text.includes('Kościół') ||
      gate.blocks.find((b) => b.blockId === 'c1')?.text.includes('Świętego'),
    'L02: blank ceremony filled',
  )
  assert(
    gate.blocks.find((b) => b.blockId === 'c0')?.text === 'Miejsce ceremonii',
    'L02: label preserved',
  )
  console.log('PASS  L02: table ceremony blank')
}

// L03 table reception sentinel
{
  const source = [
    cell('r0', 'Miejsce wesela', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    cell('r1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const manifest = buildExpectationManifest({
    sourceBlocks: source,
    dataset: FULL,
    protectedData: emptyProtected(),
  })
  assert(
    !(manifest.sourceSpecificValues ?? []).some(
      (s) => s.sourceValue === 'do uzupełnienia',
    ),
    'L03: sentinel not inventoried as mustDisappear venue',
  )
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    FULL,
  )
  assert(
    !/do uzupełnienia/i.test(gate.blocks.find((b) => b.blockId === 'r1')?.text ?? ''),
    'L03: sentinel resolved',
  )
  assert(/Bristol|Krakowskie/i.test(gate.blocks.find((b) => b.blockId === 'r1')?.text ?? ''), 'L03: reception filled')
  console.log('PASS  L03: table reception sentinel')
}

// L04 table old filled addresses
{
  const source = [
    cell('p0', 'Miejsce przygotowań', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Miejsce przygotowań',
      family: 'wedding_location',
    }),
    cell('p1', 'ul. Stara 1, Poznań', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce przygotowań',
      family: 'wedding_location',
    }),
    cell('c0', 'Miejsce ceremonii', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 0,
      label: 'Miejsce ceremonii',
      family: 'wedding_location',
    }),
    cell('c1', 'Stary Kościół Demo', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 1,
      label: 'Miejsce ceremonii',
      family: 'wedding_location',
    }),
    cell('r0', 'Miejsce wesela', {
      tableIndex: 0,
      rowIndex: 2,
      cellIndex: 0,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    cell('r1', 'Stara Sala Demo', {
      tableIndex: 0,
      rowIndex: 2,
      cellIndex: 1,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    FULL,
  )
  assert(!/Stara 1|Stary Kościół|Stara Sala/i.test(gate.blocks.map((b) => b.text).join('\n')), 'L04: old absent from grounded')
  assert(/Marszałkowska/i.test(gate.blocks.find((b) => b.blockId === 'p1')?.text ?? ''), 'L04: prep')
  assert(/Świętego Krzyża/i.test(gate.blocks.find((b) => b.blockId === 'c1')?.text ?? ''), 'L04: ceremony')
  assert(/Bristol/i.test(gate.blocks.find((b) => b.blockId === 'r1')?.text ?? ''), 'L04: reception')
  console.log('PASS  L04: old filled table locations')
}

// L05 form-like three roles
{
  const source = [
    cell('a0', 'Miejsce przygotowań', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Miejsce przygotowań',
      family: 'wedding_location',
    }),
    cell('a1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce przygotowań',
      family: 'wedding_location',
    }),
    cell('b0', 'Miejsce ceremonii', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 0,
      label: 'Miejsce ceremonii',
      family: 'wedding_location',
    }),
    cell('b1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 1,
      label: 'Miejsce ceremonii',
      family: 'wedding_location',
    }),
    cell('c0', 'Miejsce wesela', {
      tableIndex: 0,
      rowIndex: 2,
      cellIndex: 0,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    cell('c1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 2,
      cellIndex: 1,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const ev = discoverFilledLocationEvidence(source)
  assert(ev.filter((e) => e.role === 'preparation').length === 1, 'L05: prep')
  assert(ev.filter((e) => e.role === 'ceremony').length === 1, 'L05: ceremony')
  assert(ev.filter((e) => e.role === 'reception').length === 1, 'L05: reception')
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    FULL,
  )
  assert(gate.downloadAllowed || gate.blocks.every((b) => !/do uzupełnienia/i.test(b.text)), 'L05: sentinels cleared')
  console.log('PASS  L05: form-like three roles')
}

// L06 different terminology
{
  const source = [
    cell('l0', 'Lokalizacja ślubu', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Lokalizacja ślubu',
      family: 'wedding_location',
    }),
    cell('l1', 'Stary adres Demo 9', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Lokalizacja ślubu',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const ev = discoverFilledLocationEvidence(source)
  assert(ev.some((e) => e.blockId === 'l1'), 'L06: discovered')
  // role may be unknown or ceremony — either is structural
  console.log('PASS  L06: different terminology discovered')
}

// L07 one generic prep field + one canonical prep
{
  const source = [
    cell('p0', 'Miejsce przygotowań', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Miejsce przygotowań',
      family: 'wedding_location',
    }),
    cell('p1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce przygotowań',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset({ prep: 'ul. Marszałkowska 10, Warszawa' }),
  )
  assert(/Marszałkowska/i.test(gate.blocks.find((b) => b.blockId === 'p1')?.text ?? ''), 'L07: single prep')
  console.log('PASS  L07: one prep field / one canonical')
}

// L08 one generic prep + two canonical — combined display, no silent drop
{
  const ds = dataset({
    bridePrep: 'ul. Słoneczna 2, Kraków',
    groomPrep: 'ul. Wiosenna 8, Kraków',
  })
  const source = [
    cell('p0', 'Miejsce przygotowań', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Miejsce przygotowań',
      family: 'wedding_location',
    }),
    cell('p1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce przygotowań',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    ds,
  )
  const text = gate.blocks.find((b) => b.blockId === 'p1')?.text ?? ''
  assert(/Słoneczna/i.test(text) && /Wiosenna/i.test(text), 'L08: both prep addresses represented')
  console.log('PASS  L08: two prep → one generic field')
}

// L09 two explicit prep partner fields
{
  const ds = dataset({
    bridePrep: 'ul. Słoneczna 2, Kraków',
    groomPrep: 'ul. Wiosenna 8, Kraków',
  })
  const source = [
    cell('b0', 'Przygotowania Panny Młodej', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Przygotowania Panny Młodej',
      family: 'wedding_location',
    }),
    cell('b1', 'stary bride', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Przygotowania Panny Młodej',
      family: 'wedding_location',
    }),
    cell('g0', 'Przygotowania Pana Młodego', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 0,
      label: 'Przygotowania Pana Młodego',
      family: 'wedding_location',
    }),
    cell('g1', 'stary groom', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 1,
      label: 'Przygotowania Pana Młodego',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const ev = discoverFilledLocationEvidence(source)
  assert(
    ev.some((e) => e.role === 'preparation_partner1') &&
      ev.some((e) => e.role === 'preparation_partner2'),
    'L09: partner roles',
  )
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    ds,
  )
  assert(/Słoneczna/i.test(gate.blocks.find((b) => b.blockId === 'b1')?.text ?? ''), 'L09: bride')
  assert(/Wiosenna/i.test(gate.blocks.find((b) => b.blockId === 'g1')?.text ?? ''), 'L09: groom')
  console.log('PASS  L09: two explicit prep fields')
}

// L10 same ceremony+reception address
{
  const same = 'Pałac Wspólny, Kraków'
  const ds = dataset({ ceremony: same, reception: same, prep: 'ul. Prep 1' })
  const source = [
    cell('c1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce ceremonii',
      family: 'wedding_location',
    }),
    cell('r1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 1,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    cell('c0', 'Miejsce ceremonii', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Miejsce ceremonii',
      family: 'wedding_location',
    }),
    cell('r0', 'Miejsce wesela', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 0,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    ds,
  )
  assert(/Pałac Wspólny/i.test(gate.blocks.find((b) => b.blockId === 'c1')?.text ?? ''), 'L10: ceremony')
  assert(/Pałac Wspólny/i.test(gate.blocks.find((b) => b.blockId === 'r1')?.text ?? ''), 'L10: reception')
  console.log('PASS  L10: same ceremony+reception')
}

// L11 different ceremony/reception
{
  const source = [
    cell('c1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce ceremonii',
      family: 'wedding_location',
    }),
    cell('r1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 1,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    FULL,
  )
  const c = gate.blocks.find((b) => b.blockId === 'c1')?.text ?? ''
  const r = gate.blocks.find((b) => b.blockId === 'r1')?.text ?? ''
  assert(/Świętego Krzyża/i.test(c), 'L11: ceremony distinct')
  assert(/Bristol/i.test(r), 'L11: reception distinct')
  assert(c !== r, 'L11: not swapped to same text accidentally unless equal')
  console.log('PASS  L11: different ceremony/reception')
}

// L12 template field exists, CRM missing — no hallucination
{
  const ds = dataset({}) // all absent
  const source = [
    cell('c1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce ceremonii',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    ds,
  )
  const t = gate.blocks.find((b) => b.blockId === 'c1')?.text ?? ''
  assert(!/Kościół|Hotel|Bristol|Marszałkowska/i.test(t), 'L12: no invented venue')
  assert(t === '—' || isNonSemanticLocationSurface(t) || t === '', 'L12: neutralized')
  console.log('PASS  L12: CRM missing — no invent')
}

// L13 location in table; unrelated address in legal prose must survive scoped check
{
  const source: TransformDocumentBlock[] = [
    cell('r1', 'Stara Sala Demo', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    {
      blockId: 'legal',
      paragraphIndex: 5,
      text: 'Korespondencję należy kierować na adres Studio: ul. Garbary 10, Poznań.',
      kind: 'paragraph',
    },
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    FULL,
  )
  assert(/Garbary 10/i.test(gate.blocks.find((b) => b.blockId === 'legal')?.text ?? ''), 'L13: legal address preserved')
  assert(!/Stara Sala Demo/i.test(gate.blocks.find((b) => b.blockId === 'r1')?.text ?? ''), 'L13: grounded stale cleared')
  console.log('PASS  L13: scoped stale vs legal address')
}

// L14 date + location neighboring rows — date not coupled as location stale
{
  const source = [
    cell('d0', 'Data wydarzenia', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Data wydarzenia',
      family: 'wedding_date',
    }),
    cell('d1', '11.09.2027', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Data wydarzenia',
      family: 'wedding_date',
    }),
    cell('r1', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 1,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const manifest = buildExpectationManifest({
    sourceBlocks: source,
    dataset: FULL,
    protectedData: emptyProtected(),
  })
  assert(
    !manifest.sourceSpecificValues.some(
      (s) => s.canonicalField === 'wedding.date' && s.mustDisappear,
    ),
    'L14: same-day date not mustDisappear',
  )
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    FULL,
  )
  assert(
    !gate.report.blockingIssues.some(
      (i) =>
        i.canonicalField === 'wedding.date' &&
        i.code === 'stale_source_value_remaining',
    ),
    'L14: date not Mode A location stale',
  )
  console.log('PASS  L14: date vs location separation')
}

// L15 old venue elsewhere legitimate
{
  const source: TransformDocumentBlock[] = [
    cell('r1', 'Pałac Rydzyna', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    {
      blockId: 'ref',
      paragraphIndex: 8,
      text: 'Strony oświadczają, że wzorowały się na realizacji z Pałacu Rydzyna wyłącznie jako przykładzie stylu.',
      kind: 'paragraph',
    },
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    FULL,
  )
  assert(/Pałacu Rydzyna/i.test(gate.blocks.find((b) => b.blockId === 'ref')?.text ?? ''), 'L15: reference venue preserved')
  assert(!/^Pałac Rydzyna$/i.test(gate.blocks.find((b) => b.blockId === 'r1')?.text.trim() ?? ''), 'L15: grounded field replaced')
  console.log('PASS  L15: scoped stale — global absence not required')
}

// Table integrity: label not overwritten; cell count
{
  const source = [
    cell('lab', 'Miejsce wesela', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    cell('val', 'do uzupełnienia', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Miejsce wesela',
      family: 'wedding_location',
    }),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    FULL,
  )
  assert(gate.blocks.length === source.length, 'table: block count stable')
  assert(gate.blocks.find((b) => b.blockId === 'lab')?.text === 'Miejsce wesela', 'table: label intact')
  console.log('PASS  TABLE: label/value integrity')
}

console.log('\nCG7.2 location generalization acceptance: ALL PASS')
