import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildProtectedContractData } from '../protectedContractData'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { runPostReconstructionQualityGate } from '../quality/buildQualityReport'
import { classifyProviderLegalSurface } from '../quality/partyFilledIdentity'
import { buildContractTransformationDataset } from '../transformationDataset'
import { buildFullAiJsonSchemaForBlockIds } from '../blockIdIntegrity'
import { runSparseProductTransform } from '../transformService'
import { buildGoldenScenarios } from './goldenScenarios'

const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
const scenario = buildGoldenScenarios().find((item) => item.caseId === 'G03')!
const sourcePath = join(process.cwd(), 'tmp/golden-contract-validation-run2/SOURCE', scenario.sourceFile)
const raw = readFileSync(sourcePath)
const sourceBytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
const sourceBlocks = await indexDocxForTransform(sourceBytes)
const dataset = buildContractTransformationDataset({ wedding: scenario.wedding, package: scenario.package, extras: scenario.extras, currentDate: '2026-11-05' })
const para91 = sourceBlocks.find((block) => block.blockId === 'para-91')
const para9 = sourceBlocks.find((block) => block.blockId === 'para-9')
assert(Boolean(para91), 'G03 provider/legal source surface exists')
assert(Boolean(para9), 'G03 mixed-party source surface exists')

let requestBlocks: Array<Record<string, unknown>> = []
let editableIds: string[] = []
const result = await runSparseProductTransform({
  sourceBytes,
  sourceBlocks,
  dataset,
  invoke: async (_functionName, options) => {
    const body = options.body
    requestBlocks = body.documentBlocks as Array<Record<string, unknown>>
    editableIds = (body.structuralContext as { editableBlockIds: string[] }).editableBlockIds
    return { data: { ok: true, changedBlocks: [], financeEvidence: null, dateEvidence: null, model: 'simulated-no-network' }, error: null }
  },
})
const requestPara91 = requestBlocks.find((block) => block.blockId === 'para-91')
const para91Context = requestPara91?.modelContext as Record<string, unknown> | undefined
assert(para91Context?.ownership === 'provider', 'para-91 gets shared provider/legal ownership')
assert(para91Context?.modelEditable === false, 'para-91 is excluded from editable scope before model request')
assert(para91Context?.protectionReason === 'provider_legal_only', 'para-91 protection reason is retained')
assert(!editableIds.includes('para-91'), 'para-91 absent from request editable allowlist')
const responseSchema = buildFullAiJsonSchemaForBlockIds(editableIds).schema as Record<string, any>
assert(!responseSchema.properties.changedBlocks.items.properties.blockId.enum.includes('para-91'), 'strict response schema cannot target para-91')
assert(result.ok === false, 'empty-change exact G03 replay reaches quality gate and remains blocked by unrelated incomplete facts')
const providerTrace = result.diagnostics?.qualityGateEvidence?.provider.find((entry) => entry.sourceBlockId === 'para-91')
assert(providerTrace?.modelEditable === false && providerTrace.protectionDecision === 'protected', 'G03 protection is included in safe quality trace')
assert(providerTrace?.modelChanged === false && providerTrace.finalQualityResult === 'pass', 'unchanged G03 provider content passes naturally')
assert(providerTrace?.protectionReason === 'provider_legal_only' && typeof providerTrace.ownershipReason === 'string', 'G03 trace records ownership and protection reasons')
assert(!result.blockingIssues.includes('unnecessary_provider_role_rewrite:para-91'), 'G03 natural replay no longer produces provider-role blocker')

const enrichedSource = requestBlocks as unknown as typeof sourceBlocks
const forcedRewrite = enrichedSource.map((block) => block.blockId === 'para-91' ? { blockId: block.blockId, text: `${block.text} synthetic rewrite` } : { blockId: block.blockId, text: block.text })
const protectedData = buildProtectedContractData({ blocks: sourceBlocks, blockTexts: sourceBlocks.map((block) => block.text) })
const forcedGate = runPostReconstructionQualityGate({ sourceBlocks: enrichedSource, transformedBlocks: forcedRewrite, dataset, protectedData, mode: 'full_ai' })
assert(forcedGate.report.blockingIssues.some((issue) => issue.code === 'unnecessary_provider_role_rewrite' && issue.blockId === 'para-91'), 'quality invariant remains active for a forced downstream provider rewrite')

const para9Decision = classifyProviderLegalSurface({ sourceBlock: para9!, partyEvidence: result.diagnostics?.qualityGateEvidence?.party.map((entry) => ({ blockId: String(entry.sourceBlockId), identitySurfaces: [] })) ?? [] })
assert(para9Decision.classification !== 'provider_legal_only', 'G03 para-9 mixed-party behavior is not changed by provider/legal protection')
assert(requestBlocks.find((block) => block.blockId === 'para-9')?.modelContext !== undefined, 'G03 para-9 model context remains on its prior independent protection path')

console.log('PASS G03 no-network provider/legal protection replay')
