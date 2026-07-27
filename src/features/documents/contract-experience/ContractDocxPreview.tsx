/**
 * Renders the exact final DOCX artifact with docx-preview.
 * Does not reconstruct paragraphs in React or invent a second document.
 */

import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { Button } from '@/components/ui/Button'
import { DOCX_PREVIEW_OPTIONS } from './docxPreviewOptions'
import styles from './ContractDocxPreview.module.css'

function toArrayBuffer(
  source: ArrayBuffer | Uint8Array | Blob,
): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) return Promise.resolve(source.slice(0))
  if (source instanceof Uint8Array) {
    const copy = new Uint8Array(source.byteLength)
    copy.set(source)
    return Promise.resolve(copy.buffer)
  }
  return source.arrayBuffer()
}

export function ContractDocxPreview(props: {
  /** Exact final DOCX bytes (not the original template). */
  source: ArrayBuffer | Uint8Array | Blob | null
  className?: string
  onRetry?: () => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const styleRef = useRef<HTMLDivElement | null>(null)
  const renderGen = useRef(0)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    props.source ? 'loading' : 'idle',
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    const styleHost = styleRef.current
    if (!host) return

    host.replaceChildren()
    styleHost?.replaceChildren()

    if (!props.source) {
      queueMicrotask(() => {
        setStatus('idle')
        setError(null)
      })
      return
    }

    const gen = ++renderGen.current
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled || gen !== renderGen.current) return
      setStatus('loading')
      setError(null)
    })

    void (async () => {
      try {
        const bytes = await toArrayBuffer(props.source!)
        if (cancelled || gen !== renderGen.current) return
        await renderAsync(bytes, host, styleHost ?? undefined, {
          ...DOCX_PREVIEW_OPTIONS,
        })
        if (cancelled || gen !== renderGen.current) {
          host.replaceChildren()
          return
        }
        setStatus('ready')
      } catch {
        if (cancelled || gen !== renderGen.current) return
        host.replaceChildren()
        setStatus('error')
        setError('Nie udało się wyświetlić podglądu dokumentu.')
      }
    })()

    return () => {
      cancelled = true
      host.replaceChildren()
      styleHost?.replaceChildren()
    }
  }, [props.source])

  return (
    <div className={`${styles.root} ${props.className ?? ''}`.trim()}>
      <div ref={styleRef} className={styles.styleHost} hidden />
      {status === 'loading' || status === 'idle' ? (
        <p className={styles.muted} aria-live="polite">
          {status === 'idle'
            ? 'Brak dokumentu do podglądu.'
            : 'Ładowanie podglądu…'}
        </p>
      ) : null}
      {status === 'error' ? (
        <div className={styles.errorBox} role="alert">
          <p>{error}</p>
          {props.onRetry ? (
            <Button type="button" variant="secondary" onClick={props.onRetry}>
              Spróbuj ponownie
            </Button>
          ) : null}
        </div>
      ) : null}
      <div
        ref={hostRef}
        className={styles.paperHost}
        data-testid="contract-docx-preview"
        data-preview-status={status}
        aria-busy={status === 'loading'}
      />
    </div>
  )
}
