/** User-facing CRM questionnaire instance detail copy. Domain stays frozen. */

export const DETAIL_FALLBACK_TITLE = 'Dane do umowy'

export const DETAIL_BACK = 'Lista'

export const DETAIL_BACK_PENDING = 'Oczekujące'

export const DETAIL_BACK_LIBRARY_TO = '/ankiety'

export const DETAIL_BACK_PENDING_TO = '/oczekujace'

/** Explicit Link state from Oczekujące — not history.back(), not a URL change. */
export function resolveQuestionnaireDetailBack(from: unknown): {
  to: typeof DETAIL_BACK_PENDING_TO | typeof DETAIL_BACK_LIBRARY_TO
  label: string
} {
  if (from === DETAIL_BACK_PENDING_TO) {
    return { to: DETAIL_BACK_PENDING_TO, label: DETAIL_BACK_PENDING }
  }
  return { to: DETAIL_BACK_LIBRARY_TO, label: DETAIL_BACK }
}

export const DETAIL_CREATE_WEDDING = 'Utwórz ślub'

export const DETAIL_OPEN_WEDDING = 'Otwórz ślub'

export const DETAIL_CREATE_BUSY = 'Zapisywanie…'

export const DETAIL_COPY_LINK = 'Kopiuj link'

export const DETAIL_OPEN_FORM = 'Otwórz'

export const DETAIL_SUBMITTED = 'Wysłano'

export const DETAIL_CREATED = 'Utworzono'

export const DETAIL_LINKED_WEDDING = 'Powiązany ślub'

export const DETAIL_NOT_FOUND_TITLE = 'Nie znaleziono ankiety'

export const DETAIL_NOT_FOUND_COPY = 'Sprawdź link lub wróć do listy.'

export const DETAIL_ERROR_RETRY = 'Spróbuj ponownie'

export const DETAIL_NO_ANSWERS = 'Para nie przesłała jeszcze odpowiedzi.'

export const DETAIL_EMPTY_ANSWERS = 'Brak zapisanych odpowiedzi do wyświetlenia.'

export const DETAIL_SKELETON_SECTIONS = 4
