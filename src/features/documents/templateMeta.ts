import type { LucideIcon } from 'lucide-react'
import {
  ClipboardCheck,
  File,
  FileText,
  Files,
  ShieldCheck,
} from 'lucide-react'
import type {
  DocumentDocType,
  DocumentTemplateStatus,
} from '@/types/documents'

/** Phase 1 categories shown in the Templates UI. */
export const TEMPLATE_CATEGORIES: {
  id: DocumentDocType
  label: string
  icon: LucideIcon
}[] = [
  { id: 'contract', label: 'Umowa', icon: FileText },
  { id: 'annex', label: 'Aneks', icon: Files },
  { id: 'gdpr', label: 'RODO', icon: ShieldCheck },
  { id: 'delivery_protocol', label: 'Protokół', icon: ClipboardCheck },
  { id: 'other', label: 'Inne', icon: File },
]

export const TEMPLATE_STATUSES: {
  id: DocumentTemplateStatus
  label: string
}[] = [
  { id: 'draft', label: 'Szkic' },
  { id: 'ready', label: 'Gotowy' },
  { id: 'archived', label: 'Zarchiwizowany' },
]

export function getCategoryMeta(docType: DocumentDocType) {
  return (
    TEMPLATE_CATEGORIES.find((c) => c.id === docType) ??
    TEMPLATE_CATEGORIES[TEMPLATE_CATEGORIES.length - 1]
  )
}

export function getStatusLabel(status: DocumentTemplateStatus): string {
  return TEMPLATE_STATUSES.find((s) => s.id === status)?.label ?? status
}

export function formatTemplateDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function formatTemplateDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export type TemplateSortKey =
  | 'newest'
  | 'oldest'
  | 'updated'
  | 'alpha'

export const TEMPLATE_SORT_OPTIONS: { id: TemplateSortKey; label: string }[] = [
  { id: 'updated', label: 'Ostatnio aktualizowane' },
  { id: 'newest', label: 'Najnowsze' },
  { id: 'oldest', label: 'Najstarsze' },
  { id: 'alpha', label: 'Alfabetycznie' },
]
