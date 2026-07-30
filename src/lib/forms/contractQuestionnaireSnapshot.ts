/**
 * Build / normalize contract questionnaire option snapshots and config.
 */

import {
  CONTRACT_QUESTIONNAIRE_CONFIG_VERSION,
  defaultContractQuestionnaireConfig,
  type AdditionalServiceOptionSnapshot,
  type ContractQuestionnaireConfig,
  type FormInstanceOptionsSnapshot,
  type PackageOptionSnapshot,
  type QuestionnaireCustomField,
} from '@/types/contractQuestionnaire'
import { ensureQuestionnaireBlocks } from '@/lib/forms/questionnaireBlocks'

export function normalizeContractQuestionnaireConfig(
  raw: unknown,
): ContractQuestionnaireConfig {
  const base = defaultContractQuestionnaireConfig()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ensureQuestionnaireBlocks(base)
  }
  const row = raw as Record<string, unknown>

  const customFields = normalizeCustomFields(row.customFields)

  const baseConfig: ContractQuestionnaireConfig = {
    version:
      typeof row.version === 'number' && row.version > 0
        ? row.version
        : CONTRACT_QUESTIONNAIRE_CONFIG_VERSION,
    greeting:
      typeof row.greeting === 'string' ? row.greeting : base.greeting,
    footerText:
      typeof row.footerText === 'string' ? row.footerText : base.footerText,
    questionnaireTitle:
      typeof row.questionnaireTitle === 'string'
        ? row.questionnaireTitle
        : undefined,
    submitButtonLabel:
      typeof row.submitButtonLabel === 'string'
        ? row.submitButtonLabel
        : undefined,
    successMessage:
      typeof row.successMessage === 'string' ? row.successMessage : undefined,
    showPackages:
      typeof row.showPackages === 'boolean' ? row.showPackages : base.showPackages,
    allowMultiplePackages:
      typeof row.allowMultiplePackages === 'boolean'
        ? row.allowMultiplePackages
        : base.allowMultiplePackages,
    showAdditionalServices:
      typeof row.showAdditionalServices === 'boolean'
        ? row.showAdditionalServices
        : base.showAdditionalServices,
    packagesRequired:
      typeof row.packagesRequired === 'boolean'
        ? row.packagesRequired
        : base.packagesRequired,
    requiredFields:
      row.requiredFields &&
      typeof row.requiredFields === 'object' &&
      !Array.isArray(row.requiredFields)
        ? (row.requiredFields as Record<string, boolean>)
        : undefined,
    customFields,
    blocks: Array.isArray(row.blocks)
      ? (row.blocks as ContractQuestionnaireConfig['blocks'])
      : undefined,
  }

  return ensureQuestionnaireBlocks(baseConfig)
}

function normalizeCustomFields(raw: unknown): QuestionnaireCustomField[] {
  if (!Array.isArray(raw)) return []
  const out: QuestionnaireCustomField[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = String(row.id ?? '').trim()
    const label = String(row.label ?? '').trim()
    const type = String(row.type ?? '').trim()
    if (!id || !label || !type) continue
    const fieldKey =
      String(row.fieldKey ?? row.internalKey ?? '').trim() || `custom_${id}`
    out.push({
      id,
      fieldKey,
      label,
      helperText:
        typeof row.helperText === 'string' ? row.helperText : undefined,
      type: type as QuestionnaireCustomField['type'],
      required: Boolean(row.required),
      enabled: row.enabled !== false,
      order: typeof row.order === 'number' ? row.order : out.length,
      placeholder:
        typeof row.placeholder === 'string' ? row.placeholder : undefined,
      options: Array.isArray(row.options)
        ? row.options
            .filter((o): o is { value: string; label: string } => {
              if (!o || typeof o !== 'object') return false
              const opt = o as Record<string, unknown>
              return (
                typeof opt.value === 'string' &&
                typeof opt.label === 'string' &&
                opt.value.trim() !== '' &&
                opt.label.trim() !== ''
              )
            })
            .map((o) => ({ value: o.value, label: o.label }))
        : undefined,
    })
  }
  return out.sort((a, b) => a.order - b.order)
}

export function normalizePackageOptions(
  raw: unknown,
): PackageOptionSnapshot[] {
  if (!Array.isArray(raw)) return []
  const out: PackageOptionSnapshot[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = String(row.id ?? row.value ?? '').trim()
    const name = String(row.name ?? row.label ?? '').trim()
    if (!id || !name) continue
    const price =
      typeof row.price === 'number'
        ? row.price
        : typeof row.price === 'string' && row.price.trim()
          ? Number(row.price)
          : null
    out.push({
      id,
      name,
      description:
        typeof row.description === 'string' ? row.description : null,
      price: Number.isFinite(price) ? price : null,
      currency:
        typeof row.currency === 'string' && row.currency.trim()
          ? row.currency
          : 'PLN',
    })
  }
  return out
}

export function normalizeAdditionalServiceOptions(
  raw: unknown,
): AdditionalServiceOptionSnapshot[] {
  return normalizePackageOptions(raw)
}

export function parseOptionsSnapshot(
  raw: unknown,
): FormInstanceOptionsSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  return {
    version:
      typeof row.version === 'number'
        ? row.version
        : CONTRACT_QUESTIONNAIRE_CONFIG_VERSION,
    config: normalizeContractQuestionnaireConfig(row.config),
    packageOptions: normalizePackageOptions(row.packageOptions),
    additionalServiceOptions: normalizeAdditionalServiceOptions(
      row.additionalServiceOptions,
    ),
    createdAt:
      typeof row.createdAt === 'string'
        ? row.createdAt
        : new Date().toISOString(),
  }
}

/**
 * Snapshot active catalog packages + extras + company questionnaire config.
 * Called when creating/sending a questionnaire (authenticated studio context).
 * Catalog services are loaded lazily so pure helpers stay testable without Supabase.
 */
export async function buildFormInstanceOptionsSnapshot(): Promise<FormInstanceOptionsSnapshot> {
  const [
    { packageService },
    { extraServiceService },
    { companyDetailsService },
  ] = await Promise.all([
    import('@/lib/api/packageService'),
    import('@/lib/api/extraServiceService'),
    import('@/lib/api/companyDetailsService'),
  ])

  const [packages, extras, company] = await Promise.all([
    packageService.list({ activeOnly: true }),
    extraServiceService.list({ activeOnly: true }),
    companyDetailsService.get(),
  ])

  const config = normalizeContractQuestionnaireConfig(
    company?.questionnaireConfig ?? null,
  )

  return {
    version: CONTRACT_QUESTIONNAIRE_CONFIG_VERSION,
    config,
    packageOptions: packages.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency || 'PLN',
    })),
    additionalServiceOptions: extras.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      price: e.price,
      currency: e.currency || 'PLN',
    })),
    createdAt: new Date().toISOString(),
  }
}

/** Normalize legacy single packageId → selectedPackageIds[]. */
export function normalizeSelectedPackageIds(
  fields: Record<string, unknown>,
): string[] {
  const fromArray = fields.selectedPackageIds
  const ids: string[] = []
  if (Array.isArray(fromArray)) {
    for (const item of fromArray) {
      const id = String(item ?? '').trim()
      if (id && !ids.includes(id)) ids.push(id)
    }
  }
  const legacy = String(fields.packageId ?? '').trim()
  if (legacy && !ids.includes(legacy)) ids.push(legacy)
  return ids
}

export function validateIdsAgainstOptions(
  selectedIds: string[],
  options: Array<{ id: string }>,
): { ok: true } | { ok: false; invalidIds: string[] } {
  if (options.length === 0) {
    // Legacy instances without snapshot options — allow empty validation.
    return { ok: true }
  }
  const allowed = new Set(options.map((o) => o.id))
  const invalidIds = selectedIds.filter((id) => !allowed.has(id))
  if (invalidIds.length > 0) return { ok: false, invalidIds }
  return { ok: true }
}

export function formatLocationAnswer(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  const row = value as Record<string, unknown>
  const address =
    (typeof row.formattedAddress === 'string' && row.formattedAddress.trim()) ||
    [
      row.street,
      row.buildingNumber,
      row.postalCode,
      row.city,
      row.country,
    ]
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter(Boolean)
      .join(', ') ||
    ''
  const name =
    (typeof row.label === 'string' && row.label.trim()) ||
    (typeof row.name === 'string' && row.name.trim()) ||
    ''
  // Keep venue name when richer GeoPlace / NormalizedAddress is present.
  if (name && address && name !== address) return `${name} — ${address}`
  if (address) return address
  if (name) return name
  return ''
}
