/**
 * @deprecated Prefer Form Engine types in `src/types/form.ts`.
 */
import type { WorkflowStage } from '@/types/wedding'

export type PortalSectionId =
  | 'start'
  | 'contract_data'
  | 'wedding_questionnaire'
  | 'contract'
  | 'status'
  | 'contact'

export interface PortalSection {
  id: PortalSectionId
  label: string
  path: string
  /** false = show “Dostępne w późniejszym etapie.” */
  available: boolean
}

/** Teksty edytowalne później w Ustawieniach. */
export interface PortalSettings {
  welcomeTitle: string
  welcomeDescription: string
  welcomeParagraph: string
  contractInstructions: string
  footerMessage: string
  studioName: string
}

export interface Portal {
  id: string
  /** Public token — later used as ourwed.pl/p/{token} */
  token: string
  weddingId: string
  createdAt: string
}

export interface ContractQuestionnairePerson {
  firstName: string
  lastName: string
  address: string
  postalCode: string
  city: string
  phone: string
  email: string
}

export interface ContractQuestionnaire {
  weddingDate: string
  partner1: ContractQuestionnairePerson
  partner2: ContractQuestionnairePerson
  packageId: string
  preparationLocation: string
  ceremonyLocation: string
  receptionLocation: string
  additionalNotes: string
}

export interface PortalStatusStep {
  id: string
  label: string
  completed: boolean
  /** Optional link to workflow stage for engine alignment */
  stage?: WorkflowStage
}

export interface SubmitContractQuestionnaireResult {
  success: true
  packageChanged: boolean
}
