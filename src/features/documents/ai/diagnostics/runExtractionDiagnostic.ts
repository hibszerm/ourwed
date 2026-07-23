/**
 * Dev-only dual-pass extraction diagnostic.
 * Pass 1: business understanding (no registry).
 * Pass 2: production extraction + stage snapshots.
 * Does not alter production prompts or draft generation logic.
 */

import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { DOCUMENT_AI_CONFIG } from '@/features/documents/ai/config'
import {
  DocumentAiAnalysisError,
  documentAiErrorFromPayload,
  mapHttpStatusToErrorCode,
} from '@/features/documents/ai/errors'
import { normalizeAnalysisPayload } from '@/features/documents/ai/normalizeAnalysisResult'
import { aiAnalysisToDetectedFields } from '@/features/documents/ai/bridgeToWizard'
import { hashDocumentText } from '@/features/documents/ai/hash'
import type { DocumentStructure } from '@/features/documents/mapping/preview/documentNodes'
import { generateQuestionnaireDraft } from '@/features/documents/questionnaire'
import { classifyDetectedFields } from '@/features/documents/questionnaire/classifyVariables'
import { compareExtractionDiagnostic } from './compareExtractionDiagnostic'
import { parseBusinessUnderstanding } from './parseBusinessUnderstanding'
import type {
  DiagnosticPipelineStages,
  ExtractionDiagnosticReport,
  ProductionIdArrays,
} from './types'
import type { DocumentAiErrorPayload } from '@/features/documents/ai/types'
import type { QuestionnaireDraft } from '@/features/documents/questionnaire'

/** Enable with VITE_DOCUMENT_AI_DIAGNOSTIC=true in development only. */
export function isExtractionDiagnosticEnabled(): boolean {
  return (
    import.meta.env.DEV === true &&
    import.meta.env.VITE_DOCUMENT_AI_DIAGNOSTIC === 'true'
  )
}

interface EdgeErrorBody {
  ok: false
  error: DocumentAiErrorPayload
}

function isEdgeError(body: unknown): body is EdgeErrorBody {
  return (
    body != null &&
    typeof body === 'object' &&
    'ok' in body &&
    (body as { ok: unknown }).ok === false &&
    'error' in body
  )
}

async function readHttpErrorBody(error: unknown): Promise<unknown> {
  if (!(error instanceof FunctionsHttpError)) return null
  const ctx = error.context
  if (!ctx || typeof ctx.json !== 'function') return null
  try {
    return await ctx.json()
  } catch {
    return null
  }
}

async function invokeEdge(body: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    DOCUMENT_AI_CONFIG.clientTimeoutMs,
  )
  try {
    const result = await supabase.functions.invoke(
      DOCUMENT_AI_CONFIG.edgeFunctionName,
      { body, signal: controller.signal },
    )
    if (result.error) {
      const errBody = (await readHttpErrorBody(result.error)) ?? result.data
      if (isEdgeError(errBody)) {
        throw documentAiErrorFromPayload(errBody.error)
      }
      const status =
        result.error instanceof FunctionsHttpError &&
        typeof result.error.context?.status === 'number'
          ? result.error.context.status
          : 0
      throw new DocumentAiAnalysisError(mapHttpStatusToErrorCode(status))
    }
    return result.data
  } finally {
    clearTimeout(timer)
  }
}

function asIdArrays(value: unknown): ProductionIdArrays {
  if (!value || typeof value !== 'object') {
    return {
      coupleVariables: [],
      studioVariables: [],
      packageVariables: [],
      possibleVariables: [],
    }
  }
  const obj = value as Record<string, unknown>
  const list = (key: string) =>
    Array.isArray(obj[key])
      ? (obj[key] as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
  return {
    coupleVariables: list('coupleVariables'),
    studioVariables: list('studioVariables'),
    packageVariables: list('packageVariables'),
    possibleVariables: list('possibleVariables'),
  }
}

export async function runExtractionDiagnostic(input: {
  text: string
  structure?: DocumentStructure | null
  templateName?: string | null
}): Promise<{
  report: ExtractionDiagnosticReport
  draft: QuestionnaireDraft
}> {
  const fullText = input.text ?? ''
  const text =
    fullText.length > DOCUMENT_AI_CONFIG.maxTextChars
      ? fullText.slice(0, DOCUMENT_AI_CONFIG.maxTextChars)
      : fullText
  const contentHash = await hashDocumentText(text)

  const [pass1Body, pass2Body] = await Promise.all([
    invokeEdge({
      text,
      contentHash: `${contentHash}:business`,
      mode: 'business_understanding',
      schemaVersion: DOCUMENT_AI_CONFIG.schemaVersion,
      promptVersion: DOCUMENT_AI_CONFIG.promptVersion,
    }),
    invokeEdge({
      text,
      contentHash: `${contentHash}:diagnostic`,
      mode: 'production',
      diagnostic: true,
      schemaVersion: DOCUMENT_AI_CONFIG.schemaVersion,
      promptVersion: DOCUMENT_AI_CONFIG.promptVersion,
    }),
  ])

  if (!pass1Body || typeof pass1Body !== 'object') {
    throw new DocumentAiAnalysisError('empty_response')
  }
  if (!pass2Body || typeof pass2Body !== 'object') {
    throw new DocumentAiAnalysisError('empty_response')
  }

  const p1 = pass1Body as Record<string, unknown>
  const p2 = pass2Body as Record<string, unknown>

  if (isEdgeError(p1)) throw documentAiErrorFromPayload(p1.error)
  if (isEdgeError(p2)) throw documentAiErrorFromPayload(p2.error)

  const understandingRaw = p1.understanding ?? p1.analysis
  const understanding = parseBusinessUnderstanding(understandingRaw)

  if (p2.analysis == null) {
    throw new DocumentAiAnalysisError('empty_response')
  }

  const diagnosticBlock =
    p2.diagnostic && typeof p2.diagnostic === 'object'
      ? (p2.diagnostic as Record<string, unknown>)
      : null
  const stagesBlock =
    diagnosticBlock?.stages && typeof diagnosticBlock.stages === 'object'
      ? (diagnosticBlock.stages as Record<string, unknown>)
      : null

  const rawParsed = stagesBlock?.rawParsed ?? p2.analysis
  const afterValidation = stagesBlock?.afterValidation
    ? asIdArrays(stagesBlock.afterValidation)
    : asIdArrays(p2.analysis)

  const aiAnalysis = normalizeAnalysisPayload(p2.analysis, {
    sourceTextLength: text.length,
    contentHash,
    fromCache: false,
  })
  const fields = aiAnalysisToDetectedFields(aiAnalysis, input.structure)
  const classification = classifyDetectedFields(fields)

  const draft = generateQuestionnaireDraft({
    fields,
    ai: aiAnalysis,
    sourceText: text,
    templateName: input.templateName,
  })

  const afterExpand = {
    registryKeys: aiAnalysis.fields
      .map((f) => f.registryKey)
      .filter((k): k is string => Boolean(k)),
    labels: aiAnalysis.fields.map((f) => f.label).filter(Boolean),
    unmappedLabels: aiAnalysis.fields
      .filter((f) => !f.registryKey)
      .map((f) => f.label)
      .filter(Boolean),
  }

  const afterClassification = {
    registryKeys: classification
      .map((c) => c.registryKey)
      .filter((k): k is string => Boolean(k)),
    labels: classification.map((c) => c.label),
  }

  const afterReview = {
    registryKeys: draft.questions
      .map((q) => q.registryKey)
      .filter((k): k is string => Boolean(k)),
    labels: draft.questions.map((q) => q.title || q.contractLabel),
    enabledLabels: draft.questions
      .filter((q) => q.enabled)
      .map((q) => q.title || q.contractLabel),
  }

  // Include package presence rows in review labels for comparison.
  for (const pv of draft.packageVariables ?? []) {
    afterReview.labels.push(pv.label)
    if (pv.enabled) afterReview.enabledLabels.push(pv.label)
  }

  const stages: DiagnosticPipelineStages = {
    rawParsed,
    afterValidation,
    afterExpand,
    afterClassification,
    afterReview,
  }

  const compared = compareExtractionDiagnostic({ understanding, stages })

  const report: ExtractionDiagnosticReport = {
    generatedAt: new Date().toISOString(),
    businessType: understanding.businessType,
    understanding,
    production: compared.production,
    productionDisplayNames: compared.productionDisplayNames,
    stages,
    comparisons: compared.comparisons,
    missing: compared.missing,
    partial: compared.partial,
    coverage: compared.coverage,
    likelyFirstLoss: compared.likelyFirstLoss,
    summary: compared.summary,
  }

  return { report, draft }
}
