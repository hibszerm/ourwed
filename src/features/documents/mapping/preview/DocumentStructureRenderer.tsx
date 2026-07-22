import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import type { PreviewOverlay } from '../mapping/previewOverlays'
import { isBlankishText } from '../mapping/previewOverlays'
import type {
  DocumentBlock,
  DocumentInline,
  DocumentStructure,
  DocumentTextRun,
} from './documentNodes'
import styles from '../MappingWizard.module.css'

function overlappingOverlays(
  start: number,
  end: number,
  overlays: PreviewOverlay[],
): PreviewOverlay[] {
  return overlays
    .filter((o) => o.start < end && o.end > start)
    .sort((a, b) => a.start - b.start)
}

function renderOverlayText(
  text: string,
  absStart: number,
  overlays: PreviewOverlay[],
  onOverlayClick?: (overlayId: string) => void,
): ReactNode[] {
  const absEnd = absStart + text.length
  const hits = overlappingOverlays(absStart, absEnd, overlays)
  if (hits.length === 0) {
    return [text]
  }

  const nodes: ReactNode[] = []
  let cursor = absStart

  hits.forEach((overlay, i) => {
    const start = Math.max(overlay.start, absStart)
    const end = Math.min(overlay.end, absEnd)
    if (start < cursor) return
    if (start > cursor) {
      nodes.push(
        <span key={`t-${absStart}-${i}`}>
          {text.slice(cursor - absStart, start - absStart)}
        </span>,
      )
    }

    if (overlay.mode === 'chip') {
      nodes.push(
        <button
          key={overlay.id}
          type="button"
          className={`${styles.mappingChip} ${styles[`mappingChip_${overlay.kind}`]} ${overlay.active ? styles.mappingChipActive : ''}`}
          title={overlay.variableKey ?? overlay.label}
          onClick={(e) => {
            e.stopPropagation()
            onOverlayClick?.(overlay.id)
          }}
        >
          {overlay.label}
        </button>,
      )
    } else {
      nodes.push(
        <mark
          key={overlay.id}
          className={`${styles.docHighlightPending} ${overlay.active ? styles.docHighlightActive : ''}`}
          title={overlay.label}
          onClick={(e) => {
            e.stopPropagation()
            onOverlayClick?.(overlay.id)
          }}
        >
          {text.slice(start - absStart, end - absStart)}
        </mark>,
      )
    }
    cursor = end
  })

  if (cursor < absEnd) {
    nodes.push(
      <span key={`tail-${absStart}`}>
        {text.slice(cursor - absStart)}
      </span>,
    )
  }

  return nodes
}

function renderInline(
  inline: DocumentInline,
  overlays: PreviewOverlay[],
  onOverlayClick?: (overlayId: string) => void,
): ReactNode {
  if (inline.type === 'break') {
    return <br key={`br-${inline.start}`} />
  }

  const run = inline as DocumentTextRun
  const content = renderOverlayText(
    run.text,
    run.start,
    overlays,
    onOverlayClick,
  )

  let wrapped: ReactNode = content
  if (run.marks?.bold && run.marks?.italic) {
    wrapped = (
      <strong>
        <em>{content}</em>
      </strong>
    )
  } else if (run.marks?.bold) {
    wrapped = <strong>{content}</strong>
  } else if (run.marks?.italic) {
    wrapped = <em>{content}</em>
  }

  return <span key={`run-${run.start}-${run.end}`}>{wrapped}</span>
}

function blockText(block: DocumentBlock): string {
  return block.children
    .map((c) => (c.type === 'text' ? c.text : '\n'))
    .join('')
}

function renderBlock(
  block: DocumentBlock,
  index: number,
  overlays: PreviewOverlay[],
  selectable: boolean,
  selectedBlockId: string | null | undefined,
  onSelectBlock?: (blockIndex: number) => void,
  onOverlayClick?: (overlayId: string) => void,
  expandEmptyBlocks = false,
): ReactNode {
  const blockId = `block-${index}`
  const selected = selectedBlockId === blockId
  const text = blockText(block)
  const blankish = isBlankishText(text)
  const empty = block.children.length === 0 || blankish
  const children = block.children.map((inline, i) => (
    <span key={`in-${block.start}-${i}`}>
      {renderInline(inline, overlays, onOverlayClick)}
    </span>
  ))

  const selectableProps = selectable
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'data-block-id': blockId,
        'aria-pressed': selected,
        onClick: (e: MouseEvent) => {
          e.stopPropagation()
          onSelectBlock?.(index)
        },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelectBlock?.(index)
          }
        },
      }
    : {
        'data-block-id': blockId,
      }

  const selectableClass = selectable
    ? `${styles.docBlockSelectable} ${blankish ? styles.docBlockBlankish : ''} ${selected ? styles.docBlockSelected : ''}`
    : blankish && expandEmptyBlocks
      ? styles.docBlockBlankish
      : ''

  const expandClass =
    expandEmptyBlocks && empty ? styles.docBlockExpandable : ''

  if (block.type === 'heading') {
    const level = Math.min(6, Math.max(1, block.level ?? 1))
    const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    return (
      <Tag
        key={`b-${index}`}
        className={`${styles.docBlock} ${styles.docHeading} ${styles[`docHeading${level}`]} ${selectableClass} ${expandClass}`}
        {...selectableProps}
      >
        {children}
      </Tag>
    )
  }

  if (block.type === 'list-item') {
    const indent = Math.min(6, block.listLevel ?? 0)
    const marker =
      block.listKind === 'number' ? `${block.listIndex ?? 1}.` : '•'
    return (
      <div
        key={`b-${index}`}
        className={`${styles.docBlock} ${styles.docListItem} ${selectableClass} ${expandClass}`}
        style={{ paddingLeft: `${12 + indent * 16}px` }}
        {...selectableProps}
      >
        <span className={styles.docListMarker} aria-hidden>
          {marker}
        </span>
        <div className={styles.docListBody}>{children}</div>
      </div>
    )
  }

  return (
    <p
      key={`b-${index}`}
      className={`${styles.docBlock} ${styles.docParagraph} ${empty ? styles.docParagraphEmpty : ''} ${selectableClass} ${expandClass}`}
      {...selectableProps}
    >
      {empty ? '\u00a0' : children}
    </p>
  )
}

export function DocumentStructureRenderer({
  structure,
  overlays = [],
  selectable = false,
  selectedBlockId,
  onSelectBlock,
  onOverlayClick,
  expandEmptyBlocks = false,
}: {
  structure: DocumentStructure
  overlays?: PreviewOverlay[]
  selectable?: boolean
  selectedBlockId?: string | null
  onSelectBlock?: (blockIndex: number) => void
  onOverlayClick?: (overlayId: string) => void
  /** Make empty / blank paragraphs taller so they are easy click targets. */
  expandEmptyBlocks?: boolean
}) {
  return (
    <div
      className={`${styles.docSurface} ${selectable ? styles.docSurfaceGuided : ''} ${expandEmptyBlocks ? styles.docSurfaceExpandEmpty : ''}`}
    >
      {structure.blocks.map((block, index) =>
        renderBlock(
          block,
          index,
          overlays,
          selectable,
          selectedBlockId,
          onSelectBlock,
          onOverlayClick,
          expandEmptyBlocks,
        ),
      )}
    </div>
  )
}
