/** Offline replay adapter for already-parsed sparse model responses. */
import { normalizeIdenticalChangedBlockDuplicates } from '../blockIdIntegrity'
import { collectProtocolIntegrityViolations } from '../sparseProtocolIntegrity'
import { runSparseProductTransform } from '../transformService'
import type { ContractTransformationDataset, TransformDocumentBlock, GroundedDateEvidence, GroundedFinanceEvidence } from '../types'
import type { SparseChangedBlock } from '../parseSparseV2Response'

export type ParsedCapturedResponse = {
  changedBlocks: SparseChangedBlock[]
  financeEvidence?: GroundedFinanceEvidence[]
  dateEvidence?: GroundedDateEvidence[]
}

export type CapturedReplayReport = {
  protocol: { status: 'accepted' | 'rejected'; normalizationApplied: boolean; violations: string[] }
  semanticEvidence: { finance: Array<{ blockId: string; concept: string; outcome: string }>; date: Array<{ blockId: string; concept: string; outcome: string }> }
  transform: { started: boolean; completed: boolean }
  repairs: { attempted: string[]; applied: string[]; skipped: string[] }
  quality: { status: 'passed' | 'failed' | 'not_reached'; blockerReasons: string[] }
  finalEligible: boolean
}

/**
 * Starts after provider parsing. Protocol helpers and the normal product
 * orchestration are reused; the injected invoke only returns captured data.
 */
export async function replayCapturedResponse(input: {
  sourceBytes: ArrayBuffer
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
  response: ParsedCapturedResponse
}): Promise<{ report: CapturedReplayReport }> {
  let protocolStatus: CapturedReplayReport['protocol']['status'] = 'accepted'
  let normalizationApplied = false
  let violations: string[] = []
  let finance: CapturedReplayReport['semanticEvidence']['finance'] = []
  let date: CapturedReplayReport['semanticEvidence']['date'] = []

  const result = await runSparseProductTransform({
    sourceBytes: input.sourceBytes,
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
    invoke: async (_functionName, options) => {
      const requestBlocks = Array.isArray(options.body.documentBlocks)
        ? options.body.documentBlocks as TransformDocumentBlock[]
        : input.sourceBlocks
      const normalized = normalizeIdenticalChangedBlockDuplicates({
        changedBlocks: input.response.changedBlocks,
        sourceBlocks: requestBlocks,
      })
      normalizationApplied = normalized.duplicateDiagnostics.some((item) => item.identicalNormalizationApplied)
      const integrity = collectProtocolIntegrityViolations({
        changedBlocks: normalized.changedBlocks,
        sourceBlocks: requestBlocks,
      })
      violations = integrity.violations.map((item) => item.kind)
      if (integrity.needsProtocolRetry) {
        protocolStatus = 'rejected'
        return { data: { ok: false, error: { code: 'captured_response_protocol_rejected', message: 'Captured response failed protocol integrity.' } }, error: null }
      }
      return {
        data: {
          ok: true,
          changedBlocks: normalized.changedBlocks,
          financeEvidence: input.response.financeEvidence ?? [],
          dateEvidence: input.response.dateEvidence ?? [],
          model: 'captured-response-replay',
        },
        error: null,
      }
    },
  })

  const wasProtocolRejected = () => protocolStatus === 'rejected'
  if (wasProtocolRejected()) {
    return {
      report: {
        protocol: { status: protocolStatus, normalizationApplied, violations },
        semanticEvidence: { finance, date },
        transform: { started: false, completed: false },
        repairs: { attempted: [], applied: [], skipped: [] },
        quality: { status: 'not_reached', blockerReasons: [] },
        finalEligible: false,
      },
    }
  }

  const diagnostics = result.diagnostics
  finance = (diagnostics?.groundedFinanceEvidence ?? []).map((item) => ({ blockId: item.sourceBlockId, concept: item.financeConcept, outcome: item.outcome }))
  date = (diagnostics?.dateEvidence ?? []).map((item) => ({ blockId: item.sourceBlockId, concept: item.dateConcept, outcome: item.outcome }))
  const attempted = [
    ...(diagnostics?.financeRepairs ?? []).map((item) => `finance:${item.canonicalRole}`),
    ...(diagnostics?.dateEvidence ?? []).filter((item) => item.repairAttempted).map((item) => `date:${item.dateConcept}`),
  ]
  const applied = [
    ...(diagnostics?.financeRepairs ?? []).filter((item) => item.applied).map((item) => `finance:${item.canonicalRole}`),
    ...(diagnostics?.dateEvidence ?? []).filter((item) => item.repairApplied).map((item) => `date:${item.dateConcept}`),
  ]
  const skipped = [...new Set([
    ...(diagnostics?.financeRepairs ?? []).filter((item) => !item.applied).map((item) => `finance:${item.canonicalRole}`),
    ...(diagnostics?.dateEvidence ?? []).filter((item) => item.repairAttempted && !item.repairApplied).map((item) => `date:${item.dateConcept}`),
  ])]
  const blockers = result.blockingIssues
  const downstreamBlocked = !result.ok && result.reason === 'blocked'
  const downstreamStarted = result.ok || downstreamBlocked
  return {
    report: {
      protocol: { status: 'accepted', normalizationApplied, violations },
      semanticEvidence: { finance, date },
      transform: { started: downstreamStarted, completed: downstreamStarted },
      repairs: { attempted: [...new Set(attempted)], applied: [...new Set(applied)], skipped },
      quality: { status: result.ok ? 'passed' : downstreamBlocked ? 'failed' : 'not_reached', blockerReasons: blockers },
      finalEligible: result.ok,
    },
  }
}
