import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  isProAccessRequiredError,
  toProAccessUserMessage,
} from '@/features/billing/proAccessError'
import { packageService } from '@/lib/api/packageService'
import { questionnaireService } from '@/lib/api/questionnaireService'
import {
  GENERATE_PACKAGE_SNAPSHOT_NOTE,
  GENERATE_ZERO_PACKAGES_ADD_PACKAGE,
  GENERATE_ZERO_PACKAGES_BODY,
  GENERATE_ZERO_PACKAGES_CONTINUE,
  GENERATE_ZERO_PACKAGES_TITLE,
} from '@/features/questionnaires/generateQuestionnaireActivationCopy'
import styles from './GenerateQuestionnaireModal.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

interface GenerateQuestionnaireModalProps {
  open: boolean
  onClose: () => void
  onGenerated: () => void
}

/**
 * Create an indefinite Contract Data Questionnaire public link.
 * Phase 3.2: soft zero-package choice + quiet snapshot note (state-derived only).
 */
export function GenerateQuestionnaireModal({
  open,
  onClose,
  onGenerated,
}: GenerateQuestionnaireModalProps) {
  const navigate = useNavigate()
  const userId = useStudioAuthId()
  const { requirePro, openUpgradeDialog } = useProAccessGate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    formUrl: string
    formName: string
  } | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setResult(null)
      setError(null)
      setBusy(false)
    }
  }

  // Same active catalog as options snapshot (`activeOnly: true`).
  // Shares `['studio-packages', userId, 'active']` with other studio surfaces.
  const packagesQuery = useQuery({
    queryKey: ['studio-packages', userId, 'active'],
    queryFn: () => packageService.list({ activeOnly: true }),
    enabled: open && Boolean(userId),
    staleTime: 30_000,
  })

  const packageCountKnown =
    packagesQuery.isSuccess && Array.isArray(packagesQuery.data)
  const packageCount = packageCountKnown ? packagesQuery.data.length : null
  const showZeroPackageChoice = packageCount === 0
  const showSnapshotNote = packageCount != null && packageCount > 0
  // Loading / error: never claim zero packages. Generation stays available.
  const packagesPending =
    open && !result && !packageCountKnown && !packagesQuery.isError

  async function handleGenerate() {
    if (!requirePro(undefined, { actionKey: 'generate_questionnaire_link' })) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const generated = await questionnaireService.generate({
        type: 'contract',
      })
      setResult({ formUrl: generated.formUrl, formName: generated.formName })
      onGenerated()
    } catch (err) {
      if (isProAccessRequiredError(err)) {
        setError(toProAccessUserMessage())
        openUpgradeDialog('pro_required_action', 'generate_questionnaire_link')
        return
      }
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się wygenerować ankiety.'),
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    await navigator.clipboard.writeText(result.formUrl)
  }

  function handleClose() {
    if (busy) return
    setResult(null)
    setError(null)
    onClose()
  }

  function handleAddPackage() {
    if (busy) return
    handleClose()
    navigate('/studio/pakiety')
  }

  const preGenerateTitle = showZeroPackageChoice
    ? GENERATE_ZERO_PACKAGES_TITLE
    : 'Wygeneruj ankietę'
  const preGenerateDescription = showZeroPackageChoice
    ? undefined
    : 'Utwórz nowy link do ankiety „Dane do umowy” (bezterminowy).'

  return (
    <Modal
      open={open}
      title={result ? 'Link do ankiety' : preGenerateTitle}
      description={
        result
          ? 'Skopiuj unikalny link i wyślij go do pary.'
          : preGenerateDescription
      }
      onClose={handleClose}
      busy={busy}
      showClose
      size="md"
      mobilePresentation="center"
      initialFocus="panel"
      entrance="settle"
      panelClassName={styles.generatePanel}
      cancelLabel={
        result
          ? undefined
          : showZeroPackageChoice
            ? GENERATE_ZERO_PACKAGES_CONTINUE
            : 'Anuluj'
      }
      cancelVariant={showZeroPackageChoice && !result ? 'secondary' : 'ghost'}
      onCancel={
        result
          ? undefined
          : showZeroPackageChoice
            ? () => void handleGenerate()
            : handleClose
      }
      primaryAction={
        result ? (
          <Button type="button" variant="primary" onClick={handleClose}>
            Zamknij
          </Button>
        ) : showZeroPackageChoice ? (
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={handleAddPackage}
            data-testid="generate-questionnaire-add-package"
          >
            {GENERATE_ZERO_PACKAGES_ADD_PACKAGE}
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void handleGenerate()}
            data-testid="generate-questionnaire-submit"
          >
            {busy ? 'Generowanie…' : 'Generuj link'}
          </Button>
        )
      }
    >
      {result ? (
        <div className={styles.result}>
          <p className={styles.resultName}>{result.formName}</p>
          <div className={styles.linkRow}>
            <input
              className={styles.linkInput}
              readOnly
              value={result.formUrl}
              aria-label="URL ankiety"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleCopy()}
            >
              Kopiuj
            </Button>
            <a href={result.formUrl} target="_blank" rel="noreferrer">
              <Button type="button" size="sm" variant="ghost">
                Otwórz
              </Button>
            </a>
          </div>
        </div>
      ) : (
        <div className={styles.body}>
          {packagesPending ? (
            <p
              className={styles.loading}
              role="status"
              data-testid="generate-questionnaire-packages-loading"
            >
              Sprawdzanie pakietów…
            </p>
          ) : null}

          {showSnapshotNote ? (
            <p
              className={styles.snapshotNote}
              data-testid="generate-questionnaire-snapshot-note"
            >
              {GENERATE_PACKAGE_SNAPSHOT_NOTE}
            </p>
          ) : null}

          {showZeroPackageChoice ? (
            <p
              className={styles.lede}
              data-testid="generate-questionnaire-zero-packages"
            >
              {GENERATE_ZERO_PACKAGES_BODY}
            </p>
          ) : null}

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
