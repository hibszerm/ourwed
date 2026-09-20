/**
 * CG7 scenarios — synthetic CRM datasets for unknown-studio templates.
 */

import type { WeddingExtraService } from '@/types/package'
import type { Wedding } from '@/types/wedding'
import {
  UNKNOWN_STUDIO_META,
  type UnknownStudioId,
} from './buildUnknownStudioFixtures'

export type Cg7Scenario = {
  caseId: UnknownStudioId
  partyMode: 'one' | 'two'
  extrasMode: 'none' | 'many'
  wedding: Wedding
  package: { id: string; name: string }
  extras: WeddingExtraService[]
  preserveMoney: string[]
  meta: (typeof UNKNOWN_STUDIO_META)[number]
}

const EXTRAS = [
  'dodatkowy operator',
  'film w wersji rozszerzonej',
  'ujęcie z drona',
  'ekspresowy montaż',
] as const

function weddingBase(input: {
  id: string
  partyMode: 'one' | 'two'
  price: number
  deposit: number
  packageName: string
  date: string
  partner1: string
  partner2?: string
}): Wedding {
  const couple = {
    partner1: input.partner1,
    partner1Address: 'ul. Kwiatowa 12',
    partner1City: 'Kraków',
    partner1PostalCode: '30-001',
    partner1Phone: '+48 500 100 200',
    ...(input.partyMode === 'two' && input.partner2
      ? {
          partner2: input.partner2,
          partner2Address: 'ul. Kwiatowa 12',
          partner2City: 'Kraków',
          partner2PostalCode: '30-001',
          partner2Phone: '+48 500 100 201',
        }
      : {}),
  }
  return {
    id: input.id,
    date: input.date,
    price: input.price,
    depositAmount: input.deposit,
    currency: 'PLN',
    packageId: `cg7-pkg-${input.id}`,
    packageName: input.packageName,
    couple,
  } as unknown as Wedding
}

function extrasFor(
  mode: 'none' | 'many',
  weddingId: string,
): WeddingExtraService[] {
  if (mode === 'none') return []
  return EXTRAS.map((name, i) => ({
    id: `cg7-e-${weddingId}-${i}`,
    weddingId,
    extraServiceId: `cg7-s-${i}`,
    priceSnapshot: 400 + i * 200,
    quantity: 1,
    createdAt: '2026-01-01',
    name,
  }))
}

/** Distinct commercial truths — not identical across all U cases. */
const DATASETS: Record<
  UnknownStudioId,
  {
    partyMode: 'one' | 'two'
    extrasMode: 'none' | 'many'
    price: number
    deposit: number
    packageName: string
    date: string
    partner1: string
    partner2?: string
    preserveMoney: string[]
  }
> = {
  U01: {
    partyMode: 'one',
    extrasMode: 'none',
    price: 11200,
    deposit: 2800,
    packageName: 'Video Classic',
    date: '2027-08-14',
    partner1: 'Anna Testowa',
    preserveMoney: ['450 zł', '450zł'],
  },
  U02: {
    partyMode: 'two',
    extrasMode: 'many',
    price: 9800,
    deposit: 2200,
    packageName: 'Photo Soft',
    date: '2027-05-22',
    partner1: 'Anna Testowa',
    partner2: 'Jan Próbny',
    preserveMoney: [],
  },
  U03: {
    partyMode: 'two',
    extrasMode: 'many',
    price: 19500,
    deposit: 5460,
    packageName: 'Photo+Video Premium',
    date: '2027-07-03',
    partner1: 'Anna Testowa',
    partner2: 'Jan Próbny',
    preserveMoney: ['800 zł', '800zł'],
  },
  U04: {
    partyMode: 'two',
    extrasMode: 'none',
    price: 10500,
    deposit: 2940,
    packageName: 'Photo Reportage',
    date: '2027-09-11',
    partner1: 'Anna Testowa',
    partner2: 'Jan Próbny',
    preserveMoney: [],
  },
  U05: {
    partyMode: 'one',
    extrasMode: 'many',
    price: 12800,
    deposit: 3584,
    packageName: 'Film Documentary',
    date: '2027-06-30',
    partner1: 'Anna Testowa',
    preserveMoney: [],
  },
  U06: {
    partyMode: 'two',
    extrasMode: 'none',
    price: 14200,
    deposit: 3976,
    packageName: 'Reportaż Klasyczny',
    date: '2027-10-02',
    partner1: 'Anna Testowa',
    partner2: 'Jan Próbny',
    preserveMoney: [],
  },
  U07: {
    partyMode: 'two',
    extrasMode: 'none',
    price: 8200,
    deposit: 2296,
    packageName: 'Clear Day',
    date: '2027-04-18',
    partner1: 'Anna Testowa',
    partner2: 'Jan Próbny',
    preserveMoney: [],
  },
  U08: {
    partyMode: 'two',
    extrasMode: 'many',
    price: 11800,
    deposit: 3304,
    packageName: 'North Story',
    date: '2027-08-01',
    partner1: 'Anna Testowa',
    partner2: 'Jan Próbny',
    preserveMoney: [],
  },
  U09: {
    partyMode: 'one',
    extrasMode: 'none',
    price: 15600,
    deposit: 4368,
    packageName: 'Ledger Film',
    date: '2027-09-25',
    partner1: 'Anna Testowa',
    preserveMoney: ['550 zł', '550zł', '120 zł', '1,80 zł'],
  },
  U10: {
    partyMode: 'two',
    extrasMode: 'many',
    price: 17800,
    deposit: 4984,
    packageName: 'Hybrid Formal XL',
    date: '2027-11-07',
    partner1: 'Anna Testowa',
    partner2: 'Jan Próbny',
    preserveMoney: ['750 zł', '750zł'],
  },
}

export function buildCg7Scenarios(): Cg7Scenario[] {
  return UNKNOWN_STUDIO_META.map((meta) => {
    const d = DATASETS[meta.id]
    const extrasSum =
      d.extrasMode === 'none'
        ? 0
        : EXTRAS.reduce((n, _, i) => n + (400 + i * 200), 0)
    // Keep commercial totals explicit from DATASETS (already include extras commercially)
    const wedding = weddingBase({
      id: `cg7-w-${meta.id}`,
      partyMode: d.partyMode,
      price: d.price,
      deposit: d.deposit,
      packageName: d.packageName,
      date: d.date,
      partner1: d.partner1,
      partner2: d.partner2,
    })
    void extrasSum
    return {
      caseId: meta.id,
      partyMode: d.partyMode,
      extrasMode: d.extrasMode,
      wedding,
      package: { id: wedding.packageId!, name: d.packageName },
      extras: extrasFor(d.extrasMode, wedding.id),
      preserveMoney: d.preserveMoney,
      meta,
    }
  })
}

export const CG7_GATE_A: UnknownStudioId[] = ['U01', 'U04', 'U06']
export const CG7_GATE_B: UnknownStudioId[] = [
  'U02',
  'U03',
  'U05',
  'U07',
  'U08',
  'U09',
  'U10',
]
