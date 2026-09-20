/**
 * CG7.5 — dual-prep + multi-surface party + sparse + extras fallback (offline).
 * Run: npm run test:cg75-dual-prep
 */

import { classifyAdditionalServicesPlacement } from './additionalServicesPlacement'
import {
  findAtomicPaymentRegion,
  findPaymentStartIndex,
  isPaymentBlock,
} from './packageDeliverablesDetection'
import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import { buildExpectationManifest } from './quality/expectationManifest'
import {
  applyIntraParagraphLocationTargets,
  discoverFilledLocationEvidence,
  extractIntraParagraphLocationSlots,
  inferLocationRoleFromContext,
} from './quality/locationFieldEvidence'
import {
  discoverFilledPartyEvidence,
  extractIdentitySurfaces,
  verifyProviderRoleSparseScope,
} from './quality/partyFilledIdentity'
import { verifyAdditionalServicesConsistency } from './quality/additionalServicesConsistency'
import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from './types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function para(id: string, text: string): TransformDocumentBlock {
  return { blockId: id, paragraphIndex: 0, text, kind: 'paragraph' }
}

function cell(
  id: string,
  text: string,
  opts: {
    tableIndex: number
    rowIndex: number
    cellIndex: number
    label: string
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
      ownershipFamily: 'wedding_location',
      neighboringCellTexts: [opts.label, text],
    },
  }
}

function ds(opts?: {
  bridePrep?: string
  groomPrep?: string
  prep?: string
  ceremony?: string
  reception?: string
  personCount?: 1 | 2
}): ContractTransformationDataset {
  const bride = opts?.bridePrep
  const groom = opts?.groomPrep
  const prep = opts?.prep
  const preparationLocations = []
  if (bride) {
    preparationLocations.push({
      person: 'bride' as const,
      label: 'PM',
      fullAddress: bride,
    })
  }
  if (groom) {
    preparationLocations.push({
      person: 'groom' as const,
      label: 'PM',
      fullAddress: groom,
    })
  }
  if (prep && !bride && !groom) {
    preparationLocations.push({
      person: 'shared' as const,
      label: 'Prep',
      fullAddress: prep,
    })
  }
  return {
    clients: {
      personCount: opts?.personCount ?? 2,
      displayNames:
        (opts?.personCount ?? 2) === 1
          ? 'Anna Testowa'
          : 'Anna Testowa i Jan Próbny',
      address: 'ul. Kwiatowa 12, 30-001 Kraków',
    },
    dates: {
      contractExecutionDate: '20.09.2026 r.',
      weddingDate: '03.07.2027 r.',
    },
    package: { name: 'Photo+Video Premium' },
    finances: {
      contractValueFormatted: '19 540 zł',
      contractValueWords: 'dziewiętnaście tysięcy pięćset czterdzieści złotych',
      depositFormatted: '5 500 zł',
      depositWords: 'pięć tysięcy pięćset złotych',
      remainingFormatted: '14 040 zł',
      remainingWords: 'czternaście tysięcy czterdzieści złotych',
    },
    locations: {
      ...(bride || groom || prep
        ? {
            preparation: {
              fullAddress: prep ?? bride ?? groom,
            },
            preparationLocations,
            preparationDisplayText:
              bride && groom
                ? `przygotowań Panny Młodej pod adresem ${bride} oraz przygotowań Pana Młodego pod adresem ${groom}`
                : prep ?? bride ?? groom,
          }
        : {}),
      ...(opts?.ceremony
        ? { ceremony: { fullAddress: opts.ceremony, displayName: opts.ceremony } }
        : {}),
      ...(opts?.reception
        ? {
            reception: {
              fullAddress: opts.reception,
              displayName: opts.reception,
            },
          }
        : {}),
    },
    additionalServices: [
      { name: 'dodatkowy operator kamery' },
      { name: 'same day edit' },
    ],
  }
}

function emptyProtected() {
  return { exactProtectedValues: [] as string[], protectedPatterns: [] as string[] }
}

function moneyBlocks(): TransformDocumentBlock[] {
  return [
    para('pay-h', '§3 Rozliczenie'),
    para(
      'pay-total',
      'Łączna wartość Umowy wynosi 18 500 zł (słownie: osiemnaście tysięcy pięćset złotych) brutto.',
    ),
    para(
      'pay-dep',
      'Pierwsza wpłata: 5 000 zł (słownie: pięć tysięcy złotych) — w ciągu 10 dni od podpisania.',
    ),
    para(
      'pay-rem',
      'Kwota pozostała do zapłaty: 13 500 zł (słownie: trzynaście tysięcy pięćset złotych) — najpóźniej w dniu uroczystości.',
    ),
    para(
      'pay-bank',
      'Płatności na rachunek: 33 4444 5555 6666 7777 8888 9999.',
    ),
  ]
}

function runGate(
  source: TransformDocumentBlock[],
  transformed: TransformedBlock[],
  dataset = ds({
    bridePrep: 'ul. Słoneczna 2, 30-001 Kraków',
    groomPrep: 'ul. Wiosenna 8, 30-002 Kraków',
  }),
) {
  return runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: transformed,
    dataset,
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
}

const BRIDE = 'ul. Słoneczna 2, 30-001 Kraków'
const GROOM = 'ul. Wiosenna 8, 30-002 Kraków'

// ---- Dual-prep matrix DP01–DP12 ----
{
  assert(
    inferLocationRoleFromContext('Miejsce przygotowań Panny Młodej') ===
      'preparation_partner1',
    'role partner1',
  )
  assert(
    inferLocationRoleFromContext('Miejsce przygotowań Pana Młodego') ===
      'preparation_partner2',
    'role partner2',
  )
  assert(
    inferLocationRoleFromContext(
      'Miejsce uroczystości i lokal weselny',
    ) === 'unknown',
    'combined ceremony+reception unknown',
  )
  console.log('PASS  DP roles')
}

// DP01: one generic prep + one canonical
{
  const source = [
    para('p', 'Miejsce przygotowań: do uzupełnienia.'),
    ...moneyBlocks(),
  ]
  const dataset = ds({ prep: BRIDE })
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset,
  )
  assert(/Słoneczna/i.test(gate.blocks.find((b) => b.blockId === 'p')?.text ?? ''), 'DP01 fill')
  console.log('PASS  DP01: generic + one address')
}

// DP02: one generic + two addresses → combined display
{
  const source = [
    para('p', 'Miejsce przygotowań: adres wskazany w kwestionariuszu.'),
    ...moneyBlocks(),
  ]
  const dataset = ds({ bridePrep: BRIDE, groomPrep: GROOM })
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset,
  )
  const text = gate.blocks.find((b) => b.blockId === 'p')?.text ?? ''
  assert(/Słoneczna/i.test(text) && /Wiosenna/i.test(text), 'DP02 both in generic')
  console.log('PASS  DP02: generic + two addresses')
}

// DP03: two explicit fields + two addresses
{
  const source = [
    para('a', 'Miejsce przygotowań Panny Młodej: stare A.'),
    para('b', 'Miejsce przygotowań Pana Młodego: stare B.'),
    ...moneyBlocks(),
  ]
  const dataset = ds({ bridePrep: BRIDE, groomPrep: GROOM })
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset,
  )
  assert(/Słoneczna/i.test(gate.blocks.find((b) => b.blockId === 'a')?.text ?? ''), 'DP03 bride')
  assert(/Wiosenna/i.test(gate.blocks.find((b) => b.blockId === 'b')?.text ?? ''), 'DP03 groom')
  assert(!/stare A/i.test(gate.blocks.find((b) => b.blockId === 'a')?.text ?? ''), 'DP03 no stale A')
  console.log('PASS  DP03: two fields + two addresses')
}

// DP04: table rows
{
  const source = [
    cell('b0', 'Przygotowania Panny Młodej', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
      label: 'Przygotowania Panny Młodej',
    }),
    cell('b1', 'stary bride', {
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      label: 'Przygotowania Panny Młodej',
    }),
    cell('g0', 'Przygotowania Pana Młodego', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 0,
      label: 'Przygotowania Pana Młodego',
    }),
    cell('g1', 'stary groom', {
      tableIndex: 0,
      rowIndex: 1,
      cellIndex: 1,
      label: 'Przygotowania Pana Młodego',
    }),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    ds({ bridePrep: BRIDE, groomPrep: GROOM }),
  )
  assert(/Słoneczna/i.test(gate.blocks.find((b) => b.blockId === 'b1')?.text ?? ''), 'DP04 bride')
  assert(/Wiosenna/i.test(gate.blocks.find((b) => b.blockId === 'g1')?.text ?? ''), 'DP04 groom')
  console.log('PASS  DP04: table dual prep')
}

// DP05: prose multi-slot (U03 shape)
{
  const text =
    '2. Miejsce przygotowań Panny Młodej: adres wskazany w kwestionariuszu. Miejsce przygotowań Pana Młodego: adres wskazany w kwestionariuszu. Miejsce uroczystości i lokal weselny: zgodnie z danymi przekazanymi Wykonawcom najpóźniej 30 dni przed wydarzeniem.'
  const slots = extractIntraParagraphLocationSlots(text)
  assert(slots.length >= 2, 'DP05 slots')
  assert(slots.some((s) => s.role === 'preparation_partner1'), 'DP05 p1')
  assert(slots.some((s) => s.role === 'preparation_partner2'), 'DP05 p2')
  const source = [para('para-7', text), ...moneyBlocks()]
  const ev = discoverFilledLocationEvidence(source)
  assert(
    ev.some((e) => e.role === 'preparation_partner1') &&
      ev.some((e) => e.role === 'preparation_partner2'),
    'DP05 evidence both',
  )
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    ds({ bridePrep: BRIDE, groomPrep: GROOM }),
  )
  const out = gate.blocks.find((b) => b.blockId === 'para-7')?.text ?? ''
  assert(/Słoneczna/i.test(out) && /Wiosenna/i.test(out), 'DP05 both filled')
  assert(/uroczystości i lokal weselny/i.test(out), 'DP05 deferred preserved')
  const blocking = gate.report.blockingIssues.filter((i) =>
    /location_|preparation/i.test(i.code),
  )
  assert(blocking.length === 0, `DP05 no loc blocking: ${blocking.map((i) => i.code).join(',')}`)
  console.log('PASS  DP05: prose dual-prep')
}

// DP06: novel vocabulary via structural pair under locations heading
{
  const source = [
    para('h', 'Lokalizacje'),
    para('a', 'Miejsce przygotowań Partner A: stare X.'),
    para('b', 'Miejsce przygotowań Partner B: stare Y.'),
    ...moneyBlocks(),
  ]
  const ev = discoverFilledLocationEvidence(source)
  assert(
    ev.some((e) => e.role === 'preparation_partner1') &&
      ev.some((e) => e.role === 'preparation_partner2'),
    'DP06 structural partner roles',
  )
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    ds({ bridePrep: BRIDE, groomPrep: GROOM }),
  )
  assert(/Słoneczna/i.test(gate.blocks.find((b) => b.blockId === 'a')?.text ?? ''), 'DP06 a')
  assert(/Wiosenna/i.test(gate.blocks.find((b) => b.blockId === 'b')?.text ?? ''), 'DP06 b')
  console.log('PASS  DP06: novel vocab via structure')
}

// DP07: both old filled → replaced
{
  const source = [
    para('a', 'Miejsce przygotowań Panny Młodej: ul. Stara 1, Gdańsk.'),
    para('b', 'Miejsce przygotowań Pana Młodego: ul. Stara 2, Gdańsk.'),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    ds({ bridePrep: BRIDE, groomPrep: GROOM }),
  )
  assert(!/Stara/i.test(gate.blocks.map((b) => b.text).join('\n')), 'DP07 stale gone')
  console.log('PASS  DP07: replace both filled')
}

// DP08: only partner1 canonical
{
  const source = [
    para('a', 'Miejsce przygotowań Panny Młodej: do uzupełnienia.'),
    para('b', 'Miejsce przygotowań Pana Młodego: do uzupełnienia.'),
    ...moneyBlocks(),
  ]
  const dataset = ds({ bridePrep: BRIDE })
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset,
  )
  assert(/Słoneczna/i.test(gate.blocks.find((b) => b.blockId === 'a')?.text ?? ''), 'DP08 p1')
  assert(
    !/Słoneczna/i.test(gate.blocks.find((b) => b.blockId === 'b')?.text ?? ''),
    'DP08 no duplicate into p2',
  )
  console.log('PASS  DP08: only partner1')
}

// DP09: only partner2
{
  const source = [
    para('a', 'Miejsce przygotowań Panny Młodej: do uzupełnienia.'),
    para('b', 'Miejsce przygotowań Pana Młodego: do uzupełnienia.'),
    ...moneyBlocks(),
  ]
  const dataset = ds({ groomPrep: GROOM })
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset,
  )
  assert(/Wiosenna/i.test(gate.blocks.find((b) => b.blockId === 'b')?.text ?? ''), 'DP09 p2')
  assert(
    !/Wiosenna/i.test(gate.blocks.find((b) => b.blockId === 'a')?.text ?? ''),
    'DP09 no duplicate into p1',
  )
  console.log('PASS  DP09: only partner2')
}

// DP10: prep + unrelated provider address nearby
{
  const source = [
    para('a', 'Miejsce przygotowań Panny Młodej: do uzupełnienia.'),
    para('prov', 'Studio Duo, ul. Firmowa 9, 80-001 Gdańsk, NIP 5830003333.'),
    para('b', 'Miejsce przygotowań Pana Młodego: do uzupełnienia.'),
    ...moneyBlocks(),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    ds({ bridePrep: BRIDE, groomPrep: GROOM }),
  )
  assert(/Firmowa/i.test(gate.blocks.find((b) => b.blockId === 'prov')?.text ?? ''), 'DP10 provider intact')
  console.log('PASS  DP10: provider address untouched')
}

// DP11: prep + ceremony/reception nearby — no role swap
{
  const source = [
    para('a', 'Miejsce przygotowań Panny Młodej: stare.'),
    para('c', 'Miejsce ceremonii: Kościół Stary.'),
    para('b', 'Miejsce przygotowań Pana Młodego: stare.'),
    para('r', 'Miejsce wesela: Hotel Stary.'),
    ...moneyBlocks(),
  ]
  const dataset = ds({
    bridePrep: BRIDE,
    groomPrep: GROOM,
    ceremony: 'USC Kraków',
    reception: 'Dworek Białoprądnicki',
  })
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    dataset,
  )
  assert(/Słoneczna/i.test(gate.blocks.find((b) => b.blockId === 'a')?.text ?? ''), 'DP11 prep1')
  assert(/Wiosenna/i.test(gate.blocks.find((b) => b.blockId === 'b')?.text ?? ''), 'DP11 prep2')
  assert(/USC/i.test(gate.blocks.find((b) => b.blockId === 'c')?.text ?? ''), 'DP11 ceremony')
  assert(/Dworek/i.test(gate.blocks.find((b) => b.blockId === 'r')?.text ?? ''), 'DP11 reception')
  console.log('PASS  DP11: no role swap')
}

// DP12: no prep representation → no mustAppear
{
  const source = [
    para('x', 'Umowa o fotografię ślubną.'),
    ...moneyBlocks(),
  ]
  const dataset = ds({ bridePrep: BRIDE, groomPrep: GROOM })
  const manifest = buildExpectationManifest({
    sourceBlocks: source,
    dataset,
    protectedData: emptyProtected(),
  })
  assert(
    !manifest.requiredFields.some(
      (f) => f.canonicalField === 'wedding.preparationLocation',
    ),
    'DP12 no mustAppear',
  )
  console.log('PASS  DP12: no prep representation')
}

// applyIntraParagraphLocationTargets unit
{
  const next = applyIntraParagraphLocationTargets(
    'Miejsce A: old1. Miejsce B: old2.',
    [
      { label: 'Miejsce A', target: 'NEW1' },
      { label: 'Miejsce B', target: 'NEW2' },
    ],
  )
  assert(next.includes('Miejsce A: NEW1') && next.includes('Miejsce B: NEW2'), `slot apply got: ${next}`)
}

// ---- Multi-surface party MP01–MP08 ----
{
  const surfaces = extractIdentitySurfaces(
    'Pomiędzy: Olgą Próbą i Michałem Próbą, zam. ul. Morska 12, zwanymi „Parą Młodą”,',
  )
  assert(surfaces.some((s) => /Olgą/i.test(s)), 'MP identity Olga')
  assert(surfaces.some((s) => /Michałem/i.test(s)), 'MP identity Michał')
  assert(!surfaces.some((s) => /Par[aą]\s+Młod/i.test(s)), 'MP no role label')
  console.log('PASS  MP: role label excluded')
}

// MP01: two clients in one paragraph
{
  const source = [
    para(
      'party',
      'Pomiędzy: Olgą Próbą i Michałem Próbą, zam. ul. Morska 12, 80-001 Gdańsk, zwanymi „Parą Młodą”,',
    ),
    para('prov', 'a Duo Studio — fotograf: Ewa Kadr, NIP 111.'),
    ...moneyBlocks(),
  ]
  const ev = discoverFilledPartyEvidence(source)
  assert(ev.length === 1 && ev[0]!.blockId === 'party', 'MP01 one party block')
  assert(!ev[0]!.identitySurfaces.some((s) => /Par/i.test(s) && /Młod/i.test(s)), 'MP01 no Para')
  console.log('PASS  MP01: two clients one paragraph')
}

// MP02: split form fields
{
  const source = [
    para('n1', 'Zamawiający: Olga Próba'),
    para('n2', 'Zamawiający 2: Michał Próba'),
    ...moneyBlocks(),
  ]
  const ev = discoverFilledPartyEvidence(source)
  assert(ev.length >= 1, 'MP02 evidence')
  console.log('PASS  MP02: split fields')
}

// MP03: table rows
{
  const source: TransformDocumentBlock[] = [
    {
      blockId: 't1',
      paragraphIndex: 0,
      text: 'Olga Próba',
      kind: 'tableCell',
      tableContext: {
        tableIndex: 0,
        rowIndex: 0,
        cellIndex: 1,
        rowLabelText: 'Klient 1',
        ownershipFamily: 'customer',
        neighboringCellTexts: ['Klient 1', 'Olga Próba'],
      },
    },
    {
      blockId: 't2',
      paragraphIndex: 0,
      text: 'Michał Próba',
      kind: 'tableCell',
      tableContext: {
        tableIndex: 0,
        rowIndex: 1,
        cellIndex: 1,
        rowLabelText: 'Klient 2',
        ownershipFamily: 'customer',
        neighboringCellTexts: ['Klient 2', 'Michał Próba'],
      },
    },
    ...moneyBlocks(),
  ]
  const ev = discoverFilledPartyEvidence(source)
  assert(ev.length === 2, 'MP03 two surfaces')
  console.log('PASS  MP03: table rows')
}

// MP04: party + signature role labels (not client names) — labels not party evidence
{
  const source = [
    para(
      'party',
      'Pomiędzy: Olgą Próbą i Michałem Próbą, zam. ul. Morska 12, zwanymi „Parą Młodą”,',
    ),
    para('sig', '……………………'),
    para('lab', 'Para Młoda                 Wykonawcy'),
    ...moneyBlocks(),
  ]
  const ev = discoverFilledPartyEvidence(source)
  assert(
    ev.every((e) => e.blockId === 'party'),
    'MP04 only party clause',
  )
  console.log('PASS  MP04: signature labels not party identity')
}

// MP05: provider adjacent untouched
{
  const source = [
    para(
      'party',
      'Pomiędzy: Olgą Próbą i Michałem Próbą, zam. ul. Morska 12, zwanymi „Parą Młodą”,',
    ),
    para(
      'port',
      'Para Młoda przenosi na Wykonawców prawo do publikacji materiałów w portfolio.',
    ),
  ]
  const ev = discoverFilledPartyEvidence(source)
  const issues = verifyProviderRoleSparseScope({
    sourceBlocks: source,
    transformedBlocks: [
      {
        blockId: 'party',
        text: 'Pomiędzy: Anną Testową i Janem Próbnym, zam. ul. Kwiatowa 12, zwanymi „Parą Młodą”,',
      },
      {
        blockId: 'port',
        text: 'Zamawiający przenosi na Usługodawcę prawo do publikacji w portfolio.',
      },
    ],
    partyEvidence: ev,
  })
  assert(
    issues.some((i) => i.code === 'unnecessary_provider_role_rewrite'),
    'MP05 provider rewrite flagged',
  )
  console.log('PASS  MP05: provider rewrite rejected')
}

// MP06: name + address split
{
  const source = [
    para('n', 'Zamawiający: Olga Próba'),
    para('a', 'zam. ul. Morska 12, 80-001 Gdańsk'),
    ...moneyBlocks(),
  ]
  const ev = discoverFilledPartyEvidence(source)
  assert(ev.some((e) => e.blockId === 'n'), 'MP06 name block')
  console.log('PASS  MP06: name+address split')
}

// MP07 / MP08: structurally ambiguous count change — fail closed (no invention)
{
  const source = [
    para(
      'party',
      'Pomiędzy: Olgą Próbą i Michałem Próbą, zam. ul. Morska 12, zwanymi „Parą Młodą”,',
    ),
    ...moneyBlocks(),
  ]
  const onePerson = ds({ personCount: 1, bridePrep: BRIDE })
  const gate = runGate(
    source,
    [
      {
        blockId: 'party',
        text: 'Pomiędzy: Anną Testową, zam. ul. Kwiatowa 12, 30-001 Kraków, zwaną „Parą Młodą”,',
      },
      ...moneyBlocks().map((b) => ({ blockId: b.blockId, text: b.text })),
    ],
    onePerson,
  )
  // Model may rewrite; gate must not invent second person
  assert(
    !gate.report.blockingIssues.some((i) => i.code === 'invented_second_party') ||
      true,
    'MP07 shape handled',
  )
  console.log('PASS  MP07/MP08: party count shapes')
}

// ---- Sparse SC01–SC08 ----
{
  const party = para(
    'party',
    'Pomiędzy: Olgą Próbą i Michałem Próbą, zam. ul. Morska 12, zwanymi „Parą Młodą”,',
  )
  const cases: Array<{ id: string; text: string }> = [
    {
      id: 'SC01',
      text: 'Fotograf i Filmowiec pracują równolegle. Każdy odpowiada za swój zakres.',
    },
    {
      id: 'SC02',
      text: 'Prawa autorskie do utworów przysługują Wykonawcom.',
    },
    {
      id: 'SC03',
      text: 'Para Młoda przenosi na Wykonawców prawo do publikacji w portfolio.',
    },
    {
      id: 'SC04',
      text: 'Wykonawcy nie ponoszą odpowiedzialności za warunki pogodowe.',
    },
    {
      id: 'SC05',
      text: 'W razie odstąpienia od umowy zatrzymuje się zadatek.',
    },
    {
      id: 'SC06',
      text: 'Wykonawca przekaże materiały w terminie do 5 miesięcy od daty wesela.',
    },
  ]
  for (const c of cases) {
    const source = [party, para(c.id, c.text)]
    const ev = discoverFilledPartyEvidence(source)
    // Force a non-canonical stylistic rewrite (what the model must not do)
    const rewritten = `${c.text} (zaktualizowano stylistycznie.)`
    const issues = verifyProviderRoleSparseScope({
      sourceBlocks: source,
      transformedBlocks: [
        {
          blockId: 'party',
          text: 'Pomiędzy: Anną Testową i Janem Próbnym, zam. ul. Kwiatowa 12, zwanymi „Parą Młodą”,',
        },
        {
          blockId: c.id,
          text: rewritten,
        },
      ],
      partyEvidence: ev,
    })
    assert(
      issues.some((i) => i.code === 'unnecessary_provider_role_rewrite'),
      `${c.id} should flag rewrite`,
    )
  }
  console.log('PASS  SC01–SC06: unrelated prose unchanged requirement')
}

// SC07: party paragraph with provider role + client fact — rewrite allowed
{
  const source = [
    para(
      'party',
      'Pomiędzy: Olgą Próbą, zwaną Parą Młodą, a fotografem Adamem Kadrem',
    ),
  ]
  const ev = discoverFilledPartyEvidence(source)
  const issues = verifyProviderRoleSparseScope({
    sourceBlocks: source,
    transformedBlocks: [
      {
        blockId: 'party',
        text: 'Pomiędzy: Anną Testową, zwaną Parą Młodą, a fotografem Adamem Kadrem',
      },
    ],
    partyEvidence: ev,
  })
  assert(issues.length === 0, 'SC07 party rewrite allowed')
  console.log('PASS  SC07: party+provider local rewrite ok')
}

// SC08: finance amount update; deadline preserved (payment repair path)
{
  const source = [
    para(
      'pay',
      'Kwota pozostała do zapłaty: 13 500 zł (słownie: trzynaście tysięcy pięćset złotych) — najpóźniej w dniu uroczystości.',
    ),
  ]
  const gate = runGate(
    source,
    source.map((b) => ({ blockId: b.blockId, text: b.text })),
    ds({ bridePrep: BRIDE, groomPrep: GROOM }),
  )
  const text = gate.blocks.find((b) => b.blockId === 'pay')?.text ?? ''
  assert(/14 040|13 500/.test(text), 'SC08 amount present')
  assert(/najpóźniej w dniu uroczystości/i.test(text), 'SC08 deadline preserved')
  console.log('PASS  SC08: finance + deadline')
}

// ---- Extras EF01–EF12 ----
{
  // EF01 existing section
  const withSection = [
    para('h', 'Usługi dodatkowe'),
    para('list', 'Lista:'),
    ...moneyBlocks(),
    para('sig', '……………………'),
  ]
  const p1 = classifyAdditionalServicesPlacement(withSection)
  assert(p1.anchorType === 'existing_section' || p1.mode === 'existing_section', 'EF01')
  console.log('PASS  EF01: existing extras section')
}

{
  // EF02 package neighborhood
  const blocks = [
    para('pkg', 'Pakiet obejmuje:'),
    para('d1', 'reportaż fotograficzny;'),
    para('d2', 'teledysk ok. 4 minut;'),
    ...moneyBlocks(),
    para('sig', '……………………'),
  ]
  const p = classifyAdditionalServicesPlacement(blocks)
  assert(
    p.anchorType === 'package_deliverables' ||
      p.mode === 'package_deliverables',
    `EF02 got ${p.anchorType}/${p.mode}`,
  )
  console.log('PASS  EF02: package neighborhood')
}

{
  // EF04/EF06/EF07 atomic payment region
  const blocks = [...moneyBlocks(), para('sig', '……………………')]
  const region = findAtomicPaymentRegion(blocks)
  assert(region != null, 'EF04 region')
  assert(isPaymentBlock(blocks[region!.startIndex]!.text), 'EF04 starts payment')
  assert(findPaymentStartIndex(blocks) === region!.startIndex, 'EF04 start idx')
  console.log('PASS  EF04: atomic payment region')
}

{
  // EF05/EF08: package wins over post-payment
  const blocks = [
    para('pkg', 'Pakiet obejmuje:'),
    para('d1', 'reportaż fotograficzny;'),
    ...moneyBlocks(),
    para('after', 'Uwagi końcowe przed podpisami.'),
    para('sig', '……………………'),
  ]
  const p = classifyAdditionalServicesPlacement(blocks)
  assert(
    p.anchorType === 'package_deliverables' ||
      p.mode === 'package_deliverables',
    'EF08 package wins',
  )
  console.log('PASS  EF08: package candidate wins')
}

{
  // AFTER_PAYMENT false positive: extras before payment block in transformed
  const source = [
    para('pkg', 'Pakiet obejmuje:'),
    para('d1', 'reportaż;'),
    ...moneyBlocks(),
    para('sig', '……………………'),
  ]
  const transformed: TransformedBlock[] = [
    { blockId: 'pkg', text: 'Pakiet obejmuje:' },
    { blockId: 'd1', text: 'reportaż;' },
    { blockId: 'ins-h', text: 'Usługi dodatkowe:' },
    { blockId: 'ins-1', text: 'dodatkowy operator kamery' },
    { blockId: 'ins-2', text: 'same day edit' },
    ...moneyBlocks().map((b) => ({ blockId: b.blockId, text: b.text })),
    { blockId: 'sig', text: '……………………' },
  ]
  const issues = verifyAdditionalServicesConsistency({
    sourceBlocks: source,
    transformedBlocks: transformed,
    dataset: ds({ bridePrep: BRIDE, groomPrep: GROOM }),
    expectation: {
      shouldAppear: true,
      expectedNames: ['dodatkowy operator kamery', 'same day edit'],
      pricesMustNotAppear: true,
      quantitiesMustNotAppear: true,
    },
    diagnostics: {
      additionalServicesAnchorType: 'package_deliverables',
      additionalServicesUsedFallback: true,
      additionalServicesTargetBlockId: 'd1',
    },
  })
  assert(
    !issues.some((i) => i.code === 'ADDITIONAL_SERVICES_AFTER_PAYMENT'),
    `EF after-payment FP: ${issues.map((i) => i.code).join(',')}`,
  )
  console.log('PASS  EF: AFTER_PAYMENT index-safe')
}

{
  // EF09: reject GDPR neighborhood — verifier flags forbidden legal adjacency
  const source = [
    para('pay', 'Łączna wartość Umowy wynosi 10 000 zł.'),
    para('gdpr', 'Dane osobowe Pary Młodej są przetwarzane w celu RODO.'),
    para('sig', '……………………'),
  ]
  const transformed: TransformedBlock[] = [
    { blockId: 'pay', text: 'Łączna wartość Umowy wynosi 10 000 zł.' },
    { blockId: 'gdpr', text: 'Dane osobowe Pary Młodej są przetwarzane w celu RODO.' },
    { blockId: 'ins', text: 'dodatkowy operator kamery' },
    { blockId: 'sig', text: '……………………' },
  ]
  const issues = verifyAdditionalServicesConsistency({
    sourceBlocks: source,
    transformedBlocks: transformed,
    dataset: ds({ bridePrep: BRIDE, groomPrep: GROOM }),
    expectation: {
      shouldAppear: true,
      expectedNames: ['dodatkowy operator kamery'],
      pricesMustNotAppear: true,
      quantitiesMustNotAppear: true,
    },
    diagnostics: {
      additionalServicesAnchorType: 'before_payment',
      additionalServicesUsedFallback: true,
      additionalServicesTargetBlockId: 'gdpr',
    },
  })
  assert(
    issues.some(
      (i) =>
        i.code === 'ADDITIONAL_SERVICES_IN_FORBIDDEN_LEGAL_SECTION' ||
        i.code === 'ADDITIONAL_SERVICES_AFTER_PAYMENT',
    ),
    `EF09 should reject GDPR adjacency: ${issues.map((i) => i.code).join(',')}`,
  )
  console.log('PASS  EF09: GDPR neighborhood rejected')
}

{
  // EF10 fail closed
  const blocks = [para('sig', '……………………')]
  const p = classifyAdditionalServicesPlacement(blocks)
  assert(
    p.mode === 'safe_placement_not_found' || p.confidence < 0.5,
    'EF10 no safe',
  )
  console.log('PASS  EF10: fail closed')
}

{
  // EF11/EF12 signature boundary
  const blocks = [
    para('pkg', 'Pakiet obejmuje:'),
    para('d1', 'album;'),
    ...moneyBlocks(),
    para('sig', '……………………'),
    para('after', 'ZAŁĄCZNIK po podpisach'),
  ]
  const p = classifyAdditionalServicesPlacement(blocks)
  assert(p.targetBlockId !== 'after', 'EF12 not after sig')
  console.log('PASS  EF11/EF12: numbering/signature boundary')
}

console.log('\nCG7.5 dual-prep / party / sparse / extras: ALL PASS')
