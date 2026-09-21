import { buildQualityGateEvidenceTrace } from './buildQualityReport'
import type { ContractTransformationDataset, TransformDocumentBlock, TransformedBlock } from '../types'
import type { DocumentQualityReport, TransformationExpectationManifest } from './types'

const source: TransformDocumentBlock[] = [
  { blockId: 'party-1', paragraphIndex: 0, kind: 'paragraph', text: 'Klientami są Maja Przykładowa i Kacper Modelowy.' },
  { blockId: 'wedding-date', paragraphIndex: 1, kind: 'paragraph', text: 'Data ślubu: 01.01.2025' },
  { blockId: 'execution-date', paragraphIndex: 2, kind: 'paragraph', text: 'Umowa zawarta w dniu 02.01.2025' },
  { blockId: 'provider-1', paragraphIndex: 3, kind: 'paragraph', text: 'Fotograf zachowuje prawa autorskie.' },
]
const transformed: TransformedBlock[] = [
  { blockId: 'party-1', text: 'Klientami są Maja Przykładowa i Kacper Modelowy.' },
  { blockId: 'wedding-date', text: '' },
  { blockId: 'execution-date', text: '' },
  { blockId: 'provider-1', text: 'Fotograf zmienia prawa autorskie.' },
]
const dataset: ContractTransformationDataset = {
  clients: { displayNames: 'Natalia Brzegowa i Filip Brzegowy', personCount: 2 },
  dates: { weddingDate: '10.10.2026', contractExecutionDate: '11.10.2026' },
  locations: {}, finances: { contractValueFormatted: '1 000 zł', contractValueWords: 'tysiąc złotych' }, package: {},
}
const manifest = {
  requiredFields: [], protectedFields: [], consistencyRules: [], sourceSpecificValues: [], requiredReplacements: [
    { canonicalField: 'wedding.date', sourceValues: ['01.01.2025'], targetRenderedValues: ['10.10.2026'], sourceBlockIds: ['wedding-date'], requiredContextBlockIds: [], replacementPolicy: 'replace_all_occurrences' },
    { canonicalField: 'contract.executionDate', sourceValues: ['02.01.2025'], targetRenderedValues: ['11.10.2026'], sourceBlockIds: ['execution-date'], requiredContextBlockIds: [], replacementPolicy: 'replace_all_occurrences' },
  ],
  sourcePartyEvidence: [{ blockId: 'party-1', sourceText: source[0]!.text, identitySurfaces: ['Maja Przykładowa', 'Kacper Modelowy'], owner: 'MIXED' as const, customerHalfText: 'Maja Przykładowa i Kacper Modelowy' }],
} as TransformationExpectationManifest
const report = {
  blockingIssues: [
    { code: 'stale_party_identity_remaining', severity: 'blocking', canonicalField: 'customer.names', blockId: 'party-1', safeDescription: '' },
    { code: 'expected_dataset_value_missing', severity: 'blocking', canonicalField: 'wedding.date', blockId: 'wedding-date', safeDescription: '' },
    { code: 'expected_dataset_value_missing', severity: 'blocking', canonicalField: 'contract.executionDate', blockId: 'execution-date', safeDescription: '' },
    { code: 'unnecessary_provider_role_rewrite', severity: 'blocking', blockId: 'provider-1', safeDescription: '' },
  ], reviewIssues: [], warnings: [], repairs: [],
  completeness: {} as never, protection: {} as never, financialConsistency: {} as never, locationConsistency: {} as never, businessConsistency: {} as never,
} as DocumentQualityReport
const trace = buildQualityGateEvidenceTrace({ sourceBlocks: source, transformedBlocks: transformed, dataset, manifest, report, repairs: [] })
if (trace.party[0]?.finalClassification !== 'stale') throw new Error('stale party trace missing')
if (trace.dates.length < 2 || trace.dates.some((d) => d.postModelClassification !== 'missing')) throw new Error('date trace missing')
if (trace.provider[0]?.modelChanged !== true) throw new Error('provider trace missing')
if (trace.violations.length !== 4) throw new Error('quality violations not retained')
if (JSON.stringify(trace).includes('Maja Przykładowa')) throw new Error('full prose persisted')
console.log('ok — quality gate evidence trace')
