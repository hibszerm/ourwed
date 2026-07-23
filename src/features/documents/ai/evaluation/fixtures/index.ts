/**
 * Golden benchmark fixtures.
 * expected.* = what is REQUIRED to regenerate this contract template.
 * sourceText = synthetic but realistic template excerpts (no PII).
 */

import type { BenchmarkFixture } from '../types'

export const BENCHMARK_FIXTURES: BenchmarkFixture[] = [
  {
    id: 'contract-001',
    name: 'Wedding videography contract',
    description:
      'Typical PL videography agreement: couple identity, day locations, film deliverables, company identity.',
    sourceText: `
UMOWA O ŚWIADCZENIE USŁUG WIDEOFILMOWANIA ŚLUBU

Zawarta pomiędzy:

Usługodawcą: [NAZWA FIRMY], NIP [NIP], REGON [REGON], adres [ADRES FIRMY],
tel. [TELEFON FIRMY], e-mail [EMAIL FIRMY], reprezentowaną przez [WŁAŚCICIEL],
konto bankowe [NUMER KONTA]

a

Zamawiającymi:
Panna Młoda: [IMIĘ] [NAZWISKO], tel. [TELEFON], e-mail [EMAIL]
Pan Młody: [IMIĘ] [NAZWISKO], tel. [TELEFON], e-mail [EMAIL]

§1 Przedmiot
Usługodawca zobowiązuje się do wideofilmowania uroczystości ślubnej w dniu [DATA ŚLUBU].

Miejsce przygotowań: [MIEJSCE PRZYGOTOWAŃ]
Miejsce ceremonii: [MIEJSCE CEREMONII]
Miejsce wesela: [MIEJSCE WESELA]
Godzina ceremonii: [GODZINA]
Harmonogram dnia: [HARMONOGRAM]

§2 Pakiet
Wybrany pakiet: [NAZWA PAKIETU]
Cena pakietu: [CENA]
Zadatek: [ZADATEK]
Liczba godzin pracy: [GODZINY PRACY]
Termin dostawy filmu: [TERMIN DOSTAWY]
Długość filmu: [DŁUGOŚĆ FILMU]
Liczba wideografów: [LICZBA WIDEOGRAFÓW]
Dron: [DRON W PAKIECIE]
Czas postprodukcji: [CZAS POSTPRODUKCJI]

§3 Kontakt organizacyjny
Wedding planner: [IMIĘ PLANNERA], tel. [TELEFON PLANNERA], e-mail [EMAIL PLANNERA]

§4 Zgody
Zamawiający wyrażają zgodę marketingową: [ZGODA MARKETINGOWA]
Uwagi dodatkowe: [UWAGI]

§5 Postanowienia końcowe
W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego.
Spory rozstrzyga sąd właściwy dla siedziby Usługodawcy.
RODO: administrator danych jest Usługodawca. Siła wyższa zwalnia z odpowiedzialności.
`.trim(),
    expected: {
      couple: [
        'bride_first_name',
        'bride_last_name',
        'bride_phone',
        'bride_email',
        'groom_first_name',
        'groom_last_name',
        'groom_phone',
        'groom_email',
        'wedding_date',
        'ceremony_time',
        'wedding_schedule',
        'preparation_location',
        'ceremony_location',
        'reception_location',
        'package',
        'wedding_planner_name',
        'wedding_planner_phone',
        'wedding_planner_email',
        'marketing_consent',
        'additional_notes',
      ],
      company: [
        'company_name',
        'company_owner',
        'company_nip',
        'company_regon',
        'company_address',
        'company_phone',
        'company_email',
        'company_bank_account',
      ],
      package: [
        'package_name',
        'package_price',
        'deposit_amount',
        'working_hours',
        'delivery_time',
        'film_duration',
        'videographers_count',
        'drone_included',
        'postproduction_duration',
      ],
      staticOnly: ['gdpr_clause', 'force_majeure', 'court_jurisdiction'],
    },
  },
  {
    id: 'contract-002',
    name: 'Wedding photography contract',
    description:
      'Photography-focused template: couple + locations + photo package slots + studio identity.',
    sourceText: `
CONTRACT FOR WEDDING PHOTOGRAPHY SERVICES

Between Studio [COMPANY NAME], VAT [VAT ID], address [COMPANY ADDRESS],
phone [COMPANY PHONE], email [COMPANY EMAIL], owner [OWNER],
bank account [BANK ACCOUNT]

and the Couple:
Bride: [FIRST NAME] [LAST NAME], phone [PHONE], email [EMAIL]
Groom: [FIRST NAME] [LAST NAME], phone [PHONE], email [EMAIL]

Wedding date: [WEDDING DATE]
Ceremony time: [CEREMONY TIME]
Preparation location: [PREP LOCATION]
Ceremony location: [CEREMONY LOCATION]
Reception location: [RECEPTION LOCATION]
Day schedule / timeline: [SCHEDULE]

Selected package: [PACKAGE NAME]
Package price: [PRICE]
Deposit: [DEPOSIT]
Photographers: [PHOTOGRAPHERS COUNT]
Working hours: [WORKING HOURS]
Overtime price: [OVERTIME]
Delivery time for gallery: [DELIVERY TIME]
Album included: [ALBUM]
Online gallery: [ONLINE GALLERY]
Engagement session: [ENGAGEMENT SESSION]

Special requests / notes: [NOTES]

Legal: GDPR, copyright, cancellation and force majeure clauses apply as standard.
`.trim(),
    expected: {
      couple: [
        'bride_first_name',
        'bride_last_name',
        'bride_phone',
        'bride_email',
        'groom_first_name',
        'groom_last_name',
        'groom_phone',
        'groom_email',
        'wedding_date',
        'ceremony_time',
        'wedding_schedule',
        'preparation_location',
        'ceremony_location',
        'reception_location',
        'package',
        'additional_notes',
      ],
      company: [
        'company_name',
        'company_owner',
        'company_vat',
        'company_address',
        'company_phone',
        'company_email',
        'company_bank_account',
      ],
      package: [
        'package_name',
        'package_price',
        'deposit_amount',
        'photographers_count',
        'working_hours',
        'overtime_price',
        'delivery_time',
        'album_included',
        'online_gallery',
        'engagement_session',
      ],
      staticOnly: ['gdpr_clause', 'copyright', 'cancellation', 'force_majeure'],
    },
  },
  {
    id: 'contract-003',
    name: 'Minimal couple + package contract',
    description:
      'Short agreement — fewer company fields, core couple + package only.',
    sourceText: `
UMOWA FOTOGRAFICZNA

Fotograf: [NAZWA FIRMY], NIP [NIP], [ADRES], tel. [TELEFON FIRMY]

Para:
Panna Młoda [IMIĘ] [NAZWISKO]
Pan Młody [IMIĘ] [NAZWISKO]
Data ślubu: [DATA]
Ceremonia: [MIEJSCE CEREMONII]
Wesele: [MIEJSCE WESELA]

Pakiet: [NAZWA PAKIETU], cena [CENA], zadatek [ZADATEK],
godziny pracy [GODZINY], termin galerii [TERMIN DOSTAWY]

Pozostałe postanowienia prawne bez zmian.
`.trim(),
    expected: {
      couple: [
        'bride_first_name',
        'bride_last_name',
        'groom_first_name',
        'groom_last_name',
        'wedding_date',
        'ceremony_location',
        'reception_location',
        'package',
      ],
      company: ['company_name', 'company_nip', 'company_address', 'company_phone'],
      package: [
        'package_name',
        'package_price',
        'deposit_amount',
        'working_hours',
        'delivery_time',
      ],
      staticOnly: ['legal_boilerplate'],
    },
  },
]

export function getBenchmarkFixture(id: string): BenchmarkFixture | undefined {
  return BENCHMARK_FIXTURES.find((f) => f.id === id)
}
