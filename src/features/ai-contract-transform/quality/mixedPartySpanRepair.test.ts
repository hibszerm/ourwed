import { buildExpectationManifest } from './expectationManifest'
import { repairMixedPartyProviderPreservation, applyDeterministicRepairs } from './deterministicRepairs'
import type { ContractTransformationDataset, TransformDocumentBlock } from '../types'
import { runPostReconstructionQualityGate } from './buildQualityReport'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildGoldenScenarios } from '../cg7/goldenScenarios'
import { buildContractTransformationDataset } from '../transformationDataset'
import { buildProtectedContractData } from '../protectedContractData'
import { splitMixedPartyClause } from './partyOwnership'
import { discoverFilledPartyEvidence } from './partyFilledIdentity'

const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
const dataset: ContractTransformationDataset = {
  clients: { displayNames: 'Natalia Brzegowa i Filip Brzegowy', personCount: 2 },
  dates: { weddingDate: '24.07.2027', contractExecutionDate: '05.11.2026' }, locations: {}, package: {},
  finances: { contractValueFormatted: '21 400 zł', contractValueWords: 'dwadzieścia jeden tysięcy czterysta złotych' },
}
const sourceText = 'Studio Foto sp. z o.o., NIP 000-000-00-03, zwaną dalej Wykonawcą, a Mają Przykładową i Kacpra Modelowego, zwanymi dalej łącznie Zamawiającymi.'
const source: TransformDocumentBlock[] = [{ blockId: 'mixed', paragraphIndex: 0, kind: 'paragraph', text: sourceText }]
const manifest = buildExpectationManifest({ sourceBlocks: source, dataset, protectedData: { exactProtectedValues: [], protectedPatterns: [] } })
assert(manifest.sourcePartyEvidence?.[0]?.owner === undefined, 'legacy behavior-driving party evidence projection remains unchanged')
assert(manifest.sourcePartyDiagnosticEvidence?.[0]?.owner === 'MIXED', 'diagnostic manifest preserves discovered mixed owner')
assert(Boolean(manifest.sourcePartyDiagnosticEvidence?.[0]?.customerHalfText), 'diagnostic manifest preserves grounded customer half')
const repaired = applyDeterministicRepairs({ blocks: [{ blockId: 'mixed', text: sourceText }], sourceBlocks: source, dataset, manifest }).blocks[0]!.text
assert(repaired.includes('Natalię Brzegową i Filipa Brzegowego'), 'inflected customer span repaired')
assert(repaired.startsWith('Studio Foto sp. z o.o., NIP 000-000-00-03, zwaną dalej Wykonawcą'), 'provider/legal prefix preserved')
assert(repaired.endsWith('zwanymi dalej łącznie Zamawiającymi.'), 'legal suffix preserved')
const ambiguous = source.map((b) => ({ ...b, text: `${b.text} oraz Mają Przykładową i Kacpra Modelowego` }))
const ambManifest = buildExpectationManifest({ sourceBlocks: ambiguous, dataset, protectedData: { exactProtectedValues: [], protectedPatterns: [] } })
const ambOut = applyDeterministicRepairs({ blocks: [{ blockId: 'mixed', text: ambiguous[0]!.text }], sourceBlocks: ambiguous, dataset, manifest: ambManifest }).blocks[0]!.text
assert(ambOut === ambiguous[0]!.text, 'ambiguous duplicate span fails closed')

const safeData = { exactProtectedValues: [], protectedPatterns: [] }
const traceFor = (src: TransformDocumentBlock[], out: Array<{ blockId: string; text: string; originSourceBlockId?: string }>) =>
  repairMixedPartyProviderPreservation({ blocks: out, sourceBlocks: src, dataset, manifest: buildExpectationManifest({ sourceBlocks: src, dataset, protectedData: safeData }) }).diagnostics[0]
const successTrace = traceFor(source, [{ blockId: 'mixed', text: `${sourceText} Synthetic edit.` }])!
assert(successTrace.repairAttempted && successTrace.repairApplied && successTrace.reasonCode === 'repair_applied', 'successful mixed repair has an execution trace')
assert(successTrace.providerLegalPreservationCheck === true && successTrace.targetUnique && successTrace.customerSpanRepairApplied, 'successful trace records exact provider preservation and unique customer-span repair')

const missingTarget = sourceText.replace('Mają Przykładową i Kacpra Modelowego', 'Natalię Brzegową i Filipa Brzegowego')
const missingTrace = traceFor(source, [{ blockId: 'mixed', text: missingTarget }])!
assert(missingTrace.repairAttempted && !missingTrace.repairApplied && missingTrace.reasonCode === 'target_span_missing', 'missing target span fails closed with its reason')

const multipleText = `${sourceText} oraz Mają Przykładową i Kacpra Modelowego`
const multipleTrace = traceFor(source, [{ blockId: 'mixed', text: multipleText }])!
assert(multipleTrace.repairAttempted && !multipleTrace.repairApplied && multipleTrace.reasonCode === 'target_span_not_unique' && multipleTrace.targetCandidateCount > 2, 'multiple target candidates fail closed with their reason')

const renderingDataset = { ...dataset, clients: { ...dataset.clients, displayNames: 'Natalia Nowa Brzegowa i Filip Nowy Brzegowy' } }
const renderingTrace = repairMixedPartyProviderPreservation({ blocks: [{ blockId: 'mixed', text: sourceText }], sourceBlocks: source, dataset: renderingDataset, manifest }).diagnostics[0]!
assert(!renderingTrace.repairApplied && renderingTrace.guardReasonCodes.includes('canonical_party_rendering_unavailable'), 'unrenderable canonical morphology is visible and fails closed for the name span')

const sourceProvenanceTrace = traceFor(source, [{ blockId: 'replacement-id', originSourceBlockId: 'mixed', text: sourceText }])!
assert(!sourceProvenanceTrace.repairAttempted && sourceProvenanceTrace.reasonCode === 'source_provenance_target_not_matched_by_repair', 'origin-only target exposes the current exact-ID handoff without changing behavior')

const providerChanged = sourceText.replace('Studio Foto', 'Different Studio')
const providerTrace = traceFor(source, [{ blockId: 'mixed', text: providerChanged }])!
assert(providerTrace.repairApplied && providerTrace.providerLegalPreservationCheck === false && providerTrace.reasonCode === 'provider_half_changed_rebuilt_from_source', 'changed provider half is restored from source and traced')

const canonicalSource = source.map((block) => ({ ...block, text: sourceText.replace('Mają Przykładową i Kacpra Modelowego', 'Natalię Brzegową i Filipa Brzegowego') }))
const noChangeTrace = repairMixedPartyProviderPreservation({ blocks: [{ blockId: 'mixed', text: canonicalSource[0]!.text }], sourceBlocks: canonicalSource, dataset, manifest: buildExpectationManifest({ sourceBlocks: canonicalSource, dataset, protectedData: safeData }) }).diagnostics[0]!
assert(!noChangeTrace.repairApplied && noChangeTrace.reasonCode === 'no_change_needed', `already-canonical surface is distinguished from a skipped repair (${JSON.stringify({ reasonCode: noChangeTrace.reasonCode, guardReasonCodes: noChangeTrace.guardReasonCodes, targetCandidateCount: noChangeTrace.targetCandidateCount, canonicalRenderingAvailable: noChangeTrace.canonicalRenderingAvailable })})`)

const noGroundedSpanSource = source.map((block) => ({ ...block, text: sourceText.replace('Mają Przykładową i Kacpra Modelowego, zwanymi dalej łącznie Zamawiającymi', 'osobami, zwanymi dalej łącznie Zamawiającymi') }))
const noGroundedTrace = repairMixedPartyProviderPreservation({ blocks: [{ blockId: 'mixed', text: noGroundedSpanSource[0]!.text }], sourceBlocks: noGroundedSpanSource, dataset, manifest: buildExpectationManifest({ sourceBlocks: noGroundedSpanSource, dataset, protectedData: safeData }) }).diagnostics[0]!
assert(!noGroundedTrace.repairApplied && noGroundedTrace.guardReasonCodes.includes('grounded_customer_span_unavailable'), 'missing grounded identity evidence is visible')

const incompatibleSource = source.map((block) => ({ ...block, text: sourceText.replace(', a Mają', ' oraz Mają') }))
const incompatibleTrace = traceFor(incompatibleSource, [{ blockId: 'mixed', text: incompatibleSource[0]!.text }])!
assert(!incompatibleTrace.repairAttempted && incompatibleTrace.reasonCode === 'source_mixed_split_unavailable', 'unavailable SOURCE mixed split is reported before repair')

const serializedTrace = JSON.stringify([successTrace, missingTrace, multipleTrace, renderingTrace, sourceProvenanceTrace, providerTrace, noChangeTrace, noGroundedTrace, incompatibleTrace])
assert(!serializedTrace.includes('Maja Przykładowa') && !serializedTrace.includes('Kacper Modelowy') && !serializedTrace.includes('Synthetic edit') && !serializedTrace.includes('Studio Foto'), 'diagnostics retain no source or replacement prose')

// Exact G03 SOURCE/dataset, no provider call. Exercise the real quality-gate path
// against controlled synthetic mutations, not the unavailable historical response.
const scenario = buildGoldenScenarios().find((item) => item.caseId === 'G03')!
const g03Path = join(process.cwd(), 'tmp/golden-contract-validation-run2/SOURCE', scenario.sourceFile)
const raw = readFileSync(g03Path)
const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
const g03Source = await indexDocxForTransform(bytes)
const g03Dataset = buildContractTransformationDataset({ wedding: scenario.wedding, package: scenario.package, extras: scenario.extras, currentDate: '2026-11-05' })
const g03Para9 = g03Source.find((block) => block.blockId === 'para-9')!
assert(Boolean(g03Para9), 'exact G03 SOURCE mixed party block exists')
const g03PartyEvidence = discoverFilledPartyEvidence([g03Para9])[0]!
const g03Split = splitMixedPartyClause(g03Para9.text)
assert(g03PartyEvidence.owner === 'MIXED' && Boolean(g03Split) && g03PartyEvidence.identitySurfaces.length === 2, 'exact G03 SOURCE discovers mixed split and two identity surfaces')
const g03Gate = (text: string) => runPostReconstructionQualityGate({
  sourceBlocks: g03Source,
  transformedBlocks: g03Source.map((block) => ({ blockId: block.blockId, text: block.blockId === 'para-9' ? text : block.text })),
  dataset: g03Dataset,
  protectedData: buildProtectedContractData({ blocks: g03Source, blockTexts: g03Source.map((block) => block.text) }),
  mode: 'full_ai',
})
const syntheticProviderEdit = g03Para9.text.replace(/Studio/i, 'Altered studio')
const syntheticEdited = g03Gate(syntheticProviderEdit)
const g03Success = syntheticEdited.diagnostics.qualityGateEvidence?.mixedPartyRepairs?.find((item) => item.sourceBlockId === 'para-9')
assert(g03Success?.sourceOwnership === 'MIXED' && g03Success.sourceMixedSplitAvailable && g03Success.groundedCustomerSpanAvailable, 'G03 SOURCE repair trace records grounded mixed ownership')
assert(g03Success.manifestOwnership === 'MIXED', 'G03 manifest now retains mixed ownership')
assert(g03Success.repairAttempted && g03Success.repairApplied && g03Success.reasonCode === 'provider_half_changed_rebuilt_from_source', 'G03 synthetic mixed mutation reaches the existing source-restoration repair')
const directG03Repair = repairMixedPartyProviderPreservation({ blocks: [{ blockId: 'para-9', text: syntheticProviderEdit }], sourceBlocks: [g03Para9], dataset: g03Dataset, manifest: syntheticEdited.manifest })
const restoredG03Split = splitMixedPartyClause(directG03Repair.blocks[0]?.text ?? '')
assert(restoredG03Split?.providerHalf === g03Split!.providerHalf, 'G03 synthetic repair restores the exact SOURCE provider half')
const g03SyntheticBlocks = g03Source.map((block) => ({ blockId: block.blockId, text: block.blockId === 'para-9' ? syntheticProviderEdit : block.text }))
const withDiagnosticEvidence = applyDeterministicRepairs({ blocks: g03SyntheticBlocks, sourceBlocks: g03Source, dataset: g03Dataset, manifest: syntheticEdited.manifest })
const legacyManifest = { ...syntheticEdited.manifest, sourcePartyDiagnosticEvidence: undefined }
const withoutDiagnosticEvidence = applyDeterministicRepairs({ blocks: g03SyntheticBlocks, sourceBlocks: g03Source, dataset: g03Dataset, manifest: legacyManifest })
assert(JSON.stringify({ blocks: withDiagnosticEvidence.blocks, repairs: withDiagnosticEvidence.repairs }) === JSON.stringify({ blocks: withoutDiagnosticEvidence.blocks, repairs: withoutDiagnosticEvidence.repairs }), 'diagnostics-only metadata does not change deterministic transformation output')
assert(!JSON.stringify(syntheticEdited.diagnostics.qualityGateEvidence).includes(g03Para9.text), 'G03 trace excludes contract prose')

const g03PreservedProvider = g03Gate(`${g03Para9.text} Synthetic edit.`)
const g03PreservedTrace = g03PreservedProvider.diagnostics.qualityGateEvidence?.mixedPartyRepairs?.find((item) => item.sourceBlockId === 'para-9')
assert(g03PreservedTrace?.repairAttempted && !g03PreservedTrace.repairApplied && !g03PreservedTrace.customerSpanRepairApplied && g03PreservedTrace.reasonCode === 'canonical_party_rendering_unavailable', 'G03 stale identity with preserved provider half exposes the exact morphology fail-closed guard')

const g03SplitRequired = g03Split!
const duplicatedIdentity = `${g03SplitRequired.providerHalf}${g03SplitRequired.separator}${g03SplitRequired.customerHalf} oraz ${g03PartyEvidence.identitySurfaces.join(' i ')}`
const g03Ambiguous = g03Gate(duplicatedIdentity)
const g03AmbiguousTrace = g03Ambiguous.diagnostics.qualityGateEvidence?.mixedPartyRepairs?.find((item) => item.sourceBlockId === 'para-9')
assert(g03AmbiguousTrace?.repairAttempted && !g03AmbiguousTrace.repairApplied && g03AmbiguousTrace.reasonCode === 'target_span_not_unique', 'G03 synthetic ambiguous target fails closed with a specific reason')

const g03Missing = g03Gate(`${g03SplitRequired.providerHalf}${g03SplitRequired.separator}Zamawiającymi.`)
const g03MissingTrace = g03Missing.diagnostics.qualityGateEvidence?.mixedPartyRepairs?.find((item) => item.sourceBlockId === 'para-9')
assert(g03MissingTrace?.repairAttempted && !g03MissingTrace.repairApplied && g03MissingTrace.reasonCode === 'target_span_missing', 'G03 synthetic missing target fails closed with a specific reason')
console.log('PASS mixed protected party span regressions')
