import type { WeddingHeroAction } from '@/features/weddings/components/detail/WeddingDetailHero'
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

export type WeddingDetailViewMode = 'v1' | 'v2'

export const WEDDING_DETAIL_VIEW_STORAGE_KEY = 'ourwed:wedding-detail-view'
export const WEDDING_DETAIL_V2_TAB_KEY = 'ourwed:wedding-detail-v2-tab'

export type WeddingWorkspaceTab =
  | 'overview'
  | 'wedding_day'
  | 'contract_finance'
  | 'activity'

export type ActivityFilter =
  | 'all'
  | 'notes'
  | 'tasks'
  | 'questionnaires'
  | 'system'

/** Shared props for V1 and V2 — page owns data + mutations. */
export interface WeddingDetailSharedProps {
  wedding: Wedding
  payments: Payment[]
  notes: WeddingNote[]
  tasks: Task[]
  contacts: WeddingContact[]
  extras: WeddingExtraService[]
  editing: boolean
  packageBasePrice?: number
  onChangeWedding: (patch: Partial<Wedding>) => void
  onChangePayments: (payments: Payment[]) => void
  onChangeNotes: (notes: WeddingNote[]) => void
  onChangeTasks: (tasks: Task[]) => void
  onChangeContacts: (contacts: WeddingContact[]) => void
  onChangeExtras: (extras: WeddingExtraService[]) => void
  onChangePackageBasePrice: (price: number) => void
  onHeroAction: (action: WeddingHeroAction) => void
  onRequestVerifyLocations: () => void
  onAddNote?: () => void
  onSendQuestionnaire?: (kind: 'contractData') => void
  onArchive: () => Promise<void>
  onDelete: () => Promise<void>
  showSchedule: boolean
  showEquipment: boolean
  showDeliverables: boolean
}

export interface PartnerContactView {
  title: string
  name: string
  phone: string | null
  email: string | null
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
