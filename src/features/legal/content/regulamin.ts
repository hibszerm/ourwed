export type LegalSection = {
  id: string
  title: string
  paragraphs: string[]
}

export const REGULAMIN_TITLE = 'Regulamin OurWed'

export const REGULAMIN_SECTIONS: LegalSection[] = [
  {
    id: 'informacje-ogolne',
    title: '1. Informacje ogólne',
    paragraphs: [
      'Niniejszy Regulamin określa zasady korzystania z platformy OurWed dostępnej pod adresem ourwed.pl oraz powiązanych podstron i aplikacji webowej.',
      'Korzystając z OurWed, użytkownik potwierdza, że zapoznał się z Regulaminem oraz Polityką prywatności i akceptuje ich treść w zakresie wymaganym do założenia konta i korzystania z usługi.',
    ],
  },
  {
    id: 'dane-uslugodawcy',
    title: '2. Dane Usługodawcy',
    paragraphs: [
      'Usługodawcą OurWed jest Video Productions Marcin Hibszer, ul. Juliusza Słowackiego 6/17, 41-800 Zabrze, Polska, NIP: 6482810484, REGON: 522500508.',
      'Kontakt w sprawach prawnych, wsparcia i ochrony danych: kontakt.ourwed@gmail.com.',
    ],
  },
  {
    id: 'definicje',
    title: '3. Definicje',
    paragraphs: [
      '„OurWed” lub „Usługa” oznacza internetową platformę SaaS (CRM) przeznaczoną dla profesjonalistów i twórców branży ślubnej.',
      '„Użytkownik” oznacza osobę, która utworzyła konto OurWed lub korzysta z Usługi w inny przewidziany sposób.',
      '„Konto” oznacza indywidualne konto Użytkownika w OurWed.',
      '„Dane klientów” oznaczają dane osobowe klientów, par młodych lub innych osób, które Użytkownik wprowadza do OurWed lub które trafiają do OurWed za pośrednictwem ankiet publicznych udostępnionych przez Użytkownika.',
      '„Okres próbny” oznacza 30-dniowy bezpłatny dostęp do funkcji OurWed zgodnie z aktualnymi zasadami produktowymi.',
      '„Plan płatny” oznacza płatny abonament OurWed aktywowany dopiero po świadomym zakupie przez Użytkownika.',
    ],
  },
  {
    id: 'charakter',
    title: '4. Charakter i przeznaczenie OurWed',
    paragraphs: [
      'OurWed jest narzędziem CRM wspierającym prowadzenie zleceń ślubnych i pokrewnych: zarządzanie zleceniami, klientami, ankietami, dokumentami, finansami zleceń, kalendarzem, lokalizacjami i powiązanymi funkcjami.',
      'OurWed nie jest kancelarią prawną, nie świadczy porad prawnych i nie gwarantuje skuteczności prawnej wygenerowanych dokumentów.',
      'Usługa jest przeznaczona dla osób dorosłych korzystających z niej w ramach działalności zawodowej lub twórczej związanej z branżą ślubną, w tym przedsiębiorców, osób prowadzących działalność gospodarczą (także nieewidencjonowaną, o ile jest to zgodne z prawem) oraz innych użytkowników profesjonalnych.',
    ],
  },
  {
    id: 'wymagania-techniczne',
    title: '5. Wymagania techniczne',
    paragraphs: [
      'Korzystanie z OurWed wymaga urządzenia z dostępem do internetu oraz aktualnej, wspieranej przeglądarki internetowej.',
      'Niektóre funkcje (np. mapy, kalendarze, generowanie PDF, AI) wymagają połączenia z usługami zewnętrznymi i mogą być niedostępne przy braku łączności lub ograniczeniach po stronie dostawców.',
    ],
  },
  {
    id: 'konto',
    title: '6. Konto użytkownika',
    paragraphs: [
      'Aby korzystać z pełnych funkcji OurWed, Użytkownik zakłada Konto, podając m.in. imię, nazwisko, adres e-mail, hasło oraz zawód/rolę w zakresie wymaganym przez formularz rejestracyjny.',
      'Konto jest obecnie przeznaczone dla jednego użytkownika / jednego studia. Funkcje zespołowe (multi-user) nie są częścią aktualnego produktu.',
      'Użytkownik zobowiązuje się podawać dane prawdziwe i aktualne oraz dbać o poufność danych logowania.',
    ],
  },
  {
    id: 'warunki-18',
    title: '7. Warunki korzystania i wymóg 18+',
    paragraphs: [
      'Usługa jest dostępna wyłącznie dla osób, które ukończyły 18 lat.',
      'Zakładając Konto, Użytkownik oświadcza, że spełnia ten wymóg oraz że jest uprawniony do korzystania z OurWed zgodnie z obowiązującym prawem.',
    ],
  },
  {
    id: 'bezpieczenstwo-konta',
    title: '8. Bezpieczeństwo konta',
    paragraphs: [
      'Użytkownik ponosi odpowiedzialność za działania wykonane przy użyciu jego Konta, o ile nie wynikają one z okoliczności leżących po stronie Usługodawcy.',
      'W razie podejrzenia nieuprawnionego dostępu Użytkownik powinien niezwłocznie zmienić hasło i skontaktować się z Usługodawcą.',
    ],
  },
  {
    id: 'okres-probny',
    title: '9. Okres próbny',
    paragraphs: [
      'Nowi użytkownicy mogą otrzymać 30-dniowy Okres próbny z dostępem do funkcji OurWed zgodnie z aktualnymi zasadami produktowymi.',
      'Okres próbny jest całkowicie bezpłatny i nie wymaga podania karty płatniczej.',
      'Zakończenie Okresu próbnego nie powoduje automatycznego rozpoczęcia płatnego abonamentu ani automatycznego obciążenia środkami Użytkownika.',
    ],
  },
  {
    id: 'po-probie',
    title: '10. Dostęp po zakończeniu okresu próbnego',
    paragraphs: [
      'Po zakończeniu Okresu próbnego Konto może przejść w tryb tylko do odczytu zgodnie z mechanizmami uprawnień OurWed.',
      'Istniejące dane pozostają widoczne, natomiast tworzenie, edycja lub generowanie aktywnych treści CRM może być niedostępne do czasu ręcznej aktywacji Planu płatnego.',
    ],
  },
  {
    id: 'plany-i-ceny',
    title: '11. Plany płatne i ceny',
    paragraphs: [
      'Aktualnie komunikowane ceny Planów płatnych wynoszą 49 zł brutto miesięcznie oraz 490 zł brutto rocznie, o ile w aplikacji lub na stronie nie wskazano inaczej.',
      'Ceny prezentowane Użytkownikowi są cenami finalnymi (brutto). Faktury są wystawiane zgodnie z aktualnym statusem podatkowym Usługodawcy.',
      'Usługodawca zastrzega możliwość aktualizacji cennika; zmiany cen nie wpływają wstecz na już opłacony okres rozliczeniowy.',
    ],
  },
  {
    id: 'zawarcie-platnej',
    title: '12. Zawarcie płatnej umowy',
    paragraphs: [
      'Płatny abonament rozpoczyna się wyłącznie po świadomym zakupie dokonanym przez Użytkownika.',
      'Do czasu udostępnienia płatności online OurWed nie pobiera opłat abonamentowych i nie realizuje automatycznych obciążeń.',
    ],
  },
  {
    id: 'odnawianie',
    title: '13. Automatyczne odnawianie abonamentu',
    paragraphs: [
      'Po zawarciu płatnej umowy Plan płatny odnawia się automatycznie na wybrany okres rozliczeniowy, aż do rezygnacji z odnowienia.',
      'Informacje o sposobie płatności, potwierdzeniach i fakturowaniu są przedstawiane w procesie zakupu oraz w dokumentach powiązanych z dostawcą płatności.',
    ],
  },
  {
    id: 'rezygnacja',
    title: '14. Rezygnacja z odnowienia',
    paragraphs: [
      'Użytkownik może zrezygnować z automatycznego odnawiania w dowolnym momencie zgodnie z mechanizmem udostępnionym w produkcie lub u dostawcy płatności.',
      'Rezygnacja zatrzymuje przyszłe odnowienia; dostęp do Planu płatnego pozostaje aktywny do końca już opłaconego okresu rozliczeniowego.',
    ],
  },
  {
    id: 'faktury',
    title: '15. Faktury i rozliczenia',
    paragraphs: [
      'W związku z płatnym abonamentem Usługodawca wystawia dokumenty rozliczeniowe zgodnie z obowiązującymi przepisami oraz swoim aktualnym statusem podatkowym.',
      'Użytkownik powinien podać poprawne dane do rozliczeń w zakresie wymaganym przez proces zakupowy.',
    ],
  },
  {
    id: 'prawa-konsumenta',
    title: '16. Prawa konsumenta i przedsiębiorcy na prawach konsumenta',
    paragraphs: [
      'OurWed nie jest usługą wyłącznie B2B. Jeżeli Użytkownikowi przysługują uprawnienia konsumenta albo przedsiębiorcy na prawach konsumenta wynikające z bezwzględnie obowiązujących przepisów prawa polskiego, Regulamin nie ogranicza tych uprawnień.',
      'Postanowienia Regulaminu stosuje się z uwzględnieniem przepisów o ochronie konsumentów oraz przepisów o umowach zawieranych na odległość.',
    ],
  },
  {
    id: 'odstapienie',
    title: '17. Odstąpienie od umowy, gdy ma zastosowanie',
    paragraphs: [
      'W przypadkach przewidzianych prawem Użytkownikowi będącemu konsumentem (lub korzystającemu z ochrony analogicznej) może przysługiwać prawo odstąpienia od umowy zawartej na odległość w terminie 14 dni, z uwzględnieniem wyjątków ustawowych dotyczących treści cyfrowych i usług cyfrowych.',
      'Przy zawieraniu płatnej umowy Usługodawca udostępnia wymagane informacje przedumowne oraz — gdy ma to zastosowanie — umożliwia złożenie żądania rozpoczęcia świadczenia usługi cyfrowej przed upływem terminu odstąpienia, zgodnie z obowiązującymi przepisami.',
      'Informacje o odstąpieniu i zwrotach są przedstawiane w procesie zakupu oraz w komunikacji po zakupie.',
    ],
  },
  {
    id: 'funkcje',
    title: '18. Funkcje platformy',
    paragraphs: [
      'OurWed może obejmować m.in.: zarządzanie ślubami i sesjami, danymi klientów, pakietami i usługami dodatkowymi, ankietami (w tym ankietą umowną i przedślubną), ewidencją płatności dotyczących zlecenia, kalendarzem, lokalizacjami i wyliczeniami tras, szablonami dokumentów, generowaniem umów DOCX/PDF, przechowywaniem plików, powiadomieniami e-mail oraz funkcjami AI wspomagającymi pracę z dokumentami.',
      'Zakres dostępnych funkcji może zależeć od statusu Konta (okres próbny / plan płatny / tryb tylko do odczytu) oraz od tego, które integracje Użytkownik świadomie włączy.',
    ],
  },
  {
    id: 'dane-klientow',
    title: '19. Dane klientów i odpowiedzialność użytkownika',
    paragraphs: [
      'Użytkownik decyduje, jakie Dane klientów wprowadza do OurWed i w jakim celu je przetwarza. OurWed nie staje się właścicielem Danych klientów Użytkownika.',
      'W zakresie przetwarzania Danych klientów na rzecz Użytkownika zastosowanie ma Umowa powierzenia przetwarzania danych osobowych dostępna pod adresem /powierzenie-danych.',
      'Użytkownik odpowiada za zgodność z prawem przetwarzania Danych klientów, w tym za podstawę prawną, minimalizację danych oraz treść ankiet i szablonów, które konfiguruje.',
      'OurWed nie wymaga PESEL jako standardowego pola konta lub danych klienta. Jeżeli szablony lub zmienne umożliwiają przetwarzanie numeru PESEL lub innego identyfikatora krajowego, Użytkownik odpowiada za ustalenie odpowiedniej podstawy prawnej, konieczności, proporcjonalności oraz zakresu takiego przetwarzania.',
      'Użytkownik powinien unikać niepotrzebnego wprowadzania danych szczególnych kategorii, chyba że jest to rzeczywiście wymagane jego prawnie uzasadnionym celem przetwarzania.',
    ],
  },
  {
    id: 'ankiety',
    title: '20. Ankiety publiczne',
    paragraphs: [
      'Użytkownik może udostępniać klientom publiczne linki do ankiet. Osoby wypełniające ankietę przekazują dane w związku z realizacją zlecenia przez studio Użytkownika, z wykorzystaniem platformy OurWed.',
      'Użytkownik powinien zapewnić, że osoby wypełniające ankietę otrzymają adekwatną informację o przetwarzaniu danych (w tym poprzez dostępne w OurWed odwołania do informacji prywatności).',
    ],
  },
  {
    id: 'dokumenty',
    title: '21. Dokumenty i generowanie umów',
    paragraphs: [
      'OurWed umożliwia przygotowywanie i generowanie dokumentów na podstawie szablonów oraz danych zlecenia. Wygenerowane dokumenty należy zawsze sprawdzić przed użyciem.',
      'OurWed nie oferuje obecnie kwalifikowanego podpisu elektronicznego jako usługi e-sign. Status „podpisana” w produkcie ma charakter operacyjny i nie zastępuje wymogów prawa dotyczących formy czynności prawnej.',
      'Użytkownik powinien przechowywać własne kopie dokumentów o krytycznym znaczeniu poza platformą.',
    ],
  },
  {
    id: 'ai',
    title: '22. AI',
    paragraphs: [
      'Wybrane funkcje OurWed wykorzystują sztuczną inteligencję. Gdy Użytkownik świadomie uruchomi funkcję AI, treść niezbędna do wykonania operacji (np. treść dokumentu lub powiązane dane zlecenia) może zostać przekazana zewnętrznemu dostawcy usługi AI.',
      'AI wspomaga przetwarzanie i generowanie treści, nie stanowi porady prawnej, nie rozstrzyga o ważności umowy i może generować błędy. Wynik zawsze wymaga weryfikacji przez Użytkownika.',
    ],
  },
  {
    id: 'integracje',
    title: '23. Integracje zewnętrzne',
    paragraphs: [
      'OurWed korzysta z usług zewnętrznych niezbędnych lub pomocniczych dla działania platformy, m.in. infrastruktury chmurowej, poczty transakcyjnej, map, AI oraz konwersji dokumentów.',
      'Szczegóły dotyczące odbiorców danych znajdują się w Polityce prywatności oraz Umowie powierzenia.',
    ],
  },
  {
    id: 'kalendarze-mapy',
    title: '24. Kalendarze i mapy',
    paragraphs: [
      'Integracje kalendarzowe (np. Google Calendar) są opcjonalne i uruchamiane przez Użytkownika.',
      'Funkcje lokalizacji wykorzystują adresy i współrzędne miejsc związanych ze zleceniem. OurWed nie korzysta z bieżącej lokalizacji GPS urządzenia Użytkownika.',
    ],
  },
  {
    id: 'tresci',
    title: '25. Treści użytkownika i prawa do treści',
    paragraphs: [
      'Użytkownik zachowuje prawa do własnych treści: notatek, szablonów, dokumentów, logo, konfiguracji ankiet, przesłanych plików i innych treści wygenerowanych lub wprowadzonych przez siebie.',
      'Udzielając Usługodawcy dostępu do tych treści, Użytkownik upoważnia Usługodawcę do hostowania, przetwarzania, przekształcania, tworzenia kopii zapasowych i transmisji treści wyłącznie w zakresie niezbędnym do świadczenia zamówionych funkcji OurWed, z uwzględnieniem Regulaminu i Umowy powierzenia.',
    ],
  },
  {
    id: 'niedozwolone',
    title: '26. Niedozwolone korzystanie',
    paragraphs: [
      'Zabronione jest m.in.: korzystanie z Usługi niezgodnie z prawem; obchodzenie zabezpieczeń; wprowadzanie złośliwego oprogramowania; nadużywanie automatyzacji; nieuprawnione udostępnianie Konta; naruszanie praw osób trzecich; przetwarzanie danych bez podstawy prawnej; próby zakłócania działania Usługi.',
      'Usługodawca może ograniczyć dostęp lub zawiesić Konto w przypadku uzasadnionego podejrzenia naruszenia powyższych zasad, z zachowaniem przepisów bezwzględnie obowiązujących.',
    ],
  },
  {
    id: 'dostepnosc',
    title: '27. Dostępność, konserwacja i zmiany techniczne',
    paragraphs: [
      'Usługodawca dokłada starań, aby OurWed działało poprawnie, jednak nie gwarantuje nieprzerwanej dostępności.',
      'Dopuszczalne są przerwy związane z konserwacją, awariami, aktualizacjami, działaniem dostawców zewnętrznych lub siłą wyższą.',
      'Usługodawca może wprowadzać zmiany techniczne i funkcjonalne służące rozwojowi, bezpieczeństwu lub jakości Usługi.',
    ],
  },
  {
    id: 'brak-sla',
    title: '28. Brak SLA',
    paragraphs: [
      'O ile odrębna umowa nie stanowi inaczej, OurWed nie obejmuje gwarantowanego poziomu dostępności (SLA), gwarantowanego czasu reakcji ani gwarantowanych kopii zapasowych poza standardowymi mechanizmami infrastruktury.',
    ],
  },
  {
    id: 'bezpieczenstwo-kopie',
    title: '29. Bezpieczeństwo i kopie danych',
    paragraphs: [
      'Usługodawca stosuje środki techniczne i organizacyjne adekwatne do charakteru Usługi, jednak żaden system nie jest wolny od ryzyka.',
      'Użytkownik powinien eksportować i przechowywać własne kopie dokumentów krytycznych. Kopie zapasowe infrastruktury mogą istnieć przez ograniczony czas zgodnie z cyklami dostawców.',
    ],
  },
  {
    id: 'odpowiedzialnosc',
    title: '30. Odpowiedzialność',
    paragraphs: [
      'Usługodawca odpowiada na zasadach przewidzianych przepisami prawa. Regulamin nie wyłącza ani nie ogranicza odpowiedzialności w zakresie, w jakim takie wyłączenie lub ograniczenie jest niedopuszczalne na mocy bezwzględnie obowiązujących przepisów, w szczególności wobec konsumentów.',
      'W pozostałym zakresie Usługodawca nie odpowiada za szkody wynikające z decyzji Użytkownika podjętych na podstawie treści wygenerowanych przez AI lub szablony, ani za treść i legalność danych wprowadzonych przez Użytkownika.',
    ],
  },
  {
    id: 'brak-porad',
    title: '31. Brak usług/porad prawnych',
    paragraphs: [
      'OurWed nie świadczy usług prawnych. Dokumenty, szablony, podpowiedzi AI i treści pomocnicze mają charakter narzędziowy i wymagają samodzielnej oceny Użytkownika lub konsultacji z prawnikiem.',
    ],
  },
  {
    id: 'usuniecie-konta',
    title: '32. Usunięcie konta',
    paragraphs: [
      'Użytkownik może żądać usunięcia Konta, kontaktując się na adres kontakt.ourwed@gmail.com lub — gdy funkcja będzie dostępna w produkcie — korzystając z mechanizmu usunięcia Konta w ustawieniach.',
      'Po skutecznym usunięciu Konta dane aktywne są usuwane lub anonimizowane bez zbędnej zwłoki, z wyjątkiem przypadków, w których przechowywanie jest wymagane przepisami prawa, dla ustalenia, dochodzenia lub obrony roszczeń, obowiązków księgowych lub podatkowych, bezpieczeństwa albo innych obowiązujących obowiązków prawnych. Kopie zapasowe infrastruktury mogą przez pewien czas zawierać pozostałości danych zgodnie z cyklami dostawców.',
    ],
  },
  {
    id: 'zakonczenie',
    title: '33. Zakończenie świadczenia usług',
    paragraphs: [
      'Usługodawca może zakończyć lub istotnie zmienić świadczenie Usługi z ważnych przyczyn (w tym prawnych, technicznych lub biznesowych), informując Użytkowników z odpowiednim wyprzedzeniem, o ile jest to możliwe i wymagane.',
      'Użytkownik może zaprzestać korzystania z Usługi w każdym czasie, z zastrzeżeniem zasad dotyczących już opłaconych okresów abonamentu.',
    ],
  },
  {
    id: 'reklamacje',
    title: '34. Reklamacje i kontakt',
    paragraphs: [
      'Reklamacje dotyczące Usługi można składać na adres kontakt.ourwed@gmail.com, opisując problem i dane kontaktowe.',
      'Usługodawca rozpatruje reklamacje bez zbędnej zwłoki i udziela odpowiedzi na wskazany adres e-mail.',
    ],
  },
  {
    id: 'zmiany',
    title: '35. Zmiany Regulaminu',
    paragraphs: [
      'Usługodawca może zmieniać Regulamin z uzasadnionych przyczyn, w szczególności: zmiany prawa, funkcje produktu, bezpieczeństwo, infrastrukturę techniczną, dostawców usług lub model komercyjny.',
      'Istotne zmiany będą komunikowane z odpowiednim wyprzedzeniem e-mailem i/lub w aplikacji, o ile jest to możliwe.',
      'Usługodawca nie zastrzega sobie nieograniczonego, arbitralnego prawa do zmiany umowy bez uzasadnienia.',
    ],
  },
  {
    id: 'prawo',
    title: '36. Prawo właściwe',
    paragraphs: [
      'Do Regulaminu oraz świadczenia Usługi stosuje się prawo polskie, z zastrzeżeniem przepisów bezwzględnie obowiązujących chroniących konsumentów.',
      'Spory będą rozstrzygane przez właściwe sądy polskie, z uwzględnieniem właściwości wynikającej z przepisów o ochronie konsumentów.',
    ],
  },
  {
    id: 'koncowe',
    title: '37. Postanowienia końcowe',
    paragraphs: [
      'Jeżeli którekolwiek postanowienie Regulaminu okaże się nieważne lub nieskuteczne, pozostałe postanowienia pozostają w mocy.',
      'W sprawach nieuregulowanych zastosowanie mają przepisy prawa polskiego oraz Polityka prywatności OurWed.',
    ],
  },
  {
    id: 'powierzenie',
    title: '38. Powierzenie danych osobowych',
    paragraphs: [
      'Zasady powierzenia przetwarzania Danych klientów na rzecz Usługodawcy określa Umowa powierzenia przetwarzania danych osobowych dostępna pod adresem /powierzenie-danych, stanowiąca integralny instrument prawny powiązany z Regulaminem w zakresie przetwarzania wykonywanego w imieniu Użytkownika.',
    ],
  },
]
