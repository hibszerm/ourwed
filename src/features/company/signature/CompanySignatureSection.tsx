import { useEffect, useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { companyDetailsService } from '@/lib/api/companyDetailsService'
import type { CompanyDetails } from '@/types/company'
import {
  exportCanvasSignaturePng,
  normalizeUploadedSignatureFile,
} from './signatureImageProcessing'
import { SignaturePad, type SignaturePadHandle } from './SignaturePad'
import styles from './CompanySignatureSection.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

type Props = {
  signaturePath: string | null
  signatureUpdatedAt?: string | null
  /** Sync path into parent company form state after independent save/delete. */
  onSignaturePathChange: (path: string | null) => void
}

function formatUpdatedAt(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * Company signature management — draw, upload, preview, replace, delete.
 * Saves independently (does not require full company form submit).
 */
export function CompanySignatureSection({
  signaturePath,
  signatureUpdatedAt,
  onSignaturePathChange,
}: Props) {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const padRef = useRef<SignaturePadHandle | null>(null)
  const drawTriggerRef = useRef<HTMLButtonElement | null>(null)

  const [drawOpen, setDrawOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const [dirtyPad, setDirtyPad] = useState(false)
  const titleDescId = useId()

  useEffect(() => {
    let cancelled = false
    setPreviewError(false)
    setPreviewUrl(null)
    if (!signaturePath) return
    void companyDetailsService
      .getSignedUrl(signaturePath, 3600)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url)
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true)
      })
    return () => {
      cancelled = true
    }
  }, [signaturePath])

  async function invalidateCompany() {
    await queryClient.invalidateQueries({
      queryKey: ['company-details', userId],
    })
  }

  function applySaved(details: CompanyDetails) {
    onSignaturePathChange(details.signaturePath)
    void invalidateCompany()
  }

  async function persistFile(file: File, successMessage: string) {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const details = await companyDetailsService.saveSignature(file)
      applySaved(details)
      setStatus(successMessage)
      setDrawOpen(false)
      setDirtyPad(false)
    } catch (err) {
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się zapisać podpisu.'),
      )
    } finally {
      setBusy(false)
    }
  }

  async function onSaveDrawn() {
    const pad = padRef.current
    if (!pad?.hasContent()) {
      setError('Narysuj podpis przed zapisaniem.')
      return
    }
    const canvas = pad.exportCanvas()
    if (!canvas) {
      setError('Narysuj podpis przed zapisaniem.')
      return
    }
    try {
      const blob = await exportCanvasSignaturePng(canvas)
      const file = new File([blob], 'signature.png', { type: 'image/png' })
      await persistFile(file, 'Podpis zapisany')
    } catch (err) {
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się wyeksportować podpisu.'),
      )
    }
  }

  async function onUploadFile(list: FileList | null) {
    const file = list?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const normalized = await normalizeUploadedSignatureFile(file)
      await persistFile(normalized, 'Podpis wgrany')
    } catch (err) {
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się przesłać pliku.'),
      )
      setBusy(false)
    }
  }

  async function onDelete() {
    if (
      !window.confirm(
        'Usunąć zapisany podpis firmy? Tej operacji nie można cofnąć.',
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const details = await companyDetailsService.deleteSignature()
      onSignaturePathChange(details?.signaturePath ?? null)
      setPreviewUrl(null)
      setStatus('Podpis usunięty')
      await invalidateCompany()
    } catch (err) {
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się usunąć podpisu.'),
      )
    } finally {
      setBusy(false)
    }
  }

  function requestCloseDraw() {
    if (busy) return
    if (dirtyPad) {
      if (
        !window.confirm(
          'Masz niezapisany rysunek. Zamknąć bez zapisywania?',
        )
      ) {
        return
      }
    }
    setDrawOpen(false)
    setDirtyPad(false)
    setError(null)
    window.setTimeout(() => drawTriggerRef.current?.focus(), 0)
  }

  const updatedLabel = formatUpdatedAt(signatureUpdatedAt)

  return (
    <div className={styles.root} aria-labelledby={titleDescId}>
      <div className={styles.header}>
        <h3 id={titleDescId} className={styles.title}>
          Podpis
        </h3>
        <p className={styles.helper}>
          Narysuj podpis myszką, palcem lub rysikiem — albo wgraj gotowy PNG.
        </p>
      </div>

      {signaturePath ? (
        <div className={styles.previewCard}>
          <div className={styles.previewFrame}>
            {previewUrl && !previewError ? (
              <img
                src={previewUrl}
                alt="Zapisany podpis firmy"
                className={styles.previewImage}
                onError={() => setPreviewError(true)}
              />
            ) : previewError ? (
              <div className={styles.previewFallback} role="alert">
                <p>Nie udało się wczytać podglądu.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setPreviewError(false)
                    void companyDetailsService
                      .getSignedUrl(signaturePath, 3600)
                      .then(setPreviewUrl)
                      .catch(() => setPreviewError(true))
                  }}
                >
                  Spróbuj ponownie
                </Button>
              </div>
            ) : (
              <p className={styles.previewLoading}>Ładowanie podglądu…</p>
            )}
          </div>
          <div className={styles.previewMeta}>
            <p className={styles.statusOk} aria-live="polite">
              Podpis zapisany
            </p>
            {updatedLabel ? (
              <p className={styles.muted}>Aktualizacja: {updatedLabel}</p>
            ) : null}
          </div>
          <div className={styles.actions}>
            <Button
              ref={drawTriggerRef}
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setError(null)
                setDirtyPad(false)
                setDrawOpen(true)
              }}
            >
              Narysuj ponownie
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              Wgraj inny
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void onDelete()}
            >
              Usuń
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.emptyCard}>
          <p className={styles.muted}>Brak zapisanego podpisu.</p>
          <div className={styles.actions}>
            <Button
              ref={drawTriggerRef}
              type="button"
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => {
                setError(null)
                setDirtyPad(false)
                setDrawOpen(true)
              }}
            >
              Narysuj podpis
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              Wgraj podpis
            </Button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className={styles.hiddenInput}
        aria-label="Wgraj plik podpisu"
        onChange={(e) => {
          void onUploadFile(e.target.files)
          e.target.value = ''
        }}
      />

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className={styles.statusOk} aria-live="polite">
          {status}
        </p>
      ) : null}

      <Modal
        open={drawOpen}
        title="Narysuj podpis"
        description="Podpisz się myszką, palcem lub rysikiem."
        onClose={requestCloseDraw}
        busy={busy}
        size="lg"
        showClose
        cancelLabel="Anuluj"
        onCancel={requestCloseDraw}
        secondaryAction={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                padRef.current?.undo()
                setDirtyPad(true)
              }}
            >
              Cofnij
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                padRef.current?.clear()
                setDirtyPad(false)
              }}
            >
              Wyczyść
            </Button>
          </>
        }
        primaryAction={
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void onSaveDrawn()}
          >
            {busy ? 'Zapisywanie…' : 'Zapisz podpis'}
          </Button>
        }
      >
        <SignaturePad
          padRef={padRef}
          disabled={busy}
          onStrokesChange={(strokes) => {
            setDirtyPad(strokes.length > 0)
          }}
        />
      </Modal>
    </div>
  )
}
