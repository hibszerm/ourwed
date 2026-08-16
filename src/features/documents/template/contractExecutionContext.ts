/**
 * Contract execution date + company city (locative) for generation / snapshots.
 */

import {
  formatContractDateLong,
  formatContractDateShort,
} from '@/lib/utils/contractCommercialVariables'
import { toPolishLocativeCity } from '@/lib/utils/toPolishLocativeCity'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import { devInfoArgs } from '@/lib/debug/devConsole'

export interface ContractExecutionSnapshot {
  /** Exact short date written into the DOCX, e.g. "25.07.2026". */
  contractExecutionDate: string
  /** Exact locative city written into the DOCX, e.g. "Zabrzu". */
  contractExecutionCity: string
}

export interface ContractExecutionResolveInput {
  /** Explicit generation instant or ISO calendar date (YYYY-MM-DD). */
  generationDate?: Date | string | null
  /** Nominative company city from studio_details.city. */
  companyCity?: string | null
  /** Frozen values from a saved document version — wins over live resolve. */
  snapshot?: Partial<ContractExecutionSnapshot> | null
}

export interface ContractExecutionResolveResult {
  values: Record<string, string>
  snapshot: ContractExecutionSnapshot | null
  /** Set when city is present but locative cannot be produced safely. */
  locativeUnsafe: boolean
  companyCityNominative: string | null
  generationStartedAt: Date
  localDate: string
  resolvedShort: string
  resolvedLong: string
  source: 'version_snapshot' | 'generation_context' | 'local_fallback'
}

/**
 * Keys resolved by generation context / snapshot — never asked as manual
 * questionnaire or wedding form fields.
 */
export const SYSTEM_AUTO_RESOLVED_CONTRACT_KEYS = new Set([
  'contract_execution_date',
  'contract_execution_date_long',
])

export function isSystemAutoResolvedContractKey(key: string): boolean {
  return SYSTEM_AUTO_RESOLVED_CONTRACT_KEYS.has(key)
}

/** Local calendar date as YYYY-MM-DD (not UTC-shifted). */
export function localCalendarIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseToIsoDate(input: Date | string | null | undefined): string {
  if (input == null) return localCalendarIsoDate()
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return localCalendarIsoDate()
    return localCalendarIsoDate(input)
  }
  const raw = input.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  // Already short DD.MM.YYYY → convert for long form helpers
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw)
  if (m) {
    const dd = m[1]!.padStart(2, '0')
    const mm = m[2]!.padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }
  return localCalendarIsoDate()
}

/**
 * Resolve execution date/city for a new generation, or restore from snapshot.
 */
export function resolveContractExecutionValues(
  input: ContractExecutionResolveInput = {},
): ContractExecutionResolveResult {
  const nominative = input.companyCity?.trim() || null
  const generationStartedAt =
    input.generationDate instanceof Date &&
    !Number.isNaN(input.generationDate.getTime())
      ? input.generationDate
      : typeof input.generationDate === 'string' && input.generationDate.trim()
        ? (() => {
            const iso = parseToIsoDate(input.generationDate)
            const [y, m, d] = iso.split('-').map(Number)
            return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
          })()
        : new Date()

  const logResolution = (payload: {
    source: ContractExecutionResolveResult['source']
    resolvedShort: string
    resolvedLong: string
    includedInManualFields: boolean
    includedInMissingVariables: boolean
    snapshotValue?: string | null
  }) => {
    const DEV =
      typeof import.meta !== 'undefined' &&
      Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
    if (!DEV) return
    devInfoArgs('[contract-execution-date-resolution]', {
      generationStartedAt: generationStartedAt.toISOString(),
      localDate: localCalendarIsoDate(generationStartedAt),
      resolvedShort: payload.resolvedShort,
      resolvedLong: payload.resolvedLong,
      source: payload.source,
      includedInManualFields: payload.includedInManualFields,
      includedInMissingVariables: payload.includedInMissingVariables,
      snapshotValue: payload.snapshotValue ?? null,
    })
  }

  if (
    input.snapshot?.contractExecutionDate?.trim() &&
    input.snapshot?.contractExecutionCity?.trim()
  ) {
    const dateShort = input.snapshot.contractExecutionDate.trim()
    const cityLoc = input.snapshot.contractExecutionCity.trim()
    const isoFromShort = parseToIsoDate(dateShort)
    const values: Record<string, string> = {}
    SystemVariableRegistry.emit(values, 'contract_execution_date', dateShort)
    const long = formatContractDateLong(isoFromShort)
    if (long) {
      SystemVariableRegistry.emit(values, 'contract_execution_date_long', long)
    }
    if (nominative) {
      SystemVariableRegistry.emit(values, 'company_city', nominative)
    }
    SystemVariableRegistry.emit(values, 'company_city_locative', cityLoc)
    logResolution({
      source: 'version_snapshot',
      resolvedShort: dateShort,
      resolvedLong: long || '',
      includedInManualFields: false,
      includedInMissingVariables: false,
      snapshotValue: dateShort,
    })
    return {
      values,
      snapshot: {
        contractExecutionDate: dateShort,
        contractExecutionCity: cityLoc,
      },
      locativeUnsafe: false,
      companyCityNominative: nominative,
      generationStartedAt,
      localDate: localCalendarIsoDate(generationStartedAt),
      resolvedShort: dateShort,
      resolvedLong: long || '',
      source: 'version_snapshot',
    }
  }

  const hadExplicitGenerationDate =
    input.generationDate instanceof Date ||
    (typeof input.generationDate === 'string' &&
      Boolean(input.generationDate.trim()))
  const source: ContractExecutionResolveResult['source'] = hadExplicitGenerationDate
    ? 'generation_context'
    : 'local_fallback'

  const iso = parseToIsoDate(
    hadExplicitGenerationDate ? input.generationDate : generationStartedAt,
  )
  const dateShort = formatContractDateShort(iso)
  const dateLong = formatContractDateLong(iso)
  const values: Record<string, string> = {}
  if (dateShort) {
    SystemVariableRegistry.emit(values, 'contract_execution_date', dateShort)
  }
  if (dateLong) {
    SystemVariableRegistry.emit(values, 'contract_execution_date_long', dateLong)
  }

  let locative: string | undefined
  let locativeUnsafe = false
  if (nominative) {
    SystemVariableRegistry.emit(values, 'company_city', nominative)
    locative = toPolishLocativeCity(nominative)
    if (locative) {
      SystemVariableRegistry.emit(values, 'company_city_locative', locative)
    } else {
      locativeUnsafe = true
      devInfoArgs('[contract-city-inflection]', {
        companyCity: nominative,
        locative: null,
        safe: false,
      })
    }
  }

  const outSnapshot: ContractExecutionSnapshot | null =
    dateShort && locative
      ? {
          contractExecutionDate: dateShort,
          contractExecutionCity: locative,
        }
      : null

  logResolution({
    source,
    resolvedShort: dateShort,
    resolvedLong: dateLong,
    includedInManualFields: false,
    includedInMissingVariables: false,
  })

  return {
    values,
    snapshot: outSnapshot,
    locativeUnsafe,
    companyCityNominative: nominative,
    generationStartedAt,
    localDate: localCalendarIsoDate(generationStartedAt),
    resolvedShort: dateShort,
    resolvedLong: dateLong,
    source,
  }
}

export function assertCompanyCityLocativeForSlots(input: {
  slots: Array<{ registryKey?: string | null; physicallyBound?: boolean }>
  companyCity: string | null | undefined
  locative: string | null | undefined
  locativeUnsafe: boolean
}): void {
  const needsLocative = input.slots.some(
    (s) =>
      s.physicallyBound !== false &&
      (s.registryKey === 'company_city_locative' ||
        s.registryKey === 'contract_city'),
  )
  if (!needsLocative) return

  const city = input.companyCity?.trim()
  if (!city) {
    throw new Error(
      'Szablon wymaga miasta firmy (forma miejscownika), ale miasto nie jest uzupełnione w danych firmy.',
    )
  }
  if (input.locativeUnsafe || !input.locative?.trim()) {
    devInfoArgs('[contract-city-inflection]', {
      companyCity: city,
      locative: null,
      safe: false,
      blocking: true,
    })
    throw new Error(
      'Nie udało się bezpiecznie odmienić miasta firmy do formy wymaganej przez szablon umowy.',
    )
  }
}
