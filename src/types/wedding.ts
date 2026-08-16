import type { FinalPaymentTerms } from '@/lib/utils/finalPaymentTerms'
import type { WeddingCorrespondenceEntry } from '@/features/weddings/correspondence/weddingCorrespondence'
import type { TravelFeeStatus } from '@/lib/utils/travelFeeCommercial'

export type { TravelFeeStatus } from '@/lib/utils/travelFeeCommercial'


export type WorkflowStage =
  | 'reservation'
  | 'contract'
  | 'deposit'
  | 'preparation'
  | 'pre_wedding_questionnaire'
  | 'wedding_day'
  | 'post_production'
  | 'completed'

export type WeddingStatus = 'active' | 'archived' | 'cancelled'

/** Compact primary location projection for list / dashboard / header. */
export type WeddingPrimaryLocationSource =
  | 'reception'
  | 'ceremony'
  | 'preparation'
  | 'legacy'
  | 'none'

export interface WeddingPrimaryLocationSummary {
  venueName: string | null
  locality: string | null
  /** Compact one-line text, e.g. "Villa Love, Izdebnik". Null when nothing useful. */
  displayText: string | null
  source: WeddingPrimaryLocationSource
}

export interface Couple {
  partner1: string
  partner2: string
  partner1FirstName?: string
  partner1LastName?: string
  partner2FirstName?: string
  partner2LastName?: string
  partner1Phone?: string
  partner1Email?: string
  partner1Address?: string
  partner1PostalCode?: string
  partner1City?: string
  partner2Phone?: string
  partner2Email?: string
  partner2Address?: string
  partner2PostalCode?: string
  partner2City?: string
  email: string
  phone: string
  venue: string
  city: string
}

export interface WeddingContact {
  id: string
  weddingId: string
  name: string
  role?: string
  phone?: string
  email?: string
  createdAt: string
}


export interface ChecklistItem {
  id: string
  label: string
  completed: boolean
  category: string
}

export interface ScheduleEvent {
  id: string
  time: string
  title: string
  location?: string
  notes?: string
}

export type PaymentType = 'deposit' | 'installment' | 'final' | 'other'

export type PaymentMethod = 'transfer' | 'cash' | 'blik' | 'other'

/** Płatność od pary w ramach wartości umowy (zaliczka, transza, reszta). */
export interface Payment {
  id: string
  label: string
  amount: number
  type: PaymentType
  paid: boolean
  paidAt?: string
  dueDate?: string
  method?: PaymentMethod
  note?: string
}

/** Koszty operacyjne (sprzęt, podwykonawcy) — nie wliczane do wartości umowy. */
export interface FinanceItem {
  id: string
  label: string
  amount: number
  type: 'expense'
  paid: boolean
  dueDate?: string
}

export type QuestionnaireStatus = 'not_sent' | 'sent' | 'completed'

export interface QuestionnaireItem {
  status: QuestionnaireStatus
  sentAt?: string
  completedAt?: string
}

export interface WeddingQuestionnaires {
  contractData: QuestionnaireItem
  weddingQuestionnaire: QuestionnaireItem
}

export type ContractStatus = 'none' | 'generated' | 'sent' | 'signed'

/** Stan umowy — źródło prawdy dla Workflow Engine (nie tylko workflowStage). */
export interface WeddingContract {
  status: ContractStatus
  generatedAt?: string
  sentAt?: string
  signedAt?: string
}

export interface StageTask {
  id: string
  title: string
  completed: boolean
}

export type WeddingTimelineEntryType =
  | 'created'
  | 'questionnaire_sent'
  | 'questionnaire_completed'
  | 'contract_generated'
  | 'contract_signed'
  | 'payment_received'
  | 'note_added'
  | 'wedding_day'
  | 'deliverable'
  | 'package_changed'

export interface WeddingTimelineEntry {
  id: string
  title: string
  date: string
  description?: string
  type: WeddingTimelineEntryType
}

export interface WeddingNote {
  id: string
  content: string
  createdAt: string
  author: string
  /** System origin — optional for manually created notes. */
  source?:
    | 'contract_questionnaire'
    | 'wedding_questionnaire'
    | 'ai_summary'
    | 'payment'
    | 'contract'
    | 'package_change'
  /** Small origin badge, e.g. "Ankieta do umowy". */
  badge?: string
  pinned?: boolean
}

/** Linki do materiałów — gotowe na przyszłą integrację z galeriami i hostingiem wideo. */
export interface DeliverableLinks {
  downloadUrl?: string
  galleryUrl?: string
  vimeoUrl?: string
  wetransferUrl?: string
}

export type DeliverableSource = 'package' | 'additional'

/**
 * Frozen copy of a catalog package line at assignment time.
 * Historical weddings must never re-read live catalog items.
 */
export interface WeddingPackageItemSnapshot {
  /** Original catalog package_items.id when known. */
  sourceItemId?: string | null
  title: string
  description?: string | null
  sortOrder: number
  enabled?: boolean
  quantity?: number | null
  unit?: string | null
  category?: string | null
}

/**
 * Materiał do oddania przypisany do ślubu.
 * Kopia z pakietu + ewentualne usługi dodatkowe (source: additional).
 */
export interface WeddingDeliverable {
  id: string
  name: string
  source: DeliverableSource
  completed: boolean
  completedAt?: string
  deliveryDate?: string
  links?: DeliverableLinks
  /** Id szablonu z pakietu — tylko gdy source === 'package'. */
  packageDeliverableId?: string
}

export interface Wedding {
  id: string
  couple: Couple
  /**
   * Presentation-only title for app UI (lists, cards, headers).
   * Must never be used by contracts, questionnaires, merge fields, or exports.
   */
  displayName?: string | null
  /**
   * Studio ↔ couple correspondence channels (email / Instagram / Facebook).
   * Empty array when unset. Not a marketing attribution field.
   */
  correspondence?: WeddingCorrespondenceEntry[]
  date: string
  /** Ceremony start time — HH:MM (from weddings.ceremony_time). */
  ceremonyTime?: string
  status: WeddingStatus
  workflowStage: WorkflowStage
  /**
   * Commercial snapshot — historical package name.
   * Catalog renames must not change this.
   */
  packageName: string
  /** Optional FK to Studio Catalog package (reference only — not live pricing). */
  packageId?: string | null
  /**
   * Commercial snapshot — contractValue (total agreed contract value).
   * Persisted as weddings.contract_value.
   * Includes package base + extras + charged travel fee.
   */
  price: number
  /**
   * Travel fee commercial decision — snapshotted per wedding.
   * Not derived live from route distance.
   */
  travelFeeStatus?: TravelFeeStatus
  /** Amount when charged; 0 when included/unresolved. */
  travelFeeAmount?: number
  travelFeeResolvedAt?: string | null
  /** Studio free-km policy at resolve time (audit). */
  travelFeeFreeKmSnapshot?: number | null
  /** Round-trip commercial distance (meters) at resolve time (audit). */
  travelFeeRouteDistanceMSnapshot?: number | null
  travelFeeNote?: string | null
  /**
   * Commercial snapshot — agreedDeposit (deposit agreed in the contract).
   * Persisted as weddings.deposit_amount. Not the same as deposit paid.
   */
  depositAmount?: number
  currency?: string
  /**
   * Commercial snapshot — package line items frozen at assignment.
   * Persisted as weddings.package_items_snapshot.
   */
  packageItems: WeddingPackageItemSnapshot[]
  /** Wedding snapshot — coverage hours (not live catalog). */
  coverageHours?: number | null
  /** Wedding snapshot — coverage end time, e.g. "00:30". */
  coverageEndTime?: string | null
  /** Wedding snapshot — overtime hourly rate. */
  overtimeRate?: number | null
  /** Wedding snapshot — delivery term in months. */
  deliveryMonths?: number | null
  /** Wedding snapshot — delivery term in days. */
  deliveryDays?: number | null
  /**
   * Wedding snapshot — structured final payment rule from the package.
   * Independent of later catalog edits; editable per wedding.
   */
  finalPaymentTerms?: FinalPaymentTerms | null
  /**
   * Wedding-specific final payment due date (YYYY-MM-DD).
   * Derived from finalPaymentTerms + wedding date when possible;
   * never copied from DOCX templates.
   */
  finalPaymentDueDate?: string | null
  ceremonyLocation?: string
  receptionLocation?: string
  preparationLocation?: string
  /** Bride preparation — preferred over preparationLocation. */
  bridePreparationLocation?: string
  groomPreparationLocation?: string
  /**
   * Compact primary location for list/dashboard/header (hydrated).
   * Prefer reception venue name + locality; never a full street address.
   */
  primaryLocation?: WeddingPrimaryLocationSummary
  /**
   * Client-requested package IDs from questionnaire (multi-select).
   * packageId remains the primary commercial package.
   */
  selectedPackageIds?: string[]
  checklist: ChecklistItem[]
  schedule: ScheduleEvent[]
  payments: Payment[]
  finances: FinanceItem[]
  questionnaires: WeddingQuestionnaires
  contract: WeddingContract
  notes: WeddingNote[]
  deliverables: WeddingDeliverable[]
  timeline: WeddingTimelineEntry[]
  /** Snapshot of package color for calendar/UI. */
  accentColor: string
  createdAt: string
}

export interface CreateWeddingInput {
  partner1: string
  partner2: string
  date: string
  ceremonyLocation?: string
  receptionLocation?: string
  packageId?: string | null
  packageName: string
  /** contractValue */
  price: number
  depositPaid: boolean
  /** agreedDeposit */
  depositAmount?: number
  depositPaymentDate?: string
  currency?: string
  accentColor?: string
  notes?: string
  /** Optional pre-built item snapshot; otherwise loaded from catalog on create. */
  packageItems?: WeddingPackageItemSnapshot[]
  coverageHours?: number | null
  coverageEndTime?: string | null
  overtimeRate?: number | null
  deliveryMonths?: number | null
  deliveryDays?: number | null
  finalPaymentTerms?: FinalPaymentTerms | null
  finalPaymentDueDate?: string | null
  phone?: string
  email?: string
  /**
   * Presentation-only title (e.g. imported single client name).
   * Does not replace partner1/partner2 business data.
   */
  displayName?: string | null
  creationOptions?: WeddingCreationOptions
}

export type WeddingCreationOptions = {
  source?: 'manual' | 'spreadsheet_import'
  /** Imported contract value must not be replaced by catalog package price. */
  preserveImportedPrice?: boolean
  /**
   * When false, skip finalizeWeddingView and return the mapped row + input scalars.
   * Default true — approval uses false to avoid multi-hydrate on the critical path.
   */
  hydrate?: boolean
  /**
   * Approval: only seed local calendar on the critical path.
   * Timeline / contract / gallery shells are deferred by the caller.
   * Default `'full'` preserves manual create / import behavior.
   */
  seedMode?: 'full' | 'calendar_only'
  /**
   * Already-validated studio package from the same approval transaction.
   * Skips repeat packageService.get inside create. Must originate from
   * an authenticated package lookup — never from public form prices alone.
   */
  resolvedPackage?: import('@/types/package').StudioPackage
}

/** Optional write behavior for weddingService.update. Defaults preserve legacy behavior. */
export type WeddingUpdateOptions = {
  /** When false, skip finalizeWeddingView. Default true. */
  hydrate?: boolean
  /**
   * When false, skip ensureWeddingDayEvent (e.g. approval after create already seeded).
   * Default true.
   */
  ensureCalendarEvent?: boolean
  /**
   * When false, omit package_id from the UPDATE and skip package existence queries.
   * Use when the caller knows package_id is unchanged (approval scalar enrichment).
   * Default true (legacy validation).
   */
  validatePackageId?: boolean
}

export interface Task {
  id: string
  /**
   * Optional wedding association.
   * `null` = studio-wide unlinked task (Phase 1D.1+).
   * Ownership is always via DB `user_id`, not this field.
   */
  weddingId: string | null
  title: string
  /** Empty string = no due date (never invent created_at). */
  dueDate: string
  completed: boolean
  /** Display-only — not persisted. */
  priority: 'low' | 'medium' | 'high'
}

export interface Notification {
  id: string
  title: string
  message: string
  /** Calendar date string for display helpers. */
  createdAt: string
  /** Raw timestamptz — cursor pagination + precise display. */
  createdAtIso: string
  read: boolean
  type: 'info' | 'warning' | 'success'
  /** In-app deep link (relative path), when set. */
  link?: string | null
}

export interface Deadline {
  id: string
  weddingId: string
  title: string
  date: string
  type: 'payment' | 'meeting' | 'delivery' | 'other'
}

export type WeddingDetailSection =
  | 'workflow'
  | 'payments'
  | 'equipment'
  | 'questionnaires'
  | 'schedule'
  | 'tasks'
  | 'notes'
  | 'deliverables'
  | 'history'
