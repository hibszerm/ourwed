/**
 * Configuration UI for unresolved / optional template slots.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import {
  useDocumentTemplate,
} from '@/features/documents/hooks/useDocumentTemplates'
import { documentTemplateService } from '@/lib/api/documents'
import { reanalyzeTemplate } from '@/features/documents/template/reanalyzeTemplate'
import {
  slotsNeedingConfiguration,
  providerImmutableSlots,
  updateTemplateSlotConfig,
} from '@/features/documents/template/updateTemplateSlotConfig'
import {
  parseSlotMap,
  type TemplateSlot,
  type TemplateSlotMap,
} from '@/features/documents/template/types'
import { validateTemplateSlotBindings } from '@/features/documents/template/templateReadiness'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentTemplateConfigPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: template, isLoading, isError, refetch } = useDocumentTemplate(id)

  const [slotMap, setSlotMap] = useState<TemplateSlotMap | null>(null)
  const [loadingMap, setLoadingMap] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)

  const loadMap = useCallback(async () => {
    if (!template?.currentVersionId) {
      setSlotMap(null)
      setLoadingMap(false)
      return
    }
    setLoadingMap(true)
    try {
      const version = await documentTemplateService.getVersion(
        template.currentVersionId,
      )
      setSlotMap(parseSlotMap(version?.slotMap))
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się wczytać slotów.',
        'error',
      )
    } finally {
      setLoadingMap(false)
    }
  }, [template?.currentVersionId, showToast])

  useEffect(() => {
    void loadMap()
  }, [loadMap])

  if (isLoading || loadingMap) {
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
                onClick={() => navigate('/ustawienia/dokumenty/szablony')}
              >
                Wróć
              </Button>
            }
          />
        </PageContainer>
      </AppLayout>
    )
  }

  const readiness = slotMap ? validateTemplateSlotBindings(slotMap) : null
  const needsConfig = slotMap ? slotsNeedingConfiguration(slotMap) : []
  const providerImmutable = slotMap ? providerImmutableSlots(slotMap) : []
  const counters = readiness?.counters

  async function runAction(
    slot: TemplateSlot,
    action:
      | { type: 'mark_optional' }
      | { type: 'mark_not_present' }
      | { type: 'confirm' }
      | { type: 'link_to_company' }
      | { type: 'keep_immutable' }
      | { type: 'set_requirement'; requirement: 'required' | 'optional' },
  ) {
    setBusyId(slot.id)
    try {
      const result = await updateTemplateSlotConfig({
        templateId: template!.id,
        slotId: slot.id,
        action,
      })
      setSlotMap(result.slotMap)
      await refetch()
      showToast(
        result.status === 'ready'
          ? 'Szablon jest gotowy do generowania.'
          : 'Zapisano. Nadal są wymagane niepowiązane pola.',
        result.status === 'ready' ? 'success' : 'info',
      )
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się zapisać.',
        'error',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleReanalyze() {
    if (!template) return
    setReanalyzing(true)
    try {
      const result = await reanalyzeTemplate({ templateId: template.id })
      setSlotMap(result.slotMap)
      await refetch()
      showToast(
        result.readinessReady
          ? 'Ponowna analiza zakończona — szablon gotowy.'
          : `Ponowna analiza: ${result.unresolvedKeys.length} wymaganych pól bez powiązania.`,
        result.readinessReady ? 'success' : 'info',
      )
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Analiza nie powiodła się.',
        'error',
      )
    } finally {
      setReanalyzing(false)
    }
  }

  return (
    <AppLayout>
      <PageContainer width="wide">
        <div className={styles.studioPage}>
          <header className={styles.studioHero}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                navigate(`/ustawienia/dokumenty/szablony/${template.id}`)
              }
            >
              ← Wróć do szablonu
            </Button>
            <h1 className={styles.studioTitle}>Dokończ konfigurację</h1>
            <p className={styles.studioSubtitle}>
              {template.name} — tylko pola wykryte w tej umowie. Pola z
              rejestru OurWed, których nie ma w dokumencie, nie blokują
              gotowości.
            </p>
            <div className={styles.configCounters}>
              <span>
                Wykryte pola dynamiczne:{' '}
                {slotMap?.dynamicCoverage?.detectedDynamicValues ??
                  counters?.safeBindingsCount ??
                  '—'}
              </span>
              <span>
                Prawdopodobne niewykryte pola:{' '}
                {slotMap?.dynamicCoverage?.missedDynamicValues ?? '—'}
              </span>
              <span>
                Puste pola formularza:{' '}
                {slotMap?.dynamicCoverage?.emptyPlaceholders ?? '—'}
              </span>
              <span>
                Elementy poza akapitami:{' '}
                {slotMap?.dynamicCoverage?.unsupportedStructures ?? '—'}
              </span>
              <span>
                Wymaga przeglądu:{' '}
                {counters?.itemsRequiringReviewCount ??
                  counters?.needsConfirmationCount ??
                  '—'}
              </span>
            </div>
            {slotMap?.dynamicCoverage?.items &&
            slotMap.dynamicCoverage.items.length > 0 ? (
              <div className={styles.configCoverage}>
                <h2 className={styles.configSectionTitle}>
                  Pokrycie danych umowy
                </h2>
                <ul className={styles.configCoverageList}>
                  {slotMap.dynamicCoverage.items.map((row, idx) => (
                    <li key={`${row.semanticConcept}-${idx}`}>
                      <span className={styles.configCoverageStatus}>
                        {row.status}
                      </span>{' '}
                      <strong>{row.semanticConcept}</strong>
                      {row.expectedKey ? ` · ${row.expectedKey}` : ''}
                      {row.sourceText ? ` — „${row.sourceText}”` : ''}
                      {row.missReason ? ` (${row.missReason})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {slotMap?.lifecycleStatus ? (
              <p className={styles.quietHint}>
                Status:{' '}
                {slotMap.lifecycleStatus === 'generation_ready'
                  ? 'Gotowy do generacji'
                  : slotMap.lifecycleStatus === 'analysis_requires_review'
                    ? 'Analiza wymaga weryfikacji'
                    : slotMap.lifecycleStatus === 'generation_blocked'
                      ? 'Generacja zablokowana'
                      : slotMap.lifecycleStatus ===
                          'generation_requires_configuration'
                        ? 'Wymaga konfiguracji przed generacją'
                        : slotMap.lifecycleStatus}
              </p>
            ) : null}
            {(slotMap?.analysisWarnings?.length ?? 0) > 0 ? (
              <p className={styles.configWarning}>
                {slotMap!.analysisWarnings!.join(' ')}
              </p>
            ) : null}
            {providerImmutable.length > 0 ||
            slotMap?.providerPartyMode === 'immutable_template' ? (
              <div className={styles.configProviderInfo}>
                <h2 className={styles.configSectionTitle}>Dane usługodawcy</h2>
                <p className={styles.quietHint}>
                  Dane firmy i reprezentantów zapisane w szablonie pozostaną bez
                  zmian w generowanych umowach.
                </p>
                {providerImmutable
                  .filter((s) => s.canLinkToCompany)
                  .map((slot) => (
                    <div key={slot.id} className={styles.configProviderRow}>
                      <span>
                        {slot.label}: „{(slot.originalText ?? '').slice(0, 60)}”
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busyId === slot.id}
                        onClick={() =>
                          void runAction(slot, { type: 'link_to_company' })
                        }
                      >
                        Powiąż z danymi firmy
                      </Button>
                    </div>
                  ))}
              </div>
            ) : null}
            <div className={styles.studioCta}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleReanalyze()}
                disabled={reanalyzing}
              >
                {reanalyzing
                  ? 'Analizuję…'
                  : 'Ponownie przeanalizuj szablon'}
              </Button>
            </div>
          </header>

          {needsConfig.length === 0 ? (
            <EmptyState
              title={
                readiness?.ready
                  ? 'Szablon jest gotowy'
                  : 'Brak pozycji do konfiguracji'
              }
              description={
                readiness?.ready
                  ? 'Wszystkie wymagane wykryte pola mają powiązania fizyczne.'
                  : 'Uruchom ponowną analizę albo wróć do szczegółów szablonu.'
              }
              action={
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    navigate(`/ustawienia/dokumenty/szablony/${template.id}`)
                  }
                >
                  Wróć do szablonu
                </Button>
              }
            />
          ) : (
            <ul className={styles.configSlotList}>
              {needsConfig.map((slot) => (
                <li key={slot.id} className={styles.configSlotCard}>
                  <div className={styles.configSlotHeader}>
                    <strong>{slot.label}</strong>
                    <span className={styles.configSlotKey}>
                      {slot.registryKey}
                    </span>
                    <span className={styles.configSlotBadge}>
                      {slot.requirement === 'required'
                        ? 'wymagane'
                        : 'opcjonalne'}
                    </span>
                  </div>
                  <p className={styles.configSlotReason}>
                    {slot.detectionReason ??
                      'Wykryte w analizie — brak bezpiecznego powiązania fizycznego.'}
                  </p>
                  {slot.physicalSpanSafety === 'unsafe' ? (
                    <p className={styles.configWarning} role="alert">
                      <strong>Zakres jest zbyt szeroki.</strong>{' '}
                      {slot.spanSafetyMessage ??
                        'Wykryty fragment zawiera nazwę firmy oraz dodatkowe dane lub treść prawną. Zawęź zakres przed potwierdzeniem.'}
                    </p>
                  ) : null}
                  <p className={styles.quietHint}>
                    Źródło: „
                    {(slot.originalText ?? slot.exampleText ?? '—').slice(0, 120)}
                    ”
                    {slot.confidence != null
                      ? ` · pewność ${(slot.confidence * 100).toFixed(0)}%`
                      : ''}
                    {slot.physicalSpanSafety
                      ? ` · zakres: ${slot.physicalSpanSafety}`
                      : ''}
                  </p>
                  {slot.detectedEntityTypes &&
                  slot.detectedEntityTypes.length > 0 ? (
                    <p className={styles.quietHint}>
                      Encje w zakresie:{' '}
                      {slot.detectedEntityTypes.join(', ')}
                    </p>
                  ) : null}
                  {slot.sampleContext || slot.exampleText || slot.originalText ? (
                    <p className={styles.configSlotPreview}>
                      Kontekst: {slot.sampleContext ?? slot.originalText ?? slot.exampleText}
                    </p>
                  ) : null}
                  {slot.paragraphIndex != null ? (
                    <p className={styles.quietHint}>
                      Akapit {slot.paragraphIndex}
                      {slot.leftAnchor
                        ? ` · „${slot.leftAnchor.slice(0, 40)}…”`
                        : ''}
                    </p>
                  ) : (
                    <p className={styles.quietHint}>
                      Brak indeksu akapitu — sugerowane powiązanie niedostępne
                      automatycznie.
                    </p>
                  )}
                  <div className={styles.configSlotActions}>
                    {slot.needsConfirmation ||
                    slot.detectionStatus === 'ambiguous' ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={
                          busyId === slot.id ||
                          slot.physicalSpanSafety === 'unsafe'
                        }
                        title={
                          slot.physicalSpanSafety === 'unsafe'
                            ? 'Nie można potwierdzić niebezpiecznego zakresu'
                            : undefined
                        }
                        onClick={() =>
                          void runAction(slot, { type: 'confirm' })
                        }
                      >
                        Potwierdź
                      </Button>
                    ) : null}
                    <label className={styles.configToggle}>
                      <input
                        type="checkbox"
                        checked={slot.requirement === 'required'}
                        disabled={busyId === slot.id}
                        onChange={(e) =>
                          void runAction(slot, {
                            type: 'set_requirement',
                            requirement: e.target.checked
                              ? 'required'
                              : 'optional',
                          })
                        }
                      />
                      Wymagane
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busyId === slot.id || slot.paragraphIndex == null}
                      onClick={() =>
                        navigate(
                          `/ustawienia/dokumenty/szablony/${template.id}/analiza`,
                        )
                      }
                    >
                      Powiąż slot
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busyId === slot.id}
                      onClick={() =>
                        void runAction(slot, { type: 'mark_optional' })
                      }
                    >
                      Oznacz jako opcjonalne
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyId === slot.id}
                      onClick={() =>
                        void runAction(slot, { type: 'mark_not_present' })
                      }
                    >
                      Nie występuje w tej umowie
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageContainer>
    </AppLayout>
  )
}
