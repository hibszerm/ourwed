/**
 * Golden G01–G06 CRM datasets + owner-derived representation maps.
 * Harness-only — does not change generator behavior.
 */

import type { WeddingExtraService } from '@/types/package'
import type { Wedding } from '@/types/wedding'

export type GoldenCaseId = 'G01' | 'G02' | 'G03' | 'G04' | 'G05' | 'G06'

export type GoldenRepresentationMap = {
  party: boolean
  secondParty: boolean
  address: boolean
  phoneEmail: boolean
  weddingDate: boolean
  contractExecutionDate: boolean
  prep1: boolean
  prep2: boolean
  ceremony: boolean
  reception: boolean
  package: boolean
  total: boolean
  deposit: boolean
  remaining: boolean
  extrasDestination: 'explicit' | 'fallback' | 'none'
  moneyInWords: boolean
}

export type GoldenScenario = {
  caseId: GoldenCaseId
  sourceFile: string
  partyMode: 'one' | 'two'
  extrasMode: 'none' | 'one' | 'many'
  wedding: Wedding
  package: { id: string; name: string }
  extras: WeddingExtraService[]
  preserveMoney: string[]
  stalePartyTokens: string[]
  staleLocationTokens: string[]
  representation: GoldenRepresentationMap
  expectedUpdate: string[]
  expectedNonInsertion: string[]
  notes: string
}

function weddingBase(input: {
  id: string
  partyMode: 'one' | 'two'
  price: number
  deposit: number
  packageName: string
  date: string
  partner1: string
  partner1Address?: string
  partner1City?: string
  partner1PostalCode?: string
  partner1Phone?: string
  partner2?: string
  partner2Address?: string
  partner2City?: string
  partner2PostalCode?: string
  partner2Phone?: string
  preparationLocation?: string
  bridePreparationLocation?: string
  groomPreparationLocation?: string
  ceremonyLocation?: string
  receptionLocation?: string
}): Wedding {
  const couple = {
    partner1: input.partner1,
    partner1Address: input.partner1Address ?? 'ul. Jesienna 14/2',
    partner1City: input.partner1City ?? 'Poznań',
    partner1PostalCode: input.partner1PostalCode ?? '60-001',
    partner1Phone: input.partner1Phone ?? '+48 511 700 101',
    ...(input.partyMode === 'two' && input.partner2
      ? {
          partner2: input.partner2,
          partner2Address: input.partner2Address ?? 'ul. Jesienna 14/2',
          partner2City: input.partner2City ?? 'Poznań',
          partner2PostalCode: input.partner2PostalCode ?? '60-001',
          partner2Phone: input.partner2Phone ?? '+48 511 700 102',
        }
      : {}),
  }
  return {
    id: input.id,
    date: input.date,
    price: input.price,
    depositAmount: input.deposit,
    currency: 'PLN',
    packageId: `golden-pkg-${input.id}`,
    packageName: input.packageName,
    couple,
    ...(input.preparationLocation
      ? { preparationLocation: input.preparationLocation }
      : {}),
    ...(input.bridePreparationLocation
      ? { bridePreparationLocation: input.bridePreparationLocation }
      : {}),
    ...(input.groomPreparationLocation
      ? { groomPreparationLocation: input.groomPreparationLocation }
      : {}),
    ...(input.ceremonyLocation
      ? { ceremonyLocation: input.ceremonyLocation }
      : {}),
    ...(input.receptionLocation
      ? { receptionLocation: input.receptionLocation }
      : {}),
  } as unknown as Wedding
}

function extrasList(
  weddingId: string,
  names: string[],
): WeddingExtraService[] {
  return names.map((name, i) => ({
    id: `golden-e-${weddingId}-${i}`,
    weddingId,
    extraServiceId: `golden-s-${i}`,
    priceSnapshot: 500 + i * 250,
    quantity: 1,
    createdAt: '2026-09-01',
    name,
  }))
}

export const GOLDEN_SOURCE_FILES: Record<GoldenCaseId, string> = {
  G01: 'Golden_01_Elegant_Photographer.docx',
  G02: 'Golden_02_Structured_Two_Client_Photographer.docx',
  G03: 'Golden_03_Long_Photo_Video.docx',
  G04: 'Golden_04_Table_Heavy_Modern_Studio.docx',
  G05: 'Golden_05_Dense_Formal_Legalistic.docx',
  G06: 'Golden_06_Minimal_Contemporary.docx',
}

export function buildGoldenScenarios(): GoldenScenario[] {
  const g01Extras = extrasList('G01', [
    'sesja narzeczeńska',
    'dodatkowy album rodzinny',
  ])
  const g03Extras = extrasList('G03', [
    'ujęcie z drona',
    'film w wersji rozszerzonej',
    'dodatkowy operator obrazu',
  ])
  const g04Extras = extrasList('G04', [
    'sesja plenerowa dzień po',
    'album premium 30×30',
  ])
  const g05Extras = extrasList('G05', ['sesja narzeczeńska'])
  const g06Extras = extrasList('G06', [
    'dodatkowy operator',
    'dłuższa wersja filmu',
  ])

  return [
    {
      caseId: 'G01',
      sourceFile: GOLDEN_SOURCE_FILES.G01,
      partyMode: 'one',
      extrasMode: 'many',
      wedding: weddingBase({
        id: 'G01',
        partyMode: 'one',
        price: 11200,
        deposit: 2500,
        packageName: 'Reportaż Wieczorny',
        date: '2027-09-18',
        partner1: 'Zofia Kalendarzowa',
        partner1Address: 'ul. Kasztanowa 21/5',
        partner1City: 'Poznań',
        partner1PostalCode: '60-214',
        partner1Phone: '+48 511 700 101',
        preparationLocation: 'Apartament Lipowy, ul. Wierzbowa 9, 60-220 Poznań',
        ceremonyLocation: 'Kościół św. Wojciecha, pl. Farny 1, Poznań',
        receptionLocation: 'Pałac Działyńskich — sala balowa, Stary Rynek 78, Poznań',
      }),
      package: { id: 'golden-pkg-G01', name: 'Reportaż Wieczorny' },
      extras: g01Extras,
      preserveMoney: ['1 200,00 zł', '650,00 zł', '980,00 zł'],
      stalePartyTokens: [
        'Alicja Przykładowa',
        'Alicją Przykładową',
        'Tomasz Modelowy',
        'Tomasza Modelowego',
      ],
      staleLocationTokens: [
        'Domu Rodzinnym Przykład',
        'Kaplicy Jasnego Dnia',
        'Dworze Biała Karta',
        'Lawendowa 3',
        'Ogrodowa 18',
      ],
      representation: {
        party: true,
        secondParty: false,
        address: true,
        phoneEmail: true,
        weddingDate: true,
        contractExecutionDate: true,
        prep1: true,
        prep2: false,
        ceremony: true,
        reception: true,
        package: true,
        total: true,
        deposit: true,
        remaining: true,
        extrasDestination: 'explicit',
        moneyInWords: true,
      },
      expectedUpdate: [
        'party',
        'address',
        'weddingDate',
        'prep',
        'ceremony',
        'reception',
        'package',
        'total',
        'deposit',
        'remaining',
        'extrasNames',
      ],
      expectedNonInsertion: ['secondParty', 'prep2'],
      notes: 'Elegant prose one-client; explicit extras §8; catalogue prices preserved',
    },
    {
      caseId: 'G02',
      sourceFile: GOLDEN_SOURCE_FILES.G02,
      partyMode: 'two',
      extrasMode: 'none',
      wedding: weddingBase({
        id: 'G02',
        partyMode: 'two',
        price: 13400,
        deposit: 3200,
        packageName: 'Reportaż Amber',
        date: '2027-10-09',
        partner1: 'Helena Mostowa',
        partner2: 'Adam Mostowy',
        partner1Address: 'ul. Portowa 4/12',
        partner1City: 'Gdańsk',
        partner1PostalCode: '80-246',
        partner2Address: 'ul. Portowa 4/12',
        partner2City: 'Gdańsk',
        partner2PostalCode: '80-246',
        preparationLocation: 'Hotel Motława, apartament 512, ul. Chmielna 7, Gdańsk',
        ceremonyLocation: 'Dwór Artusa — sala reprezentacyjna, Gdańsk',
        receptionLocation: 'Olivia Garden, al. Grunwaldzka 472, Gdańsk',
      }),
      package: { id: 'golden-pkg-G02', name: 'Reportaż Amber' },
      extras: [],
      preserveMoney: [],
      stalePartyTokens: [
        'Lena Fikcyjna',
        'Oskar Umowny',
        'Leną Fikcyjną',
        'Oskara Umownego',
      ],
      staleLocationTokens: [
        'Apartament Próbny',
        'Urząd Uroczysty',
        'Sala Północna Przystań',
        'Planszowa 12',
        'Testowa 44',
      ],
      representation: {
        party: true,
        secondParty: true,
        address: true,
        phoneEmail: true,
        weddingDate: true,
        contractExecutionDate: true,
        prep1: true,
        prep2: false,
        ceremony: true,
        reception: true,
        package: true,
        total: true,
        deposit: true,
        remaining: true,
        extrasDestination: 'none',
        moneyInWords: false,
      },
      expectedUpdate: [
        'bothParties',
        'addresses',
        'contacts',
        'weddingDate',
        'prep',
        'ceremony',
        'reception',
        'package',
        'total',
        'deposit',
        'remaining',
      ],
      expectedNonInsertion: ['extrasSection', 'prep2', 'moneyInWords'],
      notes: 'Two-client structured tables; no extras section',
    },
    {
      caseId: 'G03',
      sourceFile: GOLDEN_SOURCE_FILES.G03,
      partyMode: 'two',
      extrasMode: 'many',
      wedding: weddingBase({
        id: 'G03',
        partyMode: 'two',
        price: 21400,
        deposit: 4800,
        packageName: 'Foto+Film Harmonia',
        date: '2027-07-24',
        partner1: 'Natalia Brzegowa',
        partner2: 'Filip Brzegowy',
        partner1Address: 'ul. Morska 16/3',
        partner1City: 'Sopot',
        partner1PostalCode: '81-701',
        partner2Address: 'ul. Leśna 2/8',
        partner2City: 'Gdynia',
        partner2PostalCode: '81-350',
        bridePreparationLocation: 'Villa Marina, apartament 1, ul. Bohaterów Monte Cassino 22, Sopot',
        groomPreparationLocation: 'Hotel Nadmorski, pokój 408, ul. Ejsmonda 2, Gdynia',
        ceremonyLocation: 'Kościół Gwiazda Morza, Sopot',
        receptionLocation: 'Grand Hotel Sopot — sala balowa',
      }),
      package: { id: 'golden-pkg-G03', name: 'Foto+Film Harmonia' },
      extras: g03Extras,
      preserveMoney: ['850,00 zł'],
      stalePartyTokens: [
        'Maja Przykładowa',
        'Kacper Modelowy',
        'Maję Przykładową',
        'Kacpra Modelowego',
      ],
      staleLocationTokens: [
        'Dom Gościnny Migdał',
        'Hotel Linia',
        'Oranżeria Jasny Sad',
        'Dwór Srebrny Liść',
        'Poranna 11',
        'Horyzontalna 8',
        'Wieczorna 27',
      ],
      representation: {
        party: true,
        secondParty: true,
        address: true,
        phoneEmail: true,
        weddingDate: true,
        contractExecutionDate: true,
        prep1: true,
        prep2: true,
        ceremony: true,
        reception: true,
        package: true,
        total: true,
        deposit: true,
        remaining: true,
        extrasDestination: 'explicit',
        moneyInWords: true,
      },
      expectedUpdate: [
        'bothParties',
        'dualPrep',
        'ceremony',
        'reception',
        'package',
        'total',
        'deposit',
        'remaining',
        'extrasNames',
      ],
      expectedNonInsertion: ['operatorIdentityRewrite'],
      notes: 'Long photo+video dual-prep stress case',
    },
    {
      caseId: 'G04',
      sourceFile: GOLDEN_SOURCE_FILES.G04,
      partyMode: 'one',
      extrasMode: 'many',
      wedding: weddingBase({
        id: 'G04',
        partyMode: 'one',
        price: 15800,
        deposit: 4200,
        packageName: 'Produkcja Dokument 550',
        date: '2027-11-13',
        partner1: 'Julia Siatkowa',
        partner1Address: 'ul. Modułowa 7/9',
        partner1City: 'Wrocław',
        partner1PostalCode: '50-001',
        preparationLocation: 'Studio Loft Nadodrze, ul. Bydgoska 5, Wrocław',
        ceremonyLocation: 'Hala Stulecia — foyer, Wrocław',
        receptionLocation: 'Hotel Monopol — sala balowa, Wrocław',
      }),
      package: { id: 'golden-pkg-G04', name: 'Produkcja Dokument 550' },
      extras: g04Extras,
      preserveMoney: ['650,00 zł', '1 250,00 zł', '2,20 zł', '700,00 zł'],
      stalePartyTokens: ['Iga Makieta', 'Igę Makietę'],
      staleLocationTokens: [
        'Loft Próbny',
        'Pawilon Zgody',
        'Hala Zielony Moduł',
        'Koncepcyjna 9',
        'Siatkowa 28',
      ],
      representation: {
        party: true,
        secondParty: false,
        address: true,
        phoneEmail: true,
        weddingDate: true,
        contractExecutionDate: true,
        prep1: true,
        prep2: false,
        ceremony: true,
        reception: true,
        package: true,
        total: true,
        deposit: true,
        remaining: true,
        extrasDestination: 'explicit',
        moneyInWords: false,
      },
      expectedUpdate: [
        'party',
        'eventDate',
        'locations',
        'package',
        'total',
        'deposit',
        'remaining',
        'extrasNames',
      ],
      expectedNonInsertion: ['secondParty', 'extensionCatalogueOverwrite'],
      notes: 'Table-heavy; extension catalogue ≠ selected extras',
    },
    {
      caseId: 'G05',
      sourceFile: GOLDEN_SOURCE_FILES.G05,
      partyMode: 'one',
      extrasMode: 'one',
      wedding: weddingBase({
        id: 'G05',
        partyMode: 'one',
        price: 10200,
        deposit: 2550,
        packageName: 'Archiwum 480',
        date: '2027-08-21',
        partner1: 'Barbara Atramentowa',
        partner1Address: 'ul. Perłowa 3/2',
        partner1City: 'Lublin',
        partner1PostalCode: '20-001',
        // CRM may hold prep; template does NOT represent it
        preparationLocation: 'ul. Spokojna 1, Lublin',
        ceremonyLocation: 'Katedra lubelska — kaplica boczna, Lublin',
        receptionLocation: 'Hotel Europa — sala lustrzana, Lublin',
      }),
      package: { id: 'golden-pkg-G05', name: 'Archiwum 480' },
      extras: g05Extras,
      preserveMoney: ['720,00 zł', '2,40 zł'],
      stalePartyTokens: [
        'Helena Wzorcowa',
        'Helenę Wzorcową',
        'Emil Próbny',
        'Emila Próbnego',
      ],
      staleLocationTokens: [
        'Urząd Stanu Cywilnego Miasta Testowego',
        'Dom Przyjęć Wstęga',
        'Atramentowy 2',
        'Borki Próbne',
      ],
      representation: {
        party: true,
        secondParty: false,
        address: true,
        phoneEmail: true,
        weddingDate: true,
        contractExecutionDate: true,
        prep1: false,
        prep2: false,
        ceremony: true,
        reception: true,
        package: true,
        total: true,
        deposit: true,
        remaining: true,
        extrasDestination: 'fallback',
        moneyInWords: true,
      },
      expectedUpdate: [
        'party',
        'weddingDate',
        'ceremony',
        'reception',
        'package',
        'total',
        'deposit',
        'remaining',
        'extrasName',
      ],
      expectedNonInsertion: [
        'preparationLocation',
        'secondParty',
        'legalRewrite',
        'unrelatedHourRate',
        'unrelatedKmRate',
      ],
      notes: 'Dense legal; sparse change; no prep invention',
    },
    {
      caseId: 'G06',
      sourceFile: GOLDEN_SOURCE_FILES.G06,
      partyMode: 'two',
      extrasMode: 'many',
      wedding: weddingBase({
        id: 'G06',
        partyMode: 'two',
        price: 16700,
        deposit: 4500,
        packageName: 'Film Obserwacyjny',
        date: '2027-12-04',
        partner1: 'Olga Widokowa',
        partner2: 'Marek Widokowy',
        partner1Address: 'ul. Jasna 11/4',
        partner1City: 'Kraków',
        partner1PostalCode: '30-001',
        partner2Address: 'ul. Jasna 11/4',
        partner2City: 'Kraków',
        partner2PostalCode: '30-001',
        // CRM has prep+ceremony; template represents reception only
        preparationLocation: 'ul. Floriańska 12, Kraków',
        ceremonyLocation: 'Kościół Mariacki, Kraków',
        receptionLocation: 'Hotel Pod Różą — sala ogrodowa, Kraków',
      }),
      package: { id: 'golden-pkg-G06', name: 'Film Obserwacyjny' },
      extras: g06Extras,
      preserveMoney: ['180,00 zł', '850,00 zł'],
      stalePartyTokens: [
        'Nina Robocza',
        'Kajetan Testowy',
        'Ninę Roboczą',
        'Kajetana Testowego',
      ],
      staleLocationTokens: [
        'Dom Otwarta Przestrzeń',
        'Spokojna 27',
        'Miasto Koncepcyjne',
      ],
      representation: {
        party: true,
        secondParty: true,
        address: true,
        phoneEmail: true,
        weddingDate: true,
        contractExecutionDate: false,
        prep1: false,
        prep2: false,
        ceremony: false,
        reception: true,
        package: false,
        total: true,
        deposit: true,
        remaining: true,
        extrasDestination: 'fallback',
        moneyInWords: false,
      },
      expectedUpdate: [
        'bothParties',
        'weddingDate',
        'reception',
        'budget',
        'firstPayment',
        'remaining',
        'extrasFallback',
      ],
      expectedNonInsertion: [
        'preparationLocation',
        'ceremonyLocation',
        'contractExecutionDate',
        'packageNameIfAbsent',
      ],
      notes: 'Minimal film; reception-only; fallback extras before Zamknięcie',
    },
  ]
}
