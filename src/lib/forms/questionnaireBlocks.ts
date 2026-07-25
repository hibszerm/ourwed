/**
 * Default ordered blocks + legacy config → blocks normalizer.
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

export const CONTRACT_QUESTIONNAIRE_BLOCKS_VERSION = 3

function blk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  partial: Record<string, any>,
  order: number,
): ContractQuestionnaireBlock {
  return { ...partial, order } as ContractQuestionnaireBlock
}

/** Canonical default questionnaire layout (grouped bride / groom / catalog). */
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
  for (const [id, systemKey, label, inputType, required] of [
    ['sys_p1_first', 'partner1.firstName', 'Imię', 'text', true],
    ['sys_p1_last', 'partner1.lastName', 'Nazwisko', 'text', true],
    ['sys_p1_address', 'partner1.address', 'Adres do umowy', 'address', true],
    ['sys_p1_phone', 'partner1.phone', 'Telefon', 'phone', true],
    ['sys_p1_email', 'partner1.email', 'E-mail', 'email', true],
  ] as const) {
    blocks.push(
      blk(
        {
          id,
          type: 'system_field',
          enabled: true,
          systemKey,
          label,
          required,
          inputType,
          ...(systemKey === 'partner1.email'
            ? {
                helperText:
                  'Na ten adres wyślemy umowę oraz wszystkie informacje dotyczące współpracy.',
              }
            : {}),
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
  for (const [id, systemKey, label, inputType, required] of [
    ['sys_p2_first', 'partner2.firstName', 'Imię', 'text', true],
    ['sys_p2_last', 'partner2.lastName', 'Nazwisko', 'text', true],
    ['sys_p2_address', 'partner2.address', 'Adres do umowy', 'address', true],
    ['sys_p2_phone', 'partner2.phone', 'Telefon', 'phone', true],
    ['sys_p2_email', 'partner2.email', 'E-mail', 'email', true],
  ] as const) {
    blocks.push(
      blk(
        {
          id,
          type: 'system_field',
          enabled: true,
          systemKey,
          label,
          required,
          inputType,
        },
        order++,
      ),
    )
  }

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
        id: 'sys_heading_locations',
        type: 'heading',
        enabled: true,
        text: 'Miejsca',
        level: 2,
      },
      order++,
    ),
  )
  for (const [id, role, label, required] of [
    [
      'sys_loc_bride_prep',
      'bride_preparation',
      'Przygotowania Panny Młodej',
      false,
    ],
    [
      'sys_loc_groom_prep',
      'groom_preparation',
      'Przygotowania Pana Młodego',
      false,
    ],
    ['sys_loc_ceremony', 'ceremony', 'Ceremonia', true],
    ['sys_loc_reception', 'reception', 'Wesele / przyjęcie weselne', true],
  ] as const) {
    blocks.push(
      blk(
        {
          id,
          type: 'location',
          enabled: true,
          locationRole: role,
          label,
          required,
        },
        order++,
      ),
    )
  }

  const customs = (legacy?.customFields ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
  if (customs.length > 0) {
    blocks.push(
      blk(
        {
          id: 'sys_heading_custom',
          type: 'heading',
          enabled: true,
          text: 'Dodatkowe pytania',
          level: 2,
        },
        order++,
      ),
    )
    for (const field of customs) {
      blocks.push(customFieldToBlock(field, order++))
    }
  }

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

const LEGACY_SPLIT_ADDRESS_KEYS = new Set<SystemFieldKey>([
  'partner1.postalCode',
  'partner1.city',
])

/**
 * Collapse split street/postal/city blocks into one address autocomplete field
 * per party. Preserves custom blocks and other system fields.
 */
export function normalizeContractAddressBlocks(
  blocks: ContractQuestionnaireBlock[],
): ContractQuestionnaireBlock[] {
  const hasSplit = blocks.some(
    (b) =>
      b.type === 'system_field' && LEGACY_SPLIT_ADDRESS_KEYS.has(b.systemKey),
  )
  const hasP1Address = blocks.some(
    (b) => b.type === 'system_field' && b.systemKey === 'partner1.address',
  )
  const hasP2Address = blocks.some(
    (b) => b.type === 'system_field' && b.systemKey === 'partner2.address',
  )

  let next = blocks
    .filter(
      (b) =>
        !(
          b.type === 'system_field' && LEGACY_SPLIT_ADDRESS_KEYS.has(b.systemKey)
        ),
    )
    .map((b) => {
      if (b.type === 'system_field' && b.systemKey === 'partner1.address') {
        return {
          ...b,
          label: b.label === 'Ulica i numer domu' ? 'Adres do umowy' : b.label,
          inputType: 'address' as const,
        }
      }
      return b
    })

  if (hasSplit || hasP1Address) {
    // ensure address input type
    next = next.map((b) =>
      b.type === 'system_field' && b.systemKey === 'partner1.address'
        ? { ...b, inputType: 'address' as const }
        : b,
    )
  }

  if (!hasP2Address) {
    const groomPhoneIdx = next.findIndex(
      (b) => b.type === 'system_field' && b.systemKey === 'partner2.phone',
    )
    const insertAt =
      groomPhoneIdx >= 0
        ? groomPhoneIdx
        : next.findIndex(
            (b) =>
              b.type === 'system_field' && b.systemKey === 'partner2.lastName',
          ) + 1
    if (insertAt > 0) {
      const addressBlock = blk(
        {
          id: 'sys_p2_address',
          type: 'system_field',
          enabled: true,
          systemKey: 'partner2.address',
          label: 'Adres do umowy',
          required: true,
          inputType: 'address',
        },
        insertAt,
      )
      next = [...next.slice(0, insertAt), addressBlock, ...next.slice(insertAt)]
    }
  }

  return next.map((b, i) => ({ ...b, order: i }))
}

/**
 * Ensure config has ordered blocks. Legacy greeting/footer/customFields
 * are normalized into the default layout without destroying historic snapshots.
 */
export function ensureQuestionnaireBlocks(
  config: ContractQuestionnaireConfig,
): ContractQuestionnaireConfig {
  if (isBlockArray(config.blocks)) {
    let blocks = [...config.blocks]
      .map((b, i) => ({ ...b, order: typeof b.order === 'number' ? b.order : i }))
      .sort((a, b) => a.order - b.order)

    if ((config.version ?? 0) < CONTRACT_QUESTIONNAIRE_BLOCKS_VERSION) {
      blocks = normalizeContractAddressBlocks(blocks)
    } else {
      blocks = normalizeContractAddressBlocks(blocks)
    }

    return {
      ...config,
      version: Math.max(config.version, CONTRACT_QUESTIONNAIRE_BLOCKS_VERSION),
      blocks,
    }
  }

  const blocks = buildDefaultQuestionnaireBlocks(config)
  const greeting = blocks.find(
    (b) => b.type === 'text' && b.role === 'greeting',
  )
  const footer = blocks.find((b) => b.type === 'text' && b.role === 'footer')

  return {
    ...config,
    version: CONTRACT_QUESTIONNAIRE_BLOCKS_VERSION,
    greeting:
      greeting && greeting.type === 'text' ? greeting.content : config.greeting,
    footerText:
      footer && footer.type === 'text' ? footer.content : config.footerText,
    blocks,
  }
}

/** Sync legacy greeting/footer/customFields from blocks for older readers. */
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
  blocks: ContractQuestionnaireBlock[],
  role: string,
): boolean {
  return !blocks.some(
    (b) =>
      b.type === 'location' &&
      b.enabled &&
      b.locationRole === role,
  )
}

export function canAddSystemKey(
  blocks: ContractQuestionnaireBlock[],
  systemKey: SystemFieldKey,
): boolean {
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
      return {
        id,
        type: 'location',
        order,
        enabled: true,
        locationRole: 'ceremony',
        label: 'Lokalizacja',
        required: false,
      }
    default:
      return null
  }
}

export function createSystemFieldBlock(
  systemKey: SystemFieldKey,
  order: number,
): ContractQuestionnaireBlock {
  const presets: Record<
    SystemFieldKey,
    { id: string; label: string; inputType: 'text' | 'phone' | 'email' | 'date' | 'textarea' | 'address'; required: boolean }
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
    'partner1.postalCode': {
      id: 'sys_p1_postal',
      label: 'Kod pocztowy',
      inputType: 'text',
      required: false,
    },
    'partner1.city': {
      id: 'sys_p1_city',
      label: 'Miasto',
      inputType: 'text',
      required: false,
    },
    'partner1.phone': {
      id: 'sys_p1_phone',
      label: 'Telefon',
      inputType: 'phone',
      required: true,
    },
    'partner1.email': {
      id: 'sys_p1_email',
      label: 'E-mail',
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
    'partner2.address': {
      id: 'sys_p2_address',
      label: 'Adres do umowy',
      inputType: 'address',
      required: true,
    },
    'partner2.phone': {
      id: 'sys_p2_phone',
      label: 'Telefon',
      inputType: 'phone',
      required: true,
    },
    'partner2.email': {
      id: 'sys_p2_email',
      label: 'E-mail',
      inputType: 'email',
      required: true,
    },
    additionalNotes: {
      id: 'sys_field_notes',
      label: 'Dodatkowe uwagi',
      inputType: 'textarea',
      required: false,
    },
  }
  const preset = presets[systemKey]
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
