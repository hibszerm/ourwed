/** User-facing Polish copy for OurWed Assistant — no model marketing wording. */

export const ASSISTANT_TITLE = 'OurWed Assistant'

/** @deprecated Empty-state discovery copy removed in Phase 2G. Kept for legacy tests. */
export const ASSISTANT_SUPPORT =
  'Znajdź informacje o zleceniach, sesjach, terminach i rozliczeniach.'

export const ASSISTANT_EMPTY_PROMPT = 'Jak mogę Ci pomóc?'

export const ASSISTANT_PLANNER_FAILURE =
  'Nie udało mi się pewnie zrozumieć tego pytania. Spróbuj napisać je trochę inaczej.'

export const ASSISTANT_ROUTE_INCOMPLETE_STUDIO =
  'Znam cel, ale nie mogę policzyć trasy — brakuje potwierdzonego punktu startowego studia.'

export const ASSISTANT_DATA_NOT_TRACKED_FUEL =
  'OurWed nie zapisuje obecnie wydatków na paliwo, więc nie policzę tej kwoty.'

export const ASSISTANT_PLACEHOLDER =
  'Zapytaj o zlecenie, sesję, termin lub zadanie…'

export const ASSISTANT_PLACEHOLDER_EMPTY = 'Zapytaj o cokolwiek…'

export const ASSISTANT_EXAMPLES = [
  'Co mam jutro?',
  'Gdzie ma przygotowania Julia?',
  'Ile zostało do zapłaty u Natalii?',
  'Ile wesel mam w tym miesiącu?',
  'Jaki jest status ankiety przedślubnej?',
] as const

export const ASSISTANT_LOADING = 'Sprawdzam…'

export const ASSISTANT_NO_MATCH =
  'Nie znalazłem takiego zlecenia na Twoim koncie.'

export const ASSISTANT_NO_MATCH_HINT =
  'Spróbuj podać imię, nazwisko lub datę ślubu.'

export const ASSISTANT_NO_SESSION_MATCH =
  'Nie znalazłem takiej sesji na Twoim koncie.'

export const ASSISTANT_API_FAILURE =
  'Nie udało się teraz wykonać zapytania. Spróbuj ponownie za chwilę.'

/** A1 — deterministic OurWed domain boundary (off-topic / unsafe). */
export const ASSISTANT_OFF_TOPIC =
  'Mogę pomóc w sprawach związanych z OurWed i Twoją pracą w studiu.'

export const ASSISTANT_UNRECOGNIZED =
  'Nie udało mi się rozpoznać tego polecenia.'

export const ASSISTANT_UNRECOGNIZED_HINT =
  'Spróbuj inaczej — na przykład o finanse, miejsce lub termin.'

export const ASSISTANT_UNSUPPORTED =
  'Tej akcji nie można jeszcze wykonać przez Zapytaj OurWed.'

/** Semantic plan blocked — never surface verifier prose. */
export const ASSISTANT_PLAN_BLOCKED =
  'Nie udało mi się bezpiecznie zinterpretować tego zapytania. Spróbuj sformułować je inaczej.'

export const ASSISTANT_LAUNCHER_LABEL = 'OurWed Assistant'

export const ASSISTANT_CLOSE_LABEL = 'Zamknij'

export const ASSISTANT_SUBMIT_LABEL = 'Wyślij'

export const ASSISTANT_EXAMPLES_LABEL = 'Przykłady'

export const ASSISTANT_CREATE_WEDDING_CTA = 'Utwórz zlecenie'

export const ASSISTANT_CREATE_TASK_CTA = 'Dodaj zadanie'

export const ASSISTANT_CANCEL = 'Anuluj'

export const ASSISTANT_MISSING_FINANCE =
  'Nie mam wystarczających danych, aby pokazać rozliczenie tego zlecenia.'

export const ASSISTANT_MISSING_PREPARATIONS =
  'Osobne miejsce przygotowań nie jest jeszcze ustawione.'

export const ASSISTANT_PARTICIPANT_NOT_FOUND =
  'Nie znajduję takiej osoby w kontekście tego ślubu. Podaj imię z umowy albo wybierz pannę młodą / pana młodego.'

export const ASSISTANT_PARTICIPANT_AMBIGUOUS =
  'Nie jestem pewien, o którą osobę chodzi. Wybierz uczestnika.'

export const ASSISTANT_MISSING_CEREMONY =
  'Miejsce ceremonii nie jest jeszcze ustawione.'

export const ASSISTANT_MISSING_CEREMONY_TIME =
  'Godzina ceremonii nie jest ustawiona.'

export const ASSISTANT_MISSING_DAY_PLAN =
  'Plan dnia nie został jeszcze uzupełniony.'

export const ASSISTANT_MISSING_FINAL_PAYMENT_DUE =
  'Nie masz jeszcze ustawionego terminu płatności końcowej.'

export const ASSISTANT_DAY_PLAN_SEQUENCE_END =
  'To ostatni wpisany punkt w Planie dnia.'

export const ASSISTANT_SEQUENCE_NO_CONTEXT =
  'Nie wiem, do którego momentu planu dnia się odnosisz. Zapytaj najpierw o przygotowania, ceremonię albo salę.'

export const ASSISTANT_CLARIFICATION_STALE =
  'Ten wybór jest już nieaktualny. Napisz pytanie jeszcze raz.'

export const ASSISTANT_CLARIFICATION_DEAD_OPTION =
  'Nie udało mi się bezpiecznie użyć tego wyboru. Napisz proszę pytanie od nowa — na przykład „co mam dzisiaj?” albo „gdzie szykuje się Maks?”.'

export const ASSISTANT_CLARIFICATION_TYPE_NAME =
  'Podaj proszę imię uczestnika z umowy — wtedy wrócę do Twojego pytania.'

export const ASSISTANT_EMPTY_TASKS =
  'Nie ma aktywnych zadań dla tego zlecenia.'

export const ASSISTANT_CHANGE_WEDDING = 'Zmień'

export const ASSISTANT_YOUR_QUESTION = 'Twoje pytanie'

export const ASSISTANT_SCHEDULE_EMPTY =
  'W tym dniu nie masz żadnych zleceń ani sesji w kalendarzu.'

export const ASSISTANT_SCHEDULE_EMPTY_TOMORROW =
  'Jutro nie masz żadnych zleceń ani sesji w kalendarzu.'

/** Read-only V7-capable examples (no CRM write suggestions). */
export const ASSISTANT_EXAMPLES_V4 = [
  'Co mam jutro?',
  'Gdzie ma przygotowania Julia?',
  'Ile zostało do zapłaty u Natalii?',
  'Ile wesel mam w tym miesiącu?',
  'Jaki jest status ankiety przedślubnej?',
] as const

export const ASSISTANT_EXAMPLE_GROUPS = [
  {
    label: 'Znajdź',
    examples: ['Co mam jutro?', 'Gdzie ma przygotowania Julia?'],
  },
  {
    label: 'Sprawdź',
    examples: [
      'Ile zostało do zapłaty u Natalii?',
      'Ile wesel mam w tym miesiącu?',
      'Jaki jest status ankiety przedślubnej?',
    ],
  },
] as const
