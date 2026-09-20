/**
 * CG7 — independent unknown-studio contract families (fixture builders ONLY).
 * Completely separate from the generator under test. No hidden metadata hints.
 */

import JSZip from 'jszip'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type UnknownStudioId =
  | 'U01'
  | 'U02'
  | 'U03'
  | 'U04'
  | 'U05'
  | 'U06'
  | 'U07'
  | 'U08'
  | 'U09'
  | 'U10'

function esc(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function p(text: string, opts?: { bold?: boolean }): string {
  const t = esc(text)
  if (opts?.bold) {
    return `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
  }
  return `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
}

function numP(text: string, numId = '1', ilvl = '0'): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`
}

function table(rows: string[][]): string {
  const tr = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map(
            (c) =>
              `<w:tc><w:p><w:r><w:t xml:space="preserve">${esc(c)}</w:t></w:r></w:p></w:tc>`,
          )
          .join('')}</w:tr>`,
    )
    .join('')
  return `<w:tbl>${tr}</w:tbl>`
}

async function pack(body: string): Promise<ArrayBuffer> {
  const numbering = `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:start w:val="1"/></w:lvl>
  <w:lvl w:ilvl="1"><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/><w:start w:val="1"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`,
  )
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  const word = zip.folder('word')!
  word.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${body}<w:sectPr/></w:body>
</w:document>`,
  )
  word.file('numbering.xml', numbering)
  word.folder('_rels')!.file(
    'document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`,
  )
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

const LEGAL_TAIL_COMMON = (provider: string) => [
  p(
    `W przypadku rozwiązania Umowy z przyczyn leżących po stronie Zamawiającego, ${provider} ma prawo zatrzymać otrzymaną wpłatę wstępną.`,
  ),
  p(
    `Zamawiający wyraża zgodę na publikację wybranych ujęć w portfolio ${provider}, na stronie internetowej oraz w mediach społecznościowych, o ile nie zgłosi sprzeciwu na piśmie przed przekazaniem materiałów.`,
  ),
  p(
    `Prawa autorskie do utworów powstałych w ramach Umowy przysługują ${provider}. Zamawiający otrzymuje niewyłączną licencję na prywatne korzystanie z materiałów.`,
  ),
  p(
    `${provider} nie wyraża zgody na ingerencję w przekazany materiał zmieniającą jego charakter artystyczny bez uzgodnienia.`,
  ),
  p(
    'Zamawiający oświadcza, że zapoznał się z portfolio i akceptuje styl realizacji oraz sposób obróbki cyfrowej.',
  ),
  p(
    'Zamawiający wyraża zgodę na przetwarzanie danych osobowych w celu realizacji Umowy zgodnie z obowiązującymi przepisami o ochronie danych osobowych.',
  ),
  p(
    'Wszelkie zmiany Umowy wymagają formy dokumentowej pod rygorem nieważności.',
  ),
  p(
    'Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron.',
  ),
  p('………………………………                    ………………………………'),
  p('Zamawiający                                      Wykonawca'),
]

/** U01 — classic filmmaker, numbered §§, one client, no tables */
function bodyU01(): string {
  return [
    p('UMOWA O DZIEŁO — REALIZACJA FILMU ŚLUBNEGO', { bold: true }),
    p(
      'zawarta w dniu 12.03.2026 r. w Poznaniu, pomiędzy:',
    ),
    p(
      'Katarzyną Przykładową, zam. ul. Lipowa 3, 60-001 Poznań, tel. 500 111 222, zwaną dalej „Zamawiającym”,',
    ),
    p('a'),
    p(
      'Studio Klatka Filmowa Anna Nowak, NIP 7790001111, z siedzibą ul. Garbary 10, 61-001 Poznań, zwanym dalej „Filmowcem”.',
    ),
    p('§ 1 Przedmiot Umowy', { bold: true }),
    p(
      '1. Przedmiotem Umowy jest wykonanie teledysku i filmu ślubnego z wydarzeń odbywających się w dniu 14.08.2027 r., obejmujących:',
    ),
    numP('Przygotowania — adres wskazany przez Zamawiającego;'),
    numP('Ceremonię ślubu — lokalizacja ustalona w aneksie lub korespondencji;'),
    numP('Przyjęcie weselne — lokalizacja ustalona w aneksie lub korespondencji.'),
    p(
      '2. Filmowiec wykonuje przedmiot Umowy pojedynczo, tj. rejestracja jest prowadzona przez jednego operatora.',
    ),
    p('§ 2 Pakiet', { bold: true }),
    p('Zamawiający wybiera Pakiet „Video Classic”, który obejmuje:'),
    numP('teledysk ślubny o długości ok. 3–4 minut;'),
    numP('film dokumentalny o długości ok. 20–30 minut;'),
    numP('kolorystykę i montaż dźwięku;'),
    numP('przekazanie plików drogą elektroniczną.'),
    p(
      '3. Filmowiec przekaże materiały w terminie 4 miesięcy od daty wydarzeń, o których mowa w § 1.',
    ),
    p('§ 3 Wynagrodzenie i płatności', { bold: true }),
    p(
      '1. Z tytułu wykonania Umowy Zamawiający zobowiązuje się zapłacić Filmowcowi wynagrodzenie w wysokości 9 800 zł (słownie: dziewięć tysięcy osiemset złotych) brutto.',
    ),
    p(
      '2. Zadatek w wysokości 2 000 zł (słownie: dwa tysiące złotych) Zamawiający wpłaca w terminie 7 dni od zawarcia Umowy na rachunek Filmowca: 11 2222 3333 4444 5555 6666 7777.',
    ),
    p(
      '3. Pozostała część wynagrodzenia, tj. 7 800 zł (słownie: siedem tysięcy osiemset złotych), płatna jest najpóźniej w dniu wesela przelewem na ten sam rachunek.',
    ),
    p(
      '4. Każda dodatkowa godzina pracy powyżej 10 godzin w dniu ślubu kosztuje 450 zł.',
    ),
    p('§ 4 Postanowienia końcowe', { bold: true }),
    ...LEGAL_TAIL_COMMON('Filmowiec'),
  ].join('')
}

/** U02 — modern photographer, bullets, two clients, explicit extras */
function bodyU02(): string {
  return [
    p('Umowa współpracy fotograficznej', { bold: true }),
    p('Data podpisania: 05.02.2026'),
    p('STRONY', { bold: true }),
    p(
      'Klientami są: Marta Demo oraz Tomasz Demo, zam. ul. Kwiatowa 8, 30-001 Kraków.',
    ),
    p(
      'Wykonawcą jest Atelier Światło — Piotr Jasny, NIP 6750002222, Kraków.',
    ),
    p('ZAKRES', { bold: true }),
    p(
      'Umowa dotyczy reportażu fotograficznego z dnia ślubu 22.05.2027. Zakres obejmuje miejsce szykowania się, miejsce ceremonii oraz salę weselną.',
    ),
    p('LOKALIZACJE', { bold: true }),
    p('miejsce szykowania się: ul. Przykładowa 1, Kraków'),
    p('miejsce ceremonii: Kościół / USC wskazany przez Klientów'),
    p('sala weselna: obiekt wskazany przez Klientów'),
    p('CO OBEJMUJE PAKIET', { bold: true }),
    p('Pakiet „Photo Soft”:'),
    p('• minimum 500 zdjęć po obróbce'),
    p('• galeria online'),
    p('• mini sesja w dniu ślubu'),
    p('• zapowiedź 15–20 klatek w 7 dni'),
    p('DOSTAWA', { bold: true }),
    p(
      'Pełna galeria zostanie udostępniona w ciągu 10 tygodni od daty ślubu. Klient otrzymuje dostęp do pobrania plików JPG.',
    ),
    p('CENA USŁUGI I PŁATNOŚCI', { bold: true }),
    p(
      'Cena usługi wynosi 7 200 zł (słownie: siedem tysięcy dwieście złotych).',
    ),
    p(
      'Opłata rezerwacyjna: 1 500 zł — płatna przy rezerwacji terminu na konto: 22 1111 2222 3333 4444 5555 6666.',
    ),
    p(
      'Saldo: 5 700 zł — płatne najpóźniej 14 dni przed ślubem.',
    ),
    p('USŁUGI OPCJONALNE', { bold: true }),
    p(
      'Klient może dokupić usługi opcjonalne. Aktualnie w ofercie: sesja narzeczeńska, drugi fotograf, album drukowany. Lista wybranych usług opcjonalnych zostanie dopisana poniżej, jeżeli Klient je wybierze:',
    ),
    p('Usługi dodatkowe:'),
    p('(brak wybranych na etapie wzoru)'),
    p('PRAWA I PUBLIKACJA', { bold: true }),
    p(
      'Prawa autorskie pozostają u Wykonawcy. Klient otrzymuje licencję prywatną. Publikacja w portfolio wymaga braku sprzeciwu Klienta.',
    ),
    p('REZYGNACJA', { bold: true }),
    p(
      'W razie rezygnacji Klienta opłata rezerwacyjna może zostać zatrzymana jako rekompensata kosztów przygotowania.',
    ),
    p('RODO', { bold: true }),
    p(
      'Dane osobowe przetwarzamy wyłącznie w celu realizacji umowy i rozliczeń.',
    ),
    p('……………………   ……………………   ……………………'),
    p('Marta Demo   Tomasz Demo   Piotr Jasny'),
  ].join('')
}

/** U03 — photo+video duo, long clauses, distant extras */
function bodyU03(): string {
  return [
    p('Umowa o świadczenie usług fotograficznych i filmowych', { bold: true }),
    p('zawarta w Gdańsku dnia 18.01.2026 r.'),
    p(
      'Pomiędzy: Olgą Próbą i Michałem Próbą, zam. ul. Morska 12, 80-001 Gdańsk, zwanymi „Parą Młodą”,',
    ),
    p('a'),
    p(
      'Duo Obraz & Dźwięk — fotograf: Ewa Kadr, filmowiec: Adam Klatka, NIP 5830003333, Gdańsk.',
    ),
    p('§1', { bold: true }),
    p(
      '1. Łączna wartość Umowy obejmuje realizację zdjęć i filmu z dnia 03.07.2027 r. w następujących lokalizacjach: miejsce przygotowań Panny Młodej, miejsce przygotowań Pana Młodego, miejsce uroczystości oraz lokal weselny.',
    ),
    p(
      '2. Miejsce przygotowań Panny Młodej: adres wskazany w kwestionariuszu. Miejsce przygotowań Pana Młodego: adres wskazany w kwestionariuszu. Miejsce uroczystości i lokal weselny: zgodnie z danymi przekazanymi Wykonawcom najpóźniej 30 dni przed wydarzeniem.',
    ),
    p(
      '3. Fotograf i Filmowiec pracują równolegle. Każdy odpowiada za swój zakres materiałowy.',
    ),
    p('§2 Zakres pakietu Photo+Video Premium', { bold: true }),
    p('Pakiet obejmuje:'),
    numP('reportaż fotograficzny minimum 700 zdjęć;'),
    numP('teledysk ok. 4 minut oraz film ok. 40 minut;'),
    numP('ujęcia z drona zależne od pogody i zezwoleń;'),
    numP('dostawę w terminie do 5 miesięcy od daty wesela.'),
    p(
      '4. Czas pracy zespołu w dniu ślubu wynosi maksymalnie 12 godzin. Każda dodatkowa godzina: 800 zł.',
    ),
    p('§3 Rozliczenie', { bold: true }),
    p(
      'Łączna wartość Umowy wynosi 18 500 zł (słownie: osiemnaście tysięcy pięćset złotych) brutto.',
    ),
    p(
      'Pierwsza wpłata: 5 000 zł (słownie: pięć tysięcy złotych) — w ciągu 10 dni od podpisania.',
    ),
    p(
      'Kwota pozostała do zapłaty: 13 500 zł (słownie: trzynaście tysięcy pięćset złotych) — najpóźniej w dniu uroczystości.',
    ),
    p(
      'Płatności na rachunek: 33 4444 5555 6666 7777 8888 9999. W tytule: imiona Pary Młodej oraz data ślubu.',
    ),
    p('§4 Odpowiedzialność i prawa', { bold: true }),
    p(
      'Wykonawcy nie ponoszą odpowiedzialności za ograniczenia lokalowe, zakazy fotografowania lub warunki pogodowe uniemożliwiające ujęcia powietrzne.',
    ),
    p(
      'Para Młoda przenosi na Wykonawców prawo do publikacji materiałów w portfolio, z zastrzeżeniem sprzeciwu zgłoszonego przed przekazaniem plików.',
    ),
    p(
      'Materiały surowe (RAW/niezmontowane) nie wchodzą w zakres Umowy, chyba że Strony postanowią inaczej w aneksie.',
    ),
    p('§5 Ochrona danych', { bold: true }),
    p(
      'Dane osobowe Pary Młodej są przetwarzane w celu wykonania Umowy i rozliczeń podatkowych.',
    ),
    p('§6 Postanowienia końcowe', { bold: true }),
    p(
      'W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego. Spory rozstrzyga sąd właściwy dla siedziby Wykonawców.',
    ),
    p('………………………………   ………………………………'),
    p('Para Młoda                 Wykonawcy'),
    p('— — —', { bold: true }),
    p('ZAŁĄCZNIK — usługi spoza pakietu', { bold: true }),
    p(
      'Jeżeli Para Młoda wybierze usługi spoza pakietu podstawowego, zostaną one wymienione w niniejszym załączniku (bez cen jednostkowych — ceny są wliczone w łączną wartość Umowy):',
    ),
    p('Lista usług dodatkowych:'),
  ].join('')
}

/** U04 — table-heavy, Wartość/Wpłacono/Do zapłaty, two clients */
function bodyU04(): string {
  return [
    p('Formularz umowy — Studio Stół & Kadr', { bold: true }),
    p('Umowa nr STK/2026/041'),
    table([
      ['Klient 1', 'Anna Wzorcowa'],
      ['Klient 2', 'Jan Wzorcowy'],
      ['Adres korespondencyjny', 'ul. Testowa 5, 00-001 Warszawa'],
      ['Telefon', '500 200 300'],
    ]),
    p('Dane wydarzenia', { bold: true }),
    table([
      ['Data wydarzenia', '11.09.2027'],
      ['Miejsce przygotowań', 'do uzupełnienia'],
      ['Miejsce ceremonii', 'do uzupełnienia'],
      ['Miejsce wesela', 'do uzupełnienia'],
    ]),
    p('Pakiet', { bold: true }),
    table([
      ['Nazwa pakietu', 'Photo Reportage'],
      ['Zakres', 'reportaż + galeria + 2h sesji'],
      ['Czas pracy', 'do 10 godzin'],
    ]),
    p('Podsumowanie finansowe', { bold: true }),
    table([
      ['Wartość zlecenia', '8 400 zł'],
      ['Wpłacono', '2 100 zł'],
      ['Do zapłaty', '6 300 zł'],
    ]),
    p(
      'Wpłacono oznacza kwotę już otrzymaną przez Studio. Do zapłaty oznacza saldo przed dniem wydarzenia.',
    ),
    p(
      'Płatność salda następuje przelewem na rachunek 44 5555 6666 7777 8888 9999 0000 najpóźniej 7 dni przed datą wydarzenia.',
    ),
    p('Warunki realizacji', { bold: true }),
    p(
      '1. Studio zobowiązuje się do starannej realizacji reportażu zgodnie z pakietem.',
    ),
    p(
      '2. Klient zobowiązuje się zapewnić dostęp do lokalizacji i poinformować o ograniczeniach.',
    ),
    p(
      '3. W razie odwołania terminu z winy Klienta kwota „Wpłacono” może zostać zatrzymana.',
    ),
    p(
      '4. Prawa autorskie przysługują Studio; Klient otrzymuje licencję prywatną.',
    ),
    p(
      '5. Dane osobowe przetwarzane są wyłącznie w celu wykonania umowy.',
    ),
    p('Podpisy', { bold: true }),
    p('Klient 1 __________  Klient 2 __________  Studio __________'),
  ].join('')
}

/** U05 — form-like top + long T&C, one client, no extras section */
function bodyU05(): string {
  return [
    p('KARTA ZAMÓWIENIA — Lens & Ember Studio', { bold: true }),
    p('Data wydarzenia: 30.06.2027'),
    p('Miejsce przygotowań: _______________________________'),
    p('Kościół / USC: ____________________________________'),
    p('Miejsce przyjęcia: _________________________________'),
    p('Wybrany wariant: Film Documentary'),
    p('Wartość: 11 200 zł'),
    p('Zaliczka: 3 000 zł'),
    p('Pozostało: 8 200 zł'),
    p('Klient: Ewa Modelowa, ul. Polna 9, 50-001 Wrocław'),
    p('— — — REGULAMIN / WARUNKI — — —', { bold: true }),
    p(
      '1. Niniejsza Karta Zamówienia wraz z poniższymi warunkami stanowi umowę o dzieło pomiędzy Klientem a Lens & Ember Studio (NIP 8990004444).',
    ),
    p(
      '2. Wykonawca realizuje film dokumentalny z dnia ślubu w wariancie wskazanym powyżej. Czas pracy do godziny 24:00, o ile Strony nie uzgodnią inaczej.',
    ),
    p(
      '3. Zaliczka jest płatna w ciągu 5 dni roboczych od podpisania Karty. Pozostało — najpóźniej w dniu przyjęcia weselnego.',
    ),
    p(
      '4. Numer rachunku do wpłat: 55 6666 7777 8888 9999 0000 1111. Tytuł: imię i nazwisko + data.',
    ),
    p(
      '5. Materiały zostaną przekazane w terminie do 16 tygodni. Opóźnienie wynikające z siły wyższej nie stanowi naruszenia Umowy.',
    ),
    p(
      '6. Klient zobowiązuje się podać kompletne lokalizacje najpóźniej 21 dni przed wydarzeniem.',
    ),
    p(
      '7. W razie zmiany terminu z przyczyn leżących po stronie Klienta Strony uzgodnią nowy termin lub rozliczą zaliczkę.',
    ),
    p(
      '8. Prawa autorskie do filmu przysługują Wykonawcy. Klient uzyskuje prawo do prywatnego odtwarzania i udostępniania rodzinie.',
    ),
    p(
      '9. Wykonawca może wykorzystać fragmenty w portfolio, chyba że Klient zgłosi sprzeciw przed finalną dostawą.',
    ),
    p(
      '10. Dane osobowe są przetwarzane zgodnie z RODO wyłącznie w celu realizacji zamówienia.',
    ),
    p(
      '11. Spory rozstrzyga sąd właściwy dla siedziby Wykonawcy.',
    ),
    p('Podpis Klienta: __________     Podpis Studio: __________'),
  ].join('')
}

/** U06 — legalistic dense, honorarium vocabulary, two clients */
function bodyU06(): string {
  return [
    p('Umowa o świadczenie usług twórczych', { bold: true }),
    p('§ 1. Strony', { bold: true }),
    p(
      '1. Zamawiającymi są solidarnie: Natalia Próbna oraz Karol Próbny, zamieszkali przy ul. Sądowej 2, 31-001 Kraków.',
    ),
    p(
      '2. Przyjmującym zamówienie jest Kancelaria Obrazu — adw. kreatywny Marek Soczewka prowadzący działalność fotograficzną, NIP 6770005555.',
    ),
    p('§ 2. Przedmiot świadczenia', { bold: true }),
    p(
      '1. Przedmiotem jest wykonanie reportażu fotograficznego z miejsca realizacji materiału w dniu 02.10.2027 r., obejmującego miejsce uroczystości zaślubin oraz miejsce celebracji weselnej.',
    ),
    p(
      '2. Szczegółowy przebieg dnia ustala się na podstawie informacji przekazanych przez Zamawiających.',
    ),
    p('§ 3. Honorarium', { bold: true }),
    p(
      '1. Z tytułu należytego wykonania świadczenia Zamawiający uiszczą honorarium w łącznej wysokości 12 600 zł (słownie: dwanaście tysięcy sześćset złotych).',
    ),
    p(
      '2. Świadczenie pieniężne obejmuje: kwotę rezerwacyjną w wysokości 3 500 zł (słownie: trzy tysiące pięćset złotych) płatną w terminie 14 dni od zawarcia umowy oraz pozostałe należne wynagrodzenie w wysokości 9 100 zł (słownie: dziewięć tysięcy sto złotych) płatne na 10 dni przed datą uroczystości.',
    ),
    p(
      '3. Wpłaty należy dokonywać na rachunek bankowy nr 66 7777 8888 9999 0000 1111 2222.',
    ),
    p('§ 4. Obowiązki stron', { bold: true }),
    p(
      '1. Przyjmujący zamówienie zobowiązuje się do starannego działania z uwzględnieniem zasad sztuki fotograficznej.',
    ),
    p(
      '2. Zamawiający zobowiązują się do zapewnienia dostępu do lokalizacji oraz informowania o ograniczeniach liturgicznych lub lokalowych.',
    ),
    p(
      '3. W razie odstąpienia od umowy przez Zamawiających z przyczyn leżących po ich stronie, kwota rezerwacyjna może zostać zatrzymana.',
    ),
    p('§ 5. Prawa majątkowe', { bold: true }),
    p(
      '1. Autorskie prawa majątkowe do utworów przysługują Przyjmującemu zamówienie. Zamawiający otrzymują licencję niewyłączną na użytek prywatny.',
    ),
    p(
      '2. Publikacja w portfolio wymaga braku sprzeciwu Zamawiających zgłoszonego przed przekazaniem plików.',
    ),
    p('§ 6. Dane osobowe', { bold: true }),
    p(
      '1. Administratorem danych jest Przyjmujący zamówienie. Podstawą przetwarzania jest wykonanie umowy.',
    ),
    p('§ 7. Postanowienia końcowe', { bold: true }),
    p(
      '1. Wszelkie zmiany wymagają formy pisemnej lub dokumentowej.',
    ),
    p(
      '2. W sprawach nieuregulowanych stosuje się Kodeks cywilny.',
    ),
    p('_________________     _________________     _________________'),
    p('Zamawiający           Zamawiający           Przyjmujący'),
  ].join('')
}

/** U07 — minimal modern, Inwestycja / rezerwacja terminu */
function bodyU07(): string {
  return [
    p('Umowa rezerwacji reportażu', { bold: true }),
    p('STRONY', { bold: true }),
    p(
      'Zamawiający: Zofia QA oraz Bartek QA, adres: ul. Zielona 4, 40-001 Katowice.',
    ),
    p(
      'Studio: Minimal Frame — Laura Czysta, NIP 6340006666, Katowice.',
    ),
    p(
      'Strony oświadczają, że mają pełną zdolność do czynności prawnych i zawierają umowę dobrowolnie.',
    ),
    p('DZIEŃ ŚLUBU', { bold: true }),
    p(
      'Termin: 18.04.2027. Adres przygotowań, ceremonii i wesela Klient przekazuje w formularzu online najpóźniej 30 dni przed terminem.',
    ),
    p(
      'Studio nie odpowiada za błędy w lokalizacjach przekazanych po tym terminie, jeżeli uniemożliwiły właściwe przygotowanie logistyki.',
    ),
    p('CO OBEJMUJE PAKIET', { bold: true }),
    p('Pakiet „Clear Day”: reportaż do 9 godzin, galeria, 40 odbitek 15×21.'),
    p(
      'W pakiecie nie ma drugiego fotografa, albumu premium ani filmu — te elementy wymagają osobnego uzgodnienia.',
    ),
    p('INWESTYCJA', { bold: true }),
    p(
      'Inwestycja wynosi 6 900 zł (słownie: sześć tysięcy dziewięćset złotych).',
    ),
    p(
      'Kwota obejmuje dojazd w promieniu 30 km od Katowic. Poza tym radiusem Studio przedstawi koszt osobno.',
    ),
    p('REZERWACJA TERMINU', { bold: true }),
    p(
      'Rezerwacja terminu: 1 800 zł — płatna przy podpisaniu. Numer konta: 77 8888 9999 0000 1111 2222 3333.',
    ),
    p(
      'Dopiero po zaksięgowaniu rezerwacji termin uznaje się za zablokowany w kalendarzu Studio.',
    ),
    p('POZOSTAŁA PŁATNOŚĆ', { bold: true }),
    p(
      'Pozostała płatność: 5 100 zł — najpóźniej 21 dni przed dniem ślubu.',
    ),
    p(
      'Brak płatności w terminie uprawnia Studio do zwolnienia daty po uprzednim wezwaniu mailowym.',
    ),
    p('DOSTAWA', { bold: true }),
    p('Galeria online w ciągu 8 tygodni.'),
    p(
      'Odbitki wysyłane są na adres Zamawiających w ciągu 14 dni od akceptacji galerii.',
    ),
    p('PRAWA DO MATERIAŁU', { bold: true }),
    p(
      'Prawa autorskie: Studio. Licencja prywatna dla Zamawiających. Portfolio: tak, o ile brak sprzeciwu.',
    ),
    p(
      'Dane osobowe przetwarzamy tylko do realizacji umowy.',
    ),
    p(
      'W razie rezygnacji Zamawiających rezerwacja terminu może zostać zatrzymana.',
    ),
    p('PODPISY', { bold: true }),
    p('Zamawiający __________   Studio __________'),
  ].join('')
}

/** U08 — event table + extras table + prose payments */
function bodyU08(): string {
  return [
    p('Umowa reportażu — Collective North', { bold: true }),
    p('Informacje o dniu (wypełnia studio na podstawie danych klienta):', { bold: true }),
    table([
      ['Przygotowania', 'ul. Próbna 1, Łódź'],
      ['Ślub', 'USC / kościół — do potwierdzenia'],
      ['Wesele', 'sala — do potwierdzenia'],
      ['Start reportażu', '14:00'],
      ['Koniec reportażu', '00:00'],
    ]),
    p(
      'Pakiet „North Story” obejmuje zdjęcia reportażowe, selekcję i obróbkę kolorystyczną oraz udostępnienie galerii. Sesja plenerowa w dniu ślubu wliczona do 45 minut.',
    ),
    p(
      'Wynagrodzenie za pakiet wynosi 9 100 zł (słownie: dziewięć tysięcy sto złotych).',
    ),
    p(
      'Zadatek 2 500 zł płatny w 7 dni od podpisania. Reszta wynagrodzenia 6 600 zł płatna 10 dni przed terminem.',
    ),
    p(
      'Konto: 88 9999 0000 1111 2222 3333 4444. Opóźnienie płatności może skutkować wstrzymaniem rezerwacji terminu.',
    ),
    p('Usługi dodatkowe', { bold: true }),
    table([
      ['Nazwa usługi', 'Uwagi'],
      ['(wstawiane przez studio)', 'bez cen jednostkowych'],
    ]),
    p(
      'Wybrane usługi dodatkowe zwiększają łączne wynagrodzenie; ich nazwy umieszcza się w tabeli powyżej.',
    ),
    p(
      'Klient: para — Hanna Fixture i Adam Fixture, ul. Fabryczna 3, 90-001 Łódź.',
    ),
    p(
      'Prawa autorskie i zgoda na publikację: jak w standardzie Collective North. RODO: dane tylko do umowy.',
    ),
    p(
      'W razie rezygnacji Klienta zadatek może zostać zatrzymany.',
    ),
    p('Podpisy: Klient __________  Studio __________'),
  ].join('')
}

/** U09 — complex financial, one client, many PLN amounts */
function bodyU09(): string {
  return [
    p('Umowa kompleksowa — Studio Ledger Light', { bold: true }),
    p(
      'Zamawiający: Igor Samotny, ul. Rachunkowa 7, 15-001 Białystok, tel. 500 777 888.',
    ),
    p(
      'Wykonawca: Ledger Light Video, NIP 5420007777, Białystok.',
    ),
    p('1. Przedmiot', { bold: true }),
    p(
      'Realizacja filmu ślubnego w dniu 25.09.2027 obejmująca przygotowania, ceremonię i przyjęcie weselne.',
    ),
    p(
      'Wykonawca pracuje samodzielnie. Zakres godzinowy: od przygotowań do zakończenia oficjalnej części przyjęcia, maksymalnie 11 godzin ciągłych.',
    ),
    p('2. Wartość i rozliczenia', { bold: true }),
    p(
      'Całkowita wartość umowy: 14 200 zł (słownie: czternaście tysięcy dwieście złotych).',
    ),
    p(
      'Wpłata wstępna (zaliczka): 4 000 zł (słownie: cztery tysiące złotych) — w 7 dni.',
    ),
    p(
      'Pozostała należność: 10 200 zł (słownie: dziesięć tysięcy dwieście złotych) — w dniu wesela.',
    ),
    p(
      'Opłata za dodatkową godzinę: 550 zł (nie jest częścią wartości umowy, naliczana osobno).',
    ),
    p(
      'Ryczałt dojazdowy poza radiusem 40 km: 1,80 zł/km — rozliczany osobno po wydarzeniu.',
    ),
    p(
      'Opłata za wymianę nośnika / ponowne wydanie pendrive: 120 zł.',
    ),
    p(
      'Odsetki ustawowe za opóźnienie płatności salda liczone są od dnia wymagalności.',
    ),
    p(
      'Konto: 99 0000 1111 2222 3333 4444 5555. W tytule przelewu: imię i nazwisko Zamawiającego oraz data ślubu.',
    ),
    p(
      'Faktura VAT zostanie wystawiona na dane podane przez Zamawiającego w ciągu 7 dni od otrzymania salda.',
    ),
    p('3. Zakres pakietu', { bold: true }),
    p(
      'Pakiet „Ledger Film”: teledysk, film 25–35 min, kolor grading, dostawa do 18 tygodni.',
    ),
    p(
      'W pakiecie nie ma relacji live, transmisji online ani wersji kinowej — te usługi wycenia się osobno.',
    ),
    p('4. Obowiązki Zamawiającego', { bold: true }),
    p(
      'Zamawiający przekazuje plan dnia, lokalizacje i ograniczenia lokalowe najpóźniej 21 dni przed terminem.',
    ),
    p(
      'Zamawiający zapewnia posiłek dla operatora, jeżeli reportaż trwa dłużej niż 8 godzin.',
    ),
    p('5. Postanowienia', { bold: true }),
    p(
      'Prawa autorskie: Wykonawca. Licencja prywatna: Zamawiający. Portfolio: za zgodą milczącą.',
    ),
    p(
      'RODO: przetwarzanie w celu umowy. Rezygnacja: zaliczka może zostać zatrzymana.',
    ),
    p(
      'Siła wyższa (w tym nagła choroba operatora) uprawnia do zaproponowania zastępstwa lub nowego terminu.',
    ),
    p('Podpis Zamawiającego __________  Podpis Wykonawcy __________'),
  ].join('')
}

/** U10 — structural adversarial: nested lists, tables, cross-refs, no extras heading */
function bodyU10(): string {
  return [
    p('KONTRAKT REALIZACYJNY NR XR-10', { bold: true }),
    p('Studio Mixed Formal — fotografowie: Lea i Natan Formal, NIP 5210008888.'),
    p(
      'Zleceniodawca: para testowa — Ida Chaos oraz Wiktor Chaos, ul. Zawiła 15, 70-001 Szczecin.',
    ),
    p('A. Struktura dnia', { bold: true }),
    p(
      'Zgodnie z pkt A.1 poniżej lokalizacje są niezależne. Odesłanie: patrz także tabela w pkt B.',
    ),
    numP('Adres przygotowań (wspólny lub rozdzielony) ustalany w aneksie operacyjnym;', '1', '0'),
    numP('ceremonia — zgodnie z pkt A.2;', '1', '1'),
    numP('przyjęcie — zgodnie z pkt A.3;', '1', '1'),
    numP('A.2 Ceremonia: obiekt wskazany przez Zleceniodawcę.', '1', '0'),
    numP('A.3 Przyjęcie / impreza: obiekt wskazany przez Zleceniodawcę.', '1', '0'),
    p('B. Dane operacyjne', { bold: true }),
    table([
      ['Element', 'Wartość wzorcowa'],
      ['Data', '07.11.2027'],
      ['Pakiet', 'Hybrid Formal XL'],
      ['Start', '12:00'],
      ['Koniec', '01:00'],
    ]),
    p('C. Pakiet — tabela zakresu', { bold: true }),
    table([
      ['Składnik', 'Opis'],
      ['Foto', 'min. 800 klatek'],
      ['Video', 'teledysk + film 45 min'],
      ['Dostawa', 'do 5 miesięcy (por. § D ust. 2)'],
    ]),
    p('D. Rozliczenie', { bold: true }),
    p(
      '1. Wartość kontraktu: 16 800 zł (słownie: szesnaście tysięcy osiemset złotych).',
    ),
    p(
      '2. Zaliczka rezerwacyjna: 4 200 zł. Saldo: 12 600 zł płatne na 14 dni przed datą z pkt B.',
    ),
    p(
      '3. Godzina ponad limit 13 h: 750 zł. Nie wchodzi do wartości z ust. 1.',
    ),
    p(
      '4. Rachunek: 12 3456 7890 1234 5678 9012 3456. Tytuł: XR-10 + nazwiska.',
    ),
    p('E. Prawa, RODO, odstąpienie', { bold: true }),
    p(
      'Prawa autorskie przysługują Studio Mixed Formal. Publikacja portfolio — o ile brak sprzeciwu. Dane osobowe — wyłącznie umowa. Odstąpienie Zleceniodawcy: zaliczka może zostać zatrzymana.',
    ),
    p(
      'F. Uwaga: usługi spoza tabeli pakietu, jeśli zostaną wybrane, dopisuje się bezpośrednio pod niniejszym punktem F bez tworzenia osobnego § „Usługi dodatkowe”.',
    ),
    p('G. Podpisy', { bold: true }),
    p('Zleceniodawca __________     Studio __________'),
    p(
      'Niniejszy kontrakt odsyła wzajemnie do pkt A–G. Zmiany wymagają formy dokumentowej.',
    ),
  ].join('')
}

const BUILDERS: Record<UnknownStudioId, () => string> = {
  U01: bodyU01,
  U02: bodyU02,
  U03: bodyU03,
  U04: bodyU04,
  U05: bodyU05,
  U06: bodyU06,
  U07: bodyU07,
  U08: bodyU08,
  U09: bodyU09,
  U10: bodyU10,
}

export const UNKNOWN_STUDIO_META: Array<{
  id: UnknownStudioId
  studioType: string
  style: string
  pagesEstimate: string
  paymentTerms: string
  locationTerms: string
  packageRep: string
  extrasRep: string
  partyDefault: 1 | 2
  tables: boolean
}> = [
  {
    id: 'U01',
    studioType: 'filmmaker',
    style: 'classic numbered §§',
    pagesEstimate: '2–3',
    paymentTerms: 'wynagrodzenie/zadatek/pozostała część',
    locationTerms: 'przygotowania/ceremonia/przyjęcie weselne',
    packageRep: 'numbered deliverables',
    extrasRep: 'none explicit',
    partyDefault: 1,
    tables: false,
  },
  {
    id: 'U02',
    studioType: 'photographer',
    style: 'modern soft headings + bullets',
    pagesEstimate: '3–4',
    paymentTerms: 'cena usługi/opłata rezerwacyjna/saldo',
    locationTerms: 'miejsce szykowania/ceremonii/sala weselna',
    packageRep: 'bullet list',
    extrasRep: 'explicit Usługi dodatkowe',
    partyDefault: 2,
    tables: false,
  },
  {
    id: 'U03',
    studioType: 'photo+video duo',
    style: 'long dual-operator',
    pagesEstimate: '4–5',
    paymentTerms: 'łączna wartość/pierwsza wpłata/kwota pozostała',
    locationTerms: 'przygotowania Panny/Pana, uroczystość, lokal',
    packageRep: 'numbered photo+video',
    extrasRep: 'distant annex list',
    partyDefault: 2,
    tables: false,
  },
  {
    id: 'U04',
    studioType: 'photographer',
    style: 'table-heavy form',
    pagesEstimate: '3–4',
    paymentTerms: 'Wartość zlecenia/Wpłacono/Do zapłaty',
    locationTerms: 'table cells',
    packageRep: 'finance/package tables',
    extrasRep: 'none',
    partyDefault: 2,
    tables: true,
  },
  {
    id: 'U05',
    studioType: 'filmmaker',
    style: 'form header + T&C',
    pagesEstimate: '2–4',
    paymentTerms: 'Wartość/Zaliczka/Pozostało',
    locationTerms: 'form fields Kościół/USC',
    packageRep: 'Wybrany wariant line',
    extrasRep: 'none — must invent safe insert',
    partyDefault: 1,
    tables: false,
  },
  {
    id: 'U06',
    studioType: 'photographer',
    style: 'legalistic dense',
    pagesEstimate: '4–5',
    paymentTerms: 'honorarium/kwota rezerwacyjna/pozostałe należne',
    locationTerms: 'uroczystość zaślubin/celebracja weselna',
    packageRep: 'prose scope',
    extrasRep: 'none',
    partyDefault: 2,
    tables: false,
  },
  {
    id: 'U07',
    studioType: 'photographer',
    style: 'minimal modern headings',
    pagesEstimate: '2–3',
    paymentTerms: 'Inwestycja/rezerwacja terminu/pozostała płatność',
    locationTerms: 'via online form mention',
    packageRep: 'short Clear Day blurb',
    extrasRep: 'none',
    partyDefault: 2,
    tables: false,
  },
  {
    id: 'U08',
    studioType: 'photographer',
    style: 'event table + extras table',
    pagesEstimate: '3–5',
    paymentTerms: 'wynagrodzenie/zadatek/reszta',
    locationTerms: 'Przygotowania/Ślub/Wesele table',
    packageRep: 'prose North Story',
    extrasRep: 'Usługi dodatkowe table',
    partyDefault: 2,
    tables: true,
  },
  {
    id: 'U09',
    studioType: 'filmmaker',
    style: 'complex multi-fee finance',
    pagesEstimate: '4–5',
    paymentTerms: 'wartość/zaliczka/pozostała + hour/travel/media',
    locationTerms: 'przygotowania/ceremonia/przyjęcie',
    packageRep: 'Ledger Film prose',
    extrasRep: 'none',
    partyDefault: 1,
    tables: false,
  },
  {
    id: 'U10',
    studioType: 'photo+video',
    style: 'nested+tables+cross-refs adversarial',
    pagesEstimate: '4–5',
    paymentTerms: 'wartość/zaliczka rezerwacyjna/saldo',
    locationTerms: 'nested pkt A + table B',
    packageRep: 'package table C',
    extrasRep: 'no heading — insert under F',
    partyDefault: 2,
    tables: true,
  },
]

export async function buildUnknownStudioDocx(
  id: UnknownStudioId,
): Promise<ArrayBuffer> {
  return pack(BUILDERS[id]())
}

export async function writeAllUnknownStudioFixtures(
  dir = 'tmp/cg7-fixtures',
): Promise<void> {
  mkdirSync(dir, { recursive: true })
  for (const meta of UNKNOWN_STUDIO_META) {
    const bytes = await buildUnknownStudioDocx(meta.id)
    writeFileSync(join(dir, `${meta.id}_SOURCE.docx`), Buffer.from(bytes))
  }
}

const isDirect =
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('buildUnknownStudioFixtures')

if (isDirect) {
  writeAllUnknownStudioFixtures()
    .then(() => console.log('CG7 fixtures written to tmp/cg7-fixtures'))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
