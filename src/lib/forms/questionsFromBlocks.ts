/**
 * Convert ordered enabled blocks into FormTemplate questions (public + preview).
 */

import {
  LOCATION_ROLE_TO_FIELD_KEY,
  type ContractQuestionnaireBlock,
  type QuestionnaireCustomFieldBlock,
  type QuestionnaireLocationBlock,
  type QuestionnaireSystemFieldBlock,
} from '@/types/questionnaireBlocks'
import type { Question } from '@/types/form'
import type {
  AdditionalServiceOptionSnapshot,
  PackageOptionSnapshot,
} from '@/types/contractQuestionnaire'

export function questionsFromBlocks(
  blocks: ContractQuestionnaireBlock[],
  packages: PackageOptionSnapshot[],
  additionalServices: AdditionalServiceOptionSnapshot[],
): Question[] {
  const packageOptions = packages.map((p) => ({
    value: p.id,
    label: p.name,
  }))
  const extraOptions = additionalServices.map((s) => ({
    value: s.id,
    label: s.name,
  }))

  const sorted = [...blocks]
    .filter((b) => b.enabled)
    .sort((a, b) => a.order - b.order)

  const questions: Question[] = []

  for (const block of sorted) {
    switch (block.type) {
      case 'heading':
        questions.push({
          id: block.id,
          type: 'section_title',
          label: block.text,
          description: block.description,
        })
        break
      case 'text':
        if (block.content.trim()) {
          questions.push({
            id: block.id,
            type: 'paragraph',
            label: block.content,
          })
        }
        break
      case 'divider':
        questions.push({
          id: block.id,
          type: 'paragraph',
          label: '—',
        })
        break
      case 'system_field':
        questions.push(systemBlockToQuestion(block))
        break
      case 'packages':
        // Hide empty catalog publicly — admin builder shows a config warning.
        if (packageOptions.length === 0) break
        questions.push({
          id: block.id,
          type: 'multiselect',
          label: block.label,
          description: block.helperText,
          required: block.required,
          fieldKey: 'selectedPackageIds',
          options: packageOptions,
          presentation: 'cards',
        })
        break
      case 'additional_services':
        if (extraOptions.length === 0) break
        questions.push({
          id: block.id,
          type: 'multiselect',
          label: block.label,
          description: block.helperText,
          required: block.required,
          fieldKey: 'selectedAdditionalServiceIds',
          options: extraOptions,
          presentation: 'cards',
        })
        break
      case 'location':
        questions.push(locationBlockToQuestion(block))
        break
      case 'short_text':
      case 'long_text':
      case 'single_choice':
      case 'multiple_choice':
      case 'checkbox':
      case 'date':
      case 'number':
      case 'email':
      case 'phone':
        questions.push(customBlockToQuestion(block))
        break
      default:
        break
    }
  }

  return questions
}

function systemBlockToQuestion(block: QuestionnaireSystemFieldBlock): Question {
  if (block.inputType === 'address') {
    return {
      id: block.id,
      type: 'location',
      label: block.label,
      description: block.helperText,
      required: block.required,
      fieldKey: block.systemKey,
      placeholder: 'Wpisz adres…',
    }
  }
  const typeMap = {
    text: 'text' as const,
    phone: 'phone' as const,
    email: 'email' as const,
    date: 'date' as const,
    textarea: 'textarea' as const,
  }
  return {
    id: block.id,
    type: typeMap[block.inputType],
    label: block.label,
    description: block.helperText,
    required: block.required,
    fieldKey: block.systemKey,
  }
}

function locationBlockToQuestion(block: QuestionnaireLocationBlock): Question {
  return {
    id: block.id,
    type: 'location',
    label: block.label,
    description: block.helperText,
    required: block.required,
    fieldKey: LOCATION_ROLE_TO_FIELD_KEY[block.locationRole],
  }
}

function customBlockToQuestion(block: QuestionnaireCustomFieldBlock): Question {
  const base = {
    id: block.id,
    label: block.label,
    required: block.required,
    fieldKey: `custom.${block.fieldKey}`,
    description: block.helperText,
    placeholder: block.placeholder,
    customFieldId: block.id,
  }
  switch (block.type) {
    case 'long_text':
      return { ...base, type: 'textarea' }
    case 'single_choice':
      return {
        ...base,
        type: 'radio',
        options: (block.options ?? []).map((o) => ({
          value: o.value,
          label: o.label,
        })),
      }
    case 'multiple_choice':
      return {
        ...base,
        type: 'multiselect',
        options: (block.options ?? []).map((o) => ({
          value: o.value,
          label: o.label,
        })),
      }
    case 'checkbox':
      return { ...base, type: 'checkbox' }
    case 'date':
      return { ...base, type: 'date' }
    case 'number':
      return { ...base, type: 'text', placeholder: block.placeholder || '0' }
    case 'phone':
      return { ...base, type: 'phone' }
    case 'email':
      return { ...base, type: 'email' }
    case 'short_text':
    default:
      return { ...base, type: 'text' }
  }
}
