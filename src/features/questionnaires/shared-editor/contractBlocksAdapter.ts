/**
 * Adapter: ContractQuestionnaireBlock[] ↔ section/question editor model.
 * Preserves system bindings, packages, locations and legacy metadata.
 */

import { createBlockOfType } from '@/lib/forms/questionnaireBlocks'
import {
  newBlockId,
  type ContractQuestionnaireBlock,
  type QuestionnaireHeadingBlock,
  type QuestionnaireChoiceOption,
} from '@/types/questionnaireBlocks'

export const CONTRACT_FIELD_TYPE_LABELS: Record<string, string> = {
  short_text: 'Krótka odpowiedź',
  long_text: 'Długa odpowiedź',
  date: 'Data',
  phone: 'Telefon',
  email: 'E-mail',
  number: 'Liczba',
  single_choice: 'Wybór jednej opcji',
  multiple_choice: 'Wybór wielu opcji',
  checkbox: 'Tak / Nie',
  packages: 'Wybór pakietu',
  additional_services: 'Usługi dodatkowe',
  location: 'Adres',
  system_field: 'Pole systemowe',
  information: 'Informacja',
}

/** Field types the user can add as custom questions. */
export const CONTRACT_ADDABLE_TYPES = [
  'short_text',
  'long_text',
  'date',
  'phone',
  'email',
  'number',
  'single_choice',
  'multiple_choice',
  'checkbox',
] as const

export type ContractAddableType = (typeof CONTRACT_ADDABLE_TYPES)[number]

export interface ContractEditorQuestion {
  id: string
  label: string
  /** Friendly editor type key (may be system_field / packages / …). */
  editorType: string
  required: boolean
  helpText: string
  /** Option labels for choice fields (editor). */
  optionLabels: string[]
  /** Cannot delete. */
  protected: boolean
  /** Cannot change field type. */
  typeLocked: boolean
  systemBadge: boolean
  /** Original block for lossless round-trip. */
  block: ContractQuestionnaireBlock
}

export interface ContractEditorSection {
  id: string
  title: string
  questions: ContractEditorQuestion[]
  /** Original heading block when present. */
  heading: QuestionnaireHeadingBlock | null
}

function isQuestionBlock(b: ContractQuestionnaireBlock): boolean {
  return (
    b.type === 'system_field' ||
    b.type === 'short_text' ||
    b.type === 'long_text' ||
    b.type === 'single_choice' ||
    b.type === 'multiple_choice' ||
    b.type === 'checkbox' ||
    b.type === 'date' ||
    b.type === 'number' ||
    b.type === 'email' ||
    b.type === 'phone' ||
    b.type === 'packages' ||
    b.type === 'additional_services' ||
    b.type === 'location' ||
    (b.type === 'text' && b.role === 'general')
  )
}

function blockToQuestion(block: ContractQuestionnaireBlock): ContractEditorQuestion | null {
  if (!isQuestionBlock(block)) return null
  if (block.type === 'text') {
    return {
      id: block.id,
      label: block.content || 'Informacja',
      editorType: 'information',
      required: false,
      helpText: '',
      optionLabels: [],
      protected: false,
      typeLocked: true,
      systemBadge: false,
      block,
    }
  }

  let label = ''
  let required = false
  let helpText = ''
  let optionLabels: string[] = []
  let editorType = block.type as string
  let typeLocked = false
  let systemBadge = false

  if (block.type === 'system_field') {
    label = block.label
    required = block.required
    helpText = block.helperText ?? ''
    editorType = 'system_field'
    typeLocked = true
    systemBadge = true
  } else if (
    block.type === 'packages' ||
    block.type === 'additional_services' ||
    block.type === 'location'
  ) {
    label = block.label
    required = block.required
    helpText = block.helperText ?? ''
    typeLocked = true
    systemBadge = true
  } else if (block.type === 'single_choice' || block.type === 'multiple_choice') {
    label = block.label
    required = block.required
    helpText = block.helperText ?? ''
    optionLabels = (block.options ?? []).map((o) => o.label)
  } else if (
    block.type === 'short_text' ||
    block.type === 'long_text' ||
    block.type === 'checkbox' ||
    block.type === 'date' ||
    block.type === 'number' ||
    block.type === 'email' ||
    block.type === 'phone'
  ) {
    label = block.label
    required = block.required
    helpText = block.helperText ?? ''
  }

  const isProtected =
    block.type === 'system_field' ||
    block.type === 'packages' ||
    block.type === 'additional_services' ||
    block.type === 'location'

  return {
    id: block.id,
    label,
    editorType,
    required,
    helpText,
    optionLabels,
    protected: isProtected,
    typeLocked: typeLocked || isProtected,
    systemBadge: systemBadge || isProtected,
    block,
  }
}

/**
 * Group ordered blocks into editable sections (heading → questions).
 * Greeting/footer text blocks are excluded (handled via config fields).
 */
export function blocksToEditorSections(
  blocks: ContractQuestionnaireBlock[],
): ContractEditorSection[] {
  const ordered = [...blocks]
    .filter((b) => b.enabled !== false)
    .sort((a, b) => a.order - b.order)
    .filter((b) => {
      if (b.type === 'divider') return false
      if (b.type === 'text' && (b.role === 'greeting' || b.role === 'footer')) {
        return false
      }
      return true
    })

  const sections: ContractEditorSection[] = []
  let current: ContractEditorSection | null = null

  function ensureSection(title = 'Pytania'): ContractEditorSection {
    if (current) return current
    current = {
      id: `sec_${newBlockId().replace(/-/g, '').slice(0, 10)}`,
      title,
      questions: [],
      heading: null,
    }
    sections.push(current)
    return current
  }

  for (const block of ordered) {
    if (block.type === 'heading') {
      current = {
        id: block.id,
        title: block.text || 'Sekcja',
        questions: [],
        heading: block,
      }
      sections.push(current)
      continue
    }
    const q = blockToQuestion(block)
    if (!q) continue
    ensureSection().questions.push(q)
  }

  if (sections.length === 0) {
    sections.push({
      id: `sec_${newBlockId().replace(/-/g, '').slice(0, 10)}`,
      title: 'Pytania',
      questions: [],
      heading: null,
    })
  }

  return sections
}

function labelsToOptions(labels: string[]): QuestionnaireChoiceOption[] {
  return labels
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label, i) => ({
      id: `opt_${i}_${label.slice(0, 12).replace(/\s+/g, '_')}`,
      value: label,
      label,
    }))
}

/** Apply editor question edits onto the underlying block. */
export function applyQuestionEdits(
  q: ContractEditorQuestion,
): ContractQuestionnaireBlock {
  const block = { ...q.block } as ContractQuestionnaireBlock

  if (block.type === 'text') {
    return { ...block, content: q.label }
  }

  if (block.type === 'system_field') {
    return {
      ...block,
      label: q.label,
      helperText: q.helpText || undefined,
      required: q.required,
    }
  }

  if (
    block.type === 'packages' ||
    block.type === 'additional_services' ||
    block.type === 'location'
  ) {
    return {
      ...block,
      label: q.label,
      helperText: q.helpText || undefined,
      required: q.required,
    }
  }

  if (
    block.type === 'short_text' ||
    block.type === 'long_text' ||
    block.type === 'single_choice' ||
    block.type === 'multiple_choice' ||
    block.type === 'checkbox' ||
    block.type === 'date' ||
    block.type === 'number' ||
    block.type === 'email' ||
    block.type === 'phone'
  ) {
    const nextType = q.editorType as typeof block.type
    const customTypes = [
      'short_text',
      'long_text',
      'single_choice',
      'multiple_choice',
      'checkbox',
      'date',
      'number',
      'email',
      'phone',
    ] as const
    const typeOk = (customTypes as readonly string[]).includes(q.editorType)
    const resolvedType = typeOk ? nextType : block.type
    return {
      ...block,
      type: resolvedType,
      label: q.label,
      helperText: q.helpText || undefined,
      required: q.required,
      options:
        resolvedType === 'single_choice' || resolvedType === 'multiple_choice'
          ? labelsToOptions(q.optionLabels)
          : undefined,
    }
  }

  return block
}

/**
 * Flatten sections back to ordered blocks, preserving greeting/footer and
 * disabled blocks from the previous config.
 */
export function editorSectionsToBlocks(
  sections: ContractEditorSection[],
  previousBlocks: ContractQuestionnaireBlock[],
  options?: { greeting?: string; footer?: string },
): ContractQuestionnaireBlock[] {
  const prev = [...previousBlocks].sort((a, b) => a.order - b.order)
  const greetingBlock = prev.find((b) => b.type === 'text' && b.role === 'greeting')
  const footerBlock = prev.find((b) => b.type === 'text' && b.role === 'footer')
  const disabled = prev.filter((b) => b.enabled === false)

  const out: ContractQuestionnaireBlock[] = []
  let order = 0

  const greetingText = options?.greeting?.trim() ?? ''
  if (greetingText) {
    out.push({
      id: greetingBlock?.id ?? `sys_text_greeting`,
      type: 'text',
      order: order++,
      enabled: true,
      content: greetingText,
      role: 'greeting',
    })
  }

  for (const section of sections) {
    const heading: QuestionnaireHeadingBlock = section.heading
      ? {
          ...section.heading,
          text: section.title,
          order: order++,
          enabled: true,
        }
      : {
          id: section.id.startsWith('sec_') ? section.id : `sys_heading_${section.id}`,
          type: 'heading',
          order: order++,
          enabled: true,
          text: section.title || 'Sekcja',
          level: 2,
        }
    out.push(heading)

    for (const q of section.questions) {
      const block = applyQuestionEdits(q)
      out.push({ ...block, order: order++, enabled: true })
    }
  }

  const footerText = options?.footer?.trim() ?? ''
  if (footerText) {
    out.push({
      id: footerBlock?.id ?? `sys_text_footer`,
      type: 'text',
      order: order++,
      enabled: true,
      content: footerText,
      role: 'footer',
    })
  }

  for (const b of disabled) {
    out.push({ ...b, order: order++ })
  }

  return out
}

export function createEditorQuestion(
  type: ContractAddableType,
): ContractEditorQuestion {
  const block = createBlockOfType(type, 0)
  if (!block) throw new Error('Cannot create block')
  const q = blockToQuestion(block)
  if (!q) throw new Error('Cannot map block')
  return q
}

export function createEditorSection(title = 'Nowa sekcja'): ContractEditorSection {
  return {
    id: `sec_${newBlockId().replace(/-/g, '').slice(0, 10)}`,
    title,
    questions: [],
    heading: null,
  }
}

export function friendlyContractTypeLabel(editorType: string): string {
  return CONTRACT_FIELD_TYPE_LABELS[editorType] ?? 'Pytanie'
}
