/**
 * Mixed-paragraph immutable audit tests.
 * Run: npm run test:mixed-paragraph-immutable-audit
 */

import { buildMinimalDocxFromParagraphs } from '@/features/documents/template/buildMinimalDocx'
import { auditExperimentalImmutable } from './experimentalImmutableAudit'
import { renderExperimentalDocx } from './experimentalDocxRenderer'
import { auditReplacementTraces } from './experimentalReplacementTraceAudit'
import { buildExperimentalPhysicalBindings } from './experimentalPhysicalBindings'
import { buildContractGenerationInput } from './contractGenerationInput'
import { blocksFromPlainParagraphs } from './experimentService'
import { approveAllValidMappings } from './experimentalMappingApproval'
import { NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import { validateStructuredMapping } from './mappingValidator'
import type { IndexedDocxBlock, StructuredAiFieldProposal, StructuredAiMappingResponse } from './types'
import type { Wedding } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function proposal(
  partial: Pick<StructuredAiFieldProposal, 'fieldKey' | 'blockId' | 'exactValue'> &
    Partial<StructuredAiFieldProposal>,
): StructuredAiFieldProposal {
  return {
    evidenceText: partial.evidenceText ?? partial.exactValue,
    contextBefore: '',
    contextAfter: '',
    semanticRole: 'test',
    confidence: 'high',
    reasoning: 'test',
    pairedFieldGroup: null,
    ...partial,
  }
}

function wedding(): Wedding {
  return {
    id: 'w-1',
    date: '2026-07-29',
    status: 'active',
    workflowStage: 'contract',
    couple: {
      partner1: 'Iza Karczewska',
      partner2: 'Jan Kulewski',
      email: 'a@b.c',
      phone: '500600700',
      venue: 'X',
      city: 'Y',
    },
    packageId: 'pkg-1',
    packageName: 'Video',
    price: 10500,
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
  const paragraphs = [NOWICCY_FIXTURE.para37Remuneration]
  const blocks: IndexedDocxBlock[] = blocksFromPlainParagraphs(paragraphs)
  const mixed = blocks[0]!
  const response: StructuredAiMappingResponse = {
    responseVersion: '2026-07-v2',
    documentAssessment: {
      documentType: 'wedding_video_contract',
      clientPartyCapability: { physicalMode: 'composite', expectedPersonCount: 2 },
    },
    fields: [
      proposal({
        fieldKey: 'contract_value_formatted',
        blockId: mixed.id,
        exactValue: '6 000 zł',
        pairedFieldGroup: 'contract_value_pair_1',
      }),
      proposal({
        fieldKey: 'contract_value_words',
        blockId: mixed.id,
        exactValue: 'sześć tysięcy złotych',
        pairedFieldGroup: 'contract_value_pair_1',
      }),
    ],
    unsupportedValues: [],
    immutableFindings: [
      {
        blockId: mixed.id,
        sourceText: mixed.text,
        classification: 'package_fact',
        reason: 'payment',
      },
    ],
    warnings: [],
  }

  const generationInput = buildContractGenerationInput({
    wedding: wedding(),
    package: { id: 'pkg-1', name: 'Video' },
    currentDate: '27.07.2026 r.',
  })
  const validated = approveAllValidMappings(
    validateStructuredMapping({ response, blocks, generationInput }),
  )
  assert(validated.every((m) => m.validationStatus === 'valid'), 'mappings valid')

  const bindings = buildExperimentalPhysicalBindings({
    experimentRunId: 'run-mixed',
    mappings: validated,
    blocks,
    generationInput,
  })
  const sourceBytes = await buildMinimalDocxFromParagraphs(paragraphs)
  const rendered = await renderExperimentalDocx({ sourceBytes, blocks, bindings })
  const output = rendered.appliedParagraphs[0]!.text

  assert(output.includes('10 500 zł'), '17 numeric replaced')
  assert(
    output.includes('dziesięć tysięcy pięćset złotych'),
    '17 words replaced',
  )
  assert(output.includes('brutto'), 'wrapper brutto unchanged')
  assert(output.includes('płatne jednorazowo'), 'payment prose unchanged')
  assert(
    output.includes(NOWICCY_FIXTURE.providerBankAccountMixed),
    '18 provider account unchanged',
  )
  assert(output.includes('14 dni przed datą wydarzenia'), '19 deadline unchanged')

  const checks = auditReplacementTraces({
    bindings,
    traces: rendered.replacementTraces,
    resultingParagraphs: rendered.appliedParagraphs,
  })
  const audit = auditExperimentalImmutable({
    sourceBlocks: blocks,
    outputParagraphs: rendered.appliedParagraphs,
    bindings,
    replacementTraces: rendered.replacementTraces,
    replacementChecks: checks,
  })
  assert(audit.status === 'safe', '20 immutable audit safe')

  console.log('ok — mixedParagraphImmutableAudit')
}

void main()
