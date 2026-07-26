/**
 * Sanitized extracted-document regression fixture.
 *
 * Structure, paragraph indices, list markers, and relevant run boundaries mirror
 * 2026.06.20_Zinnar_film_signed.docx. Personal values are synthetic.
 */

import type { DocumentTextAnchor } from '@/features/ai-contract-lab/aiContractLabTypes'

type Run = NonNullable<DocumentTextAnchor['runSegments']>[number]

function runs(parts: Array<{ text: string; bold?: boolean }>): Run[] {
  let offset = 0
  return parts.map((part, runIndex) => {
    const start = offset
    offset += part.text.length
    return {
      runIndex,
      start,
      end: offset,
      text: part.text,
      bold: part.bold,
    }
  })
}

function anchor(
  paragraphIndex: number,
  text: string,
  options: {
    before?: string
    after?: string
    listMarker?: boolean
    runSegments?: Run[]
  } = {},
): DocumentTextAnchor {
  return {
    anchorId: `body:p${paragraphIndex}`,
    container: 'body',
    paragraphIndex,
    runStart: 0,
    runEnd: text.length,
    text,
    contextBefore: options.before ?? '',
    contextAfter: options.after ?? '',
    listMarker: options.listMarker ?? false,
    runSegments: options.runSegments ?? runs([{ text }]),
  }
}

export const PRIMEPHOTO_CIVIL_PARTNERSHIP_FILM_ANCHORS: DocumentTextAnchor[] = [
  anchor(6, 'zawarta w dniu 17.06.2026 r. w Jaworznie pomiędzy:'),
  anchor(
    8,
    'Dominikiem Nowakiem, PESEL: 80010112345, e-mail: dominik@example.test, tel. 500 100 200',
    {
      after:
        'oraz Anną Kowalską, PESEL: 79020254321, e-mail: anna@example.test, tel. 500 100 201',
      runSegments: runs([
        { text: 'Dominikiem Nowakiem', bold: true },
        { text: ', PESEL: ' },
        { text: '80010112345' },
        { text: ', e-mail: ', bold: true },
        { text: 'dominik@example.test', bold: true },
        { text: ', tel. ' },
        { text: '500 100 200', bold: true },
      ]),
    },
  ),
  anchor(
    9,
    'oraz Anną Kowalską, PESEL: 79020254321, e-mail: anna@example.test, tel. 500 100 201',
    {
      before:
        'Dominikiem Nowakiem, PESEL: 80010112345, e-mail: dominik@example.test, tel. 500 100 200',
      runSegments: runs([
        { text: 'oraz ' },
        { text: 'Anną Kowalską', bold: true },
        { text: ', PESEL: ' },
        { text: '79020254321' },
        { text: ', e-mail: ', bold: true },
        { text: 'anna@example.test', bold: true },
        { text: ', tel. ' },
        { text: '500 100 201', bold: true },
      ]),
    },
  ),
  anchor(
    11,
    'prowadzącymi działalność gospodarczą w formie spółki cywilnej pod firmą PRIMEPHOTO s.c. Dominik Nowak, Anna Kowalska z siedzibą w Jaworznie, przy ul. Grunwaldzkiej 83, 43-600 Jaworzno,',
    {
      after: 'NIP: 6321999826, Regon: 241889811,',
      runSegments: runs([
        {
          text: 'prowadzącymi działalność gospodarczą w formie spółki cywilnej pod firmą ',
        },
        {
          text: 'PRIMEPHOTO s.c. Dominik Nowak, Anna Kowalska ',
          bold: true,
        },
        {
          text: 'z siedzibą w Jaworznie, przy ul. Grunwaldzkiej 83, 43-600 Jaworzno,',
        },
      ]),
    },
  ),
  anchor(12, 'NIP: 6321999826, Regon: 241889811,', {
    before:
      'prowadzącymi działalność gospodarczą w formie spółki cywilnej pod firmą PRIMEPHOTO s.c. Dominik Nowak, Anna Kowalska',
  }),
  anchor(14, 'zwanymi dalej "Wykonawcą", a Parą Młodą:'),
  anchor(
    15,
    'www.primephoto.pl',
    {
      runSegments: runs([{ text: 'www.primephoto.pl' }]),
    },
  ),
  anchor(16, 'Panna Młoda: Katarzyna Testowa'),
  anchor(
    17,
    'adres zamieszkania: ul. Świętego Tomasza 35/2A, 31-027 Kraków',
  ),
  anchor(18, 'PESEL: 90030313269'),
  // Real DOCX run fragmentation: decorative ellipsis between digits/letters.
  anchor(
    19,
    'telefon: …6…0…0 …82…8…7…97, e-mail: …ka…ta…rz…y…na…@…d…ob…ro…w…o…ls…ka….p…l',
    {
      runSegments: runs([
        { text: 'telefon:' },
        { text: ' ' },
        { text: '…', bold: true },
        { text: '6' },
        { text: '…', bold: true },
        { text: '0' },
        { text: '…', bold: true },
        { text: '0' },
        { text: ' ' },
        { text: '…', bold: true },
        { text: '8' },
        { text: '2' },
        { text: '…', bold: true },
        { text: '8' },
        { text: '…', bold: true },
        { text: '7' },
        { text: '…', bold: true },
        { text: '9' },
        { text: '7' },
        { text: ', ', bold: true },
        { text: 'e-mail:' },
        { text: ' ' },
        { text: '…', bold: true },
        { text: 'k' },
        { text: 'a' },
        { text: '…', bold: true },
        { text: 't' },
        { text: 'a' },
        { text: '…', bold: true },
        { text: 'r' },
        { text: 'z' },
        { text: '…', bold: true },
        { text: 'y' },
        { text: '…', bold: true },
        { text: 'n' },
        { text: 'a' },
        { text: '…', bold: true },
        { text: '@' },
        { text: '…', bold: true },
        { text: 'd' },
        { text: '…', bold: true },
        { text: 'o' },
        { text: 'b' },
        { text: '…', bold: true },
        { text: 'r' },
        { text: 'o' },
        { text: '…', bold: true },
        { text: 'w' },
        { text: '…', bold: true },
        { text: 'o' },
        { text: '…', bold: true },
        { text: 'l' },
        { text: 's' },
        { text: '…', bold: true },
        { text: 'k' },
        { text: 'a' },
        { text: '…', bold: true },
        { text: '.' },
        { text: 'p' },
        { text: '…', bold: true },
        { text: 'l' },
      ]),
    },
  ),
  anchor(21, '2.Pan Młody: Tomasz Testowy'),
  anchor(
    22,
    'adres zamieszkania: ul. Świętego Tomasza 35/2A, 31-027 Kraków',
  ),
  anchor(24, 'Zwanymi dalej "Zamawiającymi".'),
  anchor(
    38,
    '2.Miejscami, w których Wykonawca będzie dokumentował przebieg uroczystości są: przygotowania, ceremonia, przyjęcie: ZINNAR CASTLE Kraków',
    {
      runSegments: runs([
        { text: '2.' },
        {
          text: 'Miejscami, w których Wykonawca będzie dokumentował przebieg uroczystości są: przygotowania, ceremonia, przyjęcie: ',
        },
        { text: 'ZINNAR CASTLE ', bold: true },
        { text: 'Kraków' },
      ]),
    },
  ),
  anchor(
    46,
    '- zmontowany FILM w postaci pliku cyfrowego o czasie trwania do 20 minut,',
    {
      runSegments: runs([
        { text: '- zmontowany ' },
        { text: 'FILM ', bold: true },
        { text: 'w postaci pliku cyfrowego o czasie trwania ' },
        { text: 'do 20 minut,', bold: true },
      ]),
    },
  ),
  anchor(
    48,
    'Zmontowany film zostanie przekazany Zamawiającym w terminie do 180 dni roboczych od dnia ślubu.',
    { listMarker: true },
  ),
  anchor(94, 'Wynagrodzenie'),
  anchor(
    96,
    'Ustalone przez strony Wynagrodzenia za wykonanie przedmiotów umowy opisanych w § 1 oraz udzielenie licencji na korzystanie z filmu wynosi: 9 000 zł',
    {
      listMarker: true,
      runSegments: runs([
        {
          text: 'Ustalone przez strony Wynagrodzenia za wykonanie przedmiotów umowy opisanych w § 1 oraz udzielenie licencji na korzystanie z filmu wynosi: ',
        },
        { text: '9 000 zł', bold: true },
      ]),
    },
  ),
  anchor(98, 'Wynagrodzenie płatne jest w trzech ratach:'),
  anchor(
    99,
    'pierwsza rata w wysokości 6 300 zł płatna gotówką w dniu wesela',
    { listMarker: true },
  ),
  anchor(
    100,
    'trzecia rata w wysokości 2 700 zł płatna przy odebraniu gotowego przedmiotu umowy.',
    { listMarker: true },
  ),
  anchor(
    102,
    'Powyższe płatności powinny zostać zapłacone gotówką lub przelewem na konto:',
  ),
  anchor(
    103,
    'ING Bank Śląski 72 1050 1302 1000 0092 3121 6509',
    {
      before:
        'Powyższe płatności powinny zostać zapłacone gotówką lub przelewem na konto:',
      runSegments: runs([
        { text: 'ING Bank Śląski ' },
        { text: '72 1050 1302 1000 0092 3121 6509' },
      ]),
    },
  ),
  anchor(
    140,
    'Odstąpienie od umowy w późniejszym terminie wiąże się z zapłatą kary umownej w wysokości 50% ustalonego wynagrodzenia, tj. 4 500 zł.',
    { listMarker: true },
  ),
  anchor(153, 'Dodatkowe ustalenia / uwagi:'),
  anchor(
    155,
    'Liczba osób wykonujących zlecenie w dniu ślubu: 2 operatorów Czas pracy - 12:00 - 23:00',
    {
      runSegments: runs([
        { text: 'Liczba osób wykonujących zlecenie w dniu ślubu: ' },
        { text: '2 ' },
        { text: 'operatorów Czas pracy - 12:00 - 23:00', bold: true },
      ]),
    },
  ),
]

