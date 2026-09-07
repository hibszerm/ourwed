import { LEGAL_OPERATOR, LEGAL_PROCESSORS } from '@/features/legal/legalMeta'
import type { LegalSection } from '@/features/legal/content/regulamin'

export const POWIERZENIE_TITLE =
  'Umowa powierzenia przetwarzania danych osobowych'

export const POWIERZENIE_SECTIONS: LegalSection[] = [
  {
    id: 'strony',
    title: '1. Strony i związek z Regulaminem',
    paragraphs: [
      `Niniejsza Umowa powierzenia przetwarzania danych osobowych („Umowa”) wiąże ${LEGAL_OPERATOR.name} („Podmiot przetwarzający”, „OurWed”) oraz użytkownika OurWed („Administrator”), który korzysta z platformy do przetwarzania danych osobowych swoich klientów.`,
      'Umowa stanowi integralny instrument prawny powiązany z Regulaminem OurWed w zakresie przetwarzania wykonywanego na rzecz Administratora. Korzystanie z funkcji CRM OurWed obejmujących Dane klientów oznacza akceptację niniejszej Umowy w formie elektronicznej.',
    ],
  },
  {
    id: 'definicje',
    title: '2. Definicje',
    paragraphs: [
      'Pojęcia niezdefiniowane w Umowie mają znaczenie nadane im w Regulaminie OurWed oraz w RODO.',
      '„Dane osobowe” oznaczają dane osobowe w rozumieniu art. 4 pkt 1 RODO, które Administrator wprowadza do OurWed lub które trafiają do OurWed za pośrednictwem funkcji udostępnionych Administratorowi (w tym ankiet publicznych).',
    ],
  },
  {
    id: 'przedmiot',
    title: '3. Przedmiot',
    paragraphs: [
      'Przedmiotem Umowy jest powierzenie OurWed przetwarzania Danych osobowych w celu świadczenia Usługi CRM OurWed, w tym hostowania, przechowywania, wyświetlania, przekształcania, transmisji i tworzenia kopii niezbędnych do działania żądanych funkcji.',
    ],
  },
  {
    id: 'czas',
    title: '4. Czas trwania',
    paragraphs: [
      'Umowa obowiązuje przez okres korzystania przez Administratora z OurWed w zakresie obejmującym przetwarzanie Danych osobowych i wygasa z chwilą trwałego zaprzestania takiego korzystania oraz usunięcia lub zwrotu danych zgodnie z Umową, z zastrzeżeniem obowiązków ustawowych.',
    ],
  },
  {
    id: 'charakter',
    title: '5. Charakter i cel',
    paragraphs: [
      'Przetwarzanie ma charakter elektroniczny i obejmuje czynności niezbędne do działania CRM: zapis, odczyt, organizację, przechowywanie, udostępnianie na polecenie Administratora (np. generowanie dokumentów), transmisję do podprocesorów wymaganych funkcjami oraz usuwanie.',
      'Celem jest umożliwienie Administratorowi prowadzenia działalności związanej ze zleceniami ślubnymi/kreatywnymi przy użyciu OurWed.',
    ],
  },
  {
    id: 'osoby',
    title: '6. Kategorie osób, których dane dotyczą',
    paragraphs: [
      'W szczególności: klienci/pary młode Administratora, osoby kontaktowe wskazane w zleceniu, osoby wymienione w notatkach lub dokumentach, a także inne osoby, których dane Administrator zdecyduje się wprowadzić do OurWed.',
    ],
  },
  {
    id: 'rodzaje-danych',
    title: '7. Kategorie / rodzaje danych osobowych',
    paragraphs: [
      'W zależności od konfiguracji Administratora mogą być przetwarzane m.in.: dane identyfikacyjne i kontaktowe, adresy, dane lokalizacji miejsc, odpowiedzi ankietowe, dane umów i dokumentów, dane z ewidencji płatności dotyczących zlecenia, notatki oraz treści plików.',
      'OurWed nie wymaga PESEL jako standardowego pola konta lub danych klienta. Jeżeli Administrator zdecyduje się przetwarzać PESEL lub inny identyfikator krajowy, Administrator odpowiada za ustalenie odpowiedniej podstawy prawnej, konieczności, proporcjonalności oraz zakresu takiego przetwarzania.',
    ],
  },
  {
    id: 'polecenia',
    title: '8. Udokumentowane polecenia',
    paragraphs: [
      'OurWed przetwarza Dane osobowe wyłącznie na udokumentowane polecenie Administratora. Korzystanie z konkretnych funkcji OurWed (zapis danych, wysyłka linku ankiety, generowanie dokumentu, uruchomienie AI, eksport PDF itp.) stanowi takie polecenie w zakresie niezbędnym do wykonania tej funkcji.',
      'Jeżeli OurWed uzna, że dane polecenie narusza RODO lub inne obowiązujące przepisy Unii Europejskiej lub państwa członkowskiego o ochronie danych osobowych, OurWed niezwłocznie informuje o tym Administratora.',
      'OurWed może przetwarzać Dane osobowe, gdy jest to wymagane obowiązującym prawem Unii lub państwa członkowskiego, któremu OurWed podlega. W takim przypadku OurWed informuje Administratora o tym wymogu prawnym przed rozpoczęciem przetwarzania, chyba że prawo to zabrania udzielenia takiej informacji z ważnych względów interesu publicznego.',
    ],
  },
  {
    id: 'obowiazki-admin',
    title: '9. Obowiązki Administratora',
    paragraphs: [
      'Administrator oświadcza, że posiada podstawę prawną przetwarzania Danych osobowych oraz że treść ankiet, szablonów i instrukcji jest zgodna z prawem.',
      'Administrator stosuje minimalizację danych, nie wprowadza niepotrzebnych danych szczególnych kategorii i informuje osoby, których dane dotyczą, w wymaganym zakresie.',
    ],
  },
  {
    id: 'obowiazki-ourwed',
    title: '10. Obowiązki OurWed / podmiotu przetwarzającego',
    paragraphs: [
      'OurWed zobowiązuje się przetwarzać Dane osobowe zgodnie z Umową, Regulaminem i obowiązującym prawem oraz nie wykorzystywać ich do własnych celów marketingowych niezwiązanych ze świadczeniem Usługi.',
    ],
  },
  {
    id: 'poufnosc',
    title: '11. Poufność',
    paragraphs: [
      'OurWed zapewnia, że osoby upoważnione do przetwarzania Danych osobowych zobowiązane są do poufności lub podlegają odpowiedniemu ustawowemu obowiązkowi zachowania tajemnicy.',
    ],
  },
  {
    id: 'toz',
    title: '12. Środki techniczne i organizacyjne',
    paragraphs: [
      'OurWed stosuje środki bezpieczeństwa adekwatne do ryzyka, w tym kontrolę dostępu, izolację danych kont, prywatne przechowywanie plików oraz środki stosowane przez dostawców infrastruktury.',
    ],
  },
  {
    id: 'podprocesorzy',
    title: '13. Dalsi przetwarzający / podprocesorzy',
    paragraphs: [
      'Administrator upoważnia OurWed do korzystania z dalszych przetwarzających w zakresie niezbędnym do świadczenia Usługi. Aktualne kategorie obejmują m.in.:',
      ...LEGAL_PROCESSORS.map(
        (p) => `${p.name}: ${p.purpose} (${p.whenUsed}).`,
      ),
      'Dostawca płatności jest ujawniany w dokumentach prawnych i procesie zakupu, gdy płatności online są udostępnione; do tego czasu nie jest wpisany na niniejszą listę.',
      'Gdy OurWed angażuje innego przetwarzającego do wykonywania określonych czynności przetwarzania w imieniu Administratora, OurWed nakłada na tego przetwarzającego obowiązki ochrony danych równoważne obowiązkom wynikającym z niniejszej Umowy i art. 28 RODO, w zakresie mającym zastosowanie do danej relacji.',
    ],
  },
  {
    id: 'autoryzacja',
    title: '14. Model ogólnego upoważnienia',
    paragraphs: [
      'Administrator udziela OurWed ogólnego upoważnienia do angażowania dalszych przetwarzających z kategorii niezbędnych do hostingu, poczty transakcyjnej, map, AI i konwersji dokumentów, zgodnie z modelem art. 28 RODO.',
    ],
  },
  {
    id: 'zmiany-podprocesorow',
    title: '15. Informowanie o istotnych zmianach podprocesorów',
    paragraphs: [
      'OurWed informuje Administratora z wyprzedzeniem o zamierzonym dodaniu lub zastąpieniu dalszego przetwarzającego, tak aby Administrator miał możliwość wniesienia sprzeciwu przed wejściem zmiany w życie.',
      'Informacja jest przekazywana w sposób adekwatny do charakteru zmiany, w szczególności poprzez aktualizację dokumentów prawnych i/lub komunikację w produkcie lub e-mail.',
    ],
  },
  {
    id: 'transfery',
    title: '16. Transfery międzynarodowe',
    paragraphs: [
      'Jeżeli dalszy przetwarzający przetwarza dane poza Europejskim Obszarem Gospodarczym, OurWed zapewnia zastosowanie wymagań RODO dotyczących transferów międzynarodowych, w tym odpowiednich zabezpieczeń wymaganych prawem, w zakresie mającym zastosowanie do danej relacji. Zakres i mechanizm transferu zależą od konkretnego dostawcy oraz użytej funkcji.',
    ],
  },
  {
    id: 'prawa-osob',
    title: '17. Wsparcie przy prawach osób',
    paragraphs: [
      'OurWed wspiera Administratora — w miarę możliwości technicznych — w realizacji żądań osób, których dane dotyczą, dotyczących danych przetwarzanych w OurWed.',
    ],
  },
  {
    id: 'incydenty',
    title: '18. Incydenty / naruszenia ochrony danych',
    paragraphs: [
      'OurWed powiadomi Administratora o naruszeniu ochrony Danych osobowych bez zbędnej zwłoki po powzięciu o nim wiarygodnej wiedzy, przekazując dostępne informacje potrzebne Administratorowi do spełnienia obowiązków prawnych.',
    ],
  },
  {
    id: 'dpia',
    title: '19. DPIA i wsparcie organów',
    paragraphs: [
      'OurWed — w rozsądnym zakresie — udziela Administratorowi informacji potrzebnych do DPIA oraz współpracy z organem nadzorczym, gdy dotyczy to przetwarzania w OurWed.',
    ],
  },
  {
    id: 'usuniecie-zwrot',
    title: '20. Usunięcie / zwrot po zakończeniu',
    paragraphs: [
      'Po zakończeniu świadczenia usług związanych z przetwarzaniem OurWed usuwa lub zwraca Dane osobowe Administratorowi według dostępnych mechanizmów produktu i wniosku Administratora, chyba że prawo nakazuje dalsze przechowywanie.',
      'Kopie zapasowe mogą wygasać zgodnie z cyklami infrastruktury. Natychmiastowe usunięcie we wszystkich warstwach backupu nie jest gwarantowane.',
    ],
  },
  {
    id: 'audyt',
    title: '21. Informacje i współpraca audytowa',
    paragraphs: [
      'OurWed udostępnia Administratorowi informacje niezbędne do wykazania spełnienia obowiązków art. 28 RODO. Audyty — jeżeli będą wymagane — odbywają się w rozsądnym zakresie, z poszanowaniem bezpieczeństwa, poufności innych klientów i praw dostawców.',
    ],
  },
  {
    id: 'odpowiedzialnosc',
    title: '22. Odpowiedzialność',
    paragraphs: [
      'Odpowiedzialność stron określa RODO, inne przepisy bezwzględnie obowiązujące oraz Regulamin OurWed. Umowa nie wyłącza odpowiedzialności w zakresie, w jakim jest to niedopuszczalne prawnie.',
    ],
  },
  {
    id: 'forma',
    title: '23. Forma elektroniczna / akceptacja',
    paragraphs: [
      'Umowa jest zawierana w formie elektronicznej poprzez akceptację Regulaminu OurWed i korzystanie z funkcji przetwarzających Dane osobowe klientów.',
    ],
  },
  {
    id: 'koncowe',
    title: '24. Postanowienia końcowe',
    paragraphs: [
      'W sprawach nieuregulowanych zastosowanie mają Regulamin, Polityka prywatności oraz przepisy prawa polskiego i RODO.',
      `Kontakt: ${LEGAL_OPERATOR.email}.`,
    ],
  },
]
