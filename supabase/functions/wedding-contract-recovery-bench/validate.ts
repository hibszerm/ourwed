import { WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION } from './config.ts'

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function validateEvidenceArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  return value.every((item) => {
    if (!isObject(item)) return false
    return typeof item.quote === 'string'
  })
}

function validateStringField(value: unknown): boolean {
  if (!isObject(value)) return false
  if (!('value' in value)) return false
  if (value.value != null && typeof value.value !== 'string') return false
  if (typeof value.confidence !== 'number') return false
  if (!validateEvidenceArray(value.evidence)) return false
  if (!Array.isArray(value.warnings)) return false
  if (value.value != null && value.confidence > 0) {
    const evidence = value.evidence as unknown[]
    if (!evidence.some((e) => isObject(e) && String(e.quote).trim())) {
      return false
    }
  }
  return true
}

function validateNumberField(value: unknown): boolean {
  if (!isObject(value)) return false
  if (!('value' in value)) return false
  if (value.value != null && typeof value.value !== 'number') return false
  if (typeof value.confidence !== 'number') return false
  if (!validateEvidenceArray(value.evidence)) return false
  if (!Array.isArray(value.warnings)) return false
  return true
}

export function validateRecoveryExtraction(payload: unknown): payload is Record<string, unknown> {
  if (!isObject(payload)) return false
  if (payload.responseVersion !== WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION) return false
  if (!isObject(payload.document) || !isObject(payload.clients) || !isObject(payload.wedding)) {
    return false
  }
  if (!isObject(payload.finances) || !isObject(payload.contractedPackage)) return false
  if (!isObject(payload.otherTerms)) return false
  if (!Array.isArray(payload.additionalServices) || !Array.isArray(payload.documentWarnings)) {
    return false
  }

  const doc = payload.document
  if (!validateStringField(doc.contractNumber) || !validateStringField(doc.signingDate)) {
    return false
  }

  for (const partner of ['partner1', 'partner2'] as const) {
    const client = payload.clients[partner]
    if (!isObject(client)) return false
    for (const key of [
      'fullName',
      'firstName',
      'lastName',
      'email',
      'phone',
      'addressLine',
      'postalCode',
      'city',
      'country',
    ]) {
      if (!validateStringField(client[key])) return false
    }
  }

  const wedding = payload.wedding
  for (const key of [
    'weddingDate',
    'ceremonyTime',
    'ceremonyLocation',
    'receptionLocation',
    'bridePreparationLocation',
    'groomPreparationLocation',
  ]) {
    if (!validateStringField(wedding[key])) return false
  }

  const finances = payload.finances
  if (
    !validateNumberField(finances.totalContractValue) ||
    !validateStringField(finances.currency) ||
    !validateNumberField(finances.depositAmount) ||
    !validateStringField(finances.depositDueDate) ||
    !validateNumberField(finances.remainingAmount) ||
    !validateStringField(finances.finalPaymentDueDate) ||
    !validateStringField(finances.paymentTermsText)
  ) {
    return false
  }

  return true
}

export function extractOutputText(body: unknown): string {
  if (!isObject(body)) return ''
  const output = body.output
  if (!Array.isArray(output)) return ''
  const chunks: string[] = []
  for (const item of output) {
    if (!isObject(item)) continue
    if (item.type !== 'message') continue
    const content = item.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!isObject(part)) continue
      if (part.type === 'output_text' && typeof part.text === 'string') {
        chunks.push(part.text)
      }
    }
  }
  return chunks.join('')
}
