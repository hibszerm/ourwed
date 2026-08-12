/**
 * Package contract template section — explicit UI state machine.
 * Never returns to the empty dropzone while upload/save is in flight.
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  ContractUploadExperience,
  PackageTemplateUploadProgress,
} from '@/features/documents/contract-experience'
import {
  fadeSlide,
  reducedMotionSafe,
  scaleIn,
} from '@/features/documents/contract-experience/motion'
import {
  clearPackageContractTemplate,
  downloadPackageContractTemplateSource,
  uploadPackageContractTemplate,
  type PackageContractTemplateUploadResult,
} from '@/features/documents/template/packageContractTemplateUpload'
import { documentTemplateKeys } from '@/features/documents/hooks/useDocumentTemplates'
import { documentTemplateService } from '@/lib/api/documents'
import type { PackageTemplateUiPhase } from './packageTemplateUiPhase'
import {
  resolvePackageTemplateSurface,
  shouldShowEmptyDropzone,
  type PackageTemplateCardModel,
} from './packageTemplateUploadSurface'
import type { StudioPackage } from '@/types/package'
import styles from '@/features/documents/contract-experience/ContractExperience.module.css'

export type { PackageTemplateUiPhase } from './packageTemplateUiPhase'
export type { PackageTemplateCardModel } from './packageTemplateUploadSurface'
export {
  resolvePackageTemplateSurface,
  shouldShowEmptyDropzone,
} from './packageTemplateUploadSurface'

function formatUploadedAt(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

function cardFromUploadResult(
  result: PackageContractTemplateUploadResult,
): PackageTemplateCardModel {
  return {
    templateId: result.templateId,
    templateVersionId: result.templateVersionId,
    fileName: result.sourceFileName,
    versionLabel: `Wersja ${result.versionNumber}`,
    uploadedAtLabel: formatUploadedAt(result.uploadedAt),
    paymentNotice: result.paymentScheduleWarning,
  }
}

export function PackageContractSection(input: {
  pkg: StudioPackage
  onPackageUpdated: (next: StudioPackage) => void
}) {
  const { pkg, onPackageUpdated } = input
  const { requirePro } = useProAccessGate()
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const prefersReduced = useReducedMotion() ?? false

  const hasPersistedTemplate = Boolean(pkg.activeContractTemplateId)

  const [phase, setPhase] = useState<PackageTemplateUiPhase>(() =>
    hasPersistedTemplate ? 'ready' : 'idle_empty',
  )
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [card, setCard] = useState<PackageTemplateCardModel | null>(null)
  const [pipelineDone, setPipelineDone] = useState(false)
  const sessionRef = useRef(0)
  const inFlightRef = useRef(false)

  const versionsQuery = useQuery({
    queryKey: [
      'document-template-versions',
      pkg.activeContractTemplateId ?? 'none',
    ],
    queryFn: () =>
      documentTemplateService.listVersions(pkg.activeContractTemplateId!),
    enabled: Boolean(pkg.activeContractTemplateId),
    staleTime: 30_000,
  })

  // Hydrate ready card from persisted package binding — never during in-flight upload.
  useEffect(() => {
    if (inFlightRef.current) return
    if (
      phase === 'uploading' ||
      phase === 'saving' ||
      phase === 'success_transition' ||
      phase === 'error'
    ) {
      return
    }

    const templateId = pkg.activeContractTemplateId
    if (!templateId) {
      setCard(null)
      setPhase('idle_empty')
      return
    }

    let cancelled = false
    void documentTemplateService.get(templateId).then((template) => {
      if (cancelled || !template || inFlightRef.current) return
      const activeVersion = versionsQuery.data?.find(
        (row) =>
          row.id ===
          (pkg.activeContractTemplateVersionId ?? template.currentVersionId),
      )
      setCard({
        templateId,
        templateVersionId:
          pkg.activeContractTemplateVersionId ?? template.currentVersionId,
        fileName:
          template.meta?.sourceFileName ?? template.name ?? 'umowa.docx',
        versionLabel: activeVersion
          ? `Wersja ${activeVersion.versionNumber}`
          : 'Aktualna wersja',
        uploadedAtLabel: formatUploadedAt(template.meta?.uploadedAt),
        paymentNotice: template.meta?.paymentScheduleNotice ?? null,
      })
      setPhase('ready')
    })
    return () => {
      cancelled = true
    }
  }, [
    pkg.activeContractTemplateId,
    pkg.activeContractTemplateVersionId,
    versionsQuery.data,
    phase,
  ])

  function finishSuccessTransition(session: number) {
    if (session !== sessionRef.current) return
    inFlightRef.current = false
    setPhase('ready')
    setSelectedFile(null)
    setPipelineDone(false)
    showToast('Szablon został dodany', 'success')
  }

  async function handleFile(file: File) {
    if (!requirePro()) return
    const session = ++sessionRef.current
    inFlightRef.current = true
    setSelectedFile(file)
    setUploadError(null)
    setPipelineDone(false)
    setPhase('uploading')

    // Brief presentational beat so “Przesyłanie” is visible before persistence work.
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, prefersReduced ? 40 : 220)
    })
    if (session !== sessionRef.current) return

    setPhase('saving')
    try {
      const result = await uploadPackageContractTemplate({
        packageId: pkg.id,
        file,
      })
      if (session !== sessionRef.current) return

      const nextCard = cardFromUploadResult(result)
      setCard(nextCard)
      onPackageUpdated(result.package)

      // Seed version list cache so ready UI does not wait on a blank refetch.
      queryClient.setQueryData(
        ['document-template-versions', result.templateId],
        (prev: unknown) => prev ?? [],
      )
      void queryClient.invalidateQueries({
        queryKey: documentTemplateKeys.all,
      })
      void queryClient.invalidateQueries({
        queryKey: ['document-template-versions', result.templateId],
      })

      setPhase('success_transition')
      setPipelineDone(true)

      if (prefersReduced) {
        finishSuccessTransition(session)
      }
    } catch (e) {
      if (session !== sessionRef.current) return
      inFlightRef.current = false
      setPipelineDone(false)
      setUploadError(
        e instanceof Error ? e.message : 'Przesyłanie umowy wymaga ponowienia.',
      )
      setPhase('error')
      showToast(
        e instanceof Error ? e.message : 'Przesyłanie umowy wymaga ponowienia.',
        'error',
      )
    }
  }

  async function handleDownload() {
    const templateId = card?.templateId ?? pkg.activeContractTemplateId
    if (!templateId) return
    try {
      const { fileName: name, bytes } =
        await downloadPackageContractTemplateSource({
          templateId,
          templateVersionId:
            card?.templateVersionId ?? pkg.activeContractTemplateVersionId,
        })
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Nie udało się pobrać szablonu.',
        'error',
      )
    }
  }

  async function handleClear() {
    if (!requirePro()) return
    try {
      const next = await clearPackageContractTemplate({ packageId: pkg.id })
      onPackageUpdated(next)
      inFlightRef.current = false
      sessionRef.current += 1
      setCard(null)
      setSelectedFile(null)
      setUploadError(null)
      setPipelineDone(false)
      setPhase('idle_empty')
      showToast('Szablon odpięty od pakietu', 'success')
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Nie udało się odpiąć szablonu.',
        'error',
      )
    }
  }

  function handleRetry() {
    if (selectedFile) {
      void handleFile(selectedFile)
      return
    }
    setUploadError(null)
    setPhase(hasPersistedTemplate || card ? 'ready' : 'idle_empty')
  }

  const replaceActions = (
    <>
      <input
        ref={replaceInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleFile(file)
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => replaceInputRef.current?.click()}
      >
        Zastąp szablon
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => void handleDownload()}
      >
        Pobierz oryginał
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => void handleClear()}
      >
        Usuń szablon
      </Button>
    </>
  )

  const surface = resolvePackageTemplateSurface({
    phase,
    hasPersistedTemplate,
    card,
  })
  const progressVariants = reducedMotionSafe(prefersReduced, fadeSlide)
  const readyVariants = reducedMotionSafe(prefersReduced, scaleIn)
  const statusCopy =
    phase === 'uploading'
      ? 'Przesyłanie pliku…'
      : phase === 'saving'
        ? 'Zapisywanie szablonu…'
        : phase === 'success_transition'
          ? 'Szablon został dodany'
          : phase === 'error'
            ? uploadError
            : null

  const displayName =
    card?.fileName ?? selectedFile?.name ?? 'Dokument DOCX'

  const showEmptyHint =
    surface === 'empty' && shouldShowEmptyDropzone(phase)

  return (
    <section
      className={`${styles.experience} ${styles.packageContractBlock}`}
      aria-labelledby={`pkg-contract-${pkg.id}`}
      data-phase={phase}
      data-testid="package-contract-section"
    >
      <h3 className={styles.eyebrow} id={`pkg-contract-${pkg.id}`}>
        Szablon umowy
      </h3>
      {showEmptyHint ? (
        <p className={styles.packageContractEmptyHint}>
          Dodaj wzór umowy dla tego pakietu.
        </p>
      ) : null}

      <div className={styles.templateStage} aria-live="polite">
        {statusCopy && phase !== 'error' ? (
          <p className={styles.templateStatusLive}>{statusCopy}</p>
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          {showEmptyHint ? (
            <motion.div
              key="empty"
              variants={progressVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={styles.templateStageInner}
            >
              <ContractUploadExperience
                embedded
                selectedFile={null}
                onFile={(file) => void handleFile(file)}
              />
            </motion.div>
          ) : null}

          {surface === 'progress' || surface === 'error' ? (
            <motion.div
              key="progress"
              variants={progressVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={styles.templateStageInner}
            >
              <PackageTemplateUploadProgress
                fileName={displayName}
                phase={phase}
                pipelineDone={pipelineDone}
                error={phase === 'error' ? uploadError : null}
                onRetry={phase === 'error' ? handleRetry : undefined}
                onComplete={() =>
                  finishSuccessTransition(sessionRef.current)
                }
              />
            </motion.div>
          ) : null}

          {surface === 'ready' && card ? (
            <motion.div
              key={`ready-${card.templateId}`}
              variants={readyVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={styles.templateStageInner}
            >
              <div
                className={`${styles.card} ${styles.packageContractReadyCard}`}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '0.65rem',
                    }}
                  >
                    <p className={styles.title} style={{ fontSize: '1.15rem' }}>
                      {card.fileName}
                    </p>
                    <span className={styles.templateStatus}>Gotowy</span>
                  </div>
                  <div className={styles.templateMetaRow}>
                    <p className={styles.templateMetaItem}>
                      <strong>{card.versionLabel}</strong>
                    </p>
                    {card.uploadedAtLabel ? (
                      <p className={styles.templateMetaItem}>
                        Dodano: {card.uploadedAtLabel}
                      </p>
                    ) : null}
                  </div>
                  {card.paymentNotice ? (
                    <p className={styles.templateNotice} role="status">
                      {card.paymentNotice}
                    </p>
                  ) : null}
                </div>
                <div className={styles.actions}>
                  <Link to={`/ustawienia/dokumenty/szablony/${card.templateId}`}>
                    <Button type="button" size="sm" variant="secondary">
                      Podgląd
                    </Button>
                  </Link>
                  {replaceActions}
                </div>
                {versionsQuery.data && versionsQuery.data.length > 1 ? (
                  <div>
                    <p className={styles.eyebrow}>Historia wersji</p>
                    <ul className={styles.subtitle}>
                      {versionsQuery.data.map((v) => (
                        <li key={v.id}>
                          Wersja {v.versionNumber}
                          {v.sourceFileName ? ` — ${v.sourceFileName}` : ''}
                          {v.id ===
                          (card.templateVersionId ??
                            pkg.activeContractTemplateVersionId)
                            ? ' (aktywna)'
                            : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  )
}
