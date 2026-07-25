import type { FormSettings, FormTemplate, Question } from '@/types/form'
import type {
  AdditionalServiceOptionSnapshot,
  ContractQuestionnaireConfig,
  PackageOptionSnapshot,
  QuestionnaireCustomField,
} from '@/types/contractQuestionnaire'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'
import { ensureQuestionnaireBlocks } from '@/lib/forms/questionnaireBlocks'
import { questionsFromBlocks } from '@/lib/forms/questionsFromBlocks'

export interface BuildContractQuestionnaireInput {
  packages: PackageOptionSnapshot[]
  additionalServices?: AdditionalServiceOptionSnapshot[]
  config?: ContractQuestionnaireConfig | null
}

/**
 * Build contract questionnaire UI template with package / extra options
 * from the Studio Catalog snapshot (active packages only at send time).
 */
export function buildContractQuestionnaireTemplate(
  packagesOrInput:
    | { id: string; name: string }[]
    | BuildContractQuestionnaireInput,
): FormTemplate {
  const input: BuildContractQuestionnaireInput = Array.isArray(packagesOrInput)
    ? { packages: packagesOrInput }
    : packagesOrInput

  const config = ensureQuestionnaireBlocks(
    input.config ?? defaultContractQuestionnaireConfig(),
  )
  const packages = input.packages ?? []
  const additionalServices = input.additionalServices ?? []

  if (config.blocks && config.blocks.length > 0) {
    const greetingBlock = config.blocks.find(
      (b) => b.type === 'text' && b.role === 'greeting' && b.enabled,
    )
    const footerBlock = config.blocks.find(
      (b) => b.type === 'text' && b.role === 'footer' && b.enabled,
    )
    const headingBlock = config.blocks.find(
      (b) => b.type === 'heading' && b.enabled && b.level === 1,
    )
    const questions = questionsFromBlocks(
      config.blocks.filter(
        (b) =>
          !(
            b.type === 'text' &&
            (b.role === 'greeting' || b.role === 'footer')
          ) &&
          !(b.type === 'heading' && b.level === 1),
      ),
      packages,
      additionalServices,
    )
    return {
      id: 'tpl-contract',
      type: 'contract_questionnaire',
      title:
        (headingBlock && headingBlock.type === 'heading'
          ? headingBlock.text
          : null) ||
        config.questionnaireTitle?.trim() ||
        'Dane do umowy',
      description:
        (greetingBlock && greetingBlock.type === 'text'
          ? greetingBlock.content
          : null) ||
        config.greeting?.trim() ||
        'Prosimy o uzupełnienie danych potrzebnych do przygotowania umowy. Pola oznaczone gwiazdką są wymagane.',
      submitLabel: config.submitButtonLabel?.trim() || 'Wyślij',
      successTitle: 'Dziękujemy!',
      successDescription:
        config.successMessage?.trim() ||
        'Otrzymaliśmy Wasze dane. Wkrótce przygotujemy umowę i prześlemy ją na podany adres e-mail.',
      questions,
      footerText:
        (footerBlock && footerBlock.type === 'text'
          ? footerBlock.content
          : null) || config.footerText,
    }
  }

  const packageOptions = packages.map((p) => ({
    value: p.id,
    label: p.name,
  }))

  const extraOptions = additionalServices.map((s) => ({
    value: s.id,
    label: s.name,
  }))

  const questions: Question[] = [
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
  ]

  if (config.showPackages !== false && packageOptions.length > 0) {
    questions.push({
      id: 'q-package',
      type: 'multiselect',
      label: 'Pakiet',
      required: config.packagesRequired !== false,
      fieldKey: 'selectedPackageIds',
      options: packageOptions,
      presentation: 'cards',
      description: config.allowMultiplePackages
        ? 'Możecie wybrać jeden lub kilka pakietów.'
        : undefined,
    })
  }

  if (config.showAdditionalServices !== false && extraOptions.length > 0) {
    questions.push(
      {
        id: 'q-section-extras',
        type: 'section_title',
        label: 'Dodatki',
      },
      {
        id: 'q-extras',
        type: 'multiselect',
        label: 'Dodatki',
        required: false,
        fieldKey: 'selectedAdditionalServiceIds',
        options: extraOptions,
        presentation: 'cards',
        description: 'Opcjonalnie — wybierzcie usługi, które Was interesują.',
      },
    )
  }

  questions.push(
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
      id: 'q-p1-address',
      type: 'location',
      label: 'Adres do umowy',
      required: true,
      fieldKey: 'partner1.address',
      placeholder: 'Wpisz adres…',
    },
    {
      id: 'q-p1-phone',
      type: 'phone',
      label: 'Telefon',
      required: true,
      fieldKey: 'partner1.phone',
    },
    {
      id: 'q-p1-email',
      type: 'email',
      label: 'E-mail',
      required: true,
      fieldKey: 'partner1.email',
      description:
        'Na ten adres wyślemy umowę oraz wszystkie informacje dotyczące współpracy.',
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
      id: 'q-p2-address',
      type: 'location',
      label: 'Adres do umowy',
      required: true,
      fieldKey: 'partner2.address',
      placeholder: 'Wpisz adres…',
    },
    {
      id: 'q-p2-phone',
      type: 'phone',
      label: 'Telefon',
      required: true,
      fieldKey: 'partner2.phone',
    },
    {
      id: 'q-p2-email',
      type: 'email',
      label: 'E-mail',
      required: true,
      fieldKey: 'partner2.email',
    },
    {
      id: 'q-section-locations',
      type: 'section_title',
      label: 'Miejsca',
    },
    {
      id: 'q-bride-prep',
      type: 'location',
      label: 'Przygotowania Panny Młodej',
      fieldKey: 'bridePreparationLocation',
    },
    {
      id: 'q-groom-prep',
      type: 'location',
      label: 'Przygotowania Pana Młodego',
      fieldKey: 'groomPreparationLocation',
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
      label: 'Wesele / przyjęcie weselne',
      required: true,
      fieldKey: 'receptionLocation',
    },
  )

  const enabledCustom = (config.customFields ?? [])
    .filter((f) => f.enabled)
    .slice()
    .sort((a, b) => a.order - b.order)

  if (enabledCustom.length > 0) {
    questions.push({
      id: 'q-section-custom',
      type: 'section_title',
      label: 'Dodatkowe pytania',
    })
    for (const field of enabledCustom) {
      questions.push(customFieldToQuestion(field))
    }
  }

  questions.push(
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
  )

  return {
    id: 'tpl-contract',
    type: 'contract_questionnaire',
    title: config.questionnaireTitle?.trim() || 'Dane do umowy',
    description:
      config.greeting?.trim() ||
      'Prosimy o uzupełnienie danych potrzebnych do przygotowania umowy. Pola oznaczone gwiazdką są wymagane.',
    submitLabel: config.submitButtonLabel?.trim() || 'Wyślij',
    successTitle: 'Dziękujemy!',
    successDescription:
      config.successMessage?.trim() ||
      'Otrzymaliśmy Wasze dane. Wkrótce przygotujemy umowę i prześlemy ją na podany adres e-mail.',
    questions,
    footerText: config.footerText,
  }
}

function customFieldToQuestion(field: QuestionnaireCustomField): Question {
  const base = {
    id: `custom-${field.id}`,
    label: field.label,
    required: field.required,
    fieldKey: `custom.${field.fieldKey}`,
    description: field.helperText,
    placeholder: field.placeholder,
    customFieldId: field.id,
  }

  switch (field.type) {
    case 'long_text':
      return { ...base, type: 'textarea' }
    case 'single_choice':
      return {
        ...base,
        type: 'radio',
        options: field.options ?? [],
      }
    case 'multiple_choice':
      return {
        ...base,
        type: 'multiselect',
        options: field.options ?? [],
      }
    case 'checkbox':
      return { ...base, type: 'checkbox' }
    case 'date':
      return { ...base, type: 'date' }
    case 'number':
      return { ...base, type: 'text', placeholder: field.placeholder || '0' }
    case 'phone':
      return { ...base, type: 'phone' }
    case 'email':
      return { ...base, type: 'email' }
    case 'short_text':
    default:
      return { ...base, type: 'text' }
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
