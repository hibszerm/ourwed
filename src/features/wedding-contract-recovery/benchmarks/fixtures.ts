/**
 * Anonymized synthetic fixtures for wedding-contract-recovery model benchmark.
 * No real PII.
 */

export type FixtureExpectation = {
  partner1FirstName?: string | null
  partner1LastName?: string | null
  partner1PhoneContains?: string | null
  partner2FirstName?: string | null
  /** Substrings that must NOT appear in client fields (provider leakage). */
  forbiddenClientSubstrings: string[]
  signingDate: string
  weddingDate: string
  depositDueDate?: string | null
  ceremonyLocationContains?: string | null
  receptionLocationContains?: string | null
  totalValue: number
  depositAmount: number
  remainingAmount?: number | null
  currencyContains?: string | null
  packageNameContains: string
  includedItemSubstrings: string[]
  deliveryDeadlineContains?: string | null
  additionalServiceNameContains?: string | null
  /** Bank account digits must not appear in normal display fields. */
  forbiddenBankAccountFragment?: string | null
}

export type BenchmarkFixture = {
  id: string
  label: string
  fileName: string
  plainText: string
  expect: FixtureExpectation
}

export const FIXTURE_A_STANDARD: BenchmarkFixture = {
  id: 'A-standard',
  label: 'Standard DOCX-like contract',
  fileName: 'fixture-a-standard.txt',
  plainText: `
UMOWA O ŚWIADCZENIE USŁUG FOTOGRAFICZNYCH I FILMOWYCH

Zawarta w dniu 11 kwietnia 2026 r. w Krakowie pomiędzy:

Wykonawca: Studio Filmowe Przykład Sp. z o.o., ul. Testowa 1, 30-001 Kraków, tel. 12 345 67 89
a
Zamawiający:
1) Kinga Testowa, zam. ul. Pomorska 12/4, 31-000 Kraków, tel. 530 702 125, e-mail: kinga.test@example.com
2) Adam Przykładowy, zam. ul. Pomorska 12/4, 31-000 Kraków

§1 Przedmiot umowy
Wykonawca zobowiązuje się do realizacji pakietu „Złoty Film” w dniu ślubu 03.06.2028.

Pakiet „Złoty Film” obejmuje:
• Teledysk ślubny o długości około 3 minut
• Film ślubny o długości około 15 minut
• Minimum 600 zdjęć po obróbce
• Galeria internetowa
• Mini sesja w dniu ślubu
• Zapowiedź 10–20 zdjęć do 7 dni od ślubu
• Przekazanie materiałów na pendrivie
• Dwóch operatorów

Czas realizacji reportażu: 10 godzin.
Termin przekazania materiałów: do 90 dni od daty ślubu.

§2 Wynagrodzenie
Całkowite wynagrodzenie wynosi 8.550,00 zł (słownie: osiem tysięcy pięćset pięćdziesiąt złotych).
Zaliczka: 2.000,00 zł płatna w terminie 7 dni od podpisania umowy (do 18.04.2026).
Pozostała kwota 6.550,00 zł płatna do dnia ślubu.

§3 Miejsca
Ceremonia: Kościół św. Testowego, Kraków
Przyjęcie: Sala Weselna Testowa, Kraków
`.trim(),
  expect: {
    partner1FirstName: 'Kinga',
    partner1LastName: 'Testowa',
    partner1PhoneContains: '530',
    partner2FirstName: 'Adam',
    forbiddenClientSubstrings: ['Studio Filmowe', '12 345 67 89', 'Testowa 1'],
    signingDate: '2026-04-11',
    weddingDate: '2028-06-03',
    depositDueDate: '2026-04-18',
    ceremonyLocationContains: 'Kościół',
    receptionLocationContains: 'Sala Weselna',
    totalValue: 8550,
    depositAmount: 2000,
    remainingAmount: 6550,
    currencyContains: 'PLN',
    packageNameContains: 'Złoty Film',
    includedItemSubstrings: ['Teledysk', 'Film ślubny', '600'],
    deliveryDeadlineContains: '90',
  },
}

export const FIXTURE_B_ROLE_SEPARATION: BenchmarkFixture = {
  id: 'B-role-separation',
  label: 'Provider listed before clients with formal roles',
  fileName: 'fixture-b-roles.txt',
  plainText: `
UMOWA

Zawarta dnia 02.03.2026 w Warszawie.

Usługodawca / Zleceniobiorca:
Marcin Hibszer Video Lab, ul. Producencka 9, 00-001 Warszawa, tel. 668 698 892, NIP 1112223344

Usługobiorca / Zamawiający / Para Młoda:
Ewa Klientowa, ul. Klienta 3, 02-200 Warszawa, tel. 501 111 222
oraz
Tomasz Klientowski, ul. Klienta 3, 02-200 Warszawa

Data ślubu: 20.09.2027
Ceremonia: Kościół Przykładowy
Przyjęcie: Hotel Weselny

Pakiet „Srebrny Reportaż”:
- reportaż foto
- film 10 minut
Termin oddania materiałów: 60 dni od ślubu.

Wynagrodzenie całkowite: 7000 PLN.
Zaliczka: 1500 PLN płatna do 09.03.2026.
`.trim(),
  expect: {
    partner1FirstName: 'Ewa',
    partner1LastName: 'Klientowa',
    partner1PhoneContains: '501',
    partner2FirstName: 'Tomasz',
    forbiddenClientSubstrings: [
      'Hibszer',
      'Video Lab',
      'Producencka',
      '668 698 892',
      '1112223344',
    ],
    signingDate: '2026-03-02',
    weddingDate: '2027-09-20',
    depositDueDate: '2026-03-09',
    ceremonyLocationContains: 'Kościół',
    receptionLocationContains: 'Hotel',
    totalValue: 7000,
    depositAmount: 1500,
    remainingAmount: 5500,
    currencyContains: 'PLN',
    packageNameContains: 'Srebrny',
    includedItemSubstrings: ['reportaż', 'film'],
    deliveryDeadlineContains: '60',
  },
}

export const FIXTURE_C_FINANCES: BenchmarkFixture = {
  id: 'C-finances',
  label: 'Financial distinction with bank wording',
  fileName: 'fixture-c-finances.txt',
  plainText: `
UMOWA FOTOGRAFICZNA

Data zawarcia: 15.01.2026
Zamawiający: Anna Nowak, tel. 600 200 300
Data ślubu: 12.07.2027
Ceremonia: Urząd Stanu Cywilnego Test
Przyjęcie: Restauracja Testowa

Pakiet „Basic Photo”:
• zdjęcia z ceremonii
• galeria online

§ Wynagrodzenie
Całkowita wartość umowy: 9 900,00 zł.
Zaliczka / zadatek: 2 500,00 zł płatna do 22.01.2026.
Pozostała kwota: 7 400,00 zł płatna najpóźniej w dniu ślubu.
Płatności należy dokonać przelewem na rachunek bankowy: 12 3456 7890 1234 5678 9012 3456.
Zaliczka nie została jeszcze wpłacona — stanowi wyłącznie zobowiązanie umowne.
Termin przekazania zdjęć: 120 dni od daty ślubu.
`.trim(),
  expect: {
    partner1FirstName: 'Anna',
    partner1LastName: 'Nowak',
    partner1PhoneContains: '600',
    partner2FirstName: null,
    forbiddenClientSubstrings: [],
    signingDate: '2026-01-15',
    weddingDate: '2027-07-12',
    depositDueDate: '2026-01-22',
    ceremonyLocationContains: 'Urząd',
    receptionLocationContains: 'Restauracja',
    totalValue: 9900,
    depositAmount: 2500,
    remainingAmount: 7400,
    currencyContains: 'PLN',
    packageNameContains: 'Basic Photo',
    includedItemSubstrings: ['zdjęcia', 'galeria'],
    deliveryDeadlineContains: '120',
    forbiddenBankAccountFragment: '345678901234567890123456',
  },
}

export const FIXTURE_D_NONSTANDARD_PACKAGE: BenchmarkFixture = {
  id: 'D-nonstandard-package',
  label: 'Non-standard historical package + additional service',
  fileName: 'fixture-d-package.txt',
  plainText: `
UMOWA — pakiet historyczny

Data zawarcia: 2026-02-01
Zamawiający: Anna Klient, tel. 600 100 200
Data ślubu: 15.08.2027
Ceremonia: Kaplica Leśna
Przyjęcie: Dom Weselny Alfa

Zakres usług (pakiet „Custom Drift” — poza aktualnym katalogiem):
1. Reportaż od przygotowań do oczepin
2. Drone highlight 60 sekund (usługa niestandardowa)
3. Album 30x30 na zamówienie klienta
4. Dodatkowy operator tylko na ceremonię

Usługa dodatkowa: Wieczorny aftermovie – 800 PLN.

Wynagrodzenie: 12 000 PLN, zaliczka 3 000 PLN płatna do 08.02.2026.
Termin oddania: do 4 miesięcy od ślubu.
`.trim(),
  expect: {
    partner1FirstName: 'Anna',
    partner1LastName: 'Klient',
    partner1PhoneContains: '600',
    partner2FirstName: null,
    forbiddenClientSubstrings: [],
    signingDate: '2026-02-01',
    weddingDate: '2027-08-15',
    depositDueDate: '2026-02-08',
    ceremonyLocationContains: 'Kaplica',
    receptionLocationContains: 'Dom Weselny',
    totalValue: 12000,
    depositAmount: 3000,
    remainingAmount: 9000,
    currencyContains: 'PLN',
    packageNameContains: 'Custom Drift',
    includedItemSubstrings: ['Reportaż', 'Drone', 'Album', 'operator'],
    deliveryDeadlineContains: 'miesięcy',
    additionalServiceNameContains: 'aftermovie',
  },
}

export const FIXTURE_E_DATES: BenchmarkFixture = {
  id: 'E-dates',
  label: 'Signing / wedding / payment / delivery date separation',
  fileName: 'fixture-e-dates.txt',
  plainText: `
UMOWA O REPORTAŻ ŚLUBNY

Umowę zawarto w dniu 05 maja 2026 roku.
Zamawiający: Piotr Data, tel. 511 222 333
Data uroczystości ślubnej: 18 października 2028.
Ceremonia: Kościół Datowy
Przyjęcie: Sala Datowa

Pakiet „Kalendarz Gold”:
- film i foto

Wartość umowy: 10 000 PLN.
Zaliczka: 3 000 PLN płatna do 12 maja 2026.
Pozostałość płatna do dnia ślubu.
Materiały zostaną przekazane w terminie 75 dni od daty ślubu.
`.trim(),
  expect: {
    partner1FirstName: 'Piotr',
    partner1LastName: 'Data',
    partner1PhoneContains: '511',
    partner2FirstName: null,
    forbiddenClientSubstrings: [],
    signingDate: '2026-05-05',
    weddingDate: '2028-10-18',
    depositDueDate: '2026-05-12',
    ceremonyLocationContains: 'Kościół',
    receptionLocationContains: 'Sala',
    totalValue: 10000,
    depositAmount: 3000,
    remainingAmount: 7000,
    currencyContains: 'PLN',
    packageNameContains: 'Kalendarz',
    includedItemSubstrings: ['film'],
    deliveryDeadlineContains: '75',
  },
}

export const SYNTHETIC_BENCHMARK_FIXTURES: BenchmarkFixture[] = [
  FIXTURE_A_STANDARD,
  FIXTURE_B_ROLE_SEPARATION,
  FIXTURE_C_FINANCES,
  FIXTURE_D_NONSTANDARD_PACKAGE,
  FIXTURE_E_DATES,
]
