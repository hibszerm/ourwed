import { LEGAL_OPERATOR, LEGAL_PROCESSORS } from '@/features/legal/legalMeta'
import type { LegalSection } from '@/features/legal/content/regulamin'

export const POLITYKA_TITLE = 'Polityka prywatności OurWed'

function processorsParagraphs(): string[] {
  const intro =
    'OurWed korzysta z dostawców usług niezbędnych lub pomocniczych dla działania platformy. Zakres danych przekazanych danemu dostawcy zależy od funkcji, z których korzysta Użytkownik. Poniżej przedstawiamy kategorie odbiorców zidentyfikowanych w aktualnym produkcie:'
  const rows = LEGAL_PROCESSORS.map(
    (p) =>
      `${p.name} — cel: ${p.purpose}. Kategorie danych: ${p.dataCategories}. Kiedy: ${p.whenUsed}.`,
  )
  const payment =
    'Jeżeli OurWed korzysta z dostawcy płatności w związku z subskrypcją, informacje o przetwarzaniu danych płatniczych są przedstawiane w dokumentach prawnych oraz w procesie zakupu. Do czasu udostępnienia płatności online dane płatnicze subskrypcji nie są przekazywane zewnętrznemu dostawcy płatności.'
  const transfers =
    'Jeżeli dane osobowe są przekazywane poza Europejski Obszar Gospodarczy, zastosowanie mają wymagania RODO dotyczące transferów międzynarodowych, w tym odpowiednie zabezpieczenia prawne, o ile są wymagane. Konkretne lokalizacje przetwarzania u poszczególnych dostawców mogą się różnić i zależą od danej relacji umownej oraz użytej funkcji.'
  return [intro, ...rows, payment, transfers]
}

export const POLITYKA_SECTIONS: LegalSection[] = [
  {
    id: 'cel',
    title: '1. Cel dokumentu',
    paragraphs: [
      'Niniejsza Polityka prywatności wyjaśnia, w jaki sposób Video Productions Marcin Hibszer („Usługodawca”) przetwarza dane osobowe w związku z platformą OurWed.',
      'Polityka dotyczy użytkowników kont OurWed oraz — w odpowiednim zakresie — osób, których dane trafiają do OurWed poprzez CRM lub ankiety publiczne.',
    ],
  },
  {
    id: 'administrator',
    title: '2. Administrator danych',
    paragraphs: [
      `Administratorem danych osobowych użytkowników kont OurWed jest ${LEGAL_OPERATOR.name}, ${LEGAL_OPERATOR.street}, ${LEGAL_OPERATOR.postalCity}, ${LEGAL_OPERATOR.country}, NIP: ${LEGAL_OPERATOR.nip}, REGON: ${LEGAL_OPERATOR.regon}.`,
      'W odniesieniu do danych klientów/par młodych wprowadzanych przez studio, rolą OurWed jest przede wszystkim przetwarzanie tych danych na rzecz użytkownika studia (powierzenie). Szczegóły określa Umowa powierzenia (/powierzenie-danych).',
    ],
  },
  {
    id: 'kontakt',
    title: '3. Dane kontaktowe',
    paragraphs: [
      `Kontakt w sprawach ochrony danych, wsparcia i spraw prawnych: ${LEGAL_OPERATOR.email}.`,
    ],
  },
  {
    id: 'role',
    title: '4. Role OurWed w przetwarzaniu',
    paragraphs: [
      'A. Dane konta użytkownika OurWed — Usługodawca przetwarza je jako administrator w celach świadczenia usługi, bezpieczeństwa, wsparcia, rozliczeń (gdy zostaną uruchomione) oraz wypełniania obowiązków prawnych.',
      'B. Dane klientów/par młodych — studio/użytkownik decyduje o celach i środkach przetwarzania tych danych; OurWed przetwarza je jako podmiot przetwarzający na rzecz studia, zgodnie z Umową powierzenia i instrukcjami wynikającymi z korzystania z funkcji CRM.',
      'Niniejsza Polityka nie oznacza, że OurWed staje się właścicielem danych klientów użytkownika.',
    ],
  },
  {
    id: 'dane-konta',
    title: '5. Dane posiadacza konta',
    paragraphs: [
      'Przetwarzamy dane identyfikacyjne i kontaktowe konta (m.in. imię, nazwisko, e-mail, zawód/rola), dane uwierzytelniające, preferencje konta oraz dane spółki/studia wprowadzone w ustawieniach firmy (o ile Użytkownik je poda).',
    ],
  },
  {
    id: 'dane-klientow',
    title: '6. Dane klientów/par przetwarzane na rzecz użytkowników',
    paragraphs: [
      'Użytkownik może wprowadzać do OurWed dane swoich klientów oraz otrzymywać je z ankiet publicznych. Mogą to być m.in. imiona i nazwiska, telefony, e-maile, adresy, lokalizacje, harmonogramy, odpowiedzi ankietowe, notatki, dane umów oraz informacje z ewidencji płatności dotyczących zlecenia.',
      'OurWed nie przetwarza tych danych jako niezależny administrator celów biznesowych studia, z zastrzeżeniem sytuacji, w których prawo wymaga własnego przetwarzania (np. bezpieczeństwo, logi, ochrona przed nadużyciami).',
    ],
  },
  {
    id: 'kategorie',
    title: '7. Kategorie danych osobowych',
    paragraphs: [
      'W zależności od funkcji mogą być przetwarzane: dane identyfikacyjne, kontaktowe, adresowe, dane zlecenia, dane dokumentów, dane lokalizacyjne miejsc, dane kalendarzowe, dane techniczne, dane z ewidencji płatności dotyczących zlecenia oraz treści przekazane do funkcji AI.',
      'OurWed nie jest zaprojektowany do celowego zbierania danych szczególnych kategorii. Pola swobodne lub niestandardowe konfiguracje użytkownika mogą jednak zawierać takie informacje — użytkownik powinien stosować minimalizację. OurWed nie wymaga PESEL jako standardowego pola konta lub danych klienta. Jeżeli użytkownik zdecyduje się przetwarzać PESEL lub inny identyfikator krajowy, odpowiada za ustalenie odpowiedniej podstawy prawnej, konieczności, proporcjonalności oraz zakresu takiego przetwarzania.',
    ],
  },
  {
    id: 'rejestracja',
    title: '8. Dane rejestracji i uwierzytelniania',
    paragraphs: [
      'Przy rejestracji i logowaniu przetwarzamy dane formularza konta oraz dane sesji uwierzytelniającej (w tym tokeny sesji przechowywane w przeglądarce).',
      'Hasła są obsługiwane przez infrastrukturę uwierzytelniania i nie są przechowywane w czytelnej postaci w tabelach aplikacyjnych OurWed.',
    ],
  },
  {
    id: 'profil-firma',
    title: '9. Dane profilu i firmy',
    paragraphs: [
      'Użytkownik może uzupełnić dane firmy (np. nazwa, NIP, adres, telefon, dane do dokumentów, logo, podpis graficzny). Dane te służą personalizacji dokumentów i ustawień studia.',
    ],
  },
  {
    id: 'crm',
    title: '10. Dane CRM / zleceń',
    paragraphs: [
      'CRM OurWed przechowuje dane zleceń ślubnych i sesji, w tym dane stron, lokalizacji, statusów, pakietów, notatek i powiązanych rekordów operacyjnych.',
    ],
  },
  {
    id: 'ankiety',
    title: '11. Dane ankiet',
    paragraphs: [
      'Ankieta umowna (/form/:token) oraz ankieta przedślubna (/ankieta/:token) umożliwiają klientom studia przesyłanie odpowiedzi bez logowania do OurWed.',
      'Dane z ankiet trafiają do konta studia, które udostępniło link. OurWed przetwarza je jako platforma techniczna na rzecz tego studia.',
    ],
  },
  {
    id: 'dokumenty',
    title: '12. Dokumenty i pliki',
    paragraphs: [
      'Przechowujemy szablony, wersje robocze, wygenerowane dokumenty, przesłane umowy źródłowe oraz powiązane pliki w prywatnej przestrzeni dyskowej użytkownika.',
      'Przesłane umowy mogą zawierać dane osób trzecich. Użytkownik odpowiada za legalność ich przetwarzania.',
    ],
  },
  {
    id: 'finanse',
    title: '13. Dane z ewidencji płatności zlecenia',
    paragraphs: [
      'OurWed umożliwia prowadzenie ewidencji płatności dotyczących zlecenia (kwoty, terminy, statusy, notatki). Nie jest to przetwarzanie płatności kartą klienta końcowego.',
      'Płatności za subskrypcję OurWed są obsługiwane przez dostawcę płatności wskazanego w procesie zakupu; do czasu jego udostępnienia OurWed nie przetwarza danych płatniczych subskrypcji przez zewnętrznego dostawcę płatności.',
    ],
  },
  {
    id: 'kalendarz',
    title: '14. Dane kalendarza',
    paragraphs: [
      'Przy opcjonalnej integracji kalendarza mogą być przetwarzane identyfikatory konta kalendarzowego, tokeny dostępu (w formie zabezpieczonej) oraz mapowania wydarzeń.',
    ],
  },
  {
    id: 'lokalizacje',
    title: '15. Dane lokalizacji i map',
    paragraphs: [
      'Funkcje lokalizacji wykorzystują adresy i współrzędne miejsc (np. ceremonia, przyjęcie, baza studia) oraz zapytania do usług mapowych.',
      'OurWed nie uzyskuje dostępu do bieżącej lokalizacji GPS urządzenia użytkownika.',
    ],
  },
  {
    id: 'wsparcie',
    title: '16. Dane wsparcia i kontaktu',
    paragraphs: [
      `Wiadomości wysłane na ${LEGAL_OPERATOR.email} są przetwarzane w celu obsługi zapytań, reklamacji i spraw prawnych.`,
    ],
  },
  {
    id: 'techniczne',
    title: '17. Dane techniczne i bezpieczeństwa',
    paragraphs: [
      'Mogą być przetwarzane logi techniczne, identyfikatory sesji, dane diagnostyczne oraz informacje potrzebne do bezpieczeństwa i ciągłości usługi, w zakresie wynikającym z infrastruktury Usługodawcy i dostawców.',
    ],
  },
  {
    id: 'cele-podstawy',
    title: '18. Cele i podstawy prawne',
    paragraphs: [
      'Świadczenie Usługi i wykonanie umowy (art. 6 ust. 1 lit. b RODO) — konto, funkcje CRM, okres próbny, późniejszy abonament.',
      'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f RODO) — bezpieczeństwo, przeciwdziałanie nadużyciom, dochodzenie roszczeń, rozwój usługi w zakresie niewymagającym zgody.',
      'Obowiązek prawny (art. 6 ust. 1 lit. c RODO) — gdy przepisy wymagają przechowywania określonych informacji.',
      'Zgoda (art. 6 ust. 1 lit. a RODO) — wyłącznie gdy dana czynność rzeczywiście opiera się na zgodzie.',
      'Przetwarzanie Danych klientów na rzecz studia — zgodnie z art. 28 RODO i Umową powierzenia; podstawę wobec klientów ustala studio.',
    ],
  },
  {
    id: 'odbiorcy',
    title: '19. Odbiorcy danych / dostawcy',
    paragraphs: processorsParagraphs(),
  },
  {
    id: 'supabase',
    title: '20. Supabase',
    paragraphs: [
      'Supabase zapewnia infrastrukturę bazy danych, uwierzytelniania, storage i funkcji serwerowych wykorzystywanych przez OurWed.',
    ],
  },
  {
    id: 'vercel',
    title: '21. Vercel',
    paragraphs: [
      'Aplikacja webowa OurWed jest hostowana u dostawcy infrastruktury frontendu/hostingu (Vercel), co wiąże się z przetwarzaniem danych technicznych żądań.',
    ],
  },
  {
    id: 'resend',
    title: '22. Resend',
    paragraphs: [
      'Resend może być wykorzystywany do wysyłki transakcyjnych powiadomień e-mail do użytkownika studia (np. o wypełnieniu ankiety).',
    ],
  },
  {
    id: 'google',
    title: '23. Usługi Google',
    paragraphs: [
      'Usługi Google mogą być wykorzystywane do map/Places/Routes oraz opcjonalnej synchronizacji kalendarza. Zakres zależy od użytej funkcji i zgód/połączeń konta.',
    ],
  },
  {
    id: 'openai',
    title: '24. OpenAI / przetwarzanie AI',
    paragraphs: [
      'Gdy użytkownik uruchomi funkcję AI, treść niezbędna do wykonania operacji może zostać przekazana do OpenAI. AI nie podejmuje zautomatyzowanych decyzji wywołujących skutki prawne wobec użytkownika w rozumieniu profilowania rozstrzygającego o ważności umowy.',
    ],
  },
  {
    id: 'cloudmersive',
    title: '25. Cloudmersive',
    paragraphs: [
      'Cloudmersive może być wykorzystywany do konwersji dokumentów DOCX do PDF. Przekazany plik może zawierać dane klientów.',
    ],
  },
  {
    id: 'pdfshift',
    title: '26. PDFShift',
    paragraphs: [
      'PDFShift może być wykorzystywany do generowania PDF na podstawie treści HTML (np. Brief).',
    ],
  },
  {
    id: 'platnosci-future',
    title: '27. Dostawca płatności',
    paragraphs: [
      'W związku z płatnym abonamentem OurWed może korzystać z zewnętrznego dostawcy płatności. Zakres przetwarzanych danych płatniczych, rola dostawcy oraz powiązane informacje są przedstawiane w procesie zakupu oraz — w razie potrzeby — w aktualizacji niniejszej Polityki i ujawnieniach podprocesorów.',
    ],
  },
  {
    id: 'transfery',
    title: '28. Transfery międzynarodowe',
    paragraphs: [
      'Jeżeli dane osobowe są przekazywane poza Europejski Obszar Gospodarczy, Usługodawca zapewnia zastosowanie wymagań RODO dotyczących takich transferów, w tym odpowiednich zabezpieczeń wymaganych prawem. Zakres i mechanizm transferu zależą od konkretnego dostawcy oraz funkcji, z której korzysta użytkownik.',
    ],
  },
  {
    id: 'retencja',
    title: '29. Retencja danych',
    paragraphs: [
      'Dane konta i dane CRM są przechowywane przez czas posiadania konta oraz przez okres niezbędny do celów, dla których zostały zebrane.',
      'Po skutecznym usunięciu konta dane aktywne są usuwane lub anonimizowane bez zbędnej zwłoki, z wyjątkiem przypadków, w których przechowywanie jest wymagane przepisami prawa, dla ustalenia, dochodzenia lub obrony roszczeń, obowiązków księgowych lub podatkowych, bezpieczeństwa albo innych obowiązujących obowiązków prawnych.',
      'Kopie zapasowe infrastruktury mogą przez pewien czas zawierać pozostałości danych zgodnie z cyklami dostawców, do czasu ich wygaśnięcia lub nadpisania. Usługodawca nie obiecuje natychmiastowego zniszczenia we wszystkich warstwach kopii.',
    ],
  },
  {
    id: 'usuniecie',
    title: '30. Usunięcie konta',
    paragraphs: [
      'Użytkownik może żądać usunięcia konta, kontaktując się na adres e-mail Usługodawcy lub — gdy funkcja jest dostępna w produkcie — korzystając z mechanizmu usunięcia konta w ustawieniach.',
      'Po skutecznym usunięciu konta dane aktywne są usuwane lub anonimizowane bez zbędnej zwłoki, z zastrzeżeniem obowiązujących okresów retencji prawnych oraz cykli kopii zapasowych infrastruktury.',
    ],
  },
  {
    id: 'backupy',
    title: '31. Kopie zapasowe',
    paragraphs: [
      'Infrastruktura może tworzyć kopie zapasowe na potrzeby ciągłości działania. Czas ich przechowywania zależy od dostawcy i nie jest tu ustalany sztywno.',
    ],
  },
  {
    id: 'prawa',
    title: '32. Prawa osób, których dane dotyczą',
    paragraphs: [
      'W zakresie przewidzianym RODO przysługują m.in. prawa: dostępu, sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych, sprzeciwu, cofnięcia zgody (gdy podstawą jest zgoda) — z uwzględnieniem wyjątków ustawowych.',
      'W przypadku Danych klientów studia osoba, której dane dotyczą, powinna w pierwszej kolejności skierować żądanie do studia (administratora celów biznesowych). OurWed wspiera studio w zakresie wynikającym z Umowy powierzenia.',
    ],
  },
  {
    id: 'skarga',
    title: '33. Skarga do organu nadzorczego',
    paragraphs: [
      'Przysługuje prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (PUODO), ul. Stawki 2, 00-193 Warszawa, https://uodo.gov.pl.',
    ],
  },
  {
    id: 'cookies',
    title: '34. Cookies / local storage / przechowywanie w przeglądarce',
    paragraphs: [
      'OurWed wykorzystuje mechanizmy przechowywania w przeglądarce niezbędne do działania sesji logowania (m.in. localStorage dla sesji Supabase Auth) oraz może wykorzystywać przechowywanie preferencji interfejsu.',
      'W kodzie aplikacji nie zidentyfikowano obecnie reklamowych pikseli ani aplikacjiowej analityki marketingowej. Niezależnie od tego infrastruktura lub dostawcy platformy mogą stosować techniczne pliki cookie lub inne mechanizmy przechowywania niezbędne do działania usług.',
    ],
  },
  {
    id: 'analityka',
    title: '35. Analityka i marketing',
    paragraphs: [
      'W aktualnym produkcie nie zidentyfikowano aplikacjiowych narzędzi analityki marketingowej ani newslettera. W razie wprowadzenia takich funkcji Polityka zostanie zaktualizowana.',
    ],
  },
  {
    id: 'zautomatyzowane',
    title: '36. Zautomatyzowane podejmowanie decyzji',
    paragraphs: [
      'OurWed nie stosuje zautomatyzowanego podejmowania decyzji wywołującego skutki prawne wobec użytkownika w rozumieniu decyzji o ważności umowy. Funkcje AI mają charakter narzędziowy i wymagają nadzoru człowieka.',
    ],
  },
  {
    id: 'dzieci',
    title: '37. Dzieci / wiek minimalny',
    paragraphs: [
      'Usługa jest przeznaczona dla osób, które ukończyły 18 lat. OurWed nie jest skierowany do dzieci.',
    ],
  },
  {
    id: 'bezpieczenstwo',
    title: '38. Bezpieczeństwo',
    paragraphs: [
      'Stosujemy środki techniczne i organizacyjne adekwatne do charakteru Usługi (m.in. kontrolę dostępu, izolację danych konta, prywatne przechowywanie plików). Żaden system nie gwarantuje absolutnego bezpieczeństwa.',
    ],
  },
  {
    id: 'zmiany',
    title: '39. Zmiany Polityki prywatności',
    paragraphs: [
      'Polityka może być aktualizowana z uzasadnionych przyczyn (prawo, produkt, dostawcy, bezpieczeństwo). Istotne zmiany będą komunikowane w sposób adekwatny do ich charakteru.',
    ],
  },
  {
    id: 'kontakt-koniec',
    title: '40. Kontakt',
    paragraphs: [
      `W sprawach tej Polityki prosimy o kontakt: ${LEGAL_OPERATOR.email}.`,
    ],
  },
]
