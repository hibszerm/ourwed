import { buildProtectedContractData } from './protectedContractData'
import { applyDeterministicRepairs } from './quality/deterministicRepairs'
import { buildExpectationManifest } from './quality/expectationManifest'
import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import {
  classifyProviderLegalSurface,
  discoverFilledPartyEvidence,
  verifyProviderRoleSparseScope,
} from './quality/partyFilledIdentity'
import type { ContractTransformationDataset, TransformDocumentBlock } from './types'

const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
const dataset = (): ContractTransformationDataset => ({
  clients: { displayNames: 'Natalia Brzegowa i Filip Brzegowy', personCount: 2 },
  dates: { weddingDate: '12.06.2027', contractExecutionDate: '15.06.2026' },
  locations: {}, package: {},
  finances: { contractValueFormatted: '21 400 zł', contractValueWords: 'dwadzieścia jeden tysięcy czterysta złotych', depositFormatted: '4 800 zł', remainingFormatted: '16 600 zł' },
})
const block = (blockId: string, text: string): TransformDocumentBlock => ({ blockId, paragraphIndex: 0, kind: 'paragraph', text })
const protectedData = { exactProtectedValues: [], protectedPatterns: [] }

const provider = block('provider', 'Fotograf zachowuje prawa autorskie do materiałów i portfolio.')
const providerDecision = classifyProviderLegalSurface({ sourceBlock: provider, partyEvidence: [] })
assert(providerDecision.classification === 'provider_legal_only', 'pure provider/legal prose uses shared protection classification')
assert(providerDecision.reasonCode === 'provider_legal_without_customer_fact', 'protection reason is explicit and structural')
assert(verifyProviderRoleSparseScope({ sourceBlocks: [provider], transformedBlocks: [{ blockId: provider.blockId, text: provider.text }], partyEvidence: [] }).length === 0, 'unchanged provider/legal source passes the quality invariant')
assert(verifyProviderRoleSparseScope({ sourceBlocks: [provider], transformedBlocks: [{ blockId: provider.blockId, text: 'Fotograf may change copyright and portfolio terms.' }], partyEvidence: [] }).some((issue) => issue.code === 'unnecessary_provider_role_rewrite'), 'the final quality invariant still detects a forced provider/legal rewrite')

const mixedParty = block('mixed-party', 'Studio Foto sp. z o.o., NIP 000-000-00-03, zwaną dalej Wykonawcą, a Mają Przykładową i Kacpra Modelowego, zwanymi dalej łącznie Zamawiającymi.')
const partyEvidence = discoverFilledPartyEvidence([mixedParty])
assert(partyEvidence.length === 1, 'mixed customer identity remains grounded')
assert(classifyProviderLegalSurface({ sourceBlock: mixedParty, partyEvidence }).classification === 'mixed_or_party_owned', 'mixed provider/customer content is not provider/legal-only')
const mixedPartyManifest = buildExpectationManifest({ sourceBlocks: [mixedParty], dataset: dataset(), protectedData })
const mixedPartyRepair = applyDeterministicRepairs({ blocks: [{ blockId: mixedParty.blockId, text: mixedParty.text }], sourceBlocks: [mixedParty], dataset: dataset(), manifest: mixedPartyManifest })
assert(mixedPartyRepair.blocks[0]?.text.includes('Natalię Brzegową i Filipa Brzegowego'), 'provider/legal classification does not block deterministic mixed-party repair')
assert(mixedPartyRepair.blocks[0]?.text.startsWith('Studio Foto sp. z o.o., NIP 000-000-00-03'), 'mixed provider/legal text remains unchanged around customer repair')

const mixedDate = block('mixed-date', 'Umowa zawarta w dniu 01.01.2025 r. przez Fotografa.')
assert(classifyProviderLegalSurface({ sourceBlock: mixedDate, partyEvidence: [] }).classification === 'canonical_fact_surface', 'provider/date surface remains canonical-fact eligible')
const mixedDateGate = runPostReconstructionQualityGate({
  sourceBlocks: [mixedDate], transformedBlocks: [{ blockId: mixedDate.blockId, text: mixedDate.text }],
  dataset: dataset(), protectedData, mode: 'full_ai',
  dateEvidence: [{ sourceBlockId: mixedDate.blockId, dateConcept: 'execution_date' }],
})
assert(mixedDateGate.blocks[0]?.text.includes('15.06.2026'), 'grounded deterministic execution-date repair still applies in provider-related prose')

const mixedFinance = block('mixed-finance', 'Wynagrodzenie Fotografa wynosi 1 000 zł.')
assert(classifyProviderLegalSurface({ sourceBlock: mixedFinance, partyEvidence: [] }).classification === 'canonical_fact_surface', 'provider/finance surface remains canonical-fact eligible')
const mixedFinanceGate = runPostReconstructionQualityGate({
  sourceBlocks: [mixedFinance], transformedBlocks: [{ blockId: mixedFinance.blockId, text: mixedFinance.text }],
  dataset: dataset(), protectedData, mode: 'full_ai',
  financeEvidence: [{ sourceBlockId: mixedFinance.blockId, financeConcept: 'total' }],
})
assert(mixedFinanceGate.blocks[0]?.text.includes('21 400'), 'canonical finance repair still applies to finance-owned content')

const ordinaryCustomer = block('customer-prose', 'Klient zobowiązuje się do współpracy przy realizacji umowy.')
assert(classifyProviderLegalSurface({ sourceBlock: ordinaryCustomer, partyEvidence: [] }).classification === 'other', 'ordinary customer/legal prose is not over-protected')
assert(verifyProviderRoleSparseScope({ sourceBlocks: [ordinaryCustomer], transformedBlocks: [{ blockId: ordinaryCustomer.blockId, text: `${ordinaryCustomer.text} Dodatkowe zdanie.` }], partyEvidence: [] }).length === 0, 'unrelated legal/customer prose has no accidental provider blocker')

console.log('PASS shared provider/legal protection boundary')
