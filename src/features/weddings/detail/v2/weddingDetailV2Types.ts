import type { WeddingEditorSection } from '@/features/weddings/detail/weddingEditorTypes'
import type { WeddingHeroAction } from '@/features/weddings/detail/weddingHeroActions'
import type { WeddingExtraService } from '@/types/package'
import type { WeddingPlace } from '@/types/travel'
import type {
  Couple,
  Payment,
  Task,
  Wedding,
  WeddingContact,
  WeddingNote,
} from '@/types/wedding'

export type WeddingWorkspaceTab =
  | 'overview'
  | 'wedding_day'
  | 'contract_finance'
  | 'pre_wedding_questionnaire'
  | 'activity'

export const WEDDING_DETAIL_V2_TAB_KEY = 'ourwed:wedding-detail-v2-tab'

export type ActivityFilter =
  | 'all'
  | 'notes'
  | 'tasks'
  | 'questionnaires'
  | 'system'

/** Shared props for Wedding Details — page owns data + mutations. */
export interface WeddingDetailSharedProps {
  wedding: Wedding
  payments: Payment[]
  notes: WeddingNote[]
  tasks: Task[]
  contacts: WeddingContact[]
  extras: WeddingExtraService[]
  editing: boolean
  /** Section to focus after entering edit mode (workspace scroll). */
  editorSection?: WeddingEditorSection
  packageBasePrice?: number
  saving?: boolean
  saveError?: string | null
  onChangeWedding: (patch: Partial<Wedding>) => void
  onChangePayments: (payments: Payment[]) => void
  onChangeNotes: (notes: WeddingNote[]) => void
  onChangeTasks: (tasks: Task[]) => void
  onChangeContacts: (contacts: WeddingContact[]) => void
  onChangeExtras: (extras: WeddingExtraService[]) => void
  onChangePackageBasePrice: (price: number) => void
  onHeroAction: (action: WeddingHeroAction) => void
  onRequestVerifyLocations: () => void
  /** Open shared page editor focused on a section. */
  onEditSection?: (section: WeddingEditorSection) => void
  /** Persist draft (V2 drawer Zapisz). */
  onSaveEdit?: () => void
  /** Close editor / discard (V2 drawer Anuluj). */
  onCancelEdit?: () => void
  onAddNote?: () => void
  onSendQuestionnaire?: (kind: 'contractData') => void
  onArchive: () => Promise<void>
  onDelete: () => Promise<void>
}

export interface PartnerContactView {
  title: string
  name: string
  phone: string | null
  email: string | null
  /** Contract / questionnaire postal address when available. */
  address: string | null
}

export type AssignmentStatusTone = 'ok' | 'warn'

export interface AssignmentStatusItem {
  id: string
  label: string
  tone: AssignmentStatusTone
}

export interface HeaderStatusBadge {
  id: string
  label: string
  tone: 'ok' | 'warn' | 'neutral'
}

export interface LocationItemView {
  role: string
  label: string
  address: string
  placeName: string | null
  verified: boolean
  empty: boolean
  placeId: string | null
  latitude: number | null
  longitude: number | null
}

export interface ActivityFeedItem {
  id: string
  source: 'system' | 'note' | 'task' | 'questionnaire' | 'payment'
  filter: ActivityFilter
  title: string
  body?: string
  date: string
  badge?: string
}

export type { Couple, Wedding, WeddingPlace, WeddingNote, Task }
