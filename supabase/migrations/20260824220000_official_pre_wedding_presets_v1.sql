-- Official OurWed V1 pre-wedding presets for NEW accounts only.
-- Copies Film / Fotografia / Fotografia + Film onto the newly created owner.
-- source_key is provenance of that original copy — not a live-sync pointer.
--
-- THIS MIGRATION MUST NOT:
--   - INSERT ... SELECT from existing profiles/users/owners
--   - UPDATE existing questionnaire_templates
--   - mutate wedding_questionnaires / schema_snapshot_json
--   - backfill studios created before this function existed
--
-- handle_new_user runs only AFTER INSERT ON auth.users, so existing
-- accounts are untouched.

create or replace function public.provision_official_pre_wedding_presets(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owner_id is null then
    return;
  end if;

  insert into public.questionnaire_templates (
    owner_id, name, source_key, title, introduction, schema_json,
    type, is_default, is_archived
  )
  select
    p_owner_id,
    'Film',
    'pre_wedding_video_v1',
    'Ankieta przedślubna',
    'Cześć! Już niedługo się widzimy. Potrzebujemy od Was kilku informacji, które pomogą nam dobrze przygotować się do Waszego dnia.',
    $ow_video_v1${"sections":[{"id":"s1","title":"O Was i Wasz ślub","questions":[{"id":"q1","type":"date","label":"Data ślubu","required":true,"weddingDayMapping":"weddingDate"},{"id":"q2","type":"short_text","label":"Imię i Nazwisko Panny Młodej","required":true,"weddingDayMapping":"brideName"},{"id":"q3","type":"short_text","label":"Telefon do Panny Młodej","required":true,"weddingDayMapping":"bridePhone"},{"id":"q5","type":"short_text","label":"Imię i Nazwisko Pana Młodego","required":true,"weddingDayMapping":"groomName"},{"id":"q6","type":"short_text","label":"Telefon do Pana Młodego","required":true,"weddingDayMapping":"groomPhone"}],"description":"Na początek potwierdźcie podstawowe dane dotyczące Was i dnia ślubu."},{"id":"s2","title":"Przygotowania Panny Młodej","questions":[{"id":"q4","type":"address","label":"Adres przygotowań Panny Młodej","required":true,"placeholder":"Wpisz adres lub nazwę miejsca","weddingDayMapping":"bridePreparationLocation"}],"description":"Podajcie miejsce, w którym odbędą się przygotowania Panny Młodej."},{"id":"s3","title":"Przygotowania Pana Młodego","questions":[{"id":"q7","type":"address","label":"Adres przygotowań Pana Młodego","required":true,"placeholder":"Wpisz adres lub nazwę miejsca","weddingDayMapping":"groomPreparationLocation"}],"description":"Podajcie miejsce, w którym odbędą się przygotowania Pana Młodego."},{"id":"s4","title":"Błogosławieństwo i wyjazd","questions":[{"id":"q8","type":"short_text","label":"Godzina wyjazdu Pana Młodego do Panny Młodej. Jeśli przygotowujecie się pod jednym adresem wpiszcie to też tutaj.","required":true,"placeholder":"np. 12:00 lub „Nie dotyczy, przygotowujemy się razem\"","weddingDayMapping":"groomDepartureNote"},{"id":"q9","type":"single_choice","label":"Czy i gdzie będzie błogosławieństwo?","options":["Tak, jedno wspólne u Pana Młodego","Tak, jedno wspólne u Panny Młodej","Tak, osobne błogosławieństwa","Nie będzie błogosławieństwa / Prosimy nie uwieczniać"],"required":true,"weddingDayMapping":"blessingPlan"}],"description":"Opowiedzcie nam, jak będzie wyglądało spotkanie przed ceremonią i wyjazd."},{"id":"s5","title":"Ceremonia","questions":[{"id":"q10","type":"time","label":"Godzina wyjazdu do Kościoła / USC","required":true,"weddingDayMapping":"departureToCeremonyTime"},{"id":"q11","type":"address","label":"Adres Kościoła / USC / Ślubu plenerowego","required":true,"placeholder":"Wpisz adres lub nazwę miejsca","weddingDayMapping":"ceremonyLocation"},{"id":"q12","type":"time","label":"Godzina Ślubu","required":true,"weddingDayMapping":"ceremonyTime"},{"id":"q13","type":"long_text","label":"Ważne dodatkowe elementy Ślubu - wpiszcie tutaj proszę na czym szczególnie Wam zależy podczas CEREMONII ŚLUBU co miałoby zostać uwiecznione oprócz przysięgi.","required":true,"weddingDayMapping":"ceremonyNotes"}],"description":"Podajcie miejsce, godzinę i najważniejsze informacje dotyczące ceremonii."},{"id":"s6","title":"Po ceremonii","questions":[{"id":"q15","type":"single_choice","label":"Życzenia od Gości","options":["Życzenia odbędą się przed kościołem - bezpośrednio po ceremonii","Życzenia odbędą się na sali"],"required":true,"weddingDayMapping":"guestWishesPlan"}],"description":"Dajcie znać, jak mają wyglądać życzenia i zdjęcie grupowe po ślubie."},{"id":"s7","title":"Przyjęcie weselne","questions":[{"id":"q16","type":"address","label":"Nazwa i adres sali weselnej","required":true,"placeholder":"Wpisz nazwę sali lub adres","weddingDayMapping":"receptionVenue"},{"id":"q17","type":"time","label":"Godzina przyjazdu na salę weselną","required":true,"weddingDayMapping":"receptionArrivalTime"},{"id":"q18","type":"short_text","label":"Liczba gości weselnych","required":true,"placeholder":"np. 80","weddingDayMapping":"guestCount"},{"id":"q19","type":"yes_no","label":"Czy chcecie ujęcia rodzinne / ze znajomymi w mniejszych grupach przy sali?","options":["Tak","Nie"],"required":true,"weddingDayMapping":"smallGroupPhotosPlan"},{"id":"q20","type":"short_text","label":"Jeśli macie harmonogram wesela, wklejcie go poniżej albo napiszcie, gdzie możemy go znaleźć.","required":true,"placeholder":"np. wklejony poniżej albo link do dokumentu"}],"description":"Podajcie informacje o sali i najważniejszych punktach przyjęcia."},{"id":"s8","title":"Film","questions":[{"id":"q21","type":"long_text","label":"Na czym szczególnie zależy Wam na filmie?","required":true,"weddingDayMapping":"photoVideoPriorities"},{"id":"q22","type":"single_choice","label":"Zazwyczaj wybieramy licencjonowaną muzykę do teledysku i filmu. Jeśli jakiś utwór jest dla Was ważny i chcecie, aby został użyty w teledysku lub filmie, podeślijcie go proszę przed dniem wesela.","options":["Zdajemy się na Wasz wybór","Podeślemy własne propozycje"],"required":true},{"id":"q23","type":"long_text","label":"Czy jest coś co Wam się podoba / nie podoba na filmie? (Na przykład czarno białe kadry, rozmazane ujęcia itp.)","required":true},{"id":"q_speeches","type":"long_text","label":"Czy planujecie przemowy podczas Wesela? (Jeśli tak, to powiedzcie proszę kiedy i kto dokładnie będzie przemawiał)","required":true}],"description":"Napiszcie nam, co jest dla Was szczególnie ważne i jaki styl najbardziej Wam odpowiada."},{"id":"s9","title":"Usługodawcy","questions":[{"id":"q25","type":"long_text","label":"Wymieńcie nam proszę wszystkich Waszych usługodawców, z których korzystacie tego dnia (suknie, makijaż, dekoracje, fryzura itp.).","required":true},{"id":"q26","type":"long_text","label":"Podajcie proszę nazwę DJ/Zespołu.","required":true,"weddingDayMapping":"djBandProvider"}],"description":"Podajcie osoby i firmy, z którymi będziemy współpracować w dniu ślubu."},{"id":"s10","title":"Ważne informacje","questions":[{"id":"q24","type":"long_text","label":"Jeśli są jakiekolwiek ważne kwestie rodzinne, które wymagają uwagi lub zrozumienia z naszej strony - prosimy o informację.","required":false,"weddingDayMapping":"sensitiveFamilyNotes"}],"description":"Ta część jest widoczna wyłącznie dla fotografa i służy lepszemu przygotowaniu zespołu do dnia ślubu."},{"id":"s11","title":"Wskazówki","questions":[{"id":"q27_info","type":"information","label":"","helpText":"Łapcie kilka wskazówek od nas :)\n1. Podczas przysięgi patrzcie na siebie i stójcie do siebie przodem.\n2. Na filmie najlepiej wygląda jednolite (najlepiej białe lub ciepłe) oświetlenie na sali.\n3. Jeśli jakieś detale są dla Was ważne to przygotujcie je proszę na przygotowaniach w jednym miejscu.\n4. Nie stresujcie się za bardzo - na pewno wszystko się uda :)\n5. Jeśli planujecie atrakcje na Weselu, które chcecie mieć na filmie pamiętajcie aby zaplanować je przed końcem naszej pracy.","required":false},{"id":"q28","type":"acknowledgement","label":"Zapoznaliśmy się ze wskazówkami","required":true}],"description":"Na koniec kilka krótkich wskazówek, które pomogą nam wspólnie stworzyć najlepsze zdjęcia i film."}]}$ow_video_v1$::jsonb,
    'pre_wedding',
    false,
    false
  where not exists (
    select 1
    from public.questionnaire_templates existing
    where existing.owner_id = p_owner_id
      and existing.source_key = 'pre_wedding_video_v1'
  );

  insert into public.questionnaire_templates (
    owner_id, name, source_key, title, introduction, schema_json,
    type, is_default, is_archived
  )
  select
    p_owner_id,
    'Fotografia',
    'pre_wedding_photo_v1',
    'Ankieta przedślubna',
    'Cześć! Już niedługo się widzimy. Potrzebujemy od Was kilku informacji, które pomogą nam dobrze przygotować się do Waszego dnia.',
    $ow_photo_v1${"sections":[{"id":"s1","title":"O Was i Wasz ślub","questions":[{"id":"q1","type":"date","label":"Data ślubu","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"weddingDate"},{"id":"q2","type":"short_text","label":"Imię i Nazwisko Panny Młodej","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"brideName"},{"id":"q3","type":"short_text","label":"Telefon do Panny Młodej","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"bridePhone"},{"id":"q5","type":"short_text","label":"Imię i Nazwisko Pana Młodego","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"groomName"},{"id":"q6","type":"short_text","label":"Telefon do Pana Młodego","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"groomPhone"}],"description":"Na początek potwierdźcie podstawowe dane dotyczące Was i dnia ślubu.","extraSectionKeys":[]},{"id":"s2","title":"Przygotowania Panny Młodej","questions":[{"id":"q4","type":"address","label":"Adres przygotowań Panny Młodej","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":"Wpisz adres lub nazwę miejsca","weddingDayMapping":"bridePreparationLocation"}],"description":"Podajcie miejsce, w którym odbędą się przygotowania Panny Młodej.","extraSectionKeys":[]},{"id":"s3","title":"Przygotowania Pana Młodego","questions":[{"id":"q7","type":"address","label":"Adres przygotowań Pana Młodego","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":"Wpisz adres lub nazwę miejsca","weddingDayMapping":"groomPreparationLocation"}],"description":"Podajcie miejsce, w którym odbędą się przygotowania Pana Młodego.","extraSectionKeys":[]},{"id":"s4","title":"Błogosławieństwo i wyjazd","questions":[{"id":"q8","type":"short_text","label":"Godzina wyjazdu Pana Młodego do Panny Młodej. Jeśli przygotowujecie się pod jednym adresem wpiszcie to też tutaj.","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":"np. 12:00 lub „Nie dotyczy, przygotowujemy się razem\"","weddingDayMapping":"groomDepartureNote"},{"id":"q9","type":"single_choice","label":"Czy i gdzie będzie błogosławieństwo?","hidden":false,"options":["Tak, jedno wspólne u Pana Młodego","Tak, jedno wspólne u Panny Młodej","Tak, osobne błogosławieństwa","Nie będzie błogosławieństwa / Prosimy nie uwieczniać"],"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"blessingPlan"}],"description":"Opowiedzcie nam, jak będzie wyglądało spotkanie przed ceremonią i wyjazd.","extraSectionKeys":[]},{"id":"s5","title":"Ceremonia","questions":[{"id":"q10","type":"time","label":"Godzina wyjazdu do Kościoła / USC","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"departureToCeremonyTime"},{"id":"q11","type":"address","label":"Adres Kościoła / USC / Ślubu plenerowego","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":"Wpisz adres lub nazwę miejsca","weddingDayMapping":"ceremonyLocation"},{"id":"q12","type":"time","label":"Godzina Ślubu","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"ceremonyTime"},{"id":"q13","type":"long_text","label":"Ważne dodatkowe elementy Ślubu - wpiszcie tutaj proszę na czym szczególnie Wam zależy podczas CEREMONII ŚLUBU co miałoby zostać uwiecznione oprócz przysięgi.","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"ceremonyNotes"}],"description":"Podajcie miejsce, godzinę i najważniejsze informacje dotyczące ceremonii.","extraSectionKeys":[]},{"id":"s6","title":"Po ceremonii","questions":[{"id":"q14","type":"single_choice","label":"Czy i gdzie chcecie zdjęcie grupowe ze wszystkimi gośćmi?","hidden":false,"options":["Chcemy pod kościołem","Chcemy pod salą","Nie chcemy"],"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"groupPhotoPlan"},{"id":"q15","type":"single_choice","label":"Życzenia od Gości","hidden":false,"options":["Przed kościołem/USC - bezpośrednio po ceremonii","Życzenia odbędą się na sali"],"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"guestWishesPlan"}],"description":"Dajcie znać, jak mają wyglądać życzenia i zdjęcie grupowe po ślubie.","extraSectionKeys":[]},{"id":"s7","title":"Przyjęcie weselne","questions":[{"id":"q16","type":"address","label":"Nazwa i adres sali weselnej","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":"Wpisz nazwę sali lub adres","weddingDayMapping":"receptionVenue"},{"id":"q17","type":"time","label":"Godzina przyjazdu na salę weselną","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"receptionArrivalTime"},{"id":"q18","type":"short_text","label":"Liczba gości weselnych","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":"np. 80","weddingDayMapping":"guestCount"},{"id":"q19","type":"yes_no","label":"Czy chcecie zdjęcia rodzinne/ze znajomymi w mniejszych grupach przy sali?","hidden":false,"options":["Tak","Nie"],"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"smallGroupPhotosPlan"},{"id":"q20","type":"short_text","label":"Jeśli macie harmonogram wesela, wklejcie go poniżej albo napiszcie, gdzie możemy go znaleźć.","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":"np. wklejony poniżej albo link do dokumentu","weddingDayMapping":null}],"description":"Podajcie informacje o sali i najważniejszych punktach przyjęcia.","extraSectionKeys":[]},{"id":"s8","title":"Zdjęcia i film","questions":[{"id":"q21","type":"long_text","label":"Dajcie proszę znać na czym szczególnie Wam zależy na zdjęciach i filmie? :)","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"photoVideoPriorities"},{"id":"q22","type":"single_choice","label":"Zazwyczaj wybieramy licencjonowaną muzykę do teledysku i filmu. Jeśli jakiś utwór jest dla Was ważny i chcecie, aby został użyty w teledysku lub filmie, podeślijcie go proszę przed dniem wesela.","hidden":false,"options":["Zdajemy się na Wasz wybór","Podeślemy własne propozycje","Nie mamy filmu"],"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":null},{"id":"q23","type":"long_text","label":"Czy jest coś w fotografii lub filmie co Wam się podoba/nie podoba? (Na przykład czarno białe kadry, rozmazane ujęcia)","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":null}],"description":"Napiszcie nam, co jest dla Was szczególnie ważne i jaki styl najbardziej Wam odpowiada.","extraSectionKeys":[]},{"id":"s9","title":"Usługodawcy","questions":[{"id":"q25","type":"long_text","label":"Wymieńcie nam proszę wszystkich Waszych usługodawców, z których korzystacie tego dnia (suknie, makijaż, dekoracje, fryzura itp.).","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":null},{"id":"q26","type":"long_text","label":"Podajcie proszę nazwę osób (DJ/Zespół) odpowiedzialnych za oprawę muzyczną na weselu :)","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":"djBandProvider"}],"description":"Podajcie osoby i firmy, z którymi będziemy współpracować w dniu ślubu.","extraSectionKeys":[]},{"id":"s10","title":"Ważne informacje","questions":[{"id":"q24","type":"long_text","label":"Jeśli są jakiekolwiek ważne kwestie rodzinne, które wymagają uwagi lub zrozumienia z naszej strony - prosimy o informację.","hidden":false,"options":null,"helpText":"Ta odpowiedź jest widoczna wyłącznie dla fotografa i nie jest udostępniana publicznie.","required":false,"extraKeys":[],"placeholder":null,"weddingDayMapping":"sensitiveFamilyNotes"}],"description":"Ta część jest widoczna wyłącznie dla fotografa i służy lepszemu przygotowaniu zespołu do dnia ślubu.","extraSectionKeys":[]},{"id":"s11","title":"Wskazówki","questions":[{"id":"q27_info","type":"information","label":"","hidden":false,"options":null,"helpText":"Łapcie kilka wskazówek od nas :)\n1. Podczas przysięgi patrzcie na siebie i stójcie do siebie przodem.\n2. Na zdjęciach i filmie najlepiej wygląda jednolite (najlepiej białe lub ciepłe) oświetlenie na sali.\n3. Jeśli jakieś detale są dla Was ważne to przygotujcie je proszę na przygotowaniach w jednym miejscu.\n4. Nie stresujcie się za bardzo - na pewno wszystko się uda :)\n5. Jeśli planujecie atrakcje na Weselu, które chcecie mieć na zdjęciach i filmie pamiętajcie aby zaplanować je przed końcem naszej pracy.","required":false,"extraKeys":[],"placeholder":null,"weddingDayMapping":null},{"id":"q28","type":"acknowledgement","label":"Zapoznaliśmy się ze wskazówkami","hidden":false,"options":null,"helpText":null,"required":true,"extraKeys":[],"placeholder":null,"weddingDayMapping":null}],"description":"Na koniec kilka krótkich wskazówek, które pomogą nam wspólnie stworzyć najlepsze zdjęcia i film.","extraSectionKeys":[]}]}$ow_photo_v1$::jsonb,
    'pre_wedding',
    false,
    false
  where not exists (
    select 1
    from public.questionnaire_templates existing
    where existing.owner_id = p_owner_id
      and existing.source_key = 'pre_wedding_photo_v1'
  );

  insert into public.questionnaire_templates (
    owner_id, name, source_key, title, introduction, schema_json,
    type, is_default, is_archived
  )
  select
    p_owner_id,
    'Fotografia + Film',
    'pre_wedding_photo_video_v1',
    'Ankieta przedślubna',
    'Cześć! Już niedługo się widzimy. Potrzebujemy od Was kilku informacji, które pomogą nam dobrze przygotować się do Waszego dnia.',
    $ow_photo_video_v1${"sections":[{"id":"s1","title":"O Was i Wasz ślub","questions":[{"id":"q1","type":"date","label":"Data ślubu","required":true,"weddingDayMapping":"weddingDate"},{"id":"q2","type":"short_text","label":"Imię i Nazwisko Panny Młodej","required":true,"weddingDayMapping":"brideName"},{"id":"q3","type":"short_text","label":"Telefon do Panny Młodej","required":true,"weddingDayMapping":"bridePhone"},{"id":"q5","type":"short_text","label":"Imię i Nazwisko Pana Młodego","required":true,"weddingDayMapping":"groomName"},{"id":"q6","type":"short_text","label":"Telefon do Pana Młodego","required":true,"weddingDayMapping":"groomPhone"}],"description":"Na początek potwierdźcie podstawowe dane dotyczące Was i dnia ślubu."},{"id":"s2","title":"Przygotowania Panny Młodej","questions":[{"id":"q4","type":"address","label":"Adres przygotowań Panny Młodej","required":true,"placeholder":"Wpisz adres lub nazwę miejsca","weddingDayMapping":"bridePreparationLocation"}],"description":"Podajcie miejsce, w którym odbędą się przygotowania Panny Młodej."},{"id":"s3","title":"Przygotowania Pana Młodego","questions":[{"id":"q7","type":"address","label":"Adres przygotowań Pana Młodego","required":true,"placeholder":"Wpisz adres lub nazwę miejsca","weddingDayMapping":"groomPreparationLocation"}],"description":"Podajcie miejsce, w którym odbędą się przygotowania Pana Młodego."},{"id":"s4","title":"Błogosławieństwo i wyjazd","questions":[{"id":"q8","type":"short_text","label":"Godzina wyjazdu Pana Młodego do Panny Młodej. Jeśli przygotowujecie się pod jednym adresem wpiszcie to też tutaj.","required":true,"placeholder":"np. 12:00 lub „Nie dotyczy, przygotowujemy się razem\"","weddingDayMapping":"groomDepartureNote"},{"id":"q9","type":"single_choice","label":"Czy i gdzie będzie błogosławieństwo?","options":["Tak, jedno wspólne u Pana Młodego","Tak, jedno wspólne u Panny Młodej","Tak, osobne błogosławieństwa","Nie będzie błogosławieństwa / Prosimy nie uwieczniać"],"required":true,"weddingDayMapping":"blessingPlan"}],"description":"Opowiedzcie nam, jak będzie wyglądało spotkanie przed ceremonią i wyjazd."},{"id":"s5","title":"Ceremonia","questions":[{"id":"q10","type":"time","label":"Godzina wyjazdu do Kościoła / USC","required":true,"weddingDayMapping":"departureToCeremonyTime"},{"id":"q11","type":"address","label":"Adres Kościoła / USC / Ślubu plenerowego","required":true,"placeholder":"Wpisz adres lub nazwę miejsca","weddingDayMapping":"ceremonyLocation"},{"id":"q12","type":"time","label":"Godzina Ślubu","required":true,"weddingDayMapping":"ceremonyTime"},{"id":"q13","type":"long_text","label":"Ważne dodatkowe elementy Ślubu - wpiszcie tutaj proszę na czym szczególnie Wam zależy podczas CEREMONII ŚLUBU co miałoby zostać uwiecznione oprócz przysięgi.","required":true,"weddingDayMapping":"ceremonyNotes"}],"description":"Podajcie miejsce, godzinę i najważniejsze informacje dotyczące ceremonii."},{"id":"s6","title":"Po ceremonii","questions":[{"id":"q14","type":"single_choice","label":"Czy i gdzie chcecie zdjęcie grupowe ze wszystkimi gośćmi?","options":["Chcemy pod kościołem","Chcemy pod salą","Nie chcemy"],"required":true,"weddingDayMapping":"groupPhotoPlan"},{"id":"q15","type":"single_choice","label":"Życzenia od Gości","options":["Przed kościołem/USC - bezpośrednio po ceremonii","Życzenia odbędą się na sali"],"required":true,"weddingDayMapping":"guestWishesPlan"}],"description":"Dajcie znać, jak mają wyglądać życzenia i zdjęcie grupowe po ślubie."},{"id":"s7","title":"Przyjęcie weselne","questions":[{"id":"q16","type":"address","label":"Nazwa i adres sali weselnej","required":true,"placeholder":"Wpisz nazwę sali lub adres","weddingDayMapping":"receptionVenue"},{"id":"q17","type":"time","label":"Godzina przyjazdu na salę weselną","required":true,"weddingDayMapping":"receptionArrivalTime"},{"id":"q18","type":"short_text","label":"Liczba gości weselnych","required":true,"placeholder":"np. 80","weddingDayMapping":"guestCount"},{"id":"q19","type":"yes_no","label":"Czy chcecie zdjęcia i ujęcia rodzinne / ze znajomymi w mniejszych grupach przy sali?","options":["Tak","Nie"],"required":true,"weddingDayMapping":"smallGroupPhotosPlan"},{"id":"q20","type":"short_text","label":"Jeśli macie harmonogram wesela, wklejcie go poniżej albo napiszcie, gdzie możemy go znaleźć.","required":true,"placeholder":"np. wklejony poniżej albo link do dokumentu"}],"description":"Podajcie informacje o sali i najważniejszych punktach przyjęcia."},{"id":"s8","title":"Zdjęcia i film","questions":[{"id":"q21","type":"long_text","label":"Dajcie proszę znać na czym szczególnie Wam zależy na zdjęciach i filmie? :)","required":true,"weddingDayMapping":"photoVideoPriorities"},{"id":"q22","type":"single_choice","label":"Zazwyczaj wybieramy licencjonowaną muzykę do teledysku i filmu. Jeśli jakiś utwór jest dla Was ważny i chcecie, aby został użyty w teledysku lub filmie, podeślijcie go proszę przed dniem wesela.","options":["Zdajemy się na Wasz wybór","Podeślemy własne propozycje"],"required":true},{"id":"q23","type":"long_text","label":"Czy jest coś w fotografii lub filmie co Wam się podoba/nie podoba? (Na przykład czarno białe kadry, rozmazane ujęcia)","required":true},{"id":"q_speeches","type":"long_text","label":"Czy planujecie przemowy podczas Wesela? (Jeśli tak, to powiedzcie proszę kiedy i kto dokładnie będzie przemawiał)","required":true}],"description":"Napiszcie nam, co jest dla Was szczególnie ważne i jaki styl najbardziej Wam odpowiada."},{"id":"s9","title":"Usługodawcy","questions":[{"id":"q25","type":"long_text","label":"Wymieńcie nam proszę wszystkich Waszych usługodawców, z których korzystacie tego dnia (suknie, makijaż, dekoracje, fryzura itp.).","required":true},{"id":"q26","type":"long_text","label":"Podajcie proszę nazwę DJ/Zespołu.","required":true,"weddingDayMapping":"djBandProvider"}],"description":"Podajcie osoby i firmy, z którymi będziemy współpracować w dniu ślubu."},{"id":"s10","title":"Ważne informacje","questions":[{"id":"q24","type":"long_text","label":"Jeśli są jakiekolwiek ważne kwestie rodzinne, które wymagają uwagi lub zrozumienia z naszej strony - prosimy o informację.","required":false,"weddingDayMapping":"sensitiveFamilyNotes"}],"description":"Ta część jest widoczna wyłącznie dla fotografa i służy lepszemu przygotowaniu zespołu do dnia ślubu."},{"id":"s11","title":"Wskazówki","questions":[{"id":"q27_info","type":"information","label":"","helpText":"Łapcie kilka wskazówek od nas :)\n1. Podczas przysięgi patrzcie na siebie i stójcie do siebie przodem.\n2. Na zdjęciach i filmie najlepiej wygląda jednolite (najlepiej białe lub ciepłe) oświetlenie na sali.\n3. Jeśli jakieś detale są dla Was ważne to przygotujcie je proszę na przygotowaniach w jednym miejscu.\n4. Nie stresujcie się za bardzo - na pewno wszystko się uda :)\n5. Jeśli planujecie atrakcje na Weselu, które chcecie mieć na zdjęciach i filmie pamiętajcie aby zaplanować je przed końcem naszej pracy.","required":false},{"id":"q28","type":"acknowledgement","label":"Zapoznaliśmy się ze wskazówkami","required":true}],"description":"Na koniec kilka krótkich wskazówek, które pomogą nam wspólnie stworzyć najlepsze zdjęcia i film."}]}$ow_photo_video_v1$::jsonb,
    'pre_wedding',
    true,
    false
  where not exists (
    select 1
    from public.questionnaire_templates existing
    where existing.owner_id = p_owner_id
      and existing.source_key = 'pre_wedding_photo_video_v1'
  );
end;
$$;

revoke all on function public.provision_official_pre_wedding_presets(uuid) from public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fname text;
  lname text;
  full_name text;
  prof text;
  template_package record;
  new_package_id uuid;
  template_form record;
begin
  fname := coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), '');
  lname := coalesce(nullif(trim(new.raw_user_meta_data->>'last_name'), ''), '');
  prof := coalesce(nullif(trim(new.raw_user_meta_data->>'profession'), ''), '');
  full_name := trim(both ' ' from fname || ' ' || lname);
  if full_name = '' then
    full_name := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  insert into public.profiles (id, first_name, last_name, profession)
  values (new.id, fname, lname, prof)
  on conflict (id) do update
    set
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      profession = excluded.profession,
      updated_at = timezone('utc', now());

  insert into public.users (id, email, name)
  values (new.id, coalesce(new.email, ''), full_name)
  on conflict (id) do update
    set
      email = excluded.email,
      name = excluded.name;

  -- ONLY explicit system templates (never another studio's private rows)
  for template_form in
    select *
    from public.forms
    where is_system_template = true
      and is_active = true
  loop
    if not exists (
      select 1
      from public.forms f
      where f.user_id = new.id
        and f.slug = template_form.slug
        and f.version = template_form.version
    ) then
      insert into public.forms (
        name, slug, description, category, schema, version, is_active,
        user_id, is_system_template
      )
      values (
        template_form.name,
        template_form.slug,
        template_form.description,
        template_form.category,
        template_form.schema,
        template_form.version,
        template_form.is_active,
        new.id,
        false
      );
    end if;
  end loop;

  for template_package in
    select *
    from public.packages
    where is_system_template = true
      and is_active = true
  loop
    if exists (
      select 1
      from public.packages p
      where p.user_id = new.id
        and p.slug = template_package.slug
    ) then
      continue;
    end if;

    insert into public.packages (
      name, slug, description, price, deposit_amount, currency, color,
      is_active, sort_order, user_id, is_system_template
    )
    values (
      template_package.name,
      template_package.slug,
      template_package.description,
      template_package.price,
      template_package.deposit_amount,
      template_package.currency,
      template_package.color,
      template_package.is_active,
      template_package.sort_order,
      new.id,
      false
    )
    returning id into new_package_id;

    insert into public.package_items (
      package_id, title, description, sort_order
    )
    select
      new_package_id,
      pi.title,
      pi.description,
      pi.sort_order
    from public.package_items pi
    where pi.package_id = template_package.id;
  end loop;

  insert into public.extra_services (
    name, slug, description, price, currency, is_active, sort_order,
    user_id, is_system_template
  )
  select
    es.name,
    es.slug,
    es.description,
    es.price,
    es.currency,
    es.is_active,
    es.sort_order,
    new.id,
    false
  from public.extra_services es
  where es.is_system_template = true
    and es.is_active = true
    and not exists (
      select 1
      from public.extra_services own
      where own.user_id = new.id
        and own.slug = es.slug
    );

  perform public.provision_official_pre_wedding_presets(new.id);

  return new;
end;
$$;
