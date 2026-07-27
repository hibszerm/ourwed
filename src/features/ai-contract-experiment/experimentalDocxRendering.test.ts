/**
 * Experimental DOCX rendering tests.
 * Run: npm run test:experimental-docx-rendering
 */

import { buildMinimalDocxFromParagraphs } from '@/features/documents/template/buildMinimalDocx'
import { extractDocxParagraphsIncludingEmpty } from '@/features/documents/template/extractDocxParagraphs'
import { buildContractGenerationInput } from './contractGenerationInput'
import {
  TXT_ONLY_FIXTURE_MESSAGE,
  canRenderExperimentDocx,
  clearExperimentDocxBytes,
  storeExperimentDocxBytes,
} from './experimentDocxStorage'
import { renderExperimentalDocx } from './experimentalDocxRenderer'
import {
  buildExperimentalPhysicalBindings,
  verifyBindingsBeforeRender,
} from './experimentalPhysicalBindings'
import { blocksFromPlainParagraphs } from './experimentService'
import { nowiccyFixtureParagraphs, NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import { approveAllValidMappings } from './experimentalMappingApproval'
import { validateStructuredMapping } from './mappingValidator'
import { analyzeContractForStructuredMapping } from './mockAdapters'
import { formatReplacementValue } from './replacementValueFormatting'
import type { Wedding } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function nowiccyWedding(): Wedding {
  return {
    id: 'w-nowiccy',
    date: '2026-07-29',
    status: 'active',
    workflowStage: 'contract',
    couple: {
      partner1: 'Iza Karczewska',
      partner2: 'Jan Kulewski',
      partner1FirstName: 'Iza',
      partner1LastName: 'Karczewska',
      partner2FirstName: 'Jan',
      partner2LastName: 'Kulewski',
      partner1Address: 'Lwowska',
      partner1PostalCode: '34-144',
      partner1City: 'Izdebnik',
      phone: '500600700',
      email: 'test@example.com',
      venue: 'X',
      city: 'Y',
    },
    packageId: 'pkg-1',
    packageName: 'Video',
    price: 10500,
    receptionLocation: 'Lwowska, 34-144 Izdebnik, Polska',
    packageItems: [],
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
  }
}

async function main() {
  clearExperimentDocxBytes()
  const txtBlocked = canRenderExperimentDocx({
    templateId: 'tpl-txt',
    fileName: 'nowiccy-video-fixture.txt',
  })
  assert(!txtBlocked.ok && txtBlocked.message === TXT_ONLY_FIXTURE_MESSAGE, '10 txt blocked')

  const blocks = blocksFromPlainParagraphs(nowiccyFixtureParagraphs())
  const paragraphs = nowiccyFixtureParagraphs()
  const sourceBytes = await buildMinimalDocxFromParagraphs(paragraphs)
  storeExperimentDocxBytes('tpl-docx', sourceBytes)
  assert(
    canRenderExperimentDocx({ templateId: 'tpl-docx', fileName: 'nowiccy.docx' }).ok,
    '11 docx eligible',
  )

  const generationInput = buildContractGenerationInput({
    wedding: nowiccyWedding(),
    package: { id: 'pkg-1', name: 'Video' },
    currentDate: '27.07.2026 r.',
  })

  const { response } = await analyzeContractForStructuredMapping({
    blocks,
    packageName: 'Video',
    packageId: 'pkg-1',
  })
  const validated = approveAllValidMappings(
    validateStructuredMapping({ response, blocks, generationInput }),
  )
  const bindings = buildExperimentalPhysicalBindings({
    experimentRunId: 'run-1',
    mappings: validated,
    blocks,
    generationInput,
  })
  assert(bindings.length >= 6, '11 bindings created')

  assert(
    formatReplacementValue({
      fieldKey: 'contract_execution_date',
      sourceExact: NOWICCY_FIXTURE.contractDate,
      generationInput,
    }) === '27.07.2026 r.',
    '13 contract date style',
  )
  assert(
    formatReplacementValue({
      fieldKey: 'wedding_date',
      sourceExact: NOWICCY_FIXTURE.weddingDate,
      generationInput,
    }) === '29.07.2026 r.',
    '13 wedding date style',
  )

  const verify = verifyBindingsBeforeRender({ bindings, blocks })
  assert(verify.ok, 'bindings verify')

  const rendered = await renderExperimentalDocx({
    sourceBytes,
    blocks,
    bindings,
  })
  const outputText = rendered.appliedParagraphs.map((p) => p.text).join('\n')
  assert(outputText.includes('Iza Karczewska i Jan Kulewski'), '12 names replaced')
  assert(outputText.includes('10 500 zł'), '12 money replaced')
  assert(
    outputText.includes('dziesięć tysięcy pięćset złotych'),
    '14 words replaced',
  )
  assert(outputText.includes('(słownie:'), '15 wrapper unchanged')
  assert(outputText.includes('brutto'), '15 brutto unchanged')
  assert(outputText.includes(NOWICCY_FIXTURE.provider), '16 provider unchanged')
  assert(outputText.includes(NOWICCY_FIXTURE.bankAccount), '17 bank unchanged')
  assert(outputText.includes('teaser 60'), '18 package unchanged')

  const reparsed = await extractDocxParagraphsIncludingEmpty(rendered.outputBytes)
  assert(reparsed.length > 0, '22 output reparses')

  const staleBindings = bindings.map((b) =>
    b.fieldKey === 'couple_full_names'
      ? { ...b, sourceText: 'STALE' }
      : b,
  )
  const stale = verifyBindingsBeforeRender({ bindings: staleBindings, blocks })
  assert(!stale.ok, '21 stale source blocked')

  console.log('ok — experimentalDocxRendering')
}

void main()
