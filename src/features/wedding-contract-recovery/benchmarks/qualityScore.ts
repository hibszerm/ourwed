import type { FixtureExpectation } from './fixtures'
import { MAX_EVIDENCE_ITEMS_COMPLEX, MAX_EVIDENCE_ITEMS_SCALAR, MAX_EVIDENCE_QUOTE_CHARS } from '../extractionSanitizers'

export type SafetyFailureCode =
  | 'provider_client_confusion'
  | 'signing_wedding_date_confusion'
  | 'total_deposit_confusion'
  | 'invented_missing_value'
  | 'invalid_structured_output'
  | 'missing_evidence_for_non_null'

export type QualityCheckResult = {
  id: string
  passed: boolean
  detail?: string
  safetyCritical?: boolean
  failureCode?: SafetyFailureCode
}

function fieldValue(extraction: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = extraction
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return null
    cur = (cur as Record<string, unknown>)[part]
  }
  if (cur && typeof cur === 'object' && 'value' in (cur as object)) {
    return (cur as { value: unknown }).value
  }
  return cur
}

function asString(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

function normalizeDate(value: unknown): string | null {
  const s = asString(value).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dotted = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dotted) {
    const d = dotted[1]!.padStart(2, '0')
    const m = dotted[2]!.padStart(2, '0')
    return `${dotted[3]}-${m}-${d}`
  }
  return s
}

function normalizeMoney(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const s = asString(value)
  if (!s) return null
  const cleaned = s.replace(/[^\d,.-]/g, '').replace(/\s/g, '')
  if (!cleaned) return null
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'))
  }
  if (cleaned.includes(',')) return Number(cleaned.replace(',', '.'))
  return Number(cleaned)
}

function includesCI(haystack: unknown, needle: string): boolean {
  return asString(haystack).toLowerCase().includes(needle.toLowerCase())
}

function collectClientBlob(extraction: Record<string, unknown>): string {
  const clients = extraction.clients as Record<string, unknown> | undefined
  return JSON.stringify(clients ?? {}).toLowerCase()
}

function collectDisplayFieldsBlob(extraction: Record<string, unknown>): string {
  const clone = { ...extraction }
  // Keep finances payment terms in the check — bank must not appear there either for "normal display"
  return JSON.stringify(clone).toLowerCase()
}

function everyNonNullHasEvidence(extraction: Record<string, unknown>): {
  ok: boolean
  missing: number
} {
  let missing = 0
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const obj = node as Record<string, unknown>
    if ('value' in obj && 'evidence' in obj) {
      if (obj.value != null && obj.value !== '') {
        const evidence = Array.isArray(obj.evidence) ? obj.evidence : []
        const hasQuote = evidence.some(
          (e) => e && typeof e === 'object' && String((e as { quote?: unknown }).quote ?? '').trim(),
        )
        if (!hasQuote) missing += 1
      }
      return
    }
    for (const v of Object.values(obj)) walk(v)
  }
  walk(extraction)
  return { ok: missing === 0, missing }
}

function evidencePolicyOk(extraction: Record<string, unknown>): boolean {
  let ok = true
  const walk = (node: unknown, key?: string) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, key)
      return
    }
    const obj = node as Record<string, unknown>
    if ('value' in obj && 'evidence' in obj && Array.isArray(obj.evidence)) {
      const complex =
        key === 'originalDescription' ||
        key === 'paymentTermsText' ||
        key === 'deliveryTerms' ||
        key === 'cancellationTerms' ||
        key === 'notesRelevantToExecution'
      const max = complex ? MAX_EVIDENCE_ITEMS_COMPLEX : MAX_EVIDENCE_ITEMS_SCALAR
      if (obj.evidence.length > max) ok = false
      for (const e of obj.evidence) {
        const quote = String((e as { quote?: unknown })?.quote ?? '')
        if (quote.length > MAX_EVIDENCE_QUOTE_CHARS + 5) ok = false
      }
      return
    }
    for (const [k, v] of Object.entries(obj)) walk(v, k)
  }
  walk(extraction)
  return ok
}

export function scoreRecoveryExtraction(
  extraction: unknown,
  expect: FixtureExpectation,
  options?: { validationPassed: boolean; httpOk: boolean; responseVersion?: string | null },
): {
  checks: QualityCheckResult[]
  qualityScore: number
  safetyFailures: SafetyFailureCode[]
  disqualified: boolean
} {
  const checks: QualityCheckResult[] = []
  const safetyFailures: SafetyFailureCode[] = []

  const push = (check: QualityCheckResult) => {
    checks.push(check)
    if (check.safetyCritical && !check.passed && check.failureCode) {
      safetyFailures.push(check.failureCode)
    }
  }

  push({
    id: 'http_success',
    passed: Boolean(options?.httpOk),
    safetyCritical: true,
    failureCode: 'invalid_structured_output',
  })
  push({
    id: 'validation_passed',
    passed: Boolean(options?.validationPassed),
    safetyCritical: true,
    failureCode: 'invalid_structured_output',
  })

  if (!extraction || typeof extraction !== 'object') {
    push({
      id: 'structured_object',
      passed: false,
      safetyCritical: true,
      failureCode: 'invalid_structured_output',
    })
    return {
      checks,
      qualityScore: 0,
      safetyFailures: [...new Set(safetyFailures)],
      disqualified: true,
    }
  }

  const ext = extraction as Record<string, unknown>
  push({
    id: 'response_version',
    passed:
      !options?.responseVersion ||
      options.responseVersion === '2026-07-recovery-v2' ||
      asString(ext.responseVersion) === '2026-07-recovery-v2',
  })

  const clientBlob = collectClientBlob(ext)
  const providerLeak = expect.forbiddenClientSubstrings.some((s) =>
    clientBlob.includes(s.toLowerCase()),
  )
  push({
    id: 'client_provider_separation',
    passed: !providerLeak,
    safetyCritical: true,
    failureCode: 'provider_client_confusion',
    detail: providerLeak ? 'provider substring found in clients' : undefined,
  })

  if (expect.partner1FirstName) {
    const first = fieldValue(ext, 'clients.partner1.firstName') ?? fieldValue(ext, 'clients.partner1.fullName')
    push({
      id: 'partner1_name',
      passed: includesCI(first, expect.partner1FirstName),
    })
  }
  if (expect.partner2FirstName === null) {
    const p2 =
      fieldValue(ext, 'clients.partner2.firstName') ??
      fieldValue(ext, 'clients.partner2.fullName') ??
      fieldValue(ext, 'clients.partner2.lastName')
    push({
      id: 'partner2_absent',
      passed: p2 == null || asString(p2).trim() === '',
      safetyCritical: true,
      failureCode: 'invented_missing_value',
    })
  } else if (expect.partner2FirstName) {
    const p2 =
      fieldValue(ext, 'clients.partner2.firstName') ??
      fieldValue(ext, 'clients.partner2.fullName')
    push({
      id: 'partner2_name',
      passed: includesCI(p2, expect.partner2FirstName),
    })
  }

  const signing = normalizeDate(fieldValue(ext, 'document.signingDate'))
  const wedding = normalizeDate(fieldValue(ext, 'wedding.weddingDate'))
  push({
    id: 'signing_date',
    passed: signing === expect.signingDate,
    detail: `got ${signing}`,
  })
  push({
    id: 'wedding_date',
    passed: wedding === expect.weddingDate,
    detail: `got ${wedding}`,
  })
  push({
    id: 'signing_vs_wedding_distinct',
    passed: signing != null && wedding != null && signing !== wedding,
    safetyCritical: true,
    failureCode: 'signing_wedding_date_confusion',
  })
  if (signing === expect.weddingDate && wedding === expect.signingDate) {
    push({
      id: 'signing_wedding_swapped',
      passed: false,
      safetyCritical: true,
      failureCode: 'signing_wedding_date_confusion',
    })
  }

  if (expect.depositDueDate) {
    push({
      id: 'deposit_due_date',
      passed: normalizeDate(fieldValue(ext, 'finances.depositDueDate')) === expect.depositDueDate,
    })
  }

  const total = normalizeMoney(fieldValue(ext, 'finances.totalContractValue'))
  const deposit = normalizeMoney(fieldValue(ext, 'finances.depositAmount'))
  push({
    id: 'total_value',
    passed: total === expect.totalValue,
    detail: `got ${String(total)}`,
  })
  push({
    id: 'deposit_amount',
    passed: deposit === expect.depositAmount,
    detail: `got ${String(deposit)}`,
  })
  push({
    id: 'total_vs_deposit_distinct',
    passed: total != null && deposit != null && total !== deposit,
    safetyCritical: true,
    failureCode: 'total_deposit_confusion',
  })
  if (total === expect.depositAmount && deposit === expect.totalValue) {
    push({
      id: 'total_deposit_swapped',
      passed: false,
      safetyCritical: true,
      failureCode: 'total_deposit_confusion',
    })
  }
  if (expect.remainingAmount != null) {
    push({
      id: 'remaining_amount',
      passed: normalizeMoney(fieldValue(ext, 'finances.remainingAmount')) === expect.remainingAmount,
    })
  }

  const packageName = fieldValue(ext, 'contractedPackage.name')
  push({
    id: 'package_name',
    passed: includesCI(packageName, expect.packageNameContains),
  })

  const items = (ext.contractedPackage as { includedItems?: Array<{ text?: string }> } | undefined)
    ?.includedItems
  const itemText = (items ?? []).map((i) => i.text ?? '').join(' | ')
  const itemHits = expect.includedItemSubstrings.filter((s) => includesCI(itemText, s)).length
  push({
    id: 'package_items_recall',
    passed: itemHits >= Math.ceil(expect.includedItemSubstrings.length * 0.66),
    detail: `${itemHits}/${expect.includedItemSubstrings.length}`,
  })

  if (expect.deliveryDeadlineContains) {
    const delivery =
      fieldValue(ext, 'contractedPackage.deliveryDeadlineText') ??
      fieldValue(ext, 'otherTerms.deliveryTerms')
    push({
      id: 'delivery_deadline',
      passed: includesCI(delivery, expect.deliveryDeadlineContains),
    })
  }

  if (expect.additionalServiceNameContains) {
    const services = Array.isArray(ext.additionalServices) ? ext.additionalServices : []
    const hit = services.some((s) =>
      includesCI((s as { name?: unknown })?.name, expect.additionalServiceNameContains!),
    )
    push({ id: 'additional_service', passed: hit })
  }

  if (expect.forbiddenBankAccountFragment) {
    const blob = collectDisplayFieldsBlob(ext).replace(/\s+/g, '')
    const fragment = expect.forbiddenBankAccountFragment.replace(/\s+/g, '')
    push({
      id: 'bank_account_not_in_display',
      passed: !blob.includes(fragment.toLowerCase()),
    })
  }

  const evidenceGate = everyNonNullHasEvidence(ext)
  push({
    id: 'evidence_for_non_null',
    passed: evidenceGate.ok,
    safetyCritical: true,
    failureCode: 'missing_evidence_for_non_null',
    detail: evidenceGate.missing ? `missing=${evidenceGate.missing}` : undefined,
  })
  push({
    id: 'evidence_policy',
    passed: evidencePolicyOk(ext),
  })

  const passed = checks.filter((c) => c.passed).length
  const qualityScore = checks.length === 0 ? 0 : Math.round((passed / checks.length) * 1000) / 10
  const uniqueFailures = [...new Set(safetyFailures)]

  return {
    checks,
    qualityScore,
    safetyFailures: uniqueFailures,
    disqualified: uniqueFailures.length > 0,
  }
}
