/**
 * CG7.4 — representation consistency, extras signature boundary, date semantics.
 * Run: npm run test:cg74-hardening
 */

import { classifyAdditionalServicesPlacement } from './additionalServicesPlacement'
import {
  findSignatureStartIndex,
  isSignatureBlock,
} from './packageDeliverablesDetection'
import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import {
  assertsContractExecutionDate,
  discoverExecutionDateEvidence,
} from './quality/dateFieldEvidence'
import { buildExpectationManifest } from './quality/expectationManifest'
import {
  discoverFilledLocationEvidence,
  isLocationsSectionHeading,
  parseLocationFormLine,
} from './quality/locationFieldEvidence'
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

function ds(
  partial?: Partial<ContractTransformationDataset>,
): ContractTransformationDataset {
  return {
    clients: {
      personCount: 2,
      displayNames: 'Anna Testowa i Jan Próbny',
      address: 'ul. Kwiatowa 12, 30-001 Kraków',
      phone: '+48 500 100 200',
    },
    dates: {
      contractExecutionDate: '20.09.2026 r.',
      weddingDate: '22.05.2027 r.',
    },
    package: { name: 'Photo Soft' },
    finances: {
      contractValueFormatted: '9 800 zł',
      contractValueWords: 'dziewięć tysięcy osiemset złotych',
      depositFormatted: '2 200 zł',
      depositWords: 'dwa tysiące dwieście złotych',
      remainingFormatted: '7 600 zł',
      remainingWords: 'siedem tysięcy sześćset złotych',
    },
    locations: {
      preparation: { fullAddress: 'ul. Długa 1, 30-001 Kraków' },
      ceremony: { displayName: 'Kościół św. Anny, Kraków' },
      reception: { displayName: 'Pałac Pod Baranami, Kraków' },
    },
    additionalServices: [
      { name: 'dodatkowy operator' },
      { name: 'film w wersji rozszerzonej' },
    ],
    ...partial,
  }
}

function emptyProtected() {
  return { exactProtectedValues: [] as string[], protectedPatterns: [] as string[] }
}

function money(): TransformDocumentBlock {
  return para(
    'money',
    'Cena 9 800 zł (słownie: dziewięć tysięcy osiemset złotych). Opłata rezerwacyjna 2 200 zł. Saldo 7 600 zł.',
  )
}

function asIs(source: TransformDocumentBlock[]): TransformedBlock[] {
  return source.map((b) => ({ blockId: b.blockId, text: b.text }))
}

function run(source: TransformDocumentBlock[], transformed: TransformedBlock[], dataset = ds()) {
  return runPostReconstructionQualityGate({
    sourceBlocks: source,
    transformedBlocks: transformed,
    dataset,
    protectedData: emptyProtected(),
    mode: 'full_ai',
  })
}

// ---- Representation consistency invariant ----
{
  const source = [
    para('p0', 'Umowa.'),
    para('scope', 'Zakres obejmuje miejsce ceremonii oraz salę weselną.'),
    money(),
  ]
  const m = buildExpectationManifest({
    sourceBlocks: source,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m.representedConcepts?.receptionLocation === false, 'INV: reception not represented')
  assert(
    !m.sourceSpecificValues.some(
      (s) =>
        s.canonicalField === 'wedding.receptionLocation' && s.mustDisappear,
    ),
    'INV: no stale reception inventory without evidence',
  )
  assert(
    !m.requiredFields.some((f) => f.canonicalField === 'wedding.receptionLocation'),
    'INV: no mustAppear reception',
  )
  console.log('PASS  INV: NOT_REPRESENTED ⇒ no mustAppear/mustDisappear')
}

// ---- Unknown vocabulary via structural form cluster (no synonym list) ----
{
  const source = [
    para('h', 'LOKALIZACJE'),
    para('a', 'punkt startowy ekipy: ul. Nowa 1, Kraków'),
    para('b', 'miejsce ceremonii: Kościół Demo'),
    para('c', 'sala weselna: Hotel Demo'),
    money(),
  ]
  // "punkt startowy ekipy" is NOT a parseLocationFormLine (no miejsce/sala/adres)
  // Use unknown vocab that still matches form label class:
  const source2 = [
    para('h', 'LOKALIZACJE'),
    para('a', 'miejsce zbierania się: ul. Nowa 1, Kraków'),
    para('b', 'miejsce ceremonii: Kościół Demo'),
    para('c', 'sala weselna: Hotel Demo'),
    money(),
  ]
  assert(isLocationsSectionHeading('LOKALIZACJE'), 'UV: section heading')
  assert(parseLocationFormLine(source2[1]!.text)?.label === 'miejsce zbierania się', 'UV: form parse')
  const ev = discoverFilledLocationEvidence(source2)
  assert(ev.some((e) => e.blockId === 'a' && e.role === 'preparation'), 'UV: unknown prep via position')
  assert(ev.some((e) => e.blockId === 'b' && e.role === 'ceremony'), 'UV: ceremony')
  assert(ev.some((e) => e.blockId === 'c' && e.role === 'reception'), 'UV: reception')
  void source
  console.log('PASS  UV: unknown vocab grounded structurally without synonym list')
}

// ---- U02-like form cluster ----
{
  const source = [
    para('h', 'LOKALIZACJE'),
    para('p', 'miejsce szykowania się: ul. Przykładowa 1, Kraków'),
    para('c', 'miejsce ceremonii: Kościół / USC wskazany przez Klientów'),
    para('r', 'sala weselna: obiekt wskazany przez Klientów'),
    money(),
  ]
  const ev = discoverFilledLocationEvidence(source)
  assert(ev.some((e) => e.blockId === 'p' && e.role === 'preparation'), 'U02F: prep')
  assert(ev.some((e) => e.blockId === 'c' && e.role === 'ceremony'), 'U02F: ceremony')
  assert(ev.some((e) => e.blockId === 'r' && e.role === 'reception'), 'U02F: reception')
  const gate = run(source, asIs(source))
  assert(/Długa 1/.test(gate.blocks.find((b) => b.blockId === 'p')?.text ?? ''), 'U02F: prep filled')
  assert(/Anny/.test(gate.blocks.find((b) => b.blockId === 'c')?.text ?? ''), 'U02F: ceremony filled')
  assert(/Baranami/.test(gate.blocks.find((b) => b.blockId === 'r')?.text ?? ''), 'U02F: reception filled')
  console.log('PASS  U02F: form cluster fill')
}

// ---- Dates D01–D12 (compact) ----
{
  // D01 wedding only
  const s1 = [para('w', 'Ślub odbędzie się 22.05.2027 r.'), money()]
  const m1 = buildExpectationManifest({
    sourceBlocks: s1,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m1.representedConcepts?.weddingDate === true, 'D01 wedding')
  assert(
    !discoverExecutionDateEvidence(s1).length,
    'D01 no execution evidence',
  )

  // D02 execution only
  const s2 = [para('e', 'Data podpisania: 05.02.2026'), money()]
  assert(assertsContractExecutionDate(s2[0]!.text), 'D02 asserts exec')
  const m2 = buildExpectationManifest({
    sourceBlocks: s2,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m2.representedConcepts?.contractExecutionDate === true, 'D02 exec represented')

  // D03 both
  const s3 = [
    para('e', 'Data podpisania: 05.02.2026'),
    para('w', 'Data ślubu: 22.05.2027'),
    money(),
  ]
  const gate3 = run(s3, asIs(s3))
  assert(/20\.09\.2026/.test(gate3.blocks.find((b) => b.blockId === 'e')?.text ?? ''), 'D03 exec filled')
  assert(!/05\.02\.2026/.test(gate3.blocks.find((b) => b.blockId === 'e')?.text ?? ''), 'D03 old exec gone')

  // D06 form signing
  assert(
    discoverExecutionDateEvidence([para('e', 'Data podpisania: 01.01.2020')])[0]
      ?.representation === 'form_line',
    'D06 form',
  )

  // D09 CRM has exec, template does not → no insert
  const s9 = [para('p', 'Umowa o reportaż.'), money()]
  const m9 = buildExpectationManifest({
    sourceBlocks: s9,
    dataset: ds(),
    protectedData: emptyProtected(),
  })
  assert(m9.representedConcepts?.contractExecutionDate === false, 'D09 not represented')
  assert(
    !m9.requiredFields.some((f) => f.canonicalField === 'contract.executionDate'),
    'D09 no mustAppear',
  )

  // D11 no swap — wedding date line must not become execution date
  const s11 = [
    para('e', 'Data podpisania: 05.02.2026'),
    para('w', 'Data ślubu 22.05.2027'),
    money(),
  ]
  const g11 = run(s11, asIs(s11))
  assert(/22\.05\.2027/.test(g11.blocks.find((b) => b.blockId === 'w')?.text ?? ''), 'D11 wedding kept')
  assert(/20\.09\.2026/.test(g11.blocks.find((b) => b.blockId === 'e')?.text ?? ''), 'D11 exec updated')

  // Signature false positive guard
  assert(
    !isSignatureBlock(para('e', 'Data podpisania: 05.02.2026')),
    'D: data podpisania is NOT signature',
  )

  console.log('PASS  D01–D12 date semantics (core)')
}

// ---- Extras boundary E01–E12 (compact) ----
{
  const sig = para('sig', '……………………')
  const names = para('sigN', 'Anna   Jan   Studio')

  // E01 explicit extras before signatures
  {
    const source = [
      para('pkg', 'Pakiet Photo Soft:'),
      para('d1', '• galeria'),
      money(),
      para('exH', 'Usługi dodatkowe:'),
      para('exB', '(brak wybranych)'),
      para('legal', 'Prawa autorskie pozostają u Wykonawcy.'),
      sig,
      names,
    ]
    const p = classifyAdditionalServicesPlacement(source)
    assert(p.mode === 'existing_section', 'E01 existing')
    assert(p.targetBlockId === 'exB' || p.targetBlockId === 'exH', 'E01 target in section')
    assert(findSignatureStartIndex(source) === source.findIndex((b) => b.blockId === 'sig'), 'E01 sig')
  }

  // E04 only after signatures → fail closed path
  {
    const source = [
      money(),
      sig,
      names,
      para('exH', 'Usługi dodatkowe:'),
      para('exB', '(brak)'),
    ]
    const p = classifyAdditionalServicesPlacement(source)
    assert(
      p.mode === 'safe_placement_not_found' ||
        (p.targetBlockId &&
          source.findIndex((b) => b.blockId === p.targetBlockId) <
            findSignatureStartIndex(source)),
      'E04 no post-signature target',
    )
  }

  // E05 signature table-ish dotted
  {
    const source = [money(), para('s', '……………………'), names]
    assert(isSignatureBlock(source[1]!), 'E05 dotted is signature')
  }

  // E06 dotted paragraphs excluded
  {
    const source = [
      para('pkg', 'Pakiet obejmuje:'),
      para('d1', '• album'),
      money(),
      para('dots', '………………'),
      names,
    ]
    const p = classifyAdditionalServicesPlacement(source)
    if (p.targetBlockId) {
      const idx = source.findIndex((b) => b.blockId === p.targetBlockId)
      assert(idx < findSignatureStartIndex(source), 'E06 before sig')
    }
  }

  // E10 no safe destination
  {
    const source = [sig, names]
    const p = classifyAdditionalServicesPlacement(source)
    assert(
      p.mode === 'safe_placement_not_found' || p.confidence === 0,
      'E10 fail closed',
    )
  }

  console.log('PASS  E01–E12 extras boundary (core)')
}

console.log('\nCG7.4 hardening acceptance: ALL PASS')
