/**
 * Canonical PRO gate action keys for upgrade dialog context.
 * No customer PII — keys only.
 */
export type ProGateActionKey =
  | 'create_wedding'
  | 'edit_wedding'
  | 'create_session'
  | 'edit_session'
  | 'edit_calendar'
  | 'add_payment'
  | 'create_questionnaire'
  | 'edit_questionnaire'
  | 'generate_questionnaire_link'
  | 'rotate_questionnaire_token'
  | 'send_questionnaire'
  | 'apply_questionnaire_responses'
  | 'edit_questionnaire_template'
  | 'generate_document'
  | 'generate_contract_pdf'
  | 'edit_package'
  | 'connect_integration'
  | 'create_task'
  | 'edit_task'
  | 'generic'

export const PRO_LOCKED_HINT = 'Dostępne w planie PRO'
export const PRO_LOCKED_ARIA = 'Wymaga aktywnego planu PRO'

const ACTION_CONTEXT: Partial<Record<ProGateActionKey, string>> = {
  create_wedding: 'Tworzenie nowych zleceń wymaga aktywnego PRO.',
  edit_wedding: 'Edycja zleceń wymaga aktywnego PRO.',
  create_session: 'Dodawanie sesji wymaga aktywnego PRO.',
  edit_session: 'Edycja sesji wymaga aktywnego PRO.',
  edit_calendar: 'Zmiany w kalendarzu wymagają aktywnego PRO.',
  add_payment: 'Dodawanie i edycja wpłat wymaga aktywnego PRO.',
  create_questionnaire: 'Tworzenie ankiet wymaga aktywnego PRO.',
  edit_questionnaire: 'Edycja ankiet wymaga aktywnego PRO.',
  generate_questionnaire_link:
    'Generowanie nowych linków do ankiet wymaga aktywnego PRO.',
  rotate_questionnaire_token:
    'Odświeżanie linku do ankiety wymaga aktywnego PRO.',
  send_questionnaire: 'Wysyłanie ankiet wymaga aktywnego PRO.',
  apply_questionnaire_responses:
    'Zastosowanie odpowiedzi z ankiety wymaga aktywnego PRO.',
  edit_questionnaire_template:
    'Edycja szablonów ankiet wymaga aktywnego PRO.',
  generate_document: 'Generowanie umów wymaga aktywnego PRO.',
  generate_contract_pdf: 'Generowanie PDF umowy wymaga aktywnego PRO.',
  edit_package: 'Zmiany w pakietach i usługach wymagają aktywnego PRO.',
  connect_integration: 'Zarządzanie integracjami wymaga aktywnego PRO.',
  create_task: 'Dodawanie zadań wymaga aktywnego PRO.',
  edit_task: 'Edycja i usuwanie zadań wymaga aktywnego PRO.',
}

export function getProGateActionContext(
  actionKey: ProGateActionKey | null | undefined,
): string | null {
  if (!actionKey || actionKey === 'generic') return null
  return ACTION_CONTEXT[actionKey] ?? null
}
