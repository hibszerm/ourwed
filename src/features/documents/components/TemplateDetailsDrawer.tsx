import { Drawer } from '@/components/ui/Drawer'
import { formatTemplateDateTime } from '@/features/documents/templateMeta'
import type {
  DocumentTemplateSummary,
  DocumentTemplateVersion,
} from '@/types/documents'
import styles from '../DocumentsTemplates.module.css'

interface TemplateDetailsDrawerProps {
  open: boolean
  onClose: () => void
  template: DocumentTemplateSummary
  focusVersion?: DocumentTemplateVersion | null
}

export function TemplateDetailsDrawer({
  open,
  onClose,
  template,
  focusVersion,
}: TemplateDetailsDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} title="Szczegóły techniczne" side="right">
      <div className={styles.drawerRows}>
        <p className={styles.drawerNote}>
          Metadane diagnostyczne. Nie są potrzebne przy codziennej pracy ze
          szablonami.
        </p>

        <div className={styles.drawerRow}>
          <p className={styles.drawerLabel}>Identyfikator szablonu</p>
          <p className={styles.drawerValue}>{template.id}</p>
        </div>
        <div className={styles.drawerRow}>
          <p className={styles.drawerLabel}>Bieżąca wersja (id)</p>
          <p className={styles.drawerValue}>
            {template.currentVersionId ?? '—'}
          </p>
        </div>
        <div className={styles.drawerRow}>
          <p className={styles.drawerLabel}>Ścieżka w storage</p>
          <p className={styles.drawerValue}>
            {focusVersion?.sourceDocxPath ??
              template.sourceDocxPath ??
              '—'}
          </p>
        </div>
        <div className={styles.drawerRow}>
          <p className={styles.drawerLabel}>Przechowywanie</p>
          <p className={styles.drawerValue}>Prywatne OurWed Storage</p>
        </div>
        <div className={styles.drawerRow}>
          <p className={styles.drawerLabel}>Nazwa pliku</p>
          <p className={styles.drawerValue}>
            {focusVersion?.sourceFileName ??
              template.sourceFileName ??
              '—'}
          </p>
        </div>
        <div className={styles.drawerRow}>
          <p className={styles.drawerLabel}>Komponenty / bloki / zmienne</p>
          <p className={styles.drawerValue}>
            {template.componentCount} / {template.blockCount} /{' '}
            {template.variableCount}
          </p>
        </div>
        {focusVersion && (
          <>
            <div className={styles.drawerRow}>
              <p className={styles.drawerLabel}>Wersja</p>
              <p className={styles.drawerValue}>
                v{focusVersion.versionNumber} · {focusVersion.id}
              </p>
            </div>
            <div className={styles.drawerRow}>
              <p className={styles.drawerLabel}>Utworzono wersję</p>
              <p className={styles.drawerValue}>
                {formatTemplateDateTime(focusVersion.createdAt)}
              </p>
            </div>
          </>
        )}
        <div className={styles.drawerRow}>
          <p className={styles.drawerLabel}>Utworzono szablon</p>
          <p className={styles.drawerValue}>
            {formatTemplateDateTime(template.createdAt)}
          </p>
        </div>
        <div className={styles.drawerRow}>
          <p className={styles.drawerLabel}>Ostatnia aktualizacja</p>
          <p className={styles.drawerValue}>
            {formatTemplateDateTime(template.updatedAt)}
          </p>
        </div>
      </div>
    </Drawer>
  )
}
