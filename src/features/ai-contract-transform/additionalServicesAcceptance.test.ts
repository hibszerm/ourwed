/**
 * Additional services in contract generation — dataset, placement, insertion, quality.
 * Run: npm run test:contract-additional-services
 */

import { classifyAdditionalServicesPlacement } from './additionalServicesPlacement'
import {
  formatAdditionalServicesDisplayText,
  projectContractAdditionalServices,
  renderAdditionalServicesFallbackBlock,
  renderSeparateAdditionalServicesParagraphs,
  serviceNamePresentInText,
  textLooksLikeServicePriceOrQuantity,
} from './contractAdditionalServices'
import { expandBlocksWithParagraphInsertions } from './expandBlocksWithInsertions'
import { insertAdditionalServicesIntoBlocks } from './insertAdditionalServices'
import {
  detectPackageDeliverablesAnchor,
  detectPackageIntroductionAnchor,
  findSignatureStartIndex,
  isOvertimeProvisionBlock,
  isSignatureBlock,
} from './packageDeliverablesDetection'
import { buildProtectedContractData } from './protectedContractData'
import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import { buildExpectationManifest } from './quality/expectationManifest'
import { verifyAdditionalServicesConsistency } from './quality/additionalServicesConsistency'
import { buildContractTransformationDataset } from './transformationDataset'
import type { ContractTransformationDataset, TransformDocumentBlock } from './types'
import type { WeddingExtraService } from '@/types/package'
import type { Wedding } from '@/types/wedding'

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

function block(
  id: string,
  text: string,
  extra?: Partial<TransformDocumentBlock>,
): TransformDocumentBlock {
  return {
    blockId: id,
    paragraphIndex: Number(id.replace(/\D/g, '')) || 0,
    text,
    kind: 'paragraph',
    ...extra,
  }
}

const SAMPLE_WEDDING = {
  id: 'w1',
  date: '2026-08-15',
  price: 12000,
  depositAmount: 3000,
  currency: 'PLN',
  packageId: 'pkg-1',
  packageName: 'Pakiet Premium',
  couple: {
    partner1: 'Anna Kowalska',
    partner2: 'Jan Nowak',
    partner1Address: 'ul. Testowa 1',
    partner1City: 'Kraków',
    partner1PostalCode: '30-001',
  },
} as unknown as Wedding

const EXTRAS: WeddingExtraService[] = [
  {
    id: 'e1',
    weddingId: 'w1',
    extraServiceId: 's1',
    priceSnapshot: 800,
    quantity: 2,
    createdAt: '2026-01-01',
    name: 'Dron',
  },
  {
    id: 'e2',
    weddingId: 'w1',
    extraServiceId: 's2',
    priceSnapshot: 1500,
    quantity: 1,
    createdAt: '2026-01-02',
    name: 'Album 30×30',
  },
  {
    id: 'e3',
    weddingId: 'w1',
    extraServiceId: 's3',
    priceSnapshot: 500,
    quantity: 1,
    createdAt: '2026-01-03',
    name: 'Instagram Reel',
  },
]

run('dataset: one / many / none / dedupe / order / no price or quantity', () => {
  const one = projectContractAdditionalServices([EXTRAS[0]!])
  assertEq(one.length, 1, 'one')
  assertEq(one[0]!.name, 'Dron', 'name')
  assert(!('priceSnapshot' in one[0]!), 'no price')
  assert(!('quantity' in one[0]!), 'no quantity')

  const many = projectContractAdditionalServices(EXTRAS)
  assertEq(many.length, 3, 'many')
  assertEq(many[0]!.name, 'Dron', 'order')
  assertEq(many[2]!.name, 'Instagram Reel', 'order last')

  const duped = projectContractAdditionalServices([
    ...EXTRAS,
    { ...EXTRAS[0]!, id: 'e-dup' },
  ])
  assertEq(duped.length, 3, 'dedupe')

  const trimmed = projectContractAdditionalServices([
    { ...EXTRAS[0]!, name: '  Dron  ' },
  ])
  assertEq(trimmed[0]!.name, 'Dron', 'trim')

  const ds = buildContractTransformationDataset({
    wedding: SAMPLE_WEDDING,
    package: { id: 'pkg-1', name: 'Pakiet Premium' },
    extras: EXTRAS,
  })
  assertEq(ds.additionalServices?.length, 3, 'dataset extras')
  assert(
    ds.additionalServicesDisplayText?.includes('Album 30×30') === true,
    'display',
  )
  assert(ds.additionalServicesExpectation?.shouldAppear === true, 'expectation')
  assert(
    ds.additionalServicesExpectation?.pricesMustNotAppear === true,
    'no prices flag',
  )

  const empty = buildContractTransformationDataset({
    wedding: SAMPLE_WEDDING,
    package: { id: 'pkg-1', name: 'Pakiet Premium' },
    extras: [],
  })
  assertEq(empty.additionalServices, undefined, 'empty extras omitted')
})

run('placement: existing section heading detected', () => {
  const blocks = [
    block('para-1', 'Zakres usług pakietu Premium'),
    block('para-2', 'Usługi dodatkowe'),
    block('para-3', '– Teledysk'),
    block('para-4', 'Wynagrodzenie wynosi 12 000 zł'),
  ]
  const placement = classifyAdditionalServicesPlacement(blocks)
  assert(placement != null, 'placement')
  assertEq(placement!.mode, 'existing_section', 'mode')
  assert(placement!.confidence >= 0.75, 'confidence')
})

run('placement: package scope before payment when no deliverables list', () => {
  const blocks = [
    block('para-1', 'Pakiet Premium obejmuje:'),
    block('para-2', 'Foto + wideo', {
      kind: 'tableCell',
      tableContext: {
        tableIndex: 0,
        rowIndex: 1,
        cellIndex: 1,
        rowLabelText: 'Materiał',
        neighboringCellTexts: [],
        ownershipFamily: 'service_scope',
      },
    }),
    block('para-3', ''),
    block('para-4', 'Wynagrodzenie za usługi wynosi 12 000 zł'),
  ]
  const placement = classifyAdditionalServicesPlacement(blocks)
  assertEq(placement.mode, 'package_scope', 'package_scope')
  assert(placement.targetBlockId === 'para-3', 'after table scope')
})

run('insertion: existing section appends names only', () => {
  const sourceBlocks = [
    block('para-1', 'Usługi dodatkowe'),
    block('para-2', '– Teledysk'),
    block('para-3', 'Wynagrodzenie'),
  ]
  const dataset: ContractTransformationDataset = {
    clients: { displayNames: 'A i B', personCount: 2 },
    dates: {
      contractExecutionDate: '01.01.2026 r.',
      weddingDate: '15.08.2026 r.',
    },
    locations: {},
    finances: {
      contractValueFormatted: '12 000 zł',
      contractValueWords: 'dwanaście tysięcy złotych',
    },
    package: { name: 'Premium' },
    additionalServices: [
      { name: 'Dron' },
      { name: 'Album 30×30' },
    ],
    additionalServicesExpectation: {
      expectedNames: ['Dron', 'Album 30×30'],
      shouldAppear: true,
      pricesMustNotAppear: true,
      quantitiesMustNotAppear: true,
    },
  }
  const transformed = sourceBlocks.map((b) => ({
    blockId: b.blockId,
    text: b.text,
  }))
  const result = insertAdditionalServicesIntoBlocks({
    blocks: transformed,
    sourceBlocks,
    dataset,
  })
  const target = result.blocks.find((b) => b.blockId === 'para-2')!
  assert(serviceNamePresentInText(target.text, 'Dron'), 'dron')
  assert(serviceNamePresentInText(target.text, 'Album 30×30'), 'album')
  assert(!target.text.includes('800'), 'no price')
  assert(!target.text.includes('szt'), 'no quantity')
  assert(serviceNamePresentInText(target.text, 'Teledysk'), 'keeps existing')
  assertEq(result.diagnostics.additionalServicesPlacementMode, 'existing_section', 'mode')
})

run('insertion: unnumbered fallback after package table (no §2 heading)', () => {
  const sourceBlocks = [
    block('para-1', 'Zakres pakietu'),
    block('para-2', 'Materiał foto', {
      kind: 'tableCell',
      tableContext: {
        tableIndex: 0,
        rowIndex: 0,
        cellIndex: 0,
        rowLabelText: 'Materiał',
        neighboringCellTexts: [],
        ownershipFamily: 'service_scope',
      },
    }),
    block('para-3', ''),
    block('para-4', 'Wynagrodzenie 12 000 zł'),
  ]
  const dataset: ContractTransformationDataset = {
    clients: { displayNames: 'A i B', personCount: 2 },
    dates: {
      contractExecutionDate: '01.01.2026 r.',
      weddingDate: '15.08.2026 r.',
    },
    locations: {},
    finances: {
      contractValueFormatted: '12 000 zł',
      contractValueWords: 'dwanaście tysięcy złotych',
    },
    package: { name: 'Premium' },
    additionalServices: EXTRAS.map((e) => ({ id: e.extraServiceId, name: e.name! })),
  }
  const transformed = sourceBlocks.map((b) => ({
    blockId: b.blockId,
    text: b.text,
  }))
  const result = insertAdditionalServicesIntoBlocks({
    blocks: transformed,
    sourceBlocks,
    dataset,
  })
  const target = result.blocks.find((b) => b.blockId === 'para-3')!
  assert(!/^§\s*\d+/m.test(target.text), 'no numbered section')
  assert(!/^Usługi dodatkowe$/m.test(target.text.trim()), 'no §2-style heading')
  assert(result.paragraphInsertions.length === 1, 'inserted as new paragraphs')
  const expanded = expandBlocksWithParagraphInsertions({
    sourceBlocks,
    blocks: result.blocks,
    insertions: result.paragraphInsertions,
  })
  const full = expanded.map((b) => b.text).join('\n')
  assert(serviceNamePresentInText(full, 'Dron'), 'dron')
  assert(serviceNamePresentInText(full, 'Instagram Reel'), 'reel')
  assertEq(result.diagnostics.additionalServicesAnchorType, 'package_scope', 'anchor')
})

run('insertion: empty list changes nothing', () => {
  const sourceBlocks = [block('para-1', 'Treść umowy')]
  const dataset: ContractTransformationDataset = {
    clients: { displayNames: 'A', personCount: 1 },
    dates: {
      contractExecutionDate: '01.01.2026 r.',
      weddingDate: '15.08.2026 r.',
    },
    locations: {},
    finances: {
      contractValueFormatted: '5 000 zł',
      contractValueWords: 'pięć tysięcy złotych',
    },
    package: {},
  }
  const transformed = sourceBlocks.map((b) => ({
    blockId: b.blockId,
    text: b.text,
  }))
  const result = insertAdditionalServicesIntoBlocks({
    blocks: transformed,
    sourceBlocks,
    dataset,
  })
  assertEq(result.blocks[0]!.text, 'Treść umowy', 'unchanged')
  assertEq(result.diagnostics.additionalServicesPlacementMode, 'skipped', 'skipped')
})

run('insertion: does not duplicate services already in section', () => {
  const sourceBlocks = [
    block('para-1', 'Usługi dodatkowe'),
    block('para-2', '– Dron'),
  ]
  const dataset: ContractTransformationDataset = {
    clients: { displayNames: 'A', personCount: 1 },
    dates: {
      contractExecutionDate: '01.01.2026 r.',
      weddingDate: '15.08.2026 r.',
    },
    locations: {},
    finances: {
      contractValueFormatted: '5 000 zł',
      contractValueWords: 'pięć tysięcy złotych',
    },
    package: {},
    additionalServices: [{ name: 'Dron' }, { name: 'Album 30×30' }],
  }
  const transformed = sourceBlocks.map((b) => ({
    blockId: b.blockId,
    text: b.text,
  }))
  const result = insertAdditionalServicesIntoBlocks({
    blocks: transformed,
    sourceBlocks,
    dataset,
  })
  const text = result.blocks.map((b) => b.text).join('\n')
  const dronCount = (text.match(/dron/gi) ?? []).length
  assert(dronCount === 1, 'dron once')
  assert(serviceNamePresentInText(text, 'Album 30×30'), 'album added')
})

run('real contract fixture with overtime: VHS in separate paragraphs after pendrive', () => {
  const overtimeText =
    'Każda dodatkowa godzina to koszt w wysokości 900 zł.'
  const sourceBlocks = [
    block(
      'para-1',
      'przyjęcia weselnego (...) reportaż obejmuje czas maksymalnie do godziny 23.30.',
    ),
    block('para-2', 'Czas pracy filmowca wynosi maksymalnie 12 godzin.'),
    block('para-3', overtimeText),
    block(
      'para-4',
      'Para młoda wybiera wykonanie dzieła w tzw. Pakiecie Video Standard, który obejmuje wykonanie (...) przez Filmowca:',
    ),
    block('para-5', 'teledysku ślubnego o długości ok. 3 minut;'),
    block('para-6', 'filmu ślubnego o długości około 15 minut;'),
    block('para-7', 'mini sesji filmowej w dniu ślubu'),
    block(
      'para-8',
      '- oraz przekazanie filmów w wersji elektronicznej na pendrive Parze Młodej.',
    ),
    block('para-9', 'Filmowiec wykonuje przedmiot Umowy pojedynczo...'),
  ]

  assert(isOvertimeProvisionBlock(overtimeText), 'overtime detected')
  const intro = detectPackageIntroductionAnchor(sourceBlocks)
  assert(intro != null, 'package intro found')
  assertEq(intro!.blockId, 'para-4', 'intro is para mloda wybiera')

  const anchor = detectPackageDeliverablesAnchor(sourceBlocks)
  assert(anchor != null, 'deliverables anchor found')
  assertEq(anchor!.lastDeliverableBlockId, 'para-8', 'last deliverable is pendrive')
  assert(anchor!.lastDeliverableIndex > anchor!.packageIntroductionBlockIndex, 'after intro')

  const placement = classifyAdditionalServicesPlacement(sourceBlocks)
  assertEq(placement.mode, 'package_deliverables', 'deliverables placement')
  assertEq(placement.targetBlockId, 'para-8', 'target pendrive block')

  const dataset: ContractTransformationDataset = {
    clients: { displayNames: 'A i B', personCount: 2 },
    dates: {
      contractExecutionDate: '01.01.2026 r.',
      weddingDate: '15.08.2026 r.',
    },
    locations: {},
    finances: {
      contractValueFormatted: '12 000 zł',
      contractValueWords: 'dwanaście tysięcy złotych',
    },
    package: { name: 'Video Standard' },
    additionalServices: [{ name: 'VHS' }],
  }

  const transformed = sourceBlocks.map((b) => ({ blockId: b.blockId, text: b.text }))
  const result = insertAdditionalServicesIntoBlocks({
    blocks: transformed,
    sourceBlocks,
    dataset,
  })

  const overtime = result.blocks.find((b) => b.blockId === 'para-3')!
  assertEq(overtime.text, overtimeText, 'overtime byte-for-byte unchanged')
  assert(!serviceNamePresentInText(overtime.text, 'VHS'), 'vhs not in overtime')

  const pendrive = result.blocks.find((b) => b.blockId === 'para-8')!
  assertEq(
    pendrive.text,
    '- oraz przekazanie filmów w wersji elektronicznej na pendrive Parze Młodej.',
    'pendrive unchanged',
  )
  assert(!serviceNamePresentInText(pendrive.text, 'VHS'), 'vhs not inline on pendrive')

  assert(result.paragraphInsertions.length === 1, 'one insertion batch')
  assert(
    result.paragraphInsertions[0]!.paragraphs.some((p) =>
      p.includes('Ponadto Zamawiający wybrał następującą usługę dodatkową'),
    ),
    'intro paragraph',
  )
  assert(
    result.paragraphInsertions[0]!.paragraphs.some((p) => p.includes('– VHS.')),
    'vhs item paragraph',
  )
  assertEq(result.paragraphInsertions[0]!.afterParagraphIndex, 8, 'after pendrive index')

  const expanded = expandBlocksWithParagraphInsertions({
    sourceBlocks,
    blocks: result.blocks,
    insertions: result.paragraphInsertions,
  })
  const vhsIdx = expanded.findIndex((b) => serviceNamePresentInText(b.text, 'VHS'))
  const pendriveIdx = expanded.findIndex((b) => b.blockId === 'para-8')
  const staffingIdx = expanded.findIndex((b) => b.blockId === 'para-9')
  assert(vhsIdx > pendriveIdx, 'vhs after pendrive')
  assert(vhsIdx < staffingIdx, 'vhs before staffing')
  assert(result.diagnostics.additionalServicesInsertedAsSeparateBlocks === true, 'separate blocks')
})

run('real contract fixture: VHS after pendrive item, before staffing clause', () => {
  const sourceBlocks = [
    block('para-1', '§ 1'),
    block(
      'para-2',
      'Przedmiotem Umowy jest wykonanie dzieła w postaci filmu ślubnego.',
    ),
    block(
      'para-3',
      'Para młoda wybiera wykonanie dzieła w tzw. Pakiecie Video Standard, który obejmuje:',
    ),
    block('para-4', 'teledysku ślubnego o długości ok. 3 minut;'),
    block('para-5', 'filmu ślubnego o długości około 15 minut;'),
    block('para-6', 'mini sesji filmowej w dniu ślubu'),
    block(
      'para-7',
      '- oraz przekazanie filmów w wersji elektronicznej na pendrive Parze Młodej.',
    ),
    block('para-8', 'Filmowiec wykonuje przedmiot Umowy pojedynczo...'),
    block('para-9', 'Filmowiec przekaże Parze młodej dzieło...'),
    block('para-10', 'Para młoda', {
      kind: 'tableCell',
      tableContext: {
        tableIndex: 0,
        rowIndex: 0,
        cellIndex: 0,
        rowLabelText: 'Para młoda',
        neighboringCellTexts: ['Filmowiec'],
        ownershipFamily: 'unknown',
      },
    }),
    block('para-11', 'Filmowiec', {
      kind: 'tableCell',
      tableContext: {
        tableIndex: 0,
        rowIndex: 0,
        cellIndex: 1,
        rowLabelText: 'Para młoda',
        neighboringCellTexts: ['Para młoda'],
        ownershipFamily: 'unknown',
      },
    }),
    block('para-12', 'Z tytułu wykonania Umowy Zamawiający zobowiązuje się...'),
  ]

  const anchor = detectPackageDeliverablesAnchor(sourceBlocks)
  assert(anchor != null, 'deliverables anchor found')
  assertEq(anchor!.lastDeliverableBlockId, 'para-7', 'last deliverable is pendrive')

  const placement = classifyAdditionalServicesPlacement(sourceBlocks)
  assertEq(placement.mode, 'package_deliverables', 'deliverables placement')
  assertEq(placement.targetBlockId, 'para-7', 'target pendrive block')

  const dataset: ContractTransformationDataset = {
    clients: { displayNames: 'A i B', personCount: 2 },
    dates: {
      contractExecutionDate: '01.01.2026 r.',
      weddingDate: '15.08.2026 r.',
    },
    locations: {},
    finances: {
      contractValueFormatted: '12 000 zł',
      contractValueWords: 'dwanaście tysięcy złotych',
    },
    package: { name: 'Video Standard' },
    additionalServices: [{ name: 'VHS' }],
    additionalServicesExpectation: {
      expectedNames: ['VHS'],
      shouldAppear: true,
      pricesMustNotAppear: true,
      quantitiesMustNotAppear: true,
    },
  }

  const transformed = sourceBlocks.map((b) => ({ blockId: b.blockId, text: b.text }))
  const result = insertAdditionalServicesIntoBlocks({
    blocks: transformed,
    sourceBlocks,
    dataset,
  })

  const pendrive = result.blocks.find((b) => b.blockId === 'para-7')!
  assert(!serviceNamePresentInText(pendrive.text, 'VHS'), 'vhs not inline on pendrive')
  assert(result.paragraphInsertions.length === 1, 'separate paragraphs inserted')

  const staffing = result.blocks.find((b) => b.blockId === 'para-8')!
  assertEq(staffing.text, 'Filmowiec wykonuje przedmiot Umowy pojedynczo...', 'staffing unchanged')

  const expanded = expandBlocksWithParagraphInsertions({
    sourceBlocks,
    blocks: result.blocks,
    insertions: result.paragraphInsertions,
  })
  const vhsIdx = expanded.findIndex((b) => serviceNamePresentInText(b.text, 'VHS'))
  const sigIdx = findSignatureStartIndex(sourceBlocks)
  assert(vhsIdx >= 0 && vhsIdx < sigIdx, 'vhs before signature')
})

run('signature blocks detected and block placement after them', () => {
  const blocks = [
    block('para-1', 'Pakiet obejmuje:'),
    block('para-2', 'film ślubny;'),
    block('para-3', 'Para młoda'),
    block('para-4', 'Z tytułu wykonania Umowy...'),
  ]
  assert(isSignatureBlock(blocks[2]!), 'para mloda is signature')
  const placement = classifyAdditionalServicesPlacement(blocks)
  assert(placement.targetBlockId === 'para-2', 'before signature')
  assert(findSignatureStartIndex(blocks) === 2, 'signature index')
})

run('separate paragraph rendering', () => {
  const paras = renderSeparateAdditionalServicesParagraphs(['VHS'])
  assertEq(paras.length, 2, 'intro + item')
  assert(paras[0]!.includes('następującą usługę dodatkową'), 'singular intro')
  assertEq(paras[1], '– VHS.', 'vhs item')
  const multi = renderSeparateAdditionalServicesParagraphs(['VHS', 'Dron', 'Album 30×30'])
  assert(multi[0]!.includes('następujące usługi dodatkowe'), 'plural intro')
  assert(multi.some((p) => p.includes('Album 30×30')), 'product name preserved')
})

run('overtime paragraph never selected as deliverable anchor', () => {
  const blocks = [
    block('para-1', 'Każda dodatkowa godzina to koszt w wysokości 900 zł.'),
    block('para-2', 'Para młoda wybiera wykonanie dzieła w tzw. Pakiecie Video Standard, który obejmuje:'),
    block('para-3', 'teledysku ślubnego o długości ok. 3 minut;'),
    block('para-4', 'Filmowiec wykonuje przedmiot Umowy pojedynczo...'),
  ]
  const anchor = detectPackageDeliverablesAnchor(blocks)
  assert(anchor != null, 'anchor found')
  assertEq(anchor!.lastDeliverableBlockId, 'para-3', 'not overtime')
  assert(anchor!.lastDeliverableIndex > anchor!.packageIntroductionBlockIndex, 'after intro')
})

run('safe placement failure when signature is at document start', () => {
  const sourceBlocks = [
    block('para-1', 'Para młoda'),
    block('para-2', 'Filmowiec'),
    block('para-3', 'Z tytułu wykonania Umowy...'),
  ]
  const dataset: ContractTransformationDataset = {
    clients: { displayNames: 'A', personCount: 1 },
    dates: {
      contractExecutionDate: '01.01.2026 r.',
      weddingDate: '15.08.2026 r.',
    },
    locations: {},
    finances: {
      contractValueFormatted: '5 000 zł',
      contractValueWords: 'pięć tysięcy złotych',
    },
    package: {},
    additionalServices: [{ name: 'VHS' }],
    additionalServicesExpectation: {
      expectedNames: ['VHS'],
      shouldAppear: true,
      pricesMustNotAppear: true,
      quantitiesMustNotAppear: true,
    },
  }
  const placement = classifyAdditionalServicesPlacement(sourceBlocks)
  assertEq(placement.mode, 'safe_placement_not_found', 'safe failure')
  const result = insertAdditionalServicesIntoBlocks({
    blocks: sourceBlocks.map((b) => ({ blockId: b.blockId, text: b.text })),
    sourceBlocks,
    dataset,
    placement,
  })
  const full = result.blocks.map((b) => b.text).join('\n')
  assert(!serviceNamePresentInText(full, 'VHS'), 'not inserted unsafely')
})

run('quality gate: missing service flagged', () => {
  const sourceBlocks = [
    block('para-1', 'Usługi dodatkowe'),
    block('para-2', ''),
    block('para-3', 'Wynagrodzenie'),
  ]
  const dataset: ContractTransformationDataset = {
    clients: { displayNames: 'A i B', personCount: 2 },
    dates: {
      contractExecutionDate: '01.01.2026 r.',
      weddingDate: '15.08.2026 r.',
    },
    locations: {},
    finances: {
      contractValueFormatted: '12 000 zł',
      contractValueWords: 'dwanaście tysięcy złotych',
    },
    package: { name: 'Premium' },
    additionalServices: [{ name: 'Dron' }],
    additionalServicesExpectation: {
      expectedNames: ['Dron'],
      shouldAppear: true,
      pricesMustNotAppear: true,
      quantitiesMustNotAppear: true,
    },
  }
  const transformed = sourceBlocks.map((b) => ({
    blockId: b.blockId,
    text: b.text,
  }))
  const issues = verifyAdditionalServicesConsistency({
    transformedBlocks: transformed,
    sourceBlocks,
    dataset,
    expectation: dataset.additionalServicesExpectation,
  })
  assert(issues.some((i) => i.code === 'ADDITIONAL_SERVICE_MISSING'), 'missing')
})

run('quality gate: price next to service flagged', () => {
  const issues = verifyAdditionalServicesConsistency({
    transformedBlocks: [
      { blockId: 'para-1', text: '– Dron — 800 zł' },
    ],
    sourceBlocks: [block('para-1', '')],
    dataset: {
      clients: { displayNames: 'A', personCount: 1 },
      dates: {
        contractExecutionDate: '01.01.2026 r.',
        weddingDate: '15.08.2026 r.',
      },
      locations: {},
      finances: {
        contractValueFormatted: '5 000 zł',
        contractValueWords: 'pięć tysięcy złotych',
      },
      package: {},
      additionalServicesExpectation: {
        expectedNames: ['Dron'],
        shouldAppear: true,
        pricesMustNotAppear: true,
        quantitiesMustNotAppear: true,
      },
    },
    expectation: {
      expectedNames: ['Dron'],
      shouldAppear: true,
      pricesMustNotAppear: true,
      quantitiesMustNotAppear: true,
    },
  })
  assert(
    issues.some((i) => i.code === 'ADDITIONAL_SERVICE_PRICE_RENDERED'),
    'price flagged',
  )
})

run('shared path: runPostReconstructionQualityGate inserts services', () => {
  const sourceBlocks = [
    block('para-1', 'Zakres'),
    block('para-2', 'cell', {
      kind: 'tableCell',
      tableContext: {
        tableIndex: 0,
        rowIndex: 0,
        cellIndex: 0,
        rowLabelText: 'Materiał',
        neighboringCellTexts: [],
        ownershipFamily: 'service_scope',
      },
    }),
    block('para-3', ''),
    block('para-4', 'Wynagrodzenie 12 000 zł'),
  ]
  const dataset = buildContractTransformationDataset({
    wedding: SAMPLE_WEDDING,
    package: { id: 'pkg-1', name: 'Pakiet Premium' },
    extras: [{ ...EXTRAS[0]! }],
  })
  const protectedData = buildProtectedContractData({
    blocks: sourceBlocks,
    blockTexts: sourceBlocks.map((b) => b.text),
  })
  const gate = runPostReconstructionQualityGate({
    sourceBlocks,
    transformedBlocks: sourceBlocks.map((b) => ({
      blockId: b.blockId,
      text: b.text,
    })),
    dataset,
    protectedData,
    mode: 'full_ai',
  })
  const expanded = expandBlocksWithParagraphInsertions({
    sourceBlocks,
    blocks: gate.blocks,
    insertions: gate.paragraphInsertions,
  })
  const full = expanded.map((b) => b.text).join('\n')
  assert(serviceNamePresentInText(full, 'Dron'), 'dron in final blocks')
  assert(
    !gate.report.blockingIssues.some((i) =>
      i.code.startsWith('ADDITIONAL_SERVICE_PRICE'),
    ),
    'no price block',
  )
})

run('manifest includes additionalServices expectation', () => {
  const sourceBlocks = [block('para-1', 'Umowa')]
  const dataset = buildContractTransformationDataset({
    wedding: SAMPLE_WEDDING,
    package: { id: 'pkg-1', name: 'Pakiet Premium' },
    extras: EXTRAS,
  })
  const manifest = buildExpectationManifest({
    sourceBlocks,
    dataset,
    protectedData: { exactProtectedValues: [], protectedPatterns: [] },
  })
  assertEq(manifest.additionalServices?.expectedNames.length, 3, 'manifest names')
  assert(manifest.additionalServices?.shouldAppear === true, 'should appear')
})

run('display text and fallback formatting', () => {
  const services = projectContractAdditionalServices(EXTRAS)
  const display = formatAdditionalServicesDisplayText(services)
  assert(display.includes('Album 30×30'), 'polish chars')
  const fallback = renderAdditionalServicesFallbackBlock(['Dron', 'Album 30×30'])
  assert(fallback.includes('– Dron'), 'bullet')
  assert(!textLooksLikeServicePriceOrQuantity('– Dron'), 'name only ok')
  assert(textLooksLikeServicePriceOrQuantity('– Dron 800 zł'), 'price detect')
})

run('pipeline source: insertion wired in quality gate', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const gate = readFileSync(
    resolve('src/features/ai-contract-transform/quality/buildQualityReport.ts'),
    'utf8',
  )
  assert(gate.includes('insertAdditionalServicesIntoBlocks'), 'gate wires insertion')
  const svc = readFileSync(
    resolve(
      'src/features/documents/template/WeddingSparseContractGenerationService.ts',
    ),
    'utf8',
  )
  assert(svc.includes('weddingExtraServiceService'), 'loads extras')
  assert(svc.includes('extras'), 'passes extras to dataset')
})

if (!process.exitCode) {
  console.log('\nAll contract-additional-services tests passed.')
}
