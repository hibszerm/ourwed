import type { FormSettings, FormTemplate } from '@/types/form'

/**
 * Build contract questionnaire UI template with package options
 * from the Studio Catalog (active packages only).
 */
export function buildContractQuestionnaireTemplate(
  packages: { id: string; name: string }[],
): FormTemplate {
  const packageOptions = packages.map((p) => ({
    value: p.id,
    label: p.name,
  }))

  return {
  id: 'tpl-contract',
  type: 'contract_questionnaire',
  title: 'Dane do umowy',
  description:
    'Prosimy o uzupełnienie danych potrzebnych do przygotowania umowy. Pola oznaczone gwiazdką są wymagane.',
  submitLabel: 'Wyślij',
  successTitle: 'Dziękujemy!',
  successDescription:
    'Otrzymaliśmy Wasze dane. Wkrótce przygotujemy umowę i prześlemy ją na podany adres e-mail.',
  questions: [
    {
      id: 'q-section-wedding',
      type: 'section_title',
      label: 'Dane ślubu',
    },
    {
      id: 'q-wedding-date',
      type: 'date',
      label: 'Data ślubu',
      required: true,
      fieldKey: 'weddingDate',
    },
    {
      id: 'q-package',
      type: 'select',
      label: 'Pakiet',
      required: true,
      fieldKey: 'packageId',
      options: packageOptions,
    },
    {
      id: 'q-section-p1',
      type: 'section_title',
      label: 'Dane Panny Młodej',
    },
    {
      id: 'q-p1-first',
      type: 'text',
      label: 'Imię',
      required: true,
      fieldKey: 'partner1.firstName',
    },
    {
      id: 'q-p1-last',
      type: 'text',
      label: 'Nazwisko',
      required: true,
      fieldKey: 'partner1.lastName',
    },
    {
      id: 'q-p1-phone',
      type: 'phone',
      label: 'Telefon',
      required: true,
      fieldKey: 'partner1.phone',
    },
    {
      id: 'q-section-p2',
      type: 'section_title',
      label: 'Dane Pana Młodego',
    },
    {
      id: 'q-p2-first',
      type: 'text',
      label: 'Imię',
      required: true,
      fieldKey: 'partner2.firstName',
    },
    {
      id: 'q-p2-last',
      type: 'text',
      label: 'Nazwisko',
      required: true,
      fieldKey: 'partner2.lastName',
    },
    {
      id: 'q-p2-phone',
      type: 'phone',
      label: 'Telefon',
      required: true,
      fieldKey: 'partner2.phone',
    },
    {
      id: 'q-section-address',
      type: 'section_title',
      label: 'Adres do umowy',
    },
    {
      id: 'q-p1-address',
      type: 'text',
      label: 'Ulica i numer domu',
      required: true,
      fieldKey: 'partner1.address',
    },
    {
      id: 'q-p1-postal',
      type: 'text',
      label: 'Kod pocztowy',
      required: true,
      fieldKey: 'partner1.postalCode',
      placeholder: '00-000',
    },
    {
      id: 'q-p1-city',
      type: 'text',
      label: 'Miasto',
      required: true,
      fieldKey: 'partner1.city',
    },
    {
      id: 'q-section-email',
      type: 'section_title',
      label: 'Adres e-mail do kontaktu',
    },
    {
      id: 'q-p1-email',
      type: 'email',
      label: 'Email',
      required: true,
      fieldKey: 'partner1.email',
      description:
        'Na ten adres wyślemy umowę oraz wszystkie informacje dotyczące współpracy.',
    },
    {
      id: 'q-section-locations',
      type: 'section_title',
      label: 'Miejsca',
    },
    {
      id: 'q-prep',
      type: 'location',
      label: 'Przygotowania',
      fieldKey: 'preparationLocation',
    },
    {
      id: 'q-ceremony',
      type: 'location',
      label: 'Ceremonia',
      required: true,
      fieldKey: 'ceremonyLocation',
    },
    {
      id: 'q-reception',
      type: 'location',
      label: 'Przyjęcie weselne',
      required: true,
      fieldKey: 'receptionLocation',
    },
    {
      id: 'q-section-notes',
      type: 'section_title',
      label: 'Czy jest coś, o czym powinniśmy wiedzieć?',
    },
    {
      id: 'q-notes',
      type: 'textarea',
      label: 'Czy jest coś, o czym powinniśmy wiedzieć?',
      fieldKey: 'additionalNotes',
      placeholder: 'Opcjonalne uwagi…',
    },
  ],
}
}

/** Base template without packages — prefer buildContractQuestionnaireTemplate. */
export const CONTRACT_QUESTIONNAIRE_TEMPLATE =
  buildContractQuestionnaireTemplate([])

/** Build question-id → fieldKey map from a template (single source of truth). */
export function buildQuestionIdToFieldKey(
  template: FormTemplate,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const q of template.questions) {
    if ('fieldKey' in q && typeof q.fieldKey === 'string' && q.fieldKey) {
      map[q.id] = q.fieldKey
    }
  }
  return map
}

export const CONTRACT_QUESTION_ID_TO_FIELD_KEY = buildQuestionIdToFieldKey(
  CONTRACT_QUESTIONNAIRE_TEMPLATE,
)

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  welcomeTitle: 'Cześć!',
  welcomeDescription:
    'Bardzo się cieszymy, że będziemy mogli być z Wami w tym wyjątkowym dniu. Poniżej prosimy o uzupełnienie kilku informacji.',
  footerMessage: 'W razie pytań napiszcie do nas — chętnie pomożemy.',
  successTitle: 'Dziękujemy!',
  successDescription:
    'Otrzymaliśmy Wasze dane. Wkrótce przygotujemy umowę i prześlemy ją na podany adres e-mail.',
  contractQuestionnaireMessage:
    'Cześć! Prosimy o uzupełnienie danych potrzebnych do przygotowania umowy. Link do formularza znajdziecie w tej wiadomości.',
  weddingQuestionnaireMessage:
    'Cześć! Nadchodzi Wasz wielki dzień — prosimy o uzupełnienie ankiety przedślubnej z detalami dotyczącymi ceremonii i przyjęcia.',
}
