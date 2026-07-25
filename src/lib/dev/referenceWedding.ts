/**
 * Development-only reference package + wedding fixtures.
 * Not used by production contract/DOCX pipelines.
 */

import type { StudioPackage, PackageItem } from '@/types/package'
import type { CompanyDetails } from '@/types/company'
import type { Payment, Wedding, WeddingPackageItemSnapshot } from '@/types/wedding'
import {
  defaultFinalPaymentDueDate,
  getWeddingCommercialSummary,
} from '@/lib/utils/commercial'

export const REFERENCE_PACKAGE_SLUG = 'video-mini-reference'
export const REFERENCE_WEDDING_MARKER = 'reference-wedding:video-mini'

export const REFERENCE_PACKAGE_ITEMS: Array<
  Omit<PackageItem, 'id' | 'packageId' | 'createdAt'>
> = [
  {
    title: 'Teledysk ślubny, 1–2 minuty',
    description: null,
    sortOrder: 0,
    enabled: true,
    quantity: 1,
    unit: null,
    category: 'video',
  },
  {
    title: 'Film ślubny, około 15 minut',
    description: null,
    sortOrder: 1,
    enabled: true,
    quantity: 1,
    unit: null,
    category: 'video',
  },
  {
    title: 'Przekazanie filmów w wersji elektronicznej',
    description: null,
    sortOrder: 2,
    enabled: true,
    quantity: 1,
    unit: null,
    category: 'delivery',
  },
  {
    title: 'Jeden operator',
    description: null,
    sortOrder: 3,
    enabled: true,
    quantity: 1,
    unit: null,
    category: 'crew',
  },
]

export function buildReferencePackageItemsSnapshot(
  sourceIds: Array<string | null> = [],
): WeddingPackageItemSnapshot[] {
  return REFERENCE_PACKAGE_ITEMS.map((item, index) => ({
    sourceItemId: sourceIds[index] ?? `ref-item-${index}`,
    title: item.title,
    description: item.description,
    sortOrder: item.sortOrder,
    enabled: true,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
  }))
}

export function buildReferenceStudioPackage(
  overrides?: Partial<StudioPackage>,
): StudioPackage {
  const id = overrides?.id ?? 'ref-pkg-video-mini'
  const items: PackageItem[] =
    overrides?.items ??
    REFERENCE_PACKAGE_ITEMS.map((item, index) => ({
      id: `ref-item-${index}`,
      packageId: id,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...item,
    }))
  const base: StudioPackage = {
    id,
    name: 'Video Mini',
    slug: REFERENCE_PACKAGE_SLUG,
    description: 'Pakiet video — teledysk + film ślubny.',
    price: 9500,
    depositAmount: 1000,
    currency: 'PLN',
    color: '#1a1a1a',
    isActive: true,
    sortOrder: 0,
    questionnaireFormId: null,
    coverageHours: 12,
    coverageEndTime: '00:30',
    overtimeRate: 1400,
    deliveryMonths: 4,
    deliveryDays: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    items,
  }
  return { ...base, ...overrides, id, items }
}

export function buildReferencePayments(weddingId = 'ref-wedding'): Payment[] {
  return [
    {
      id: `${weddingId}-deposit`,
      label: 'Zadatek',
      amount: 1000,
      type: 'deposit',
      paid: true,
      paidAt: '2026-03-01',
      method: 'transfer',
    },
  ]
}

/**
 * Complete in-memory reference wedding for tests / local fixtures.
 * Company profile is passed separately (never hardcoded into production logic).
 */
export function buildReferenceWedding(
  overrides?: Partial<Wedding>,
): Wedding {
  const date = overrides?.date ?? '2026-07-24'
  return {
    id: 'ref-wedding',
    couple: {
      partner1: 'Marcin Nowak',
      partner2: 'Anna Nowak',
      partner1FirstName: 'Marcin',
      partner1LastName: 'Nowak',
      partner2FirstName: 'Anna',
      partner2LastName: 'Nowak',
      partner1Address: 'Grabowa 8A',
      partner1Phone: '777666251',
      partner1Email: 'marcin.nowak@example.pl',
      email: 'marcin.nowak@example.pl',
      phone: '777666251',
      venue: 'Sala weselna',
      city: 'Warszawa',
    },
    date,
    ceremonyTime: '16:00',
    status: 'active',
    workflowStage: 'deposit',
    packageName: 'Video Mini',
    packageId: 'ref-pkg-video-mini',
    price: 9500,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: buildReferencePackageItemsSnapshot(),
    coverageHours: 12,
    coverageEndTime: '00:30',
    overtimeRate: 1400,
    deliveryMonths: 4,
    deliveryDays: null,
    finalPaymentDueDate: defaultFinalPaymentDueDate(date),
    preparationLocation: 'Dom pani młodej, Grabowa 8A',
    bridePreparationLocation: 'Dom pani młodej, Grabowa 8A',
    groomPreparationLocation: 'Hotel Centralny, ul. Główna 3',
    ceremonyLocation: 'Kościół pw. św. Anny',
    receptionLocation: 'Sala weselna Pod Lipami',
    accentColor: '#1a1a1a',
    createdAt: '2026-01-01',
    checklist: [],
    schedule: [],
    payments: buildReferencePayments(),
    finances: [],
    questionnaires: {
      contractData: { status: 'completed', completedAt: '2026-02-01' },
      weddingQuestionnaire: { status: 'sent', sentAt: '2026-02-15' },
    },
    contract: { status: 'none' },
    notes: [
      {
        id: 'ref-note',
        content: REFERENCE_WEDDING_MARKER,
        createdAt: '2026-01-01',
        author: 'System',
        source: 'package_change',
        badge: 'Referencyjny',
      },
    ],
    deliverables: [],
    timeline: [],
    ...overrides,
  }
}

/** Minimal company fixture that satisfies readiness required checks. */
export function buildReferenceCompany(
  overrides?: Partial<CompanyDetails>,
): CompanyDetails {
  return {
    id: 'ref-company',
    userId: 'ref-user',
    companyName: 'OurWed Studio',
    ownerName: 'Studio Owner',
    nip: '5250000000',
    regon: '000000000',
    vatId: null,
    address: 'ul. Przykładowa 1',
    postalCode: '00-001',
    city: 'Warszawa',
    country: 'PL',
    phone: '+48 500 000 000',
    email: 'studio@ourwed.pl',
    website: null,
    instagram: null,
    facebook: null,
    bankAccount: '12 3456 7890 1234 5678 9012 3456',
    iban: null,
    swift: null,
    logoPath: null,
    signaturePath: null,
    stampPath: null,
    questionnaireConfig: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function assertReferenceCommercialFigures(wedding: Wedding) {
  const s = getWeddingCommercialSummary(wedding)
  return {
    contractValue: s.contractValue,
    agreedDeposit: s.agreedDeposit,
    totalPaid: s.totalPaid,
    remainingToPay: s.remainingToPay,
    remainingAfterDeposit: s.remainingAfterDeposit,
  }
}
