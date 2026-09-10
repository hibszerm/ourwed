import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { LikelyDuplicateWarningModal } from '@/features/weddings/components/LikelyDuplicateWarningModal'
import { ModernPendingRow } from '@/features/questionnaires/pending/modern/ModernPendingRow'
import {
  PENDING_EMPTY_COPY,
  PENDING_EMPTY_TITLE,
  PENDING_ERROR_RETRY,
  PENDING_ERROR_TITLE,
  PENDING_SKELETON_ROWS,
  PENDING_SUBTITLE,
  PENDING_TITLE,
} from '@/features/questionnaires/pending/modern/pendingCopy'
import {
  useInvalidateAfterQuestionnaireMutation,
  usePendingQuestionnaires,
} from '@/features/questionnaires/hooks/usePendingQuestionnaires'
import { questionnaireService } from '@/lib/api/questionnaireService'
import type { LikelyDuplicateWedding } from '@/lib/weddings/findLikelyWeddingDuplicates'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import styles from './ModernPendingWorkspace.module.css'

export function ModernPendingWorkspace() {
  const navigate = useNavigate()
  const { requirePro } = useProAccessGate()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    LikelyDuplicateWedding[]
  >([])
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null)
  const { data = [], isLoading, isError, refetch } =
    usePendingQuestionnaires()
  const { afterApprove, afterReject } = useInvalidateAfterQuestionnaireMutation()

  async function runApprove(id: string) {
    setBusyId(id)
    try {
      const { wedding } = await questionnaireService.approve(id)
      afterApprove()
      setPendingApproveId(null)
      setDuplicateCandidates([])
      navigate(`/sluby/${wedding.id}`)
    } catch (err) {
      window.alert(getUserFacingErrorMessage(err, 'Nie udało się zatwierdzić.'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleApproveRequest(id: string) {
    if (!requirePro()) return
    if (busyId) return
    setBusyId(id)
    try {
      const candidates = await questionnaireService.findApprovalDuplicates(id)
      if (candidates.length > 0) {
        setPendingApproveId(id)
        setDuplicateCandidates(candidates)
        setBusyId(null)
        return
      }
      setBusyId(null)
      await runApprove(id)
    } catch (err) {
      setBusyId(null)
      window.alert(getUserFacingErrorMessage(err, 'Nie udało się zatwierdzić.'))
    }
  }

  async function handleReject(id: string) {
    if (!requirePro()) return
    if (busyId) return
    setBusyId(id)
    try {
      await questionnaireService.reject(id)
      afterReject()
    } catch (err) {
      window.alert(getUserFacingErrorMessage(err, 'Nie udało się odrzucić.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={styles.page} data-testid="pending-modern">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.pageTitle}>{PENDING_TITLE}</h1>
          <p className={styles.lead}>{PENDING_SUBTITLE}</p>
        </div>
      </header>

      <div className={styles.queue}>
        {isLoading ? (
          <div
            className={styles.surface}
            aria-hidden
            data-testid="pending-loading"
          >
            <div className={styles.skeleton}>
              {Array.from({ length: PENDING_SKELETON_ROWS }, (_, index) => (
                <div key={index} className={styles.skeletonRow}>
                  <div className={styles.skeletonCopy}>
                    <span className={styles.skeletonTitle} />
                    <span className={styles.skeletonMeta} />
                    <span className={styles.skeletonFact} />
                    <span className={styles.skeletonFactWide} />
                  </div>
                  <div className={styles.skeletonActions}>
                    <span className={styles.skeletonLink} />
                    <span className={styles.skeletonButton} />
                    <span className={`${styles.skeletonButton} ${styles.skeletonPrimary}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : isError ? (
          <div className={styles.surface} data-testid="pending-error">
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>{PENDING_ERROR_TITLE}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void refetch()}
              >
                {PENDING_ERROR_RETRY}
              </Button>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className={styles.surface} data-testid="pending-empty">
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>{PENDING_EMPTY_TITLE}</p>
              <p className={styles.emptyDesc}>{PENDING_EMPTY_COPY}</p>
            </div>
          </div>
        ) : (
          <div className={styles.surface}>
            <ul className={styles.list}>
              {data.map((item) => (
                <ModernPendingRow
                  key={item.instance.id}
                  item={item}
                  busy={busyId === item.instance.id}
                  onAccept={(id) => void handleApproveRequest(id)}
                  onReject={(id) => void handleReject(id)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <LikelyDuplicateWarningModal
        open={Boolean(pendingApproveId) && duplicateCandidates.length > 0}
        candidates={duplicateCandidates}
        busy={Boolean(busyId)}
        onClose={() => {
          if (busyId) return
          setPendingApproveId(null)
          setDuplicateCandidates([])
        }}
        onContinue={() => {
          if (!pendingApproveId) return
          void runApprove(pendingApproveId)
        }}
        onOpenExisting={(weddingId) => {
          setPendingApproveId(null)
          setDuplicateCandidates([])
          navigate(`/sluby/${weddingId}`)
        }}
      />
    </div>
  )
}
