/**
 * CG6 realistic scenarios — sanitized GP-structure fixtures (QA only).
 * No real client PII. Sources live under tmp/cg6-fixtures/.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WeddingExtraService } from '@/types/package'
import type { Wedding } from '@/types/wedding'

export type Cg6CaseId =
  | 'R01'
  | 'R02'
  | 'R03'
  | 'R04'
  | 'R05'
  | 'R06'

export type Cg6Scenario = {
  caseId: Cg6CaseId
  title: string
  structuralChallenge: string
  sourceFixture: string
  partyMode: 'one' | 'two'
  extrasMode: 'none' | 'one' | 'many'
  wedding: Wedding
  package: { id: string; name: string }
  extras: WeddingExtraService[]
  /** Unrelated PLN amounts that must survive finance repair. */
  preserveMoney: string[]
  /** Payment deadline / method phrases that must survive. */
  preservePaymentSemantics: string[]
}

const EXTRAS_CATALOG = [
  'dodatkowy operator',
  'film w wersji rozszerzonej',
  'ujęcie z drona',
  'ekspresowy montaż',
] as const

function commercialTotal(extrasSum: number): number {
  return 13500 + extrasSum
}

function weddingFor(
  caseId: Cg6CaseId,
  partyMode: 'one' | 'two',
  extrasSum: number,
): Wedding {
  const total = commercialTotal(extrasSum)
  const deposit = Math.round(total * 0.28)
  const base = {
    id: `cg6-w-${caseId}`,
    date: '2027-06-19',
    price: total,
    depositAmount: deposit,
    currency: 'PLN' as const,
    packageId: `cg6-pkg-${caseId}`,
    packageName:
      caseId === 'R04' || caseId === 'R06'
        ? 'Photo + Video Standard'
        : 'Video Standard',
    couple: {
      partner1: 'Anna Testowa',
      partner1Address: 'ul. Kwiatowa 12',
      partner1City: 'Kraków',
      partner1PostalCode: '30-001',
      partner1Phone: '+48 500 100 200',
      ...(partyMode === 'two'
        ? {
            partner2: 'Jan Próbny',
            partner2Address: 'ul. Kwiatowa 12',
            partner2City: 'Kraków',
            partner2PostalCode: '30-001',
            partner2Phone: '+48 500 100 201',
          }
        : {}),
    },
  }
  return base as unknown as Wedding
}

function extrasFor(
  mode: 'none' | 'one' | 'many',
  weddingId: string,
): WeddingExtraService[] {
  if (mode === 'none') return []
  const names =
    mode === 'one' ? [EXTRAS_CATALOG[0]] : [...EXTRAS_CATALOG]
  return names.map((name, i) => ({
    id: `cg6-e-${weddingId}-${i}`,
    weddingId,
    extraServiceId: `cg6-s-${i}`,
    priceSnapshot: 500 + i * 250,
    quantity: 1,
    createdAt: '2026-01-01',
    name,
  }))
}

export const CG6_CASES: Cg6CaseId[] = [
  'R01',
  'R02',
  'R03',
  'R04',
  'R05',
  'R06',
]

export function buildCg6Scenarios(): Cg6Scenario[] {
  const defs: Array<{
    caseId: Cg6CaseId
    title: string
    structuralChallenge: string
    sourceFixture: string
    partyMode: 'one' | 'two'
    extrasMode: 'none' | 'one' | 'many'
  }> = [
    {
      caseId: 'R01',
      title: 'FULL REALISTIC / ONE PERSON / BASE',
      structuralChallenge:
        'GP Video Standard long-form; numeric+words; deposit IBAN; hour fee; cross-refs',
      sourceFixture: 'R01_SOURCE_SANITIZED.docx',
      partyMode: 'one',
      extrasMode: 'none',
    },
    {
      caseId: 'R02',
      title: 'FULL REALISTIC / ONE PERSON / EXTRAS',
      structuralChallenge:
        'Same GP structure + several extras into package list neighborhood',
      sourceFixture: 'R02_SOURCE_SANITIZED.docx',
      partyMode: 'one',
      extrasMode: 'many',
    },
    {
      caseId: 'R03',
      title: 'FULL REALISTIC / TWO PEOPLE / BASE',
      structuralChallenge:
        'Two-person party line on full GP Video structure; no extras',
      sourceFixture: 'R03_SOURCE_SANITIZED.docx',
      partyMode: 'two',
      extrasMode: 'none',
    },
    {
      caseId: 'R04',
      title: 'FULL REALISTIC / TWO PEOPLE / EXTRAS',
      structuralChallenge:
        'Photo+Video GP structure; dual operators; two people; extras',
      sourceFixture: 'R04_SOURCE_SANITIZED.docx',
      partyMode: 'two',
      extrasMode: 'many',
    },
    {
      caseId: 'R05',
      title: 'FINANCIAL ADVERSARIAL',
      structuralChallenge:
        'Total/deposit/remaining words + unrelated 900zł additional-hour must survive',
      sourceFixture: 'R05_SOURCE_SANITIZED.docx',
      partyMode: 'one',
      extrasMode: 'none',
    },
    {
      caseId: 'R06',
      title: 'STRUCTURAL ADVERSARIAL',
      structuralChallenge:
        'Longest GP Photo+Video clauses; historical deposit prose; cross-refs; extras destination non-trivial',
      sourceFixture: 'R06_SOURCE_SANITIZED.docx',
      partyMode: 'one',
      extrasMode: 'many',
    },
  ]

  return defs.map((d) => {
    const seedExtras = extrasFor(d.extrasMode, `cg6-w-${d.caseId}`)
    const extrasSum = seedExtras.reduce(
      (n, e) => n + (e.priceSnapshot ?? 0) * (e.quantity ?? 1),
      0,
    )
    const wedding = weddingFor(d.caseId, d.partyMode, extrasSum)
    return {
      ...d,
      wedding,
      package: { id: wedding.packageId!, name: wedding.packageName! },
      extras: extrasFor(d.extrasMode, wedding.id),
      preserveMoney: ['900zł', '900 zł'],
      preservePaymentSemantics: [
        '7 dni od daty zawarcia',
        'najpóźniej w dniu',
        'rachunek bankowy',
        'W tytule przelewu',
        '00 0000 0000 0000 0000 0000 0000',
      ],
    }
  })
}

export function loadCg6SourceBytes(
  fixtureFile: string,
  fixturesDir = 'tmp/cg6-fixtures',
): ArrayBuffer {
  const buf = readFileSync(join(fixturesDir, fixtureFile))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}
