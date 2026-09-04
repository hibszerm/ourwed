import type { CompanyDetails } from '@/types/company'

export type CompanyHealthStatus = 'ok' | 'missing'

export interface CompanyHealthItem {
  id: string
  label: string
  status: CompanyHealthStatus
}

export interface CompanyHealthSnapshot {
  companyName?: string | null
  address?: string | null
  city?: string | null
}

function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

/**
 * Legacy completeness helper. V1 Studio Profile does not surface a
 * company-health checklist — generating a contract does not require
 * filling studio_details.
 */
export function buildCompanyHealth(
  data: CompanyHealthSnapshot | CompanyDetails | null | undefined,
): CompanyHealthItem[] {
  if (!data) {
    return [
      { id: 'company', label: 'Dane firmy', status: 'missing' },
      { id: 'address', label: 'Adres', status: 'missing' },
    ]
  }

  return [
    {
      id: 'company',
      label: 'Dane firmy',
      status: filled(data.companyName) ? 'ok' : 'missing',
    },
    {
      id: 'address',
      label: 'Adres',
      status:
        filled(data.address) && filled(data.city) ? 'ok' : 'missing',
    },
  ]
}
