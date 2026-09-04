/**
 * Landing V2 lifecycle narrative — Karolina & Jan.
 * Marketing-local only. No DB. Distinct from Julia & Maksymilian.
 */

export const karolinaJan = {
  couple: {
    shortName: 'Karolina & Jan',
    displayName: 'Karolina i Jan',
    brideFirst: 'Karolina',
    groomFirst: 'Jan',
    bride: 'Karolina Nowak',
    groom: 'Jan Kowalski',
  },
  wedding: {
    isoDate: '2027-08-14',
    longDate: '14 sierpnia 2027',
    shortDate: '14.08.2027',
    day: '14',
    monthShort: 'SIE',
    year: '2027',
    city: 'Warszawa',
  },
  package: {
    name: 'Reportaż Signature',
  },
  commercial: {
    contractValue: '10 900 zł',
    deposit: '2 500 zł',
  },
  places: {
    preparation: {
      label: 'Przygotowania',
      name: 'Hotel Bristol',
      city: 'Warszawa',
      line: 'Hotel Bristol, Warszawa',
    },
    ceremony: {
      label: 'Ceremonia',
      name: 'Kościół Świętego Krzyża',
      city: 'Warszawa',
      line: 'Kościół Świętego Krzyża, Warszawa',
    },
    reception: {
      label: 'Przyjęcie',
      name: 'The Bridge',
      city: 'Warszawa',
      line: 'The Bridge Warszawa',
    },
  },
  contact: {
    email: 'karolina@example.com',
    phone: '+48 600 123 456',
  },
  questionnaire: {
    linkSlug: 'karolina-jan',
    linkHost: 'ourwed.pl/a',
    get publicPath() {
      return `${this.linkHost}/${this.linkSlug}`
    },
    contractQuestionnaireUrl: 'ourwed.pl/a/karolina-jan',
    eyebrow: 'Ankieta do umowy',
  },
  contract: {
    brand: 'OURWED',
    titleLine1: 'Umowa o wykonanie',
    titleLine2: 'reportażu ślubnego',
    packageLabel: 'Pakiet',
    placesLabel: 'Miejsce realizacji',
    feeLabel: 'Wynagrodzenie',
    depositLabel: 'Zadatek',
    signatureLabel: 'Podpis klientów',
    signedLabel: 'Podpisano',
    signedStamp: 'Podpisano',
    /** Contract signed well before the wedding. */
    signedDate: '27.08.2026',
    legalLines: [
      'Strony ustalają zakres usługi zgodnie z wybranym pakietem oraz danymi zlecenia.',
      'Wykonawca zobowiązuje się do realizacji reportażu w terminie i miejscach wskazanych w umowie.',
      'Zamawiający potwierdza poprawność przekazanych danych i akceptuje warunki płatności.',
    ],
  },
  copy: {
    headlineLine1: 'Nowe zlecenie zaczyna się',
    headlineLine2: 'od jednego linku.',
    formBrand: 'OURWED',
    formTitle: 'Dane do umowy',
    sectionAbout: 'O was',
    sectionWedding: 'Ślub',
    statusComplete: 'Dane kompletne',
    statusReserved: 'Termin zarezerwowany',
    statusSigned: 'Umowa podpisana',
    depositPaid: 'Opłacono',
    supportLine1: 'Odpowiedzi są już na swoim miejscu.',
    supportLine2:
      'Nie przepisujesz niczego ręcznie. Umowę generujesz jednym kliknięciem.',
    supportContract1: 'Umowa jest gotowa.',
    supportContract2: 'Bez kopiowania danych i poprawiania dokumentów.',
    supportSigned1: 'Umowa podpisana.',
    supportSigned2: 'Status wraca do zlecenia automatycznie.',
    supportFinal1: 'Rezerwacja domknięta.',
    supportFinal2: 'Umowa podpisana. Zadatek opłacony.',
    formDateLabel: 'Data ślubu',
  },
} as const

export type KarolinaJanNarrative = typeof karolinaJan
