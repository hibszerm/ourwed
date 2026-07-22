import type { DocumentTemplateSummary } from '@/types/documents'

export type ContractUiStatus =
  | 'analyzing'
  | 'ready'
  | 'questionnaire_created'
  | 'needs_attention'

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

/** Derive a simple user-facing status from persisted template fields. */
export function getContractUiStatus(
  template: DocumentTemplateSummary,
): ContractUiStatus {
  if (template.status === 'archived') return 'needs_attention'
  if (template.questionnaireFormId) {
    return template.status === 'ready' ? 'ready' : 'questionnaire_created'
  }
  if (template.aiAnalyzedAt) return 'needs_attention'
  if (template.sourceFileName || template.sourceDocxPath) {
    return 'needs_attention'
  }
  return 'needs_attention'
}

export function contractStatusLabel(status: ContractUiStatus): string {
  switch (status) {
    case 'analyzing':
      return 'Analizowanie…'
    case 'ready':
      return 'Gotowe'
    case 'questionnaire_created':
      return 'Ankieta utworzona'
    case 'needs_attention':
      return 'Wymaga uwagi'
  }
}
