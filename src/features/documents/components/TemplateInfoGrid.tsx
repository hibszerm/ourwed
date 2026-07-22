import { FileText } from 'lucide-react'
import type { DocumentTemplateSummary } from '@/types/documents'
import {
  formatTemplateDate,
  getCategoryMeta,
  getStatusLabel,
} from '@/features/documents/templateMeta'
import styles from '../DocumentsTemplates.module.css'

type ReadinessTone = 'waiting' | 'configured' | 'ready' | 'archived' | 'incomplete'

function readinessState(
  template: DocumentTemplateSummary,
  configured: boolean,
): { label: string; helper: string; tone: ReadinessTone } {
  if (template.status === 'archived') {
    return {
      label: 'Zarchiwizowany',
      helper: 'Ukryty w aktywnej bibliotece',
      tone: 'archived',
    }
  }
  if (template.status === 'ready' && configured) {
    return {
      label: 'Gotowy do produkcji',
      helper: 'Można generować dokumenty',
      tone: 'ready',
    }
  }
  if (configured) {
    return {
      label: 'Skonfigurowany',
      helper: 'Oznacz jako gotowy, gdy wszystko jest sprawdzone',
      tone: 'configured',
    }
  }
  if (template.sourceFileName || template.currentVersionNumber) {
    return {
      label: 'Oczekuje na konfigurację',
      helper: 'Następny krok: analiza AI',
      tone: 'waiting',
    }
  }
  return {
    label: 'Niekompletny',
    helper: 'Prześlij plik DOCX',
    tone: 'incomplete',
  }
}

const readinessToneClass: Record<ReadinessTone, string> = {
  waiting: styles.readinessWaiting,
  configured: styles.readinessConfigured,
  ready: styles.readinessReady,
  archived: styles.readinessArchived,
  incomplete: styles.readinessIncomplete,
}

export function TemplateInfoGrid({
  template,
  configured,
}: {
  template: DocumentTemplateSummary
  configured: boolean
}) {
  const cat = getCategoryMeta(template.docType)
  const readiness = readinessState(template, configured)

  return (
    <div className={styles.infoGridCompact}>
      <article className={styles.infoCard}>
        <p className={styles.infoLabel}>Status</p>
        <p className={styles.infoValue}>{getStatusLabel(template.status)}</p>
        <p className={styles.infoHelper}>
          {template.status === 'draft' ? 'W przygotowaniu' : 'Widoczny status w bibliotece'}
        </p>
      </article>

      <article className={styles.infoCard}>
        <p className={styles.infoLabel}>Typ dokumentu</p>
        <p className={styles.infoValue}>{cat.label}</p>
        <p className={styles.infoHelper}>Kategoria w bibliotece studia</p>
      </article>

      <article className={styles.infoCard}>
        <p className={styles.infoLabel}>Bieżąca wersja</p>
        <p className={styles.infoValue}>
          {template.currentVersionNumber
            ? `v${template.currentVersionNumber}`
            : 'Brak'}
        </p>
        <p className={styles.infoHelper}>Używana przy nowych dokumentach</p>
      </article>

      <article className={styles.infoCard}>
        <p className={styles.infoLabel}>Plik źródłowy</p>
        <div className={styles.fileCardRow}>
          <FileText size={20} strokeWidth={1.75} aria-hidden />
          <div className={styles.fileCardText}>
            {template.sourceFileName ? (
              <>
                <p className={styles.fileName}>{template.sourceFileName}</p>
                <p className={styles.fileTags}>
                  <span>DOCX</span>
                </p>
              </>
            ) : (
              <p className={styles.infoMuted}>Brak pliku</p>
            )}
          </div>
        </div>
      </article>

      <article className={styles.infoCard}>
        <p className={styles.infoLabel}>Ostatnia aktualizacja</p>
        <p className={styles.infoValue}>
          {formatTemplateDate(template.updatedAt)}
        </p>
        <p className={styles.infoHelper}>Ostatnia zmiana szablonu lub wersji</p>
      </article>

      <article className={styles.infoCard}>
        <p className={styles.infoLabel}>Gotowość</p>
        <span
          className={`${styles.readinessBadge} ${readinessToneClass[readiness.tone]}`}
        >
          {readiness.label}
        </span>
        <p className={styles.infoHelper}>{readiness.helper}</p>
      </article>
    </div>
  )
}
