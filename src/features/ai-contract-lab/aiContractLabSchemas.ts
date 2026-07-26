import { z } from 'zod'

/** Phase A — document semantic map (no wedding field mapping). */
export const documentSemanticMapSchema = z.object({
  analysisVersion: z.string().min(1),
  documentSummary: z.object({
    documentType: z.string(),
    language: z.string(),
    detectedPartyRoles: z.array(z.string()),
    detectedBusinessContext: z.string(),
  }),
  semanticAnchors: z.array(
    z.object({
      anchorId: z.string().min(1),
      semanticRole: z.string().min(1),
      confidence: z.number().min(0).max(1),
      documentLabel: z.string().max(120).nullable().optional(),
      valueSpan: z.object({
        sourceText: z
          .string()
          .min(1)
          .max(240)
          .describe('Exact contiguous substring from the anchor'),
        prefixContext: z.string().max(240).nullable().optional(),
        suffixContext: z.string().max(240).nullable().optional(),
      }),
      reason: z.string().max(240).nullable().optional(),
    }),
  ),
  warnings: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
        anchorIds: z.array(z.string()),
      }),
    )
    .optional()
    .default([]),
})

export type ParsedDocumentSemanticMap = z.infer<typeof documentSemanticMapSchema>

/** Legacy Phase-B-style analysis result (still used after client mapping). */
export const aiContractAnalysisResultSchema = z.object({
  analysisVersion: z.string().min(1),
  documentSummary: z.object({
    documentType: z.string(),
    language: z.string(),
    detectedPartyRoles: z.array(z.string()),
    detectedBusinessContext: z.string(),
  }),
  replacements: z.array(
    z.object({
      replacementId: z.string().min(1),
      anchorId: z.string().min(1),
      originalText: z
        .string()
        .min(1)
        .max(240)
        .describe(
          'Exact contiguous substring from the anchor. No ellipses, no paraphrase.',
        ),
      canonicalFieldKey: z.string().min(1),
      proposedValue: z.string(),
      semanticRole: z.string(),
      reason: z.string(),
      confidence: z.number().min(0).max(1),
      requiresUserReview: z.boolean(),
      prefixContext: z
        .string()
        .max(240)
        .nullable()
        .optional()
        .describe('Optional exact prefix before the value in the anchor'),
      suffixContext: z
        .string()
        .max(240)
        .nullable()
        .optional()
        .describe('Optional exact suffix after the value in the anchor'),
    }),
  ),
  missingFields: z.array(
    z.object({
      missingId: z.string().min(1),
      label: z.string().min(1),
      semanticRole: z.string(),
      expectedDataType: z.string(),
      affectedAnchorIds: z.array(z.string()),
      reason: z.string(),
      suggestedCanonicalFieldKey: z.string().nullable(),
      fieldKey: z.string().nullable().optional(),
      targetEvidence: z
        .object({
          anchorId: z.string().min(1),
          exactText: z.string().max(240).nullable().optional(),
          prefixContext: z.string().max(240).nullable().optional(),
          suffixContext: z.string().max(240).nullable().optional(),
          semanticLabel: z.string().min(1).max(120),
        })
        .nullable()
        .optional(),
    }),
  ),
  ambiguities: z.array(
    z.object({
      ambiguityId: z.string().min(1),
      anchorId: z.string().min(1),
      originalText: z.string(),
      candidateFieldKeys: z.array(z.string()),
      reason: z.string(),
    }),
  ),
  ignoredWeddingFields: z
    .array(
      z.object({
        canonicalFieldKey: z.string(),
        reason: z.string(),
      }),
    )
    .optional()
    .default([]),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      anchorIds: z.array(z.string()),
    }),
  ),
})

export type ParsedAiContractAnalysis = z.infer<
  typeof aiContractAnalysisResultSchema
>
