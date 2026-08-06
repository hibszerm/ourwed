/** Demo rows for landing Import section — fictional season spreadsheet. */
export const IMPORT_SPREADSHEET_ROWS = [
  {
    id: 'imp-1',
    couple: 'Julia i Adrian',
    date: '12.06.2027',
    packageName: 'Film + Foto',
    value: '12 900 zł',
    highlight: true,
  },
  {
    id: 'imp-2',
    couple: 'Marta i Jakub',
    date: '26.06.2027',
    packageName: 'Foto',
    value: '7 800 zł',
    highlight: false,
  },
  {
    id: 'imp-3',
    couple: 'Natalia i Tomasz',
    date: '03.07.2027',
    packageName: 'Film',
    value: '8 900 zł',
    highlight: false,
  },
  {
    id: 'imp-4',
    couple: 'Zuzanna i Patryk',
    date: '17.07.2027',
    packageName: 'Film + Foto',
    value: '13 500 zł',
    highlight: false,
  },
] as const

export const IMPORT_PREPARED = {
  couple: 'Julia i Adrian',
  date: '12 czerwca 2027',
  packageName: 'Film + Foto',
  value: '12 900 zł',
  deposit: '2 500 zł',
  location: 'Folwark Wąsowo',
  document: 'Umowa_Julia_Adrian.pdf',
} as const

export const IMPORT_STEPS = [
  'Import arkusza',
  'Dołączenie umów',
  'Weryfikacja danych',
] as const
