/**
 * Package details — contract assignment section (product UI only).
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import {
  ContractAnalysisAnimation,
  ContractUploadExperience,
  PackageHealthSummary,
  packageHealthRecommendations,
} from '@/features/documents/contract-experience'
import {
  assignPackageContractFromDocx,
  packageContractMissingCategoryLabels,
} from '@/features/documents/template/packageContractAssignment'
import {
  PACKAGE_CONTRACT_CATEGORY_LABELS,
  type PackageContractUserCategory,
} from '@/features/documents/template/packageContractAllowlist'
import type { PackageContractHealthReport } from '@/features/documents/template/packageContractHealthAudit'
import { documentTemplateKeys } from '@/features/documents/hooks/useDocumentTemplates'
import { documentTemplateService } from '@/lib/api/documents'
import { packageService } from '@/lib/api/packageService'
import type { StudioPackage } from '@/types/package'
import type { DocumentTemplateMeta } from '@/types/documents'
import styles from '@/features/documents/contract-experience/ContractExperience.module.css'

type View =
  | 'upload'
  | 'analyzing'
  | 'ready'
  | 'attention'

function healthFromMeta(
  meta: DocumentTemplateMeta | undefined,
): PackageContractHealthReport | null {
  const raw = meta?.packageContractHealthReport
  if (!raw || !Array.isArray(raw.checks)) return null
  return raw as PackageContractHealthReport
}

export function PackageContractSection(input: {
  pkg: StudioPackage
  onPackageUpdated: (next: StudioPackage) => void
}) {
  const { pkg, onPackageUpdated } = input
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const [view, setView] = useState<View>(
    pkg.activeContractTemplateId ? 'ready' : 'upload',
  )
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pipelineDone, setPipelineDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [missingLabels, setMissingLabels] = useState<string[]>([])
  const [healthReport, setHealthReport] =
    useState<PackageContractHealthReport | null>(null)
  const pendingResultRef = useRef<{
    ready: boolean
    fileName: string
    healthReport: PackageContractHealthReport
    missingLabels: string[]
    error: string | null
    warnCount: number
  } | null>(null)

  const hasContract = Boolean(pkg.activeContractTemplateId)

  useEffect(() => {
    const templateId = pkg.activeContractTemplateId
    if (!templateId) {
      setFileName(null)
      setError(null)
      setMissingLabels([])
      setHealthReport(null)
      setView('upload')
      return
    }
    let cancelled = false
    void documentTemplateService.get(templateId).then((template) => {
      if (cancelled || !template) return
      setFileName(template.name)
      setHealthReport(healthFromMeta(template.meta))
      const readiness = template.meta?.packageContractReadiness
      if (readiness && readiness.ready === false) {
        setError(
          readiness.userMessage ??
            'Nie udało się rozpoznać danych potrzebnych do automatycznego generowania umowy.',
        )
        const missing = (readiness.missingRequiredCategories ?? [])
          .map((key) => {
            const label =
              PACKAGE_CONTRACT_CATEGORY_LABELS[
                key as PackageContractUserCategory
              ]
            return label ?? null
          })
          .filter((label): label is string => Boolean(label))
        setMissingLabels(missing)
        setView('attention')
      } else {
        setError(null)
        setMissingLabels([])
        setView('ready')
      }
    })
    return () => {
      cancelled = true
    }
  }, [pkg.activeContractTemplateId, pkg.activeContractTemplateVersionId])

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['studio-packages'] })
    await queryClient.invalidateQueries({
      queryKey: documentTemplateKeys.all,
    })
    await queryClient.invalidateQueries({
      queryKey: ['document-template-summaries'],
    })
  }

  function revealPendingResult() {
    const pending = pendingResultRef.current
    if (!pending) return
    pendingResultRef.current = null
    setFileName(pending.fileName)
    setHealthReport(pending.healthReport)
    setMissingLabels(pending.missingLabels)
    setError(pending.error)
    setSelectedFile(null)
    setPipelineDone(false)
    if (pending.ready) {
      setView('ready')
      showToast(
        pending.warnCount > 0
          ? 'Umowa gotowa. Warto zajrzeć do rekomendacji.'
          : 'Umowa jest gotowa do generowania.',
        pending.warnCount > 0 ? 'info' : 'success',
      )
    } else {
      setView('attention')
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return
    setError(null)
    setMissingLabels([])
    setHealthReport(null)
    setSelectedFile(file)
    setFileName(file.name)
    setPipelineDone(false)
    pendingResultRef.current = null
    setView('analyzing')

    try {
      const result = await assignPackageContractFromDocx({
        packageId: pkg.id,
        file,
      })
      onPackageUpdated(result.package)
      const ready = result.readiness.ready
      pendingResultRef.current = {
        ready,
        fileName: result.sourceFileName,
        healthReport: result.healthReport,
        missingLabels: ready
          ? []
          : packageContractMissingCategoryLabels(result.readiness),
        error: ready
          ? null
          : (result.readiness.userMessage ??
            'Nie udało się rozpoznać danych potrzebnych do automatycznego generowania umowy.'),
        warnCount: result.healthReport.warningCount,
      }
      setPipelineDone(true)
      await invalidate()
    } catch (err) {
      setSelectedFile(null)
      setPipelineDone(false)
      pendingResultRef.current = null
      setError(
        err instanceof Error
          ? err.message
          : 'Nie udało się dodać umowy do pakietu.',
      )
      setView('attention')
      showToast(
        err instanceof Error
          ? err.message
          : 'Nie udało się dodać umowy do pakietu.',
        'error',
      )
    }
  }

  async function handleClear() {
    try {
      const next = await packageService.linkContractTemplate(pkg.id, null, null)
      onPackageUpdated(next)
      setFileName(null)
      setError(null)
      setMissingLabels([])
      setHealthReport(null)
      setSelectedFile(null)
      setView('upload')
      await invalidate()
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się usunąć umowy.',
        'error',
      )
    }
  }

  const replaceActions = (
    <>
      <input
        ref={replaceInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => replaceInputRef.current?.click()}
      >
        Zmień umowę
      </Button>
      {hasContract ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void handleClear()}
        >
          Usuń
        </Button>
      ) : null}
    </>
  )

  return (
    <section aria-labelledby={`pkg-contract-${pkg.id}`}>
      <h3 className={styles.eyebrow} id={`pkg-contract-${pkg.id}`}>
        Umowa
      </h3>

      <AnimatePresence mode="wait">
        {view === 'upload' ? (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ContractUploadExperience
              selectedFile={selectedFile}
              onFile={(file) => void handleFile(file)}
            />
          </motion.div>
        ) : null}

        {view === 'analyzing' ? (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ContractAnalysisAnimation
              fileName={fileName ?? selectedFile?.name ?? null}
              pipelineDone={pipelineDone}
              onComplete={revealPendingResult}
            />
          </motion.div>
        ) : null}

        {view === 'ready' ? (
          <motion.div
            key="ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <PackageHealthSummary
              fileName={fileName}
              healthReport={healthReport}
              actions={
                <>
                  {pkg.activeContractTemplateId ? (
                    <Link
                      to={`/ustawienia/dokumenty/szablony/${pkg.activeContractTemplateId}`}
                    >
                      <Button type="button" size="sm" variant="secondary">
                        Podgląd
                      </Button>
                    </Link>
                  ) : null}
                  {replaceActions}
                </>
              }
            />
          </motion.div>
        ) : null}

        {view === 'attention' ? (
          <motion.div
            key="attention"
            className={`${styles.experience} ${styles.card}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div>
              <p className={styles.eyebrow}>Wymaga uwagi</p>
              <h3 className={styles.title}>Uzupełnij umowę</h3>
              <p className={styles.subtitle}>
                {error ??
                  'Nie udało się rozpoznać wszystkich danych potrzebnych do generowania.'}
              </p>
              {fileName ? (
                <p className={styles.fileChipMeta} style={{ marginTop: '0.5rem' }}>
                  {fileName}
                </p>
              ) : null}
            </div>
            {missingLabels.length > 0 ? (
              <ul className={styles.missingList}>
                {missingLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : null}
            {healthReport &&
            packageHealthRecommendations(healthReport.checks).length > 0 ? (
              <div className={styles.recs}>
                <div className={styles.recsToggle} style={{ cursor: 'default' }}>
                  <span>Rekomendacje</span>
                </div>
                <div className={styles.recsBody}>
                  <ul className={styles.recsList}>
                    {packageHealthRecommendations(healthReport.checks).map(
                      (text) => (
                        <li key={text}>{text}</li>
                      ),
                    )}
                  </ul>
                </div>
              </div>
            ) : null}
            <div className={styles.actions}>{replaceActions}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
