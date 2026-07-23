import type { DocumentTemplateSummary } from '@/types/documents'

export type ContractUiStatus =
  | 'ready'
  | 'needs_analysis'
  | 'analyzing'
  | 'incomplete'

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

/** User-facing template status for Contract Templates. */
export function getContractUiStatus(
  template: DocumentTemplateSummary,
): ContractUiStatus {
  if (template.status === 'incomplete') return 'incomplete'
  if (
    template.meta?.slotBindingsReady === false &&
    (template.meta?.unresolvedSlotKeys?.length ?? 0) > 0
  ) {
    return 'incomplete'
  }
  if (template.status === 'ready' && template.variableCount > 0) {
    return 'ready'
  }
  if (template.status === 'draft' && !template.aiAnalyzedAt) {
    return 'needs_analysis'
  }
  if (template.aiAnalyzedAt && template.variableCount === 0) {
    return 'needs_analysis'
  }
  if (template.status === 'ready') return 'ready'
  return 'needs_analysis'
}

export function contractStatusLabel(status: ContractUiStatus): string {
  switch (status) {
    case 'analyzing':
      return 'Analizowanie…'
    case 'ready':
      return 'Gotowe'
    case 'incomplete':
      return 'Niekompletny'
    case 'needs_analysis':
      return 'Wymaga analizy'
  }
}
