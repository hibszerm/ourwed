/**
 * Calm attention card when a package contract needs more document data.
 * Presentation only — renders from the canonical report state.
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown, CircleDashed, FileWarning } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { PackageContractUserCategory } from '@/features/documents/template/packageContractAllowlist'
import type { PackageContractHealthReport } from '@/features/documents/template/packageContractHealthAudit'
import type { PackageContractReportKind } from '@/features/documents/template/packageContractFinalReport'
import {
  isTechnicalDiagnosticText,
  packageContractAttentionCopy,
  packageReadinessMissingProductLabels,
  resolvePackageContractAttentionKind,
} from './packageContractReadinessCopy'
import { packageHealthRecommendations } from './packageHealthCopy'
import { fadeSlide, reducedMotionSafe, softSpring } from './motion'
import styles from './ContractExperience.module.css'
import { devErrorArgs } from '@/lib/debug/devConsole'

export function PackageContractAttentionCard(input: {
  fileName: string | null
  missingCategories: readonly PackageContractUserCategory[]
  /** Exact missing registry keys when known (optional). */
  missingRegistryKeys?: readonly string[]
  blockingIssues?: readonly { code: string; message?: string }[]
  reportKind?: PackageContractReportKind | null
  healthReport: PackageContractHealthReport | null
  uploadError?: string | null
  actions: ReactNode
}) {
  const prefersReduced = useReducedMotion() ?? false
  const variants = reducedMotionSafe(prefersReduced, fadeSlide)
  const kind = resolvePackageContractAttentionKind({
    healthReport: input.healthReport,
    hasUploadError: Boolean(input.uploadError),
    reportKind: input.reportKind,
    missingCategories: input.missingCategories,
    missingRegistryKeys: input.missingRegistryKeys,
    blockingIssues: input.blockingIssues,
  })

  if (kind === 'internal_inconsistency' && import.meta.env.DEV) {
    devErrorArgs('[package-contract-readiness-aggregation]', {
      error: 'internal_inconsistency_shown_in_ui',
      kind,
      missingCategories: input.missingCategories,
      missingRegistryKeys: input.missingRegistryKeys ?? [],
      blockingIssues: input.blockingIssues ?? [],
      checks: input.healthReport?.checks.map((c) => ({
        code: c.code,
        status: c.status,
        evidence: c.evidence ?? null,
      })),
    })
  }

  const copy = packageContractAttentionCopy(kind)
  const missingLabels = packageReadinessMissingProductLabels({
    missingCategories: input.missingCategories,
    missingRegistryKeys: input.missingRegistryKeys,
    blockingIssues: input.blockingIssues,
  })

  const secondaryTips = packageHealthRecommendations(
    input.healthReport?.checks ?? [],
  ).filter(
    (text) =>
      !isTechnicalDiagnosticText(text) &&
      !/rozpoznane pola|pól do automatycznego|bezpiecznie uzupełniać|wszystkich danych potrzebnych/i.test(
        text,
      ),
  )

  const [detailsOpen, setDetailsOpen] = useState(false)
  const showDevDiagnostics = import.meta.env.DEV

  return (
    <motion.div
      className={`${styles.experience} ${styles.card}`}
      variants={variants}
      initial="initial"
      animate="animate"
      layout
    >
      <div className={styles.attentionHero}>
        <span className={styles.attentionGlyph} aria-hidden>
          <FileWarning size={24} strokeWidth={1.75} />
        </span>
        <div>
          <h3 className={styles.title}>{copy.title}</h3>
          <p className={styles.attentionRecognition}>{copy.recognitionLine}</p>
          <p className={styles.subtitle}>{copy.description}</p>
          {input.fileName ? (
            <p className={styles.fileChipMeta} style={{ marginTop: '0.65rem' }}>
              {input.fileName}
            </p>
          ) : null}
          {input.uploadError && !isTechnicalDiagnosticText(input.uploadError) ? (
            <p className={styles.attentionUploadNote}>{input.uploadError}</p>
          ) : null}
        </div>
      </div>

      {missingLabels.length > 0 ? (
        <div className={styles.missingBlock}>
          <p className={styles.missingHeading}>{copy.missingSectionTitle}</p>
          <ul className={styles.missingList}>
            {missingLabels.map((label) => (
              <li key={label} className={styles.missingItem}>
                <CircleDashed size={15} strokeWidth={1.75} aria-hidden />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {copy.footerGuidance ? (
        <p className={styles.attentionGuidance}>{copy.footerGuidance}</p>
      ) : null}

      {copy.recommendedAction ? (
        <div className={styles.attentionActionHint}>
          <span>{copy.recommendedAction}</span>
        </div>
      ) : null}

      <div className={styles.actions}>{input.actions}</div>

      <div className={styles.recs}>
        <button
          type="button"
          className={styles.recsToggle}
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((v) => !v)}
        >
          <span>Pokaż szczegóły</span>
          <motion.span
            animate={{ rotate: detailsOpen ? 180 : 0 }}
            transition={softSpring}
            style={{ display: 'inline-flex' }}
          >
            <ChevronDown size={18} aria-hidden />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {detailsOpen ? (
            <motion.div
              key="details"
              className={styles.recsBody}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: prefersReduced ? 0.01 : 0.22 }}
            >
              {secondaryTips.length > 0 ? (
                <ul className={styles.recsList}>
                  {secondaryTips.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.attentionDetailsEmpty}>
                  Brak dodatkowych wskazówek dla tej umowy.
                </p>
              )}
              {showDevDiagnostics && input.healthReport ? (
                <pre className={styles.devDiagnostics}>
                  {JSON.stringify(
                    {
                      kind,
                      missingCategories: input.missingCategories,
                      missingRegistryKeys: input.missingRegistryKeys ?? [],
                      blockingIssues: input.blockingIssues ?? [],
                      checks: input.healthReport.checks.map((c) => ({
                        code: c.code,
                        status: c.status,
                        evidence: c.evidence ?? null,
                      })),
                    },
                    null,
                    2,
                  )}
                </pre>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
