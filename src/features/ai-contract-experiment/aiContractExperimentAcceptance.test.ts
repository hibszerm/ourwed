/**
 * AI Contract Experiment — Phase 1 acceptance (mock adapters).
 * Run: npm run test:ai-contract-experiment
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildMinimalDocxFromParagraphs } from '@/features/documents/template/buildMinimalDocx'
import { applyBoundSlotsToParagraphs } from '@/features/documents/template/applyBoundSlots'
import type { TemplateSlot } from '@/features/documents/template/types'
import { buildContractGenerationInput } from './contractGenerationInput'
import { buildExperimentMetrics } from './comparisonMetrics'
import { clearExperimentStore, EXPERIMENT_STORAGE_KEY } from './experimentStorage'
import {
  blocksFromPlainParagraphs,
  runExperiment,
} from './experimentService'
import { auditFullAiGeneration } from './fullAiSafetyAudit'
import { indexDocxBytes } from './indexedDocx'
import {
  analyzeContractForStructuredMapping,
  analyzeContractWithFullAi,
  generateCompleteContractWithAi,
} from './mockAdapters'
import {
  persistableMappings,
  validateStructuredMapping,
} from './mappingValidator'
import { assertWeddingMatchesExperimentPackage } from './packageAssignment'
import {
  NOWICCY_FIXTURE,
  nowiccyFixtureParagraphs,
} from './fixtures/nowiccyVideoContract'
import type {
  AiContractExperimentTemplate,
  IndexedDocxBlock,
  StructuredAiMappingResponse,
  ValidatedAiMapping,
} from './types'
import type { Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`ok — ${name}`)
  } catch (e) {
    console.error(`FAIL — ${name}`)
    throw e
  }
}

function fixtureBlocks(): IndexedDocxBlock[] {
  return blocksFromPlainParagraphs(nowiccyFixtureParagraphs())
}

function mockWedding(overrides?: Partial<Wedding>): Wedding {
  return {
    id: 'wedding-exp-1',
    date: '2027-07-24',
    status: 'active',
    workflowStage: 'contract',
    couple: {
      partner1: 'Anna Testowa',
      partner2: 'Jan Testowy',
      partner1FirstName: 'Anna',
      partner1LastName: 'Testowa',
      partner2FirstName: 'Jan',
      partner2LastName: 'Testowy',
      partner1Address: 'ul. Testowa 1',
      phone: '500600700',
      email: 'test@example.com',
      venue: 'Pałac',
      city: 'Poznań',
    },
    packageId: 'pkg-video-1',
    packageName: 'Video Premium',
    price: 6500,
    depositAmount: 1000,
    packageItems: [],
    receptionLocation: 'Pałac Testowy',
    ceremonyLocation: 'Kościół Testowy',
    preparationLocation: 'Hotel Testowy',
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {} as Wedding['questionnaires'],
    contract: {} as Wedding['contract'],
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function templateFor(packageId: string): AiContractExperimentTemplate {
  return {
    id: 'exp-tpl-1',
    packageId,
    sourceDocumentId: 'exp-src-1',
    sourceFileName: 'nowiccy.docx',
    uploadedAt: new Date().toISOString(),
    analysisStatus: 'completed',
  }
}

function testField(
  partial: Partial<StructuredAiMappingResponse['fields'][number]> &
    Pick<
      StructuredAiMappingResponse['fields'][number],
      'fieldKey' | 'blockId' | 'exactValue'
    >,
): StructuredAiMappingResponse['fields'][number] {
  const exactValue = partial.exactValue
  return {
    evidenceText: exactValue,
    contextBefore: '',
    contextAfter: '',
    semanticRole: 'test',
    confidence: 'high',
    reasoning: 'test',
    pairedFieldGroup: null,
    ...partial,
    exactValue,
  }
}

function testMappingResponse(
  fields: StructuredAiMappingResponse['fields'],
): StructuredAiMappingResponse {
  return {
    responseVersion: '2026-07-v2',
    documentAssessment: {
      documentType: 'wedding_video_contract',
      clientPartyCapability: {
        physicalMode: 'composite',
        expectedPersonCount: 2,
      },
    },
    fields,
    unsupportedValues: [],
    immutableFindings: [],
    warnings: [],
  }
}

function approveAll(mappings: ValidatedAiMapping[]): ValidatedAiMapping[] {
  return mappings.map((m) =>
    m.validationStatus === 'valid'
      ? { ...m, approvalStatus: 'approved' as const }
      : m,
  )
}

async function main() {
  clearExperimentStore()

  await run('isolation — experiment storage key is separate', () => {
    assert(
      EXPERIMENT_STORAGE_KEY === 'ourwed:ai-contract-experiment:v3',
      'storage key',
    )
    assert(
      !EXPERIMENT_STORAGE_KEY.includes('template-version'),
      'not production templates',
    )
  })

  await run('isolation — production transform service untouched by experiment imports', () => {
    const transformSrc = readFileSync(
      resolve(
        process.cwd(),
        'src/features/documents/template/ContractTransformationService.ts',
      ),
      'utf8',
    )
    assert(
      !transformSrc.includes('ai-contract-experiment'),
      'prod transform not wired to experiment',
    )
  })

  await run('1 — Nowiccy client under Zamawiający', async () => {
    const blocks = fixtureBlocks()
    const { response } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-video-1',
    })
    const client = response.fields.find((f) => f.fieldKey === 'couple_full_names')
    assert(Boolean(client), 'client field')
    assertEq(client!.exactValue, NOWICCY_FIXTURE.clientParty, 'client text')
    const heading = blocks.find((b) =>
      b.text.includes(NOWICCY_FIXTURE.orderingPartyHeading),
    )
    assert(Boolean(heading), 'Zamawiający heading present')
  })

  await run('2 — Contract date in zawarta w Poznaniu dnia', async () => {
    const blocks = fixtureBlocks()
    const { response } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    const date = response.fields.find(
      (f) => f.fieldKey === 'contract_execution_date',
    )
    assertEq(date?.exactValue, NOWICCY_FIXTURE.contractDate, 'date')
    assert(
      blocks.some((b) => b.text.includes('zawarta w Poznaniu dnia')),
      'prose context',
    )
  })

  await run('3–6 — wedding date, location, total, words pairing', async () => {
    const blocks = fixtureBlocks()
    const { response } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    assertEq(
      response.fields.find((f) => f.fieldKey === 'wedding_date')?.exactValue,
      NOWICCY_FIXTURE.weddingDate,
      'wedding',
    )
    assertEq(
      response.fields.find((f) => f.fieldKey === 'reception_location')
        ?.exactValue,
      NOWICCY_FIXTURE.location,
      'location',
    )
    assertEq(
      response.fields.find((f) => f.fieldKey === 'contract_value_formatted')
        ?.exactValue,
      NOWICCY_FIXTURE.totalFormatted,
      'total',
    )
    const words = response.fields.find(
      (f) => f.fieldKey === 'contract_value_words',
    )
    assertEq(words?.exactValue, NOWICCY_FIXTURE.totalWords, 'words')
    assertEq(words?.pairedFieldGroup, 'contract_value_pair_1', 'paired group')
  })

  await run('7–8 — Provider and bank exclusion from dynamic fields', async () => {
    const blocks = fixtureBlocks()
    const { response } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    assert(
      !response.fields.some((f) =>
        f.exactValue.includes(NOWICCY_FIXTURE.provider),
      ),
      'provider not dynamic',
    )
    assert(
      !response.fields.some((f) =>
        f.exactValue.includes(NOWICCY_FIXTURE.bankAccount),
      ),
      'bank not dynamic',
    )
    const { analysis } = await analyzeContractWithFullAi({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    assert(
      analysis.immutableSections.some(
        (s) => s.classification === 'provider_identity',
      ),
      'provider immutable',
    )
    assert(
      analysis.immutableSections.some(
        (s) => s.classification === 'provider_bank_account',
      ),
      'bank immutable',
    )
  })

  await run('9 — Invalid block ID rejected', () => {
    const blocks = fixtureBlocks()
    const response = testMappingResponse([
      testField({
        fieldKey: 'couple_full_names',
        blockId: 'para-99999',
        exactValue: NOWICCY_FIXTURE.clientParty,
      }),
    ])
    const validated = validateStructuredMapping({ response, blocks })
    assertEq(validated[0]!.validationStatus, 'rejected', 'status')
    assertEq(validated[0]!.rejectionReason, 'invalid_block_id', 'reason')
  })

  await run('10 — Invented registry key rejected', () => {
    const blocks = fixtureBlocks()
    const block = blocks.find((b) =>
      b.text.includes(NOWICCY_FIXTURE.clientParty),
    )!
    const response = testMappingResponse([
      testField({
        fieldKey: 'made_up_field' as never,
        blockId: block.id,
        exactValue: NOWICCY_FIXTURE.clientParty,
      }),
    ])
    const validated = validateStructuredMapping({
      response: response as StructuredAiMappingResponse,
      blocks,
    })
    assert(
      Boolean(
        validated[0]!.rejectionReason?.startsWith('invented_registry_key'),
      ),
      'invented key',
    )
  })

  await run('11 — Source text not present rejected', () => {
    const blocks = fixtureBlocks()
    const block = blocks[0]!
    const response = testMappingResponse([
      testField({
        fieldKey: 'couple_full_names',
        blockId: block.id,
        exactValue: 'TEKST KTÓREGO NIE MA',
      }),
    ])
    const validated = validateStructuredMapping({ response, blocks })
    assertEq(validated[0]!.rejectionReason, 'exact_value_not_in_block', 'reason')
  })

  await run('12 — Overlap rejected', () => {
    const blocks = fixtureBlocks()
    const block = blocks.find((b) =>
      b.text.includes(NOWICCY_FIXTURE.clientParty),
    )!
    const response = testMappingResponse([
      testField({
        fieldKey: 'couple_full_names',
        blockId: block.id,
        exactValue: NOWICCY_FIXTURE.clientParty,
      }),
      testField({
        fieldKey: 'client_address',
        blockId: block.id,
        exactValue: 'Michał Nowicki',
        confidence: 'medium',
      }),
    ])
    const validated = validateStructuredMapping({ response, blocks })
    assertEq(validated[0]!.validationStatus, 'valid', 'first ok')
    assert(
      Boolean(
        validated[1]!.validationStatus === 'rejected' &&
          (validated[1]!.rejectionReason?.startsWith('overlap') ||
            validated[1]!.rejectionReason === 'duplicate_physical_span'),
      ),
      'overlap rejected',
    )
  })

  await run('13 — Composite identity → one physical operation', async () => {
    const blocks = fixtureBlocks()
    const { response } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    const validated = persistableMappings(
      approveAll(validateStructuredMapping({ response, blocks })),
    )
    const clientOps = validated.filter((m) => m.fieldKey === 'couple_full_names')
    assertEq(clientOps.length, 1, 'one composite binding')
  })

  await run('14 — Deterministic renderer produces valid DOCX bytes', async () => {
    const blocks = fixtureBlocks()
    const { response } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    const validated = persistableMappings(
      approveAll(validateStructuredMapping({ response, blocks })),
    )
    const slots: TemplateSlot[] = validated.map((m) => ({
      id: `slot-${m.fieldKey}-${m.paragraphIndex}-${m.start}`,
      registryKey: m.fieldKey,
      label: m.fieldKey,
      sourceHint: 'wedding',
      occurrences: 1,
      enabled: true,
      physicallyBound: true,
      paragraphIndex: m.paragraphIndex,
      startOffset: m.start,
      endOffset: m.end,
      originalText: m.sourceText,
      allowedRange: { start: m.start, end: m.end },
    }))
    const paragraphs = blocks.map((b) => ({
      index: b.paragraphIndex,
      text: b.text,
    }))
    const applied = applyBoundSlotsToParagraphs({
      original: paragraphs,
      slots,
      resolved: {
        couple_full_names: 'Anna Testowa i Jan Testowy',
        contract_execution_date: '10.03.2027',
        wedding_date: '24.07.2027',
        reception_location: 'Pałac Testowy',
        contract_value_formatted: '6 500 zł',
        contract_value_words: 'sześć tysięcy pięćset złotych',
      },
    })
    const bytes = await buildMinimalDocxFromParagraphs(
      applied.paragraphs.map((p) => p.text),
    )
    assert(bytes.byteLength > 100, 'docx bytes')
    const clientPara = applied.paragraphs.find((p) =>
      p.text.includes('Anna Testowa i Jan Testowy'),
    )
    assert(Boolean(clientPara), 'client replaced')
  })

  await run('15 — Allowed dynamic changes classified correctly', async () => {
    const blocks = fixtureBlocks()
    const { analysis } = await analyzeContractWithFullAi({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    const { generated } = await generateCompleteContractWithAi({
      blocks,
      analysis,
      generationInput: buildContractGenerationInput({
        wedding: mockWedding(),
        package: { id: 'pkg-video-1', name: 'Video Premium' },
      }),
    })
    const { changes, safety } = auditFullAiGeneration({
      sourceBlocks: blocks,
      generated,
      analysis,
    })
    assert(
      changes.some((c) => c.classification === 'allowed_dynamic_change'),
      'allowed change present',
    )
    assert(safety.allowedChangeCount >= 1, 'allowed count')
  })

  await run('16 — Legal wording change unauthorized', async () => {
    const blocks = fixtureBlocks()
    const { analysis } = await analyzeContractWithFullAi({
      blocks,
      packageName: 'V',
      packageId: 'p',
    })
    const { generated } = await generateCompleteContractWithAi({
      blocks,
      analysis,
      generationInput: buildContractGenerationInput({
        wedding: mockWedding(),
        package: { id: 'pkg-video-1', name: 'Video' },
      }),
      mutate: { legalWording: true },
    })
    const { safety } = auditFullAiGeneration({
      sourceBlocks: blocks,
      generated,
      analysis,
    })
    assertEq(safety.status, 'critical', 'critical')
    assert(safety.unauthorizedChangeCount >= 1, 'unauthorized')
  })

  await run('17 — Punctuation outside dynamic spans unauthorized', async () => {
    const blocks = fixtureBlocks()
    const { analysis } = await analyzeContractWithFullAi({
      blocks,
      packageName: 'V',
      packageId: 'p',
    })
    const { generated } = await generateCompleteContractWithAi({
      blocks,
      analysis,
      generationInput: buildContractGenerationInput({
        wedding: mockWedding(),
        package: { id: 'pkg-video-1', name: 'Video' },
      }),
      mutate: { punctuation: true },
    })
    const { safety, changes } = auditFullAiGeneration({
      sourceBlocks: blocks,
      generated,
      analysis,
    })
    assertEq(safety.status, 'critical', 'critical')
    assert(
      changes.some(
        (c) =>
          c.classification === 'formatting_change' ||
          c.classification === 'unauthorized_text_change',
      ),
      'punctuation flagged',
    )
  })

  await run('18 — Removed paragraph critical', async () => {
    const blocks = fixtureBlocks()
    const { analysis } = await analyzeContractWithFullAi({
      blocks,
      packageName: 'V',
      packageId: 'p',
    })
    const { generated } = await generateCompleteContractWithAi({
      blocks,
      analysis,
      generationInput: buildContractGenerationInput({
        wedding: mockWedding(),
        package: { id: 'pkg-video-1', name: 'Video' },
      }),
      mutate: { removeBlockId: blocks[0]!.id },
    })
    const { safety } = auditFullAiGeneration({
      sourceBlocks: blocks,
      generated,
      analysis,
    })
    assertEq(safety.status, 'critical', 'critical')
    assert(safety.removedBlockCount >= 1, 'removed')
  })

  await run('19 — Added clause critical', async () => {
    const blocks = fixtureBlocks()
    const { analysis } = await analyzeContractWithFullAi({
      blocks,
      packageName: 'V',
      packageId: 'p',
    })
    const { generated } = await generateCompleteContractWithAi({
      blocks,
      analysis,
      generationInput: buildContractGenerationInput({
        wedding: mockWedding(),
        package: { id: 'pkg-video-1', name: 'Video' },
      }),
      mutate: { addClause: true },
    })
    const { safety } = auditFullAiGeneration({
      sourceBlocks: blocks,
      generated,
      analysis,
    })
    assertEq(safety.status, 'critical', 'critical')
    assert(safety.addedBlockCount >= 1, 'added')
  })

  await run('20 — Provider data change critical', async () => {
    const blocks = fixtureBlocks()
    const { analysis } = await analyzeContractWithFullAi({
      blocks,
      packageName: 'V',
      packageId: 'p',
    })
    const { generated } = await generateCompleteContractWithAi({
      blocks,
      analysis,
      generationInput: buildContractGenerationInput({
        wedding: mockWedding(),
        package: { id: 'pkg-video-1', name: 'Video' },
      }),
      mutate: { changeProvider: true },
    })
    const { safety } = auditFullAiGeneration({
      sourceBlocks: blocks,
      generated,
      analysis,
    })
    assertEq(safety.status, 'critical', 'critical')
  })

  await run('21 — Package-owned fact change critical', async () => {
    const blocks = fixtureBlocks()
    const { analysis } = await analyzeContractWithFullAi({
      blocks,
      packageName: 'V',
      packageId: 'p',
    })
    const { generated } = await generateCompleteContractWithAi({
      blocks,
      analysis,
      generationInput: buildContractGenerationInput({
        wedding: mockWedding(),
        package: { id: 'pkg-video-1', name: 'Video' },
      }),
      mutate: { changePackageFact: true },
    })
    const { safety } = auditFullAiGeneration({
      sourceBlocks: blocks,
      generated,
      analysis,
    })
    assertEq(safety.status, 'critical', 'critical')
  })

  await run('22 — Perfectly preserved full-AI may pass audit', async () => {
    const blocks = fixtureBlocks()
    const { analysis } = await analyzeContractWithFullAi({
      blocks,
      packageName: 'V',
      packageId: 'p',
    })
    const { generated } = await generateCompleteContractWithAi({
      blocks,
      analysis,
      generationInput: buildContractGenerationInput({
        wedding: mockWedding(),
        package: { id: 'pkg-video-1', name: 'Video' },
      }),
      perfectPreserve: true,
    })
    const { safety } = auditFullAiGeneration({
      sourceBlocks: blocks,
      generated,
      analysis,
    })
    assertEq(safety.status, 'safe', 'safe')
    assertEq(safety.unauthorizedChangeCount, 0, 'no unauthorized')
  })

  await run('23–24 — Both modes same normalized input and package', async () => {
    const wedding = mockWedding()
    const pkg = { id: 'pkg-video-1', name: 'Video Premium' }
    const blocks = fixtureBlocks()
    const inputA = buildContractGenerationInput({ wedding, package: pkg })
    const inputB = buildContractGenerationInput({ wedding, package: pkg })
    assertEq(
      JSON.stringify(inputA),
      JSON.stringify(inputB),
      'same normalized input',
    )
    const a = await runExperiment({
      mode: 'structured_mapping',
      template: templateFor(pkg.id),
      blocks,
      wedding,
      package: pkg,
      useMockStructuredMapping: true,
    })
    const b = await runExperiment({
      mode: 'full_ai',
      template: templateFor(pkg.id),
      blocks,
      wedding,
      package: pkg,
      fullAiOptions: { perfectPreserve: true },
    })
    assertEq(a.generationInput.package.id, b.generationInput.package.id, 'pkg')
    assertEq(
      JSON.stringify(a.generationInput),
      JSON.stringify(b.generationInput),
      'shared input',
    )
  })

  await run('25 — Cross-package run blocked', async () => {
    const blocked = assertWeddingMatchesExperimentPackage({
      weddingPackageId: 'pkg-other',
      experimentPackageId: 'pkg-video-1',
    })
    assert(!blocked.ok, 'blocked')
    assert(
      blocked.ok === false &&
        blocked.message.includes('innego pakietu niż umowa testowa'),
      'message',
    )
    let threw = false
    try {
      await runExperiment({
        mode: 'structured_mapping',
        template: templateFor('pkg-video-1'),
        blocks: fixtureBlocks(),
        wedding: mockWedding({ packageId: 'pkg-other' }),
        package: { id: 'pkg-video-1', name: 'Video' },
        useMockStructuredMapping: true,
      })
    } catch (e) {
      threw = true
      assert(
        e instanceof Error &&
          e.message.includes('innego pakietu niż umowa testowa'),
        'throw message',
      )
    }
    assert(threw, 'must throw')
  })

  await run('26 — Metrics do not invent cost', () => {
    const metrics = buildExperimentMetrics({
      generationSuccess: true,
      estimatedCostPln: 'Brak danych',
    })
    assertEq(metrics.estimatedCostPln, 'Brak danych', 'no fake cost')
  })

  await run('indexed DOCX preserves table coordinates', async () => {
    const JSZip = (await import('jszip')).default
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>before</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Etap</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Miejsce</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Ceremonia</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Pałac Rydzyna, Rydzyna</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr/>
  </w:body>
</w:document>`
    const zip = new JSZip()
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    )
    zip.folder('_rels')!.file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    )
    zip.folder('word')!.file('document.xml', xml)
    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const indexed = await indexDocxBytes(bytes)
    const cell = indexed.blocks.find(
      (b) => b.kind === 'tableCell' && b.text.includes('Pałac Rydzyna'),
    )
    assert(Boolean(cell), 'table cell block')
    if (cell?.kind === 'tableCell') {
      assertEq(cell.tableIndex, 0, 'table')
      assertEq(cell.rowIndex, 1, 'row')
      assertEq(cell.cellIndex, 1, 'cell')
    }
  })

  console.log('\nAll AI contract experiment tests passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
