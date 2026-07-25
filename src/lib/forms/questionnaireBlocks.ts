/**
 * Default ordered blocks + legacy config → blocks normalizer.
 * Product scope: one Contract Data Questionnaire only.
 */

import {
  defaultContractQuestionnaireConfig,
  type ContractQuestionnaireConfig,
  type QuestionnaireCustomField,
} from '@/types/contractQuestionnaire'
import {
  newBlockId,
  type ContractQuestionnaireBlock,
  type QuestionnaireCustomFieldBlock,
  type SystemFieldKey,
} from '@/types/questionnaireBlocks'

export const CONTRACT_QUESTIONNAIRE_BLOCKS_VERSION = 4

function blk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  partial: Record<string, any>,
  order: number,
): ContractQuestionnaireBlock {
  return { ...partial, order } as ContractQuestionnaireBlock
}

/**
 * Exact public questionnaire order:
 * 1 Data ślubu · 2 Pakiet · 3 Usługi · 4 Panna · 5 Pan ·
 * 6 Adres do umowy · 7 E-mail · 8 Uwagi
 */
export function buildDefaultQuestionnaireBlocks(
  legacy?: Partial<ContractQuestionnaireConfig> | null,
): ContractQuestionnaireBlock[] {
  const greeting =
    legacy?.greeting ??
    defaultContractQuestionnaireConfig().greeting ??
    ''
  const footer =
    legacy?.footerText ??
    defaultContractQuestionnaireConfig().footerText ??
    ''
  const title = legacy?.questionnaireTitle?.trim() || 'Dane do umowy'
  const showPackages = legacy?.showPackages !== false
  const showExtras = legacy?.showAdditionalServices !== false
  const packagesRequired = legacy?.packagesRequired !== false

  const blocks: ContractQuestionnaireBlock[] = []
  let order = 0

  blocks.push(
    blk(
      {
        id: 'sys_heading_title',
        type: 'heading',
        enabled: true,
        text: title,
        level: 1,
      },
      order++,
    ),
  )
  if (greeting.trim()) {
    blocks.push(
      blk(
        {
          id: 'sys_text_greeting',
          type: 'text',
          enabled: true,
          content: greeting,
          role: 'greeting',
        },
        order++,
      ),
    )
  }

  blocks.push(
    blk(
      {
        id: 'sys_heading_wedding_date',
        type: 'heading',
        enabled: true,
        text: 'Data ślubu',
        level: 2,
      },
      order++,
    ),
  )
  blocks.push(
    blk(
      {
        id: 'sys_field_wedding_date',
        type: 'system_field',
        enabled: true,
        systemKey: 'weddingDate',
        label: 'Data ślubu',
        required: true,
        inputType: 'date',
      },
      order++,
    ),
  )

  if (showPackages) {
    blocks.push(
      blk(
        {
          id: 'sys_packages',
          type: 'packages',
          enabled: true,
          label: 'Pakiet',
          helperText: 'Możecie wybrać jeden lub kilka pakietów.',
          required: packagesRequired,
        },
        order++,
      ),
    )
  }

  if (showExtras) {
    blocks.push(
      blk(
        {
          id: 'sys_extras',
          type: 'additional_services',
          enabled: true,
          label: 'Usługi dodatkowe',
          helperText: 'Opcjonalnie — wybierzcie usługi, które Was interesują.',
          required: false,
        },
        order++,
      ),
    )
  }

  blocks.push(
    blk(
      {
        id: 'sys_heading_bride',
        type: 'heading',
        enabled: true,
        text: 'Dane Panny Młodej',
        level: 2,
      },
      order++,
    ),
  )
  for (const [id, systemKey, label, inputType] of [
    ['sys_p1_first', 'partner1.firstName', 'Imię', 'text'],
    ['sys_p1_last', 'partner1.lastName', 'Nazwisko', 'text'],
    ['sys_p1_phone', 'partner1.phone', 'Telefon', 'phone'],
  ] as const) {
    blocks.push(
      blk(
        {
          id,
          type: 'system_field',
          enabled: true,
          systemKey,
          label,
          required: true,
          inputType,
        },
        order++,
      ),
    )
  }

  blocks.push(
    blk(
      {
        id: 'sys_heading_groom',
        type: 'heading',
        enabled: true,
        text: 'Dane Pana Młodego',
        level: 2,
      },
      order++,
    ),
  )
  for (const [id, systemKey, label, inputType] of [
    ['sys_p2_first', 'partner2.firstName', 'Imię', 'text'],
    ['sys_p2_last', 'partner2.lastName', 'Nazwisko', 'text'],
    ['sys_p2_phone', 'partner2.phone', 'Telefon', 'phone'],
  ] as const) {
    blocks.push(
      blk(
        {
          id,
          type: 'system_field',
          enabled: true,
          systemKey,
          label,
          required: true,
          inputType,
        },
        order++,
      ),
    )
  }

  blocks.push(
    blk(
      {
        id: 'sys_heading_contract_address',
        type: 'heading',
        enabled: true,
        text: 'Adres do umowy',
        level: 2,
      },
      order++,
    ),
  )
  blocks.push(
    blk(
      {
        id: 'sys_p1_address',
        type: 'system_field',
        enabled: true,
        systemKey: 'partner1.address',
        label: 'Adres do umowy',
        required: true,
        inputType: 'address',
      },
      order++,
    ),
  )

  blocks.push(
    blk(
      {
        id: 'sys_heading_email',
        type: 'heading',
        enabled: true,
        text: 'Adres e-mail do kontaktu',
        level: 2,
      },
      order++,
    ),
  )
  blocks.push(
    blk(
      {
        id: 'sys_p1_email',
        type: 'system_field',
        enabled: true,
        systemKey: 'partner1.email',
        label: 'Adres e-mail do kontaktu',
        helperText:
          'Na ten adres wyślemy umowę oraz wszystkie informacje dotyczące współpracy.',
        required: true,
        inputType: 'email',
      },
      order++,
    ),
  )

  const customs = (legacy?.customFields ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
  for (const field of customs) {
    blocks.push(customFieldToBlock(field, order++))
  }

  blocks.push(
    blk(
      {
        id: 'sys_heading_notes',
        type: 'heading',
        enabled: true,
        text: 'Uwagi',
        level: 2,
      },
      order++,
    ),
  )
  blocks.push(
    blk(
      {
        id: 'sys_field_notes',
        type: 'system_field',
        enabled: true,
        systemKey: 'additionalNotes',
        label: 'Uwagi',
        helperText: 'Dodatkowe informacje, które chcecie nam przekazać',
        required: false,
        inputType: 'textarea',
      },
      order++,
    ),
  )

  if (footer.trim()) {
    blocks.push(
      blk(
        {
          id: 'sys_text_footer',
          type: 'text',
          enabled: true,
          content: footer,
          role: 'footer',
        },
        order++,
      ),
    )
  }

  return blocks
}

function customFieldToBlock(
  field: QuestionnaireCustomField,
  order: number,
): QuestionnaireCustomFieldBlock {
  const type = field.type as QuestionnaireCustomFieldBlock['type']
  return {
    id: field.id.startsWith('custom-') ? field.id : `custom-${field.id}`,
    type: [
      'short_text',
      'long_text',
      'single_choice',
      'multiple_choice',
      'checkbox',
      'date',
      'number',
      'email',
      'phone',
    ].includes(type)
      ? type
      : 'short_text',
    order,
    enabled: field.enabled !== false,
    fieldKey: field.fieldKey,
    label: field.label,
    helperText: field.helperText,
    required: Boolean(field.required),
    placeholder: field.placeholder,
    options: (field.options ?? []).map((o, i) => ({
      id: `opt_${field.id}_${i}`,
      value: o.value,
      label: o.label,
    })),
  }
}

function isBlockArray(raw: unknown): raw is ContractQuestionnaireBlock[] {
  return Array.isArray(raw) && raw.length > 0
}

const OBSOLETE_SYSTEM_KEYS = new Set<SystemFieldKey>([
  'partner1.postalCode',
  'partner1.city',
  'partner2.address',
  'partner2.email',
])

/**
 * Rebuild standard system layout into the product order while preserving
 * custom questions and greeting/footer copy.
 */
export function normalizeToProductQuestionnaireLayout(
  config: ContractQuestionnaireConfig,
): ContractQuestionnaireBlock[] {
  const existing = (config.blocks ?? []).slice()
  const customsFromBlocks = existing.filter(
    (b): b is QuestionnaireCustomFieldBlock =>
      b.type === 'short_text' ||
      b.type === 'long_text' ||
      b.type === 'single_choice' ||
      b.type === 'multiple_choice' ||
      b.type === 'checkbox' ||
      b.type === 'date' ||
      b.type === 'number' ||
      b.type === 'email' ||
      b.type === 'phone',
  )
  const greetingBlock = existing.find(
    (b) => b.type === 'text' && b.role === 'greeting',
  )
  const footerBlock = existing.find(
    (b) => b.type === 'text' && b.role === 'footer',
  )
  const greeting =
    greetingBlock && greetingBlock.type === 'text'
      ? greetingBlock.content
      : config.greeting
  const footer =
    footerBlock && footerBlock.type === 'text'
      ? footerBlock.content
      : config.footerText

  const customFields =
    customsFromBlocks.length > 0
      ? customsFromBlocks.map((b, i) => ({
          id: b.id.replace(/^custom-/, ''),
          fieldKey: b.fieldKey,
          label: b.label,
          helperText: b.helperText,
          type: b.type,
          required: b.required,
          enabled: b.enabled,
          order: i,
          placeholder: b.placeholder,
          options: (b.options ?? []).map((o) => ({
            value: o.value,
            label: o.label,
          })),
        }))
      : (config.customFields ?? [])

  return buildDefaultQuestionnaireBlocks({
    ...config,
    greeting,
    footerText: footer,
    customFields,
  })
}

export function ensureQuestionnaireBlocks(
  config: ContractQuestionnaireConfig,
): ContractQuestionnaireConfig {
  if (!isBlockArray(config.blocks) || (config.version ?? 0) < CONTRACT_QUESTIONNAIRE_BLOCKS_VERSION) {
    const blocks = normalizeToProductQuestionnaireLayout(config)
    return {
      ...config,
      version: CONTRACT_QUESTIONNAIRE_BLOCKS_VERSION,
      greeting:
        blocks.find((b) => b.type === 'text' && b.role === 'greeting')?.type ===
        'text'
          ? (
              blocks.find(
                (b) => b.type === 'text' && b.role === 'greeting',
              ) as Extract<ContractQuestionnaireBlock, { type: 'text' }>
            ).content
          : config.greeting,
      footerText:
        blocks.find((b) => b.type === 'text' && b.role === 'footer')?.type ===
        'text'
          ? (
              blocks.find(
                (b) => b.type === 'text' && b.role === 'footer',
              ) as Extract<ContractQuestionnaireBlock, { type: 'text' }>
            ).content
          : config.footerText,
      blocks,
    }
  }

  const blocks = [...config.blocks]
    .map((b, i) => ({ ...b, order: typeof b.order === 'number' ? b.order : i }))
    .filter(
      (b) =>
        !(
          b.type === 'system_field' && OBSOLETE_SYSTEM_KEYS.has(b.systemKey)
        ) &&
        !(
          b.type === 'location' &&
          // Locations are no longer part of the contract questionnaire product.
          true
        ),
    )
    .map((b) => {
      if (b.type === 'system_field' && b.systemKey === 'partner1.address') {
        return {
          ...b,
          label: 'Adres do umowy',
          inputType: 'address' as const,
        }
      }
      return b
    })
    .sort((a, b) => a.order - b.order)
    .map((b, i) => ({ ...b, order: i }))

  return {
    ...config,
    version: Math.max(config.version, CONTRACT_QUESTIONNAIRE_BLOCKS_VERSION),
    blocks,
  }
}

export function syncLegacyFieldsFromBlocks(
  config: ContractQuestionnaireConfig,
): ContractQuestionnaireConfig {
  const blocks = (config.blocks ?? []).slice().sort((a, b) => a.order - b.order)
  const greeting = blocks.find(
    (b) => b.type === 'text' && b.role === 'greeting',
  )
  const footer = blocks.find((b) => b.type === 'text' && b.role === 'footer')
  const customs = blocks.filter(
    (b): b is QuestionnaireCustomFieldBlock =>
      b.type === 'short_text' ||
      b.type === 'long_text' ||
      b.type === 'single_choice' ||
      b.type === 'multiple_choice' ||
      b.type === 'checkbox' ||
      b.type === 'date' ||
      b.type === 'number' ||
      b.type === 'email' ||
      b.type === 'phone',
  )

  return {
    ...config,
    greeting:
      greeting && greeting.type === 'text' ? greeting.content : config.greeting,
    footerText:
      footer && footer.type === 'text' ? footer.content : config.footerText,
    customFields: customs.map((b, i) => ({
      id: b.id.replace(/^custom-/, ''),
      fieldKey: b.fieldKey,
      label: b.label,
      helperText: b.helperText,
      type: b.type,
      required: b.required,
      enabled: b.enabled,
      order: i,
      placeholder: b.placeholder,
      options: (b.options ?? []).map((o) => ({
        value: o.value,
        label: o.label,
      })),
    })),
    showPackages: blocks.some((b) => b.type === 'packages' && b.enabled),
    showAdditionalServices: blocks.some(
      (b) => b.type === 'additional_services' && b.enabled,
    ),
    packagesRequired: blocks.some(
      (b) => b.type === 'packages' && b.enabled && b.required,
    ),
  }
}

export function canAddPackageBlock(blocks: ContractQuestionnaireBlock[]): boolean {
  return !blocks.some((b) => b.type === 'packages' && b.enabled)
}

export function canAddExtrasBlock(blocks: ContractQuestionnaireBlock[]): boolean {
  return !blocks.some((b) => b.type === 'additional_services' && b.enabled)
}

export function canAddLocationRole(
  _blocks: ContractQuestionnaireBlock[],
  _role: string,
): boolean {
  // Wedding locations are out of contract-questionnaire product scope.
  return false
}

export function canAddSystemKey(
  blocks: ContractQuestionnaireBlock[],
  systemKey: SystemFieldKey,
): boolean {
  if (OBSOLETE_SYSTEM_KEYS.has(systemKey)) return false
  return !blocks.some(
    (b) => b.type === 'system_field' && b.enabled && b.systemKey === systemKey,
  )
}

export function createBlockOfType(
  type: ContractQuestionnaireBlock['type'],
  order: number,
): ContractQuestionnaireBlock | null {
  const id = newBlockId()
  switch (type) {
    case 'heading':
      return {
        id,
        type: 'heading',
        order,
        enabled: true,
        text: 'Nagłówek',
        level: 2,
      }
    case 'text':
      return {
        id,
        type: 'text',
        order,
        enabled: true,
        content: '',
        role: 'general',
      }
    case 'divider':
      return { id, type: 'divider', order, enabled: true }
    case 'short_text':
    case 'long_text':
    case 'single_choice':
    case 'multiple_choice':
    case 'checkbox':
    case 'date':
    case 'number':
    case 'email':
    case 'phone':
      return {
        id,
        type,
        order,
        enabled: true,
        fieldKey: `field_${id.replace(/-/g, '').slice(0, 10)}`,
        label: 'Nowe pytanie',
        required: false,
        options:
          type === 'single_choice' || type === 'multiple_choice'
            ? [
                { id: newBlockId('opt'), value: 'a', label: 'Opcja 1' },
                { id: newBlockId('opt'), value: 'b', label: 'Opcja 2' },
              ]
            : undefined,
      }
    case 'packages':
      return {
        id,
        type: 'packages',
        order,
        enabled: true,
        label: 'Pakiet',
        required: true,
      }
    case 'additional_services':
      return {
        id,
        type: 'additional_services',
        order,
        enabled: true,
        label: 'Usługi dodatkowe',
        required: false,
      }
    case 'location':
      return null
    default:
      return null
  }
}

export function createSystemFieldBlock(
  systemKey: SystemFieldKey,
  order: number,
): ContractQuestionnaireBlock {
  const presets: Partial<
    Record<
      SystemFieldKey,
      {
        id: string
        label: string
        inputType: 'text' | 'phone' | 'email' | 'date' | 'textarea' | 'address'
        required: boolean
      }
    >
  > = {
    weddingDate: {
      id: 'sys_field_wedding_date',
      label: 'Data ślubu',
      inputType: 'date',
      required: true,
    },
    'partner1.firstName': {
      id: 'sys_p1_first',
      label: 'Imię',
      inputType: 'text',
      required: true,
    },
    'partner1.lastName': {
      id: 'sys_p1_last',
      label: 'Nazwisko',
      inputType: 'text',
      required: true,
    },
    'partner1.address': {
      id: 'sys_p1_address',
      label: 'Adres do umowy',
      inputType: 'address',
      required: true,
    },
    'partner1.phone': {
      id: 'sys_p1_phone',
      label: 'Telefon',
      inputType: 'phone',
      required: true,
    },
    'partner1.email': {
      id: 'sys_p1_email',
      label: 'Adres e-mail do kontaktu',
      inputType: 'email',
      required: true,
    },
    'partner2.firstName': {
      id: 'sys_p2_first',
      label: 'Imię',
      inputType: 'text',
      required: true,
    },
    'partner2.lastName': {
      id: 'sys_p2_last',
      label: 'Nazwisko',
      inputType: 'text',
      required: true,
    },
    'partner2.phone': {
      id: 'sys_p2_phone',
      label: 'Telefon',
      inputType: 'phone',
      required: true,
    },
    additionalNotes: {
      id: 'sys_field_notes',
      label: 'Uwagi',
      inputType: 'textarea',
      required: false,
    },
  }
  const preset = presets[systemKey]
  if (!preset) {
    return {
      id: newBlockId('sys'),
      type: 'system_field',
      order,
      enabled: true,
      systemKey,
      label: systemKey,
      required: false,
      inputType: 'text',
    }
  }
  return {
    id: preset.id,
    type: 'system_field',
    order,
    enabled: true,
    systemKey,
    label: preset.label,
    required: preset.required,
    inputType: preset.inputType,
  }
}

export function reorderBlocks(
  blocks: ContractQuestionnaireBlock[],
  fromId: string,
  direction: -1 | 1,
): ContractQuestionnaireBlock[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order)
  const idx = sorted.findIndex((b) => b.id === fromId)
  const swap = idx + direction
  if (idx < 0 || swap < 0 || swap >= sorted.length) return blocks
  const next = [...sorted]
  const tmp = next[idx]
  next[idx] = next[swap]
  next[swap] = tmp
  return next.map((b, i) => ({ ...b, order: i }))
}

export function moveBlockToIndex(
  blocks: ContractQuestionnaireBlock[],
  fromId: string,
  toIndex: number,
): ContractQuestionnaireBlock[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order)
  const fromIdx = sorted.findIndex((b) => b.id === fromId)
  if (fromIdx < 0) return blocks
  const clamped = Math.max(0, Math.min(toIndex, sorted.length - 1))
  if (fromIdx === clamped) return blocks
  const next = [...sorted]
  const [item] = next.splice(fromIdx, 1)
  next.splice(clamped, 0, item)
  return next.map((b, i) => ({ ...b, order: i }))
}

/** Stable labels used to assert public renderer order. */
export const CONTRACT_QUESTIONNAIRE_SECTION_ORDER = [
  'Data ślubu',
  'Pakiet',
  'Usługi dodatkowe',
  'Dane Panny Młodej',
  'Dane Pana Młodego',
  'Adres do umowy',
  'Adres e-mail do kontaktu',
  'Uwagi',
] as const
