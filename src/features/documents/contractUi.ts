import type { DocumentTemplateSummary } from '@/types/documents'
import {
  automaticStatusFromTemplate,
  type AutomaticTemplateStatus,
} from '@/features/documents/template/automaticTemplateReadiness'
import { isTemplateUsableForGeneration } from '@/features/documents/template/templateGenerationReadiness'

export { isTemplateUsableForGeneration }

/** User-facing template status for Contract Templates (primary product). */
export type ContractUiStatus =
  | 'analyzing'
  | 'ready'
  | 'attention'
  | 'error'
  | 'archived'

export function fileFormatLabel(fileName: string | null | undefined): string {
  if (!fileName) return 'Dokument'
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) return 'PDF'
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'DOCX'
  const ext = fileName.split('.').pop()
  return ext ? ext.toUpperCase() : 'Dokument'
}

export function formatContractDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function nameFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || 'Umowa'
}

export function templateServiceTypeLabel(
  type: DocumentTemplateSummary['meta']['templateServiceType'] | undefined,
  category?: string | null,
): string {
  const fromMeta = type
  if (fromMeta === 'foto') return 'Foto'
  if (fromMeta === 'video') return 'Video'
  if (fromMeta === 'foto_video') return 'Foto + Video'
  if (fromMeta === 'other') return 'Inny'
  const cat = category?.trim().toLowerCase() ?? ''
  if (cat.includes('foto') && cat.includes('video')) return 'Foto + Video'
  if (cat.includes('foto') || cat.includes('photo')) return 'Foto'
  if (cat.includes('video') || cat.includes('film')) return 'Video'
  return 'Inny'
}

/** User-facing template status for Contract Templates (primary product). */
export function getContractUiStatus(
  template: DocumentTemplateSummary,
): ContractUiStatus {
  return automaticStatusFromTemplate(template) as ContractUiStatus
}

export function contractStatusLabel(status: ContractUiStatus): string {
  switch (status) {
    case 'archived':
      return 'Archiwalny'
    case 'analyzing':
      return 'Analizowanie'
    case 'ready':
      return 'Gotowy'
    case 'attention':
      return 'Wymaga uwagi'
    case 'error':
      return 'Błąd analizy'
  }
}

export function toAutomaticStatus(
  status: ContractUiStatus,
): AutomaticTemplateStatus {
  return status
}
