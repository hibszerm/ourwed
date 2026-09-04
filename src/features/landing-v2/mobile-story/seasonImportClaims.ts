/**
 * Landing V2 Season Import — verified public copy + demo spreadsheet data.
 * Product visualization only — not a live import feature.
 */

export const LV2_SEASON_IMPORT_COPY = {
  eyebrow: 'Import sezonu',
  headlineLine1: 'Masz już zaplanowany sezon?',
  headlineLine2: 'Przenieś go do OurWed w kilka sekund.',
  support:
    'Zaimportuj zlecenia z arkusza, dołącz umowy i przygotuj je do pracy w OurWed — bez przepisywania wszystkiego od początku.',
} as const

export const LV2_SEASON_IMPORT_STEPS = [
  'Import arkusza',
  'Dołączenie umów',
  'Weryfikacja danych',
] as const

export const LV2_SEASON_IMPORT_SHEET = {
  label: 'Arkusz',
  filename: 'zlecenia_sezon_2027.xlsx',
  status: '24 wiersze gotowe do importu',
  columns: ['Para', 'Data', 'Pakiet', 'Wartość'] as const,
} as const

export const LV2_SEASON_IMPORT_ROWS = [
  {
    id: 'imp-1',
    couple: 'Julia i Adrian',
    date: '12.06.2027',
    packageName: 'Film + Foto',
    value: '12 900 zł',
    selected: true,
  },
  {
    id: 'imp-2',
    couple: 'Marta i Jakub',
    date: '26.06.2027',
    packageName: 'Foto',
    value: '7 800 zł',
    selected: false,
  },
  {
    id: 'imp-3',
    couple: 'Natalia i Tomasz',
    date: '03.07.2027',
    packageName: 'Film',
    value: '8 900 zł',
    selected: false,
  },
  {
    id: 'imp-4',
    couple: 'Zuzanna i Patryk',
    date: '17.07.2027',
    packageName: 'Film + Foto',
    value: '13 500 zł',
    selected: false,
  },
  {
    id: 'imp-5',
    couple: 'Anna i Michał',
    date: '24.07.2027',
    packageName: 'Foto',
    value: '6 500 zł',
    selected: false,
  },
] as const

export const LV2_SEASON_IMPORT_ATTACHMENT = {
  mark: 'PDF',
  filename: 'Umowa_Julia_Adrian.pdf',
  note: 'Dołączona do wiersza Julia i Adrian',
} as const

export const LV2_SEASON_IMPORT_ASSIGNMENT = {
  eyebrow: 'Zlecenie gotowe do zatwierdzenia',
  couple: 'Julia i Adrian',
  fields: [
    { label: 'Data', value: '12 czerwca 2027' },
    { label: 'Pakiet', value: 'Film + Foto' },
    { label: 'Wartość', value: '12 900 zł' },
    { label: 'Zaliczka', value: '2 500 zł' },
    { label: 'Lokalizacja', value: 'Folwark Wąsowo' },
    { label: 'Dokument', value: 'Umowa_Julia_Adrian.pdf' },
  ] as const,
  status: 'Gotowe do zatwierdzenia',
  cta: 'Sprawdź dane',
} as const
