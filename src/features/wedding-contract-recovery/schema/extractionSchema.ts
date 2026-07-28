import { z } from 'zod'
import {
  SUPPORTED_RECOVERY_RESPONSE_VERSIONS,
  WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION,
} from '../constants'

export const extractionEvidenceSchema = z.object({
  quote: z.string(),
  page: z.number().nullable().optional(),
  section: z.string().nullable().optional(),
})

export const extractedStringFieldSchema = z.object({
  value: z.string().nullable(),
  rawValue: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(extractionEvidenceSchema),
  warnings: z.array(z.string()),
})

export const extractedNumberFieldSchema = z.object({
  value: z.number().nullable(),
  rawValue: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(extractionEvidenceSchema),
  warnings: z.array(z.string()),
})

export const contractClientExtractionSchema = z.object({
  fullName: extractedStringFieldSchema,
  firstName: extractedStringFieldSchema,
  lastName: extractedStringFieldSchema,
  email: extractedStringFieldSchema,
  phone: extractedStringFieldSchema,
  addressLine: extractedStringFieldSchema,
  postalCode: extractedStringFieldSchema,
  city: extractedStringFieldSchema,
  country: extractedStringFieldSchema,
})

export const contractRecoveryExtractionSchema = z.object({
  responseVersion: z.enum(SUPPORTED_RECOVERY_RESPONSE_VERSIONS),
  document: z.object({
    contractNumber: extractedStringFieldSchema,
    signingDate: extractedStringFieldSchema,
  }),
  clients: z.object({
    partner1: contractClientExtractionSchema,
    partner2: contractClientExtractionSchema,
  }),
  wedding: z.object({
    weddingDate: extractedStringFieldSchema,
    ceremonyTime: extractedStringFieldSchema,
    ceremonyLocation: extractedStringFieldSchema,
    receptionLocation: extractedStringFieldSchema,
    bridePreparationLocation: extractedStringFieldSchema,
    groomPreparationLocation: extractedStringFieldSchema,
  }),
  finances: z.object({
    totalContractValue: extractedNumberFieldSchema,
    currency: extractedStringFieldSchema,
    depositAmount: extractedNumberFieldSchema,
    depositDueDate: extractedStringFieldSchema,
    remainingAmount: extractedNumberFieldSchema,
    finalPaymentDueDate: extractedStringFieldSchema,
    paymentTermsText: extractedStringFieldSchema,
  }),
  contractedPackage: z.object({
    name: extractedStringFieldSchema,
    originalDescription: extractedStringFieldSchema,
    includedItems: z.array(
      z.object({
        text: z.string(),
        confidence: z.number().min(0).max(1),
        evidence: z.array(extractionEvidenceSchema),
      }),
    ),
    coverageHours: extractedNumberFieldSchema,
    coverageTimeRange: extractedStringFieldSchema,
    deliveryDeadlineText: extractedStringFieldSchema,
  }),
  additionalServices: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      price: z.number().nullable(),
      currency: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      evidence: z.array(extractionEvidenceSchema),
      warnings: z.array(z.string()),
    }),
  ),
  otherTerms: z.object({
    deliveryTerms: extractedStringFieldSchema,
    cancellationTerms: extractedStringFieldSchema,
    notesRelevantToExecution: extractedStringFieldSchema,
  }),
  documentWarnings: z.array(z.string()),
})

export const recoveryDecisionActionSchema = z.enum([
  'keep_current',
  'use_extracted',
  'skip',
])

export const recoveryApplyDecisionSchema = z.object({
  fieldKey: z.string().min(1),
  action: recoveryDecisionActionSchema,
})

export const recoveryApplyInputSchema = z.object({
  recoveryId: z.string().uuid(),
  weddingId: z.string().uuid(),
  sourceContractId: z.string().uuid(),
  decisions: z.array(recoveryApplyDecisionSchema),
  includePackageSnapshot: z.boolean(),
  expectedWeddingUpdatedAt: z.string().min(1),
})

export function parseContractRecoveryExtraction(
  payload: unknown,
): z.infer<typeof contractRecoveryExtractionSchema> {
  return contractRecoveryExtractionSchema.parse(payload)
}

export function emptyStringField() {
  return {
    value: null,
    rawValue: null,
    confidence: 0,
    evidence: [],
    warnings: [],
  }
}

export function emptyNumberField() {
  return {
    value: null,
    rawValue: null,
    confidence: 0,
    evidence: [],
    warnings: [],
  }
}

export function emptyClientExtraction() {
  return {
    fullName: emptyStringField(),
    firstName: emptyStringField(),
    lastName: emptyStringField(),
    email: emptyStringField(),
    phone: emptyStringField(),
    addressLine: emptyStringField(),
    postalCode: emptyStringField(),
    city: emptyStringField(),
    country: emptyStringField(),
  }
}

export function emptyContractRecoveryExtraction(): z.infer<
  typeof contractRecoveryExtractionSchema
> {
  return {
    responseVersion: WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION,
    document: {
      contractNumber: emptyStringField(),
      signingDate: emptyStringField(),
    },
    clients: {
      partner1: emptyClientExtraction(),
      partner2: emptyClientExtraction(),
    },
    wedding: {
      weddingDate: emptyStringField(),
      ceremonyTime: emptyStringField(),
      ceremonyLocation: emptyStringField(),
      receptionLocation: emptyStringField(),
      bridePreparationLocation: emptyStringField(),
      groomPreparationLocation: emptyStringField(),
    },
    finances: {
      totalContractValue: emptyNumberField(),
      currency: emptyStringField(),
      depositAmount: emptyNumberField(),
      depositDueDate: emptyStringField(),
      remainingAmount: emptyNumberField(),
      finalPaymentDueDate: emptyStringField(),
      paymentTermsText: emptyStringField(),
    },
    contractedPackage: {
      name: emptyStringField(),
      originalDescription: emptyStringField(),
      includedItems: [],
      coverageHours: emptyNumberField(),
      coverageTimeRange: emptyStringField(),
      deliveryDeadlineText: emptyStringField(),
    },
    additionalServices: [],
    otherTerms: {
      deliveryTerms: emptyStringField(),
      cancellationTerms: emptyStringField(),
      notesRelevantToExecution: emptyStringField(),
    },
    documentWarnings: [],
  }
}
