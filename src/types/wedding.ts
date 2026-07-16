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
  date: string
  /** Ceremony start time — HH:MM (from weddings.ceremony_time). */
  ceremonyTime?: string
  status: WeddingStatus
  workflowStage: WorkflowStage
  /** Snapshot — historical package name at selection time. */
  packageName: string
  /** Optional FK to Studio Catalog package (for contents). */
  packageId?: string | null
  /** Snapshot — contract total (package + extras at selection). */
  price: number
  /** Snapshot — expected deposit. */
  depositAmount?: number
  currency?: string
  ceremonyLocation?: string
  receptionLocation?: string
  preparationLocation?: string
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
  price: number
  depositPaid: boolean
  depositAmount?: number
  depositPaymentDate?: string
  currency?: string
  accentColor?: string
  notes?: string
}

export interface Task {
  id: string
  weddingId: string
  title: string
  dueDate: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
}

export interface Notification {
  id: string
  title: string
  message: string
  createdAt: string
  read: boolean
  type: 'info' | 'warning' | 'success'
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
