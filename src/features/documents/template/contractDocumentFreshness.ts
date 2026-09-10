/**
 * Contract document freshness — compare stored generation resolvedValues
 * against a fresh resolve of the same wedding (no schema / migration).
 */

import type { GeneratedWeddingContract } from '@/features/documents/template/contractArtifactDomain'
import type { ContractArtifactSnapshot } from '@/features/documents/template/contractArtifactDomain'
import { isSystemAutoResolvedContractKey } from '@/features/documents/template/contractExecutionContext'

/**
 * Payment-ledger keys change when recording payments without changing the
 * commercial agreement written into the contract. Exclude them so task/note-
 * unrelated payment bookkeeping does not spam stale warnings.
 * Deposit amount / CV / remaining_after_deposit remain compared.
 */
export const CONTRACT_FRESHNESS_PAYMENT_LEDGER_KEYS = new Set([
  'total_paid',
  'total_paid_formatted',
  'total_paid_words',
  'totalPaidFormatted',
  'totalPaidWords',
  'remaining_to_pay',
  'remaining_to_pay_formatted',
  'remaining_to_pay_words',
  'remainingToPayFormatted',
  'remainingToPayWords',
])

export function shouldExcludeContractFreshnessKey(key: string): boolean {
  if (isSystemAutoResolvedContractKey(key)) return true
  if (CONTRACT_FRESHNESS_PAYMENT_LEDGER_KEYS.has(key)) return true
  return false
}

export function parseContractArtifactSnapshot(
  raw: unknown,
): ContractArtifactSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (row.kind !== 'generated_wedding_contract') return null
  const provenance = row.provenance
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    return null
  }
  const replacement = (provenance as Record<string, unknown>).replacement
  if (
    !replacement ||
    typeof replacement !== 'object' ||
    Array.isArray(replacement)
  ) {
    return null
  }
  const resolvedValues = (replacement as Record<string, unknown>).resolvedValues
  if (
    !resolvedValues ||
    typeof resolvedValues !== 'object' ||
    Array.isArray(resolvedValues)
  ) {
    return null
  }
  return raw as ContractArtifactSnapshot
}

export function getLatestContractArtifactSnapshot(
  contract: GeneratedWeddingContract | null | undefined,
): ContractArtifactSnapshot | null {
  if (!contract) return null
  const artifacts = [...contract.artifacts].sort(
    (a, b) => b.generationVersion - a.generationVersion,
  )
  for (const artifact of artifacts) {
    const snap = parseContractArtifactSnapshot(artifact.snapshotJson)
    if (snap) return snap
  }
  return null
}

export function normalizeContractFreshnessValue(
  value: string | null | undefined,
): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Diff stored generation variables vs current resolve.
 * Compares the union of keys present in either map (minus excluded).
 */
export function diffContractResolvedValuesForFreshness(
  stored: Record<string, string>,
  current: Record<string, string>,
): { stale: boolean; changedKeys: string[] } {
  const keys = new Set([...Object.keys(stored), ...Object.keys(current)])
  const changedKeys: string[] = []
  for (const key of keys) {
    if (shouldExcludeContractFreshnessKey(key)) continue
    const a = normalizeContractFreshnessValue(stored[key])
    const b = normalizeContractFreshnessValue(current[key])
    if (a !== b) changedKeys.push(key)
  }
  return { stale: changedKeys.length > 0, changedKeys }
}

export function isGeneratedContractContentStale(input: {
  storedResolvedValues: Record<string, string> | null | undefined
  currentResolvedValues: Record<string, string> | null | undefined
}): boolean {
  if (!input.storedResolvedValues || !input.currentResolvedValues) return false
  return diffContractResolvedValuesForFreshness(
    input.storedResolvedValues,
    input.currentResolvedValues,
  ).stale
}

export const CONTRACT_FRESHNESS_COPY = {
  title: 'Dane zlecenia zmieniły się od wygenerowania tej umowy.',
  support:
    'Aby dokument zawierał aktualne informacje, wygeneruj umowę ponownie.',
  action: 'Wygeneruj ponownie',
  /** Signed: same facts; regenerate uses existing lifecycle (new version). */
  signedSupport:
    'Aktualne dane zlecenia różnią się od danych użytych w dokumencie. Regeneracja utworzy nową wersję dokumentu.',
} as const
