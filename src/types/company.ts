/**
 * Company Details — canonical company identity for the entire platform.
 * Persisted in public.studio_details (legacy table name; one row per account).
 */

export interface CompanyDetails {
  id: string
  userId: string
  companyName: string | null
  ownerName: string | null
  nip: string | null
  regon: string | null
  vatId: string | null
  address: string | null
  postalCode: string | null
  city: string | null
  country: string
  phone: string | null
  email: string | null
  website: string | null
  instagram: string | null
  facebook: string | null
  bankAccount: string | null
  iban: string | null
  swift: string | null
  logoPath: string | null
  signaturePath: string | null
  stampPath: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertCompanyDetailsInput {
  companyName?: string | null
  ownerName?: string | null
  nip?: string | null
  regon?: string | null
  vatId?: string | null
  address?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  instagram?: string | null
  facebook?: string | null
  bankAccount?: string | null
  iban?: string | null
  swift?: string | null
  logoPath?: string | null
  signaturePath?: string | null
  stampPath?: string | null
}
