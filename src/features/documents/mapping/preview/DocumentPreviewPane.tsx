/**
 * Free-placement canvas + document preview.
 * Placements are overlay markers; DOCX content is never mutated.
 */

import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'
import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import type { PreviewOverlay } from '../mapping/previewOverlays'
import type { ManualDocumentPlacement } from '../types'
import type { DocumentStructure } from './documentNodes'
import { DocumentStructureRenderer } from './DocumentStructureRenderer'
import styles from '../MappingWizard.module.css'

export function DocumentPreviewPane({
  sourceText,
  structure,
  overlays = [],
  placements = [],
  title = 'Twój dokument',
  fileName,
  selectable = false,
  selectedBlockId,
  onSelectBlock,
  onOverlayClick,
  placementMode = false,
  pendingPlacement = null,
  onCanvasPlace,
  onPlacementClick,
  onRemovePlacement,
  hint,
}: {
  sourceText: string
  structure?: DocumentStructure | null
  overlays?: PreviewOverlay[]
  placements?: ManualDocumentPlacement[]
  title?: string
  fileName?: string | null
  selectable?: boolean
  selectedBlockId?: string | null
  onSelectBlock?: (blockIndex: number) => void
  onOverlayClick?: (overlayId: string) => void
  placementMode?: boolean
  pendingPlacement?: { position: { x: number; y: number } } | null
  onCanvasPlace?: (input: {
    position: { x: number; y: number }
    blockId?: string
  }) => void
  onPlacementClick?: (placementId: string) => void
  onRemovePlacement?: (placementId: string) => void
  hint?: string | null
}) {
  function handleCanvasClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (!placementMode || !onCanvasPlace) return
    const inner = e.currentTarget
    const rect = inner.getBoundingClientRect()
    const height = Math.max(inner.scrollHeight, rect.height)
    const width = Math.max(inner.clientWidth, 1)
    const x = ((e.clientX - rect.left + inner.scrollLeft) / width) * 100
    const y = ((e.clientY - rect.top + inner.scrollTop) / height) * 100
    const blockEl = (e.target as HTMLElement | null)?.closest?.(
      '[data-block-id]',
    )
    const blockId = blockEl?.getAttribute('data-block-id') ?? undefined
    onCanvasPlace({
      position: {
        x: Math.min(98, Math.max(1, x)),
        y: Math.min(98, Math.max(1, y)),
      },
      blockId,
    })
  }

  return (
    <article className={styles.docPreviewPane}>
      <header className={styles.paneHeader}>
        <div>
          <h3 className={styles.paneTitle}>{title}</h3>
          {fileName && <p className={styles.paneMeta}>{fileName}</p>}
          {hint && <p className={styles.paneHint}>{hint}</p>}
        </div>
        {placementMode && (
          <span className={styles.placementModeBadge}>Tryb dodawania pól</span>
        )}
      </header>

      <div
        className={`${styles.docCanvas} ${placementMode ? styles.docCanvasPlacement : ''}`}
      >
        <div
          className={styles.docCanvasInner}
          onClick={handleCanvasClick}
        >
          {structure && structure.blocks.length > 0 ? (
            <DocumentStructureRenderer
              structure={structure}
              overlays={overlays}
              selectable={selectable && !placementMode}
              selectedBlockId={selectedBlockId}
              onSelectBlock={onSelectBlock}
              onOverlayClick={onOverlayClick}
              expandEmptyBlocks
            />
          ) : (
            <FallbackPlainPreview sourceText={sourceText} overlays={overlays} />
          )}

          <div className={styles.docCanvasBleed} aria-hidden />

          <div className={styles.placementLayer}>
            {placements.map((p) => {
              const def = getVariableDef(p.variableKey)
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.placementMarker} ${styles.mappingChip_manual}`}
                  style={{ left: `${p.position.x}%`, top: `${p.position.y}%` }}
                  title={p.variableKey}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onPlacementClick?.(p.id)
                  }}
                >
                  <span>{def?.labelPl ?? p.variableKey}</span>
                  {onRemovePlacement && (
                    <span
                      className={styles.placementRemove}
                      role="button"
                      tabIndex={-1}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onRemovePlacement(p.id)
                      }}
                    >
                      ×
                    </span>
                  )}
                </button>
              )
            })}

            {pendingPlacement && (
              <span
                className={styles.placementPending}
                style={{
                  left: `${pendingPlacement.position.x}%`,
                  top: `${pendingPlacement.position.y}%`,
                }}
              >
                Wybierz dane…
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function FallbackPlainPreview({
  sourceText,
  overlays,
}: {
  sourceText: string
  overlays: PreviewOverlay[]
}) {
  const sorted = overlays.slice().sort((a, b) => a.start - b.start)
  if (sorted.length === 0) {
    return (
      <pre className={`${styles.docPreviewText} ${styles.docSurface}`}>
        {sourceText || '\u00a0'}
      </pre>
    )
  }

  const nodes: ReactNode[] = []
  let cursor = 0
  sorted.forEach((overlay, i) => {
    if (overlay.start < cursor) return
    if (overlay.start > cursor) {
      nodes.push(
        <span key={`t-${i}`}>{sourceText.slice(cursor, overlay.start)}</span>,
      )
    }
    if (overlay.mode === 'chip') {
      nodes.push(
        <span
          key={overlay.id}
          className={`${styles.mappingChip} ${styles[`mappingChip_${overlay.kind}`]}`}
        >
          {overlay.label}
        </span>,
      )
    } else {
      nodes.push(
        <mark key={overlay.id} className={styles.docHighlightPending}>
          {sourceText.slice(overlay.start, overlay.end)}
        </mark>,
      )
    }
    cursor = overlay.end
  })
  if (cursor < sourceText.length) {
    nodes.push(<span key="tail">{sourceText.slice(cursor)}</span>)
  }
  return (
    <pre className={`${styles.docPreviewText} ${styles.docSurface}`}>{nodes}</pre>
  )
}
