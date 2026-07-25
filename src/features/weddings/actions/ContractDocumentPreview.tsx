/**
 * Document-style contract preview — coherent page, optional edit mode.
 * Edits flow back into the existing DocxParagraph[] model used on save.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Button } from '@/components/ui/Button'
import type { DocxParagraph } from '@/features/documents/template'
import styles from './ContractDocumentPreview.module.css'

export interface ContractDocumentPreviewProps {
  paragraphs: DocxParagraph[]
  baselineParagraphs: DocxParagraph[]
  resolvedValues: Record<string, string>
  omittedKeys: string[]
  busy?: boolean
  onChangeParagraph: (index: number, text: string) => void
  onReplaceAll: (next: DocxParagraph[]) => void
  onBackToVariables: () => void
  panelOpen?: boolean
  onTogglePanel?: () => void
}

type ParaKind = 'blank' | 'title' | 'heading' | 'body'

function classifyParagraph(text: string, isFirstContent: boolean): ParaKind {
  const trimmed = text.trim()
  if (!trimmed) return 'blank'
  if (/^§\s*\d+/u.test(trimmed) || /^Art\.?\s*\d+/iu.test(trimmed)) {
    return 'heading'
  }
  if (
    isFirstContent &&
    (trimmed.length < 80 ||
      /^UMOWA\b/iu.test(trimmed) ||
      trimmed === trimmed.toUpperCase())
  ) {
    return 'title'
  }
  return 'body'
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightFilledValues(
  text: string,
  values: string[],
): Array<{ text: string; highlight: boolean }> {
  if (!text || values.length === 0) return [{ text, highlight: false }]

  const unique = [
    ...new Set(values.map((v) => v.trim()).filter((v) => v.length >= 2)),
  ].sort((a, b) => b.length - a.length)
  if (unique.length === 0) return [{ text, highlight: false }]

  const pattern = new RegExp(`(${unique.map(escapeRegExp).join('|')})`, 'g')
  const parts = text.split(pattern)
  const valueSet = new Set(unique)
  return parts
    .filter((p) => p.length > 0)
    .map((part) => ({
      text: part,
      highlight: valueSet.has(part),
    }))
}

function paragraphsEqual(a: DocxParagraph[], b: DocxParagraph[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => p.index === b[i]?.index && p.text === b[i]?.text)
}

function estimatePages(paragraphs: DocxParagraph[]): number {
  const chars = paragraphs.reduce((sum, p) => sum + p.text.length + 1, 0)
  return Math.max(1, Math.ceil(chars / 2800))
}

function EditableParagraph({
  text,
  className,
  paraIndex,
  onCommit,
  onKeyDown,
}: {
  text: string
  className: string
  paraIndex: number
  onCommit: (index: number, text: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
}) {
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.innerText !== text) el.innerText = text
  }, [text])

  return (
    <p
      ref={ref}
      data-para-index={paraIndex}
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onKeyDown={onKeyDown}
      onBlur={(e) => onCommit(paraIndex, e.currentTarget.innerText)}
    />
  )
}

export function ContractDocumentPreview({
  paragraphs,
  baselineParagraphs,
  resolvedValues,
  omittedKeys,
  busy = false,
  onChangeParagraph,
  onReplaceAll,
  onBackToVariables,
  panelOpen = true,
  onTogglePanel,
}: ContractDocumentPreviewProps) {
  const docLabelId = useId()
  const pageRef = useRef<HTMLDivElement>(null)
  const findInputRef = useRef<HTMLInputElement>(null)

  const [editMode, setEditMode] = useState(false)
  const [showHighlights, setShowHighlights] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [history, setHistory] = useState<DocxParagraph[][]>([])
  const [future, setFuture] = useState<DocxParagraph[][]>([])

  const filledValues = useMemo(() => {
    const omitted = new Set(omittedKeys)
    return Object.entries(resolvedValues)
      .filter(([key, value]) => !omitted.has(key) && value.trim().length > 0)
      .map(([, value]) => value.trim())
  }, [resolvedValues, omittedKeys])

  const filledCount = useMemo(() => {
    const omitted = new Set(omittedKeys)
    return Object.entries(resolvedValues).filter(
      ([key, value]) => !omitted.has(key) && value.trim().length > 0,
    ).length
  }, [resolvedValues, omittedKeys])

  const skippedCount = omittedKeys.length
  const pageEstimate = estimatePages(paragraphs)

  const firstContentIndex = useMemo(() => {
    const found = paragraphs.find((p) => p.text.trim().length > 0)
    return found?.index ?? -1
  }, [paragraphs])

  const pushHistory = useCallback((snapshot: DocxParagraph[]) => {
    setHistory((prev) => [...prev.slice(-40), snapshot.map((p) => ({ ...p }))])
    setFuture([])
  }, [])

  const commitParagraph = useCallback(
    (index: number, nextText: string) => {
      const current = paragraphs.find((p) => p.index === index)
      if (!current || current.text === nextText) return
      pushHistory(paragraphs)
      onChangeParagraph(index, nextText)
    },
    [paragraphs, onChangeParagraph, pushHistory],
  )

  function handleUndo() {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    setFuture((f) => [paragraphs.map((p) => ({ ...p })), ...f])
    onReplaceAll(prev)
  }

  function handleRedo() {
    const next = future[0]
    if (!next) return
    setFuture((f) => f.slice(1))
    setHistory((h) => [...h, paragraphs.map((p) => ({ ...p }))])
    onReplaceAll(next)
  }

  function handleRestore() {
    if (paragraphsEqual(paragraphs, baselineParagraphs)) return
    pushHistory(paragraphs)
    onReplaceAll(baselineParagraphs.map((p) => ({ ...p })))
  }

  function runFind(direction: 1 | -1) {
    const q = findQuery.trim()
    if (!q || !pageRef.current) return
    const nodes = Array.from(
      pageRef.current.querySelectorAll<HTMLElement>('[data-para-index]'),
    )
    if (nodes.length === 0) return

    const active = document.activeElement as HTMLElement | null
    let startIdx = nodes.findIndex((n) => n === active || n.contains(active))
    if (startIdx < 0) startIdx = direction === 1 ? -1 : 0

    for (let step = 1; step <= nodes.length; step++) {
      const i =
        direction === 1
          ? (startIdx + step) % nodes.length
          : (startIdx - step + nodes.length * 2) % nodes.length
      const node = nodes[i]!
      const text = node.innerText || ''
      const at = text.toLowerCase().indexOf(q.toLowerCase())
      if (at < 0) continue
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (editMode) {
        node.focus()
          try {
            const selection = window.getSelection()
            const range = document.createRange()
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
            let remaining = at
            let textNode = walker.nextNode() as Text | null
            while (textNode) {
              const len = textNode.textContent?.length ?? 0
              if (remaining <= len) {
                range.setStart(textNode, remaining)
                range.setEnd(textNode, Math.min(remaining + q.length, len))
                selection?.removeAllRanges()
                selection?.addRange(range)
                break
              }
              remaining -= len
              textNode = walker.nextNode() as Text | null
            }
          } catch {
            /* selection optional */
          }
      } else {
        node.classList.add(styles.findFlash)
        window.setTimeout(() => node.classList.remove(styles.findFlash), 1200)
      }
      return
    }
  }

  useEffect(() => {
    if (!findOpen) return
    const id = window.requestAnimationFrame(() => findInputRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [findOpen])

  function onParaKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) handleRedo()
      else handleUndo()
    }
  }

  const empty = paragraphs.length === 0

  return (
    <div className={styles.root}>
      <div className={styles.toolbar} role="toolbar" aria-label="Narzędzia podglądu">
        <div className={styles.toolbarGroup}>
          {!editMode ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || empty}
              onClick={() => {
                setShowHighlights(false)
                setEditMode(true)
              }}
            >
              Edytuj treść
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setEditMode(false)}
            >
              Zakończ edycję
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || history.length === 0}
            onClick={handleUndo}
            aria-label="Cofnij"
          >
            Cofnij
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || future.length === 0}
            onClick={handleRedo}
            aria-label="Ponów"
          >
            Ponów
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || empty}
            onClick={() => setFindOpen((v) => !v)}
            aria-expanded={findOpen}
            aria-controls={findOpen ? 'contract-find' : undefined}
          >
            Znajdź
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || paragraphsEqual(paragraphs, baselineParagraphs)}
            onClick={handleRestore}
          >
            Przywróć wygenerowaną treść
          </Button>
        </div>
        <div className={styles.toolbarGroup}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showHighlights}
              disabled={busy || editMode}
              onChange={(e) => setShowHighlights(e.target.checked)}
            />
            <span>Pokaż uzupełnione dane</span>
          </label>
          {onTogglePanel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.panelToggle}
              onClick={onTogglePanel}
              aria-pressed={panelOpen}
            >
              {panelOpen ? 'Ukryj podsumowanie' : 'Podsumowanie'}
            </Button>
          ) : null}
        </div>
      </div>

      {findOpen ? (
        <div className={styles.findBar} id="contract-find">
          <input
            ref={findInputRef}
            className={styles.findInput}
            type="search"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                runFind(e.shiftKey ? -1 : 1)
              }
              if (e.key === 'Escape') setFindOpen(false)
            }}
            placeholder="Szukaj w umowie…"
            aria-label="Szukaj w umowie"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => runFind(-1)}
            aria-label="Poprzednie wystąpienie"
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => runFind(1)}
            aria-label="Następne wystąpienie"
          >
            ↓
          </Button>
        </div>
      ) : null}

      <div className={styles.workspace}>
        <div className={styles.pageColumn}>
          {empty ? (
            <p className={styles.empty}>
              Dokument nie zawiera edytowalnych akapitów tekstowych. Możesz
              zapisać wygenerowany DOCX bez zmian.
            </p>
          ) : (
            <div
              ref={pageRef}
              className={`${styles.page} ${editMode ? styles.pageEditing : ''}`.trim()}
              role="document"
              aria-labelledby={docLabelId}
            >
              <span id={docLabelId} className={styles.srOnly}>
                Treść wygenerowanej umowy
              </span>
              {paragraphs.map((p) => {
                const kind = classifyParagraph(
                  p.text,
                  p.index === firstContentIndex,
                )
                const className = [
                  styles.para,
                  kind === 'title' ? styles.paraTitle : '',
                  kind === 'heading' ? styles.paraHeading : '',
                  kind === 'blank' ? styles.paraBlank : '',
                ]
                  .filter(Boolean)
                  .join(' ')

                if (editMode) {
                  return (
                    <EditableParagraph
                      key={`edit-${p.index}`}
                      paraIndex={p.index}
                      text={p.text || '\u00a0'}
                      className={className}
                      onCommit={commitParagraph}
                      onKeyDown={onParaKeyDown}
                    />
                  )
                }

                const chunks =
                  showHighlights && kind !== 'blank'
                    ? highlightFilledValues(p.text, filledValues)
                    : [{ text: p.text, highlight: false }]

                return (
                  <p
                    key={`view-${p.index}`}
                    data-para-index={p.index}
                    className={className}
                  >
                    {kind === 'blank'
                      ? '\u00a0'
                      : chunks.map((chunk, i) =>
                          chunk.highlight ? (
                            <mark key={i} className={styles.filledMark}>
                              {chunk.text}
                            </mark>
                          ) : (
                            <span key={i}>{chunk.text}</span>
                          ),
                        )}
                  </p>
                )
              })}
            </div>
          )}
        </div>

        <aside
          className={`${styles.panel} ${panelOpen ? '' : styles.panelCollapsed}`.trim()}
          aria-label="Podsumowanie"
          hidden={!panelOpen}
        >
          <h3 className={styles.panelTitle}>Podsumowanie</h3>
          <dl className={styles.stats}>
            <div>
              <dt>Uzupełnione dane</dt>
              <dd>{filledCount}</dd>
            </div>
            <div>
              <dt>Pominięte dane</dt>
              <dd>{skippedCount}</dd>
            </div>
            <div>
              <dt>Szacunek stron</dt>
              <dd>{pageEstimate}</dd>
            </div>
            <div>
              <dt>Formaty</dt>
              <dd>DOCX, PDF</dd>
            </div>
          </dl>
          {skippedCount > 0 ? (
            <div className={styles.skippedBox}>
              <p>
                {skippedCount}{' '}
                {skippedCount === 1
                  ? 'wartość została pominięta'
                  : 'wartości zostały pominięte'}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={onBackToVariables}
              >
                Sprawdź zmienne
              </Button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
