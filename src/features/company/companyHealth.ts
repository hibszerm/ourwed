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
  bankAccount?: string | null
  iban?: string | null
  logoPath?: string | null
  signaturePath?: string | null
}

function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

/** Compact setup checklist for Dane firmy — only meaningful document-critical items. */
export function buildCompanyHealth(
  data: CompanyHealthSnapshot | CompanyDetails | null | undefined,
): CompanyHealthItem[] {
  if (!data) {
    return [
      { id: 'company', label: 'Dane firmy', status: 'missing' },
      { id: 'address', label: 'Adres', status: 'missing' },
      { id: 'bank', label: 'Numer konta', status: 'missing' },
      { id: 'logo', label: 'Logo', status: 'missing' },
      { id: 'signature', label: 'Podpis', status: 'missing' },
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
    {
      id: 'bank',
      label: 'Numer konta',
      status:
        filled(data.bankAccount) || filled(data.iban) ? 'ok' : 'missing',
    },
    {
      id: 'logo',
      label: 'Logo',
      status: filled(data.logoPath) ? 'ok' : 'missing',
    },
    {
      id: 'signature',
      label: 'Podpis',
      status: filled(data.signaturePath) ? 'ok' : 'missing',
    },
  ]
}
