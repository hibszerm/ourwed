/**
 * Mixed-block provider exclusion tests.
 * Run: npm run test:mixed-block-provider-exclusion
 */

import { blocksFromPlainParagraphs } from './experimentService'
import { NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import { classifyDocumentBlock } from './documentBlockClassification'
import { protectedRangesForBlock } from './protectedDocumentRanges'
import { validateSpanProviderExclusion } from './providerExclusion'
import { validateStructuredMapping } from './mappingValidator'
import type { IndexedDocxBlock, StructuredAiFieldProposal, StructuredAiMappingResponse } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function block(id: string, text: string, paragraphIndex: number): IndexedDocxBlock {
  return {
    id,
    kind: 'paragraph',
    paragraphIndex,
    text,
    runs: [{ runIndex: 0, text }],
  }
}

function proposal(
  partial: Pick<StructuredAiFieldProposal, 'fieldKey' | 'blockId' | 'exactValue'> &
    Partial<StructuredAiFieldProposal>,
): StructuredAiFieldProposal {
  return {
    evidenceText: partial.exactValue,
    contextBefore: '',
    contextAfter: '',
    semanticRole: 'test',
    confidence: 'high',
    reasoning: 'test',
    pairedFieldGroup: null,
    ...partial,
  }
}

function response(
  fields: StructuredAiFieldProposal[],
  immutableFindings: StructuredAiMappingResponse['immutableFindings'] = [],
): StructuredAiMappingResponse {
  return {
    responseVersion: '2026-07-v2',
    documentAssessment: {
      documentType: 'wedding_video_contract',
      clientPartyCapability: { physicalMode: 'composite', expectedPersonCount: 2 },
    },
    fields,
    unsupportedValues: [],
    immutableFindings,
    warnings: [],
  }
}

async function main() {
  const providerOnly = block(
    'table-0-row-1-cell-1-p-0',
    `Wykonawca: ${NOWICCY_FIXTURE.provider}, NIP ${NOWICCY_FIXTURE.nip}, REGON ${NOWICCY_FIXTURE.regon}. Rachunek: ${NOWICCY_FIXTURE.bankAccount}`,
    1,
  )
  const providerRanges = protectedRangesForBlock({
    blockId: providerOnly.id,
    text: providerOnly.text,
  })
  assert(
    classifyDocumentBlock({ block: providerOnly, protectedRanges: providerRanges }) ===
      'provider_only',
    '1 provider identity cell',
  )

  const clientOnly = block(
    'table-0-row-0-cell-1-p-0',
    NOWICCY_FIXTURE.clientContactCell,
    0,
  )
  assert(
    classifyDocumentBlock({
      block: clientOnly,
      protectedRanges: protectedRangesForBlock({
        blockId: clientOnly.id,
        text: clientOnly.text,
      }),
    }) === 'client_only',
    '2 client cell',
  )

  const neutral = block('para-legal', 'Wykonawca zobowiązuje się do świadczenia usług.', 2)
  assert(
    classifyDocumentBlock({
      block: neutral,
      protectedRanges: [],
    }) === 'neutral',
    '3 neutral legal',
  )

  const mixed = block('para-37', NOWICCY_FIXTURE.para37Remuneration, 37)
  const mixedRanges = protectedRangesForBlock({
    blockId: mixed.id,
    text: mixed.text,
  })
  assert(
    classifyDocumentBlock({ block: mixed, protectedRanges: mixedRanges }) === 'mixed',
    '4 remuneration + bank account',
  )
  assert(
    mixedRanges.filter((r) => r.classification === 'provider_bank_account').length === 1,
    '11 one protected bank range',
  )

  const numericStart = mixed.text.indexOf('6 000 zł')
  const numericEnd = numericStart + '6 000 zł'.length
  const numericCheck = validateSpanProviderExclusion({
    fieldKey: 'contract_value_formatted',
    block: mixed,
    exactValue: '6 000 zł',
    start: numericStart,
    end: numericEnd,
    immutableFindings: [
      {
        blockId: mixed.id,
        sourceText: mixed.text,
        classification: 'package_fact',
        reason: 'payment routing',
      },
    ],
  })
  assert(numericCheck.ok, '5 numeric before account allowed')
  assert(numericCheck.trace.blockClassification === 'mixed', 'mixed classification')

  const wordsStart = mixed.text.indexOf('sześć tysięcy złotych')
  const wordsCheck = validateSpanProviderExclusion({
    fieldKey: 'contract_value_words',
    block: mixed,
    exactValue: 'sześć tysięcy złotych',
    start: wordsStart,
    end: wordsStart + 'sześć tysięcy złotych'.length,
  })
  assert(wordsCheck.ok, '6 words before account allowed')

  const accountStart = mixed.text.indexOf(NOWICCY_FIXTURE.providerBankAccountMixed)
  const bankAsMoney = validateSpanProviderExclusion({
    fieldKey: 'contract_value_formatted',
    block: mixed,
    exactValue: NOWICCY_FIXTURE.providerBankAccountMixed,
    start: accountStart,
    end: accountStart + NOWICCY_FIXTURE.providerBankAccountMixed.length,
  })
  assert(!bankAsMoney.ok, '7 bank as money rejected')

  const overlapAccount = validateSpanProviderExclusion({
    fieldKey: 'contract_value_formatted',
    block: mixed,
    exactValue: '1090 1043 0000',
    start: mixed.text.indexOf('1090 1043 0000'),
    end: mixed.text.indexOf('1090 1043 0000') + '1090 1043 0000'.length,
  })
  assert(!overlapAccount.ok, '8 overlap account rejected')

  const wykonawcyElsewhere = validateSpanProviderExclusion({
    fieldKey: 'contract_value_formatted',
    block: mixed,
    exactValue: '6 000 zł',
    start: numericStart,
    end: numericEnd,
  })
  assert(wykonawcyElsewhere.ok, '9 Wykonawcy elsewhere does not reject money')

  const validated = validateStructuredMapping({
    response: response(
      [
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
      [
        {
          blockId: mixed.id,
          sourceText: mixed.text,
          classification: 'package_fact',
          reason: 'whole paragraph finding',
        },
      ],
    ),
    blocks: [mixed],
  })
  assert(
    validated.every((m) => m.validationStatus === 'valid'),
    '10 whole-block immutableFinding does not lock block',
  )
  assert(
    validated.filter((m) => m.validationStatus === 'valid').length === 2,
    '12 numeric + words pair valid',
  )

  const allNowiccyBlocks = blocksFromPlainParagraphs([
    NOWICCY_FIXTURE.clientContactCell,
    NOWICCY_FIXTURE.para37Remuneration,
  ])
  const para37Block = allNowiccyBlocks.find((b) => b.text.includes('6 000 zł'))!
  const fullValidated = validateStructuredMapping({
    response: response([
      proposal({
        fieldKey: 'couple_full_names',
        blockId: allNowiccyBlocks[0]!.id,
        exactValue: NOWICCY_FIXTURE.clientParty,
      }),
      proposal({
        fieldKey: 'client_address',
        blockId: allNowiccyBlocks[0]!.id,
        exactValue: 'zam. os. Piastowskie 5/9, 61-136 Poznań',
      }),
      proposal({
        fieldKey: 'client_phone',
        blockId: allNowiccyBlocks[0]!.id,
        exactValue: '502 118 774',
      }),
      proposal({
        fieldKey: 'contract_value_formatted',
        blockId: para37Block.id,
        exactValue: '6 000 zł',
        pairedFieldGroup: 'contract_value_pair_1',
      }),
      proposal({
        fieldKey: 'contract_value_words',
        blockId: para37Block.id,
        exactValue: 'sześć tysięcy złotych',
        pairedFieldGroup: 'contract_value_pair_1',
      }),
    ]),
    blocks: allNowiccyBlocks,
  })
  assert(
    fullValidated.filter((m) => m.validationStatus === 'rejected').length === 0,
    '21 all mappings valid',
  )
  assert(
    fullValidated.filter((m) => m.rejectionReason === 'provider_only_block').length ===
      0,
    '21 no provider-only false positives',
  )

  console.log('ok — mixedBlockProviderExclusion')
}

void main()
