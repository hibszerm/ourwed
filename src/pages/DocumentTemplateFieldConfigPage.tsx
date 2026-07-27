/**
 * Template field configuration page — /ustawienia/dokumenty/szablony/:id/konfiguracja-pol
 */

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { useDocumentTemplate } from '@/features/documents/hooks/useDocumentTemplates'
import { TemplateFieldConfigurationView } from '@/features/ai-contract-lab/TemplateFieldConfigurationView'
import {
  fieldConfigurationFromMeta,
  saveTemplateFieldConfiguration,
} from '@/features/ai-contract-lab/persistTemplateFieldConfiguration'
import {
  validateTemplateConfigurationForSave,
  type ContractTemplateConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentTemplateFieldConfigPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: template, isLoading, isError, refetch } = useDocumentTemplate(id)
  const persisted = template
    ? fieldConfigurationFromMeta(template.meta)
    : null
  const [draft, setDraft] = useState<ContractTemplateConfiguration | null>(null)
  const [touched, setTouched] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const configuration = touched ? draft : persisted

  if (isLoading) {
    return (
      <AppLayout title="Konfiguracja szablonu">
        <PageContainer width="wide">
          <p className={styles.quietHint}>Ładowanie…</p>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || !template) {
    return (
      <AppLayout title="Konfiguracja szablonu">
        <PageContainer width="wide">
          <EmptyState
            title="Nie znaleziono szablonu"
            description="Szablon mógł zostać usunięty."
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/studio/pakiety')}
              >
                Wróć
              </Button>
            }
          />
        </PageContainer>
      </AppLayout>
    )
  }

  if (!configuration) {
    return (
      <AppLayout title="Konfiguracja szablonu">
        <PageContainer width="wide">
          <EmptyState
            title="Brak wykrytych pól"
            description="Uruchom analizę w Laboratorium umów AI, aby przygotować propozycję konfiguracji, albo wróć po zapisaniu konfiguracji z laboratorium."
            action={
              <div className={styles.configSlotActions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    navigate(`/ustawienia/dokumenty/szablony/${template.id}`)
                  }
                >
                  Wróć do szablonu
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => navigate('/laboratorium-umow-ai')}
                >
                  Otwórz laboratorium
                </Button>
              </div>
            }
          />
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Ustawienia zaawansowane">
      <PageContainer width="wide">
        <button
          type="button"
          className={styles.backLink}
          onClick={() =>
            navigate(`/ustawienia/dokumenty/szablony/${template.id}`)
          }
        >
          ← Wróć do szablonu
        </button>
        <section className={styles.nextStepCard}>
          <h2 className={styles.factLabel}>Diagnostyka AI</h2>
          <p className={styles.quietHint}>
            Te informacje są tylko dla zaawansowanej konfiguracji. Nie pojawiają
            się w normalnym generatorze umów.
          </p>
          <p className={styles.quietHint}>
            Wykryte zmienne: {template.variableCount}
            {' · '}
            Wersja analizy:{' '}
            {template.currentVersionNumber != null
              ? `v${template.currentVersionNumber}`
              : '—'}
            {' · '}
            Status konfiguracji:{' '}
            {template.meta.fieldConfigurationStatus ?? '—'}
            {' · '}
            Gotowość automatyczna:{' '}
            {template.meta.automaticReadinessStatus ?? '—'}
          </p>
          {(template.meta.automaticAttentionIssues ?? []).length > 0 ? (
            <ul className={styles.quietHint}>
              {(template.meta.automaticAttentionIssues ?? []).map((issue) => (
                <li key={`${issue.code}:${issue.message}`}>
                  [{issue.code}] {issue.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.quietHint}>Brak zapisanych alertów mapowania.</p>
          )}
        </section>
        <TemplateFieldConfigurationView
          configuration={configuration}
          onChange={(next) => {
            setTouched(true)
            setDraft(next)
          }}
          saving={saving}
          errors={errors}
          onSave={({ markReady, confirmedFixedProtectedIds }) => {
            const result = validateTemplateConfigurationForSave({
              config: configuration,
              markReady,
              confirmedFixedProtectedIds,
            })
            setErrors(result.errors)
            setTouched(true)
            setDraft(result.config)
            if (!result.ok && markReady) {
              showToast(
                result.errors[0] ??
                  'Uzupełnij konfigurację przed oznaczeniem jako gotowy.',
                'error',
              )
              return
            }
            setSaving(true)
            void saveTemplateFieldConfiguration({
              templateId: template.id,
              configuration: result.config,
              automatic: false,
            })
              .then(async () => {
                await refetch()
                setTouched(false)
                setDraft(null)
                showToast(
                  result.config.status === 'configured'
                    ? 'Konfiguracja zapisana — szablon gotowy do generowania umów.'
                    : 'Konfiguracja zapisana.',
                  'success',
                )
                navigate(`/ustawienia/dokumenty/szablony/${template.id}`)
              })
              .catch((err) => {
                showToast(
                  err instanceof Error ? err.message : 'Nie udało się zapisać.',
                  'error',
                )
              })
              .finally(() => setSaving(false))
          }}
        />
      </PageContainer>
    </AppLayout>
  )
}
