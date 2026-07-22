/**
 * Canonical question definitions for "Dane do umowy" (Contract Questionnaire).
 *
 * AUDIT — every input question in the built-in template:
 *
 * | questionId       | type     | fieldKey (CRM binding)   | notes                          |
 * |------------------|----------|----------|--------------------------|--------------------------------|
 * | q-wedding-date   | date     | weddingDate              | required                       |
 * | q-package        | select   | packageId                | options from Studio Packages   |
 * | q-p1-first       | text     | partner1.firstName       | bride                          |
 * | q-p1-last        | text     | partner1.lastName        | bride                          |
 * | q-p1-phone       | phone    | partner1.phone           | bride                          |
 * | q-p2-first       | text     | partner2.firstName       | groom                          |
 * | q-p2-last        | text     | partner2.lastName        | groom                          |
 * | q-p2-phone       | phone    | partner2.phone           | groom                          |
 * | q-p1-address     | text     | partner1.address         | contract address street        |
 * | q-p1-postal      | text     | partner1.postalCode     |                                |
 * | q-p1-city        | text     | partner1.city            |                                |
 * | q-p1-email       | email    | partner1.email           | contact email                  |
 * | q-prep           | location | preparationLocation      | optional                       |
 * | q-ceremony       | location | ceremonyLocation         | required                       |
 * | q-reception      | location | receptionLocation        | required                       |
 * | q-notes          | textarea | additionalNotes          | optional                       |
 *
 * Section titles (display only, no fieldKey):
 * q-section-wedding | q-section-p1 | q-section-p2 | q-section-address |
 * q-section-email | q-section-locations | q-section-notes
 *
 * Package loading: buildContractQuestionnaireTemplate(packages) / runtime inject
 * via resolvePublicFormTemplate — never invent a second package selector.
 *
 * AI templates MUST clone these definitions (same id + fieldKey + type).
 * Only the set of enabled questions may differ.
 */

import type { FormTemplate, Question } from '@/types/form'
import {
  buildContractQuestionnaireTemplate,
  CONTRACT_QUESTIONNAIRE_TEMPLATE,
} from '@/lib/forms/contractQuestionnaireTemplate'

/** Stable ids for system questions — single implementation. */
export const CONTRACT_QUESTION_IDS = {
  WEDDING_DATE: 'q-wedding-date',
  PACKAGE_SELECTOR: 'q-package',
  BRIDE_FIRST_NAME: 'q-p1-first',
  BRIDE_LAST_NAME: 'q-p1-last',
  BRIDE_PHONE: 'q-p1-phone',
  GROOM_FIRST_NAME: 'q-p2-first',
  GROOM_LAST_NAME: 'q-p2-last',
  GROOM_PHONE: 'q-p2-phone',
  CONTRACT_ADDRESS: 'q-p1-address',
  CONTRACT_POSTAL: 'q-p1-postal',
  CONTRACT_CITY: 'q-p1-city',
  CONTACT_EMAIL: 'q-p1-email',
  PREPARATION_LOCATION: 'q-prep',
  CEREMONY_LOCATION: 'q-ceremony',
  RECEPTION_LOCATION: 'q-reception',
  NOTES: 'q-notes',
} as const

export type ContractQuestionId =
  (typeof CONTRACT_QUESTION_IDS)[keyof typeof CONTRACT_QUESTION_IDS]

/** Document-variable registry key → built-in question id. */
export const REGISTRY_KEY_TO_CONTRACT_QUESTION_ID: Record<
  string,
  ContractQuestionId
> = {
  'wedding.date': CONTRACT_QUESTION_IDS.WEDDING_DATE,
  'package.name': CONTRACT_QUESTION_IDS.PACKAGE_SELECTOR,
  'bride.firstName': CONTRACT_QUESTION_IDS.BRIDE_FIRST_NAME,
  'bride.lastName': CONTRACT_QUESTION_IDS.BRIDE_LAST_NAME,
  'bride.phone': CONTRACT_QUESTION_IDS.BRIDE_PHONE,
  'bride.email': CONTRACT_QUESTION_IDS.CONTACT_EMAIL,
  'bride.address': CONTRACT_QUESTION_IDS.CONTRACT_ADDRESS,
  'groom.firstName': CONTRACT_QUESTION_IDS.GROOM_FIRST_NAME,
  'groom.lastName': CONTRACT_QUESTION_IDS.GROOM_LAST_NAME,
  'groom.phone': CONTRACT_QUESTION_IDS.GROOM_PHONE,
  'groom.email': CONTRACT_QUESTION_IDS.CONTACT_EMAIL,
  'groom.address': CONTRACT_QUESTION_IDS.CONTRACT_ADDRESS,
  'location.preparation': CONTRACT_QUESTION_IDS.PREPARATION_LOCATION,
  'location.ceremony': CONTRACT_QUESTION_IDS.CEREMONY_LOCATION,
  'location.reception': CONTRACT_QUESTION_IDS.RECEPTION_LOCATION,
}

/** CRM fieldKey → built-in question id. */
export const FIELD_KEY_TO_CONTRACT_QUESTION_ID: Record<
  string,
  ContractQuestionId
> = {
  weddingDate: CONTRACT_QUESTION_IDS.WEDDING_DATE,
  packageId: CONTRACT_QUESTION_IDS.PACKAGE_SELECTOR,
  'partner1.firstName': CONTRACT_QUESTION_IDS.BRIDE_FIRST_NAME,
  'partner1.lastName': CONTRACT_QUESTION_IDS.BRIDE_LAST_NAME,
  'partner1.phone': CONTRACT_QUESTION_IDS.BRIDE_PHONE,
  'partner1.email': CONTRACT_QUESTION_IDS.CONTACT_EMAIL,
  'partner1.address': CONTRACT_QUESTION_IDS.CONTRACT_ADDRESS,
  'partner1.postalCode': CONTRACT_QUESTION_IDS.CONTRACT_POSTAL,
  'partner1.city': CONTRACT_QUESTION_IDS.CONTRACT_CITY,
  'partner2.firstName': CONTRACT_QUESTION_IDS.GROOM_FIRST_NAME,
  'partner2.lastName': CONTRACT_QUESTION_IDS.GROOM_LAST_NAME,
  'partner2.phone': CONTRACT_QUESTION_IDS.GROOM_PHONE,
  'partner2.email': CONTRACT_QUESTION_IDS.CONTACT_EMAIL,
  preparationLocation: CONTRACT_QUESTION_IDS.PREPARATION_LOCATION,
  ceremonyLocation: CONTRACT_QUESTION_IDS.CEREMONY_LOCATION,
  receptionLocation: CONTRACT_QUESTION_IDS.RECEPTION_LOCATION,
  additionalNotes: CONTRACT_QUESTION_IDS.NOTES,
}

/**
 * When address is enabled, include postal + city — same CRM block as built-in.
 */
export const ADDRESS_BUNDLE_IDS: ContractQuestionId[] = [
  CONTRACT_QUESTION_IDS.CONTRACT_ADDRESS,
  CONTRACT_QUESTION_IDS.CONTRACT_POSTAL,
  CONTRACT_QUESTION_IDS.CONTRACT_CITY,
]

export function getContractQuestionById(
  id: string,
): Question | undefined {
  return CONTRACT_QUESTIONNAIRE_TEMPLATE.questions.find((q) => q.id === id)
}

export function cloneContractQuestion(
  id: string,
  packages: { id: string; name: string }[] = [],
): Question | null {
  const full = buildContractQuestionnaireTemplate(packages)
  const q = full.questions.find((x) => x.id === id)
  if (!q) return null
  return { ...q, options: q.options ? [...q.options] : undefined }
}

/**
 * Assemble a FormTemplate that is a subset of "Dane do umowy".
 * Question objects are clones of the built-in definitions (same ids / types / fieldKeys).
 * Package select options come from Studio Packages via buildContractQuestionnaireTemplate.
 */
export function buildContractQuestionnaireSubset(
  enabledQuestionIds: string[],
  packages: { id: string; name: string }[],
  meta?: { title?: string; description?: string },
): FormTemplate {
  const full = buildContractQuestionnaireTemplate(packages)
  const enabled = new Set(expandEnabledQuestionIds(enabledQuestionIds))

  const questions: Question[] = []
  let pendingSection: Question | null = null

  for (const q of full.questions) {
    if (q.type === 'section_title') {
      pendingSection = { ...q }
      continue
    }
    if (q.type === 'paragraph') continue
    if (!enabled.has(q.id)) continue

    if (pendingSection) {
      questions.push(pendingSection)
      pendingSection = null
    }
    questions.push({
      ...q,
      options: q.options ? [...q.options] : undefined,
    })
  }

  return {
    ...full,
    id: full.id,
    type: 'contract_questionnaire',
    title: meta?.title?.trim() || full.title,
    description: meta?.description?.trim() || full.description,
    questions,
  }
}

function expandEnabledQuestionIds(ids: string[]): string[] {
  const out = new Set(ids)
  if (out.has(CONTRACT_QUESTION_IDS.CONTRACT_ADDRESS)) {
    for (const id of ADDRESS_BUNDLE_IDS) out.add(id)
  }
  return [...out]
}

export function resolveContractQuestionId(input: {
  registryKey?: string | null
  fieldKey?: string | null
  questionId?: string | null
}): ContractQuestionId | null {
  if (input.questionId) {
    const q = getContractQuestionById(input.questionId)
    if (q && q.fieldKey) return input.questionId as ContractQuestionId
  }
  if (input.registryKey) {
    const id = REGISTRY_KEY_TO_CONTRACT_QUESTION_ID[input.registryKey]
    if (id) return id
  }
  if (input.fieldKey) {
    const id = FIELD_KEY_TO_CONTRACT_QUESTION_ID[input.fieldKey]
    if (id) return id
  }
  return null
}

export function normalizeQuestionLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ąćęłńóśźż\s]/gi, '')
    .replace(/\s+/g, ' ')
}
