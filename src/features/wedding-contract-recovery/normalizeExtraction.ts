import { parseImportMoney } from '@/features/weddings/import/parseMoney'
import {
  isValidEmailStructure,
  normalizeEmailForCompare,
  normalizePhoneForCompare,
  sanitizeCellDisplay,
} from '@/features/weddings/import/normalizeContact'
import {
  coalesceRedundantRawValue,
  isComplexFieldKey,
  MAX_EVIDENCE_ITEMS_COMPLEX,
  MAX_EVIDENCE_ITEMS_SCALAR,
  sanitizeEvidenceArray,
} from './extractionSanitizers'
import {
  cleanupPackageIncludedItems,
  refinePackageItemsAgainstDescription,
} from './packageItemCleanup'
import type { ContractRecoveryExtraction, ExtractedField } from './types'

const PLACEHOLDER = new Set(['—', '–', '-', 'n/a', 'na', 'brak', 'nie dotyczy', 'nd'])

const POLISH_MONTHS: Record<string, number> = {
  sty: 1,
  stycznia: 1,
  lut: 2,
  lutego: 2,
  mar: 3,
  marca: 3,
  kwi: 4,
  kwietnia: 4,
  maj: 5,
  cze: 6,
  czerwca: 6,
  lip: 7,
  lipca: 7,
  sie: 8,
  sierpnia: 8,
  wrz: 9,
  września: 9,
  wrzesnia: 9,
  paź: 10,
  pazdziernika: 10,
  października: 10,
  lis: 11,
  listopada: 11,
  gru: 12,
  grudnia: 12,
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function cleanText(value: string | null | undefined): string | null {
  const cleaned = sanitizeCellDisplay(value ?? '')
  if (!cleaned || PLACEHOLDER.has(cleaned.toLowerCase())) return null
  return cleaned
}

export function normalizeRecoveryDate(
  raw: string | null | undefined,
  contextYear?: number,
): string | null {
  const text = cleanText(raw)
  if (!text) return null

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const d = Number(iso[3])
    if (isValidYmd(y, m, d)) return `${pad(y)}-${pad(m)}-${pad(d)}`
    return null
  }

  const dotted = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/)
  if (dotted) {
    let y = Number(dotted[3])
    if (y < 100) y += 2000
    const m = Number(dotted[2])
    const d = Number(dotted[1])
    if (isValidYmd(y, m, d)) return `${pad(y)}-${pad(m)}-${pad(d)}`
    return null
  }

  const named = text.match(/^(\d{1,2})\s+([a-ząćęłńóśźż.]+)(?:\s+(\d{4}))?$/i)
  if (named) {
    const d = Number(named[1])
    const monthKey = named[2]!.toLowerCase().replace(/\./g, '')
    const m = POLISH_MONTHS[monthKey]
    const y = named[3] ? Number(named[3]) : contextYear
    if (m && y && isValidYmd(y, m, d)) return `${pad(y)}-${pad(m)}-${pad(d)}`
    return null
  }

  return null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

export function normalizeRecoveryMoney(
  raw: string | number | null | undefined,
): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null
    return Math.round(raw * 100) / 100
  }
  return parseImportMoney(raw)
}

export function normalizeRecoveryEmail(raw: string | null | undefined): string | null {
  const cleaned = cleanText(raw)
  if (!cleaned) return null
  const normalized = normalizeEmailForCompare(cleaned)
  return isValidEmailStructure(normalized) ? normalized : null
}

export function normalizeRecoveryPhone(raw: string | null | undefined): string | null {
  const cleaned = cleanText(raw)
  if (!cleaned) return null
  const digits = normalizePhoneForCompare(cleaned)
  return digits.length >= 9 ? cleaned : null
}

export function normalizeRecoveryPostalCode(
  raw: string | null | undefined,
): string | null {
  const cleaned = cleanText(raw)?.replace(/\s+/g, '')
  if (!cleaned) return null
  if (/^\d{2}-\d{3}$/.test(cleaned)) return cleaned
  if (/^\d{5}$/.test(cleaned)) return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`
  return null
}

function sanitizeFieldEvidence<T extends string | number>(
  field: ExtractedField<T>,
  fieldKey: string,
): ExtractedField<T> {
  const maxItems = isComplexFieldKey(fieldKey)
    ? MAX_EVIDENCE_ITEMS_COMPLEX
    : MAX_EVIDENCE_ITEMS_SCALAR
  return {
    ...field,
    evidence: sanitizeEvidenceArray(field.evidence, { maxItems }),
  }
}

function normalizeStringField(
  field: ExtractedField<string>,
  fieldKey = 'generic',
): ExtractedField<string> {
  const raw = field.rawValue ?? field.value
  const normalized = cleanText(field.value ?? raw)
  const warnings = [...field.warnings]
  if (field.value && !normalized) {
    warnings.push('Wartość wygląda na pusty placeholder.')
  }
  return coalesceRedundantRawValue(
    sanitizeFieldEvidence(
      {
        ...field,
        value: normalized,
        rawValue: raw ?? null,
        confidence: clampConfidence(field.confidence),
        warnings,
      },
      fieldKey,
    ),
  )
}

function normalizeNumberField(
  field: ExtractedField<number>,
  fieldKey = 'generic',
): ExtractedField<number> {
  const raw = field.rawValue ?? (field.value != null ? String(field.value) : null)
  const normalized = normalizeRecoveryMoney(field.value ?? raw)
  const warnings = [...field.warnings]
  if ((field.value != null || raw) && normalized == null) {
    warnings.push('Nie udało się poprawnie odczytać kwoty.')
  }
  return coalesceRedundantRawValue(
    sanitizeFieldEvidence(
      {
        ...field,
        value: normalized,
        rawValue: raw,
        confidence: clampConfidence(field.confidence),
        warnings,
      },
      fieldKey,
    ),
  )
}

function normalizeDateField(
  field: ExtractedField<string>,
  contextYear?: number,
  fieldKey = 'generic',
): ExtractedField<string> {
  const raw = field.rawValue ?? field.value
  const normalized = normalizeRecoveryDate(field.value ?? raw, contextYear)
  const warnings = [...field.warnings]
  if ((field.value || raw) && !normalized) {
    warnings.push('Nie udało się poprawnie odczytać daty.')
  }
  return coalesceRedundantRawValue(
    sanitizeFieldEvidence(
      {
        ...field,
        value: normalized,
        rawValue: raw ?? null,
        confidence: clampConfidence(field.confidence),
        warnings,
      },
      fieldKey,
    ),
  )
}

function redactBankAccountFromPaymentTerms(text: string | null): string | null {
  if (!text) return null
  // Keep storage content but scrub IBAN / account-looking numbers for display-oriented cleanup
  // Applied only when normalizing paymentTermsText for CRM review text.
  return text
    .replace(/\b(?:PL)?\s?\d{2}(?:[\s-]?\d{4}){6,7}\b/gi, '[numer konta ukryty]')
    .replace(/\b\d{26}\b/g, '[numer konta ukryty]')
}

export function normalizeContractRecoveryExtraction(
  extraction: ContractRecoveryExtraction,
): ContractRecoveryExtraction {
  const signingYear = normalizeRecoveryDate(
    extraction.document.signingDate.value ?? extraction.document.signingDate.rawValue,
  )
  const contextYear = signingYear
    ? Number(signingYear.slice(0, 4))
    : undefined

  const partner1 = {
    ...extraction.clients.partner1,
    fullName: normalizeStringField(extraction.clients.partner1.fullName),
    firstName: normalizeStringField(extraction.clients.partner1.firstName),
    lastName: normalizeStringField(extraction.clients.partner1.lastName),
    email: {
      ...normalizeStringField(extraction.clients.partner1.email),
      value: normalizeRecoveryEmail(
        extraction.clients.partner1.email.value ??
          extraction.clients.partner1.email.rawValue,
      ),
    },
    phone: {
      ...normalizeStringField(extraction.clients.partner1.phone),
      value: normalizeRecoveryPhone(
        extraction.clients.partner1.phone.value ??
          extraction.clients.partner1.phone.rawValue,
      ),
    },
    addressLine: normalizeStringField(extraction.clients.partner1.addressLine),
    postalCode: {
      ...normalizeStringField(extraction.clients.partner1.postalCode),
      value: normalizeRecoveryPostalCode(
        extraction.clients.partner1.postalCode.value ??
          extraction.clients.partner1.postalCode.rawValue,
      ),
    },
    city: normalizeStringField(extraction.clients.partner1.city),
    country: normalizeStringField(extraction.clients.partner1.country),
  }

  const partner2 = {
    ...extraction.clients.partner2,
    fullName: normalizeStringField(extraction.clients.partner2.fullName),
    firstName: normalizeStringField(extraction.clients.partner2.firstName),
    lastName: normalizeStringField(extraction.clients.partner2.lastName),
    email: {
      ...normalizeStringField(extraction.clients.partner2.email),
      value: normalizeRecoveryEmail(
        extraction.clients.partner2.email.value ??
          extraction.clients.partner2.email.rawValue,
      ),
    },
    phone: {
      ...normalizeStringField(extraction.clients.partner2.phone),
      value: normalizeRecoveryPhone(
        extraction.clients.partner2.phone.value ??
          extraction.clients.partner2.phone.rawValue,
      ),
    },
    addressLine: normalizeStringField(extraction.clients.partner2.addressLine),
    postalCode: {
      ...normalizeStringField(extraction.clients.partner2.postalCode),
      value: normalizeRecoveryPostalCode(
        extraction.clients.partner2.postalCode.value ??
          extraction.clients.partner2.postalCode.rawValue,
      ),
    },
    city: normalizeStringField(extraction.clients.partner2.city),
    country: normalizeStringField(extraction.clients.partner2.country),
  }

  const packageName = normalizeStringField(
    extraction.contractedPackage.name,
    'name',
  )
  const originalDescription = normalizeStringField(
    extraction.contractedPackage.originalDescription,
    'originalDescription',
  )
  const itemTexts = refinePackageItemsAgainstDescription(
    extraction.contractedPackage.includedItems.map((item) => item.text),
    originalDescription.value,
  )
  const itemByNormalized = new Map(
    extraction.contractedPackage.includedItems.map((item) => [
      (cleanText(item.text) ?? item.text).toLowerCase(),
      item,
    ]),
  )

  const paymentTerms = normalizeStringField(
    extraction.finances.paymentTermsText,
    'paymentTermsText',
  )

  return {
    ...extraction,
    document: {
      contractNumber: normalizeStringField(extraction.document.contractNumber),
      signingDate: normalizeDateField(extraction.document.signingDate, contextYear),
    },
    clients: { partner1, partner2 },
    wedding: {
      weddingDate: normalizeDateField(extraction.wedding.weddingDate, contextYear),
      ceremonyTime: normalizeStringField(extraction.wedding.ceremonyTime),
      ceremonyLocation: normalizeStringField(extraction.wedding.ceremonyLocation),
      receptionLocation: normalizeStringField(extraction.wedding.receptionLocation),
      bridePreparationLocation: normalizeStringField(
        extraction.wedding.bridePreparationLocation,
      ),
      groomPreparationLocation: normalizeStringField(
        extraction.wedding.groomPreparationLocation,
      ),
    },
    finances: {
      totalContractValue: normalizeNumberField(extraction.finances.totalContractValue),
      currency: normalizeStringField(extraction.finances.currency),
      depositAmount: normalizeNumberField(extraction.finances.depositAmount),
      depositDueDate: normalizeDateField(extraction.finances.depositDueDate, contextYear),
      remainingAmount: normalizeNumberField(extraction.finances.remainingAmount),
      finalPaymentDueDate: normalizeDateField(
        extraction.finances.finalPaymentDueDate,
        contextYear,
      ),
      paymentTermsText: {
        ...paymentTerms,
        value: redactBankAccountFromPaymentTerms(paymentTerms.value),
      },
    },
    contractedPackage: {
      name: packageName,
      originalDescription,
      includedItems: itemTexts.map((text) => {
        const prior = itemByNormalized.get(text.toLowerCase())
        return {
          text,
          confidence: clampConfidence(prior?.confidence ?? 0.7),
          evidence: sanitizeEvidenceArray(prior?.evidence ?? [], {
            maxItems: MAX_EVIDENCE_ITEMS_SCALAR,
          }),
        }
      }),
      coverageHours: normalizeNumberField(extraction.contractedPackage.coverageHours),
      coverageTimeRange: normalizeStringField(
        extraction.contractedPackage.coverageTimeRange,
      ),
      deliveryDeadlineText: normalizeStringField(
        extraction.contractedPackage.deliveryDeadlineText,
        'deliveryDeadlineText',
      ),
    },
    additionalServices: extraction.additionalServices.map((service) => ({
      ...service,
      name: cleanText(service.name) ?? service.name,
      description: cleanText(service.description),
      price:
        service.price != null ? normalizeRecoveryMoney(service.price) : null,
      confidence: clampConfidence(service.confidence),
      evidence: sanitizeEvidenceArray(service.evidence, {
        maxItems: MAX_EVIDENCE_ITEMS_COMPLEX,
      }),
    })),
    otherTerms: {
      deliveryTerms: normalizeStringField(
        extraction.otherTerms.deliveryTerms,
        'deliveryTerms',
      ),
      cancellationTerms: normalizeStringField(
        extraction.otherTerms.cancellationTerms,
        'cancellationTerms',
      ),
      notesRelevantToExecution: normalizeStringField(
        extraction.otherTerms.notesRelevantToExecution,
        'notesRelevantToExecution',
      ),
    },
    documentWarnings: extraction.documentWarnings,
  }
}

export function confidenceLabel(confidence: number | null): string {
  if (confidence == null) return 'Wymaga sprawdzenia'
  if (confidence >= 0.85) return 'Wysoka pewność'
  if (confidence >= 0.6) return 'Wymaga sprawdzenia'
  return 'Niska pewność'
}

export { cleanupPackageIncludedItems }
