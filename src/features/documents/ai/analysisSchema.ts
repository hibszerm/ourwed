import { z } from 'zod'
import { isKnownVariableKey } from '@/features/documents/registry/variableRegistry'
import { DOCUMENT_AI_CONFIG } from './config'

/**
 * Runtime schema for AI analyzer JSON.
 * Ensures registryKey is either null or a known Variable Registry key.
 */

export const detectedDocumentFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  registryKey: z
    .string()
    .nullable()
    .refine((k) => k === null || isKnownVariableKey(k), {
      message: 'registryKey must be a known Variable Registry key or null',
    }),
  value: z.string().nullable().optional(),
  extractedValue: z.string().optional(),
  confidence: z.number().min(0).max(1),
  paragraphIndex: z.number().int().nonnegative().nullable().optional(),
  location: z
    .object({
      paragraphIndex: z.number().int().nonnegative().optional(),
      text: z.string().optional(),
    })
    .optional(),
  status: z.enum(['suggested', 'confirmed', 'rejected']),
})

export const detectedDocumentSectionSchema = z.object({
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
})

export const detectedDocumentClauseSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  confidence: z.number().min(0).max(1),
  title: z.string().optional(),
})

export const aiDocumentAnalysisResultSchema = z.object({
  schemaVersion: z.string().default(DOCUMENT_AI_CONFIG.schemaVersion),
  model: z.string().default(DOCUMENT_AI_CONFIG.model),
  promptVersion: z.string().default(DOCUMENT_AI_CONFIG.promptVersion),
  analyzerId: z.string().default(DOCUMENT_AI_CONFIG.analyzerId),
  analyzerVersion: z.string().default(DOCUMENT_AI_CONFIG.analyzerVersion),
  documentType: z.string(),
  packageSuggestion: z.string().nullable().optional(),
  packageVariables: z.array(z.string()).optional().default([]),
  defaults: z
    .array(
      z.object({
        id: z.string().min(1),
        value: z.string(),
      }),
    )
    .optional()
    .default([]),
  overallConfidence: z.number().min(0).max(1).default(0.5),
  fields: z.array(detectedDocumentFieldSchema),
  sections: z.array(detectedDocumentSectionSchema),
  clauses: z.array(detectedDocumentClauseSchema),
  warnings: z.array(z.string()).default([]),
  analyzedAt: z.string(),
  sourceTextLength: z.number().int().nonnegative(),
  contentHash: z.string().optional(),
  fromCache: z.boolean().optional(),
})

export type AiDocumentAnalysisResultParsed = z.infer<
  typeof aiDocumentAnalysisResultSchema
>

/** Looser parse for Edge payloads before registry filtering. */
export const rawAnalysisSchema = z.object({
  schemaVersion: z.string().optional(),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  documentType: z.string().optional(),
  overallConfidence: z.number().optional(),
  fields: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().optional(),
        registryKey: z.string().nullable().optional(),
        value: z.string().nullable().optional(),
        confidence: z.number().optional(),
        paragraphIndex: z.number().nullable().optional(),
        status: z.string().optional(),
      }),
    )
    .optional(),
  sections: z
    .array(
      z.object({
        title: z.string().optional(),
        order: z.number().optional(),
      }),
    )
    .optional(),
  clauses: z
    .array(
      z.object({
        id: z.string().optional(),
        type: z.string().optional(),
        title: z.string().optional(),
        confidence: z.number().optional(),
      }),
    )
    .optional(),
  warnings: z.array(z.string()).optional(),
})
