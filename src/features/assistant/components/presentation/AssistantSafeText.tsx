import type { ReactNode } from 'react'
import {
  parseSafeMarkdown,
  type SafeBlock,
  type SafeInline,
} from './parseSafeMarkdown'
import {
  plainTextFromInlines,
  scheduleRowsFromListItems,
  scheduleRowsFromParagraphLines,
  type ScheduleRow,
} from './scheduleDisplay'
import styles from '../Assistant.module.css'

function renderInlines(nodes: SafeInline[], keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  nodes.forEach((node, i) => {
    const key = `${keyPrefix}-${i}`
    if (node.type === 'text') {
      // Preserve soft line breaks inside paragraphs as <br>
      const parts = node.value.split('\n')
      parts.forEach((part, pi) => {
        if (pi > 0) out.push(<br key={`${key}-br-${pi}`} />)
        if (part) out.push(part)
      })
      return
    }
    out.push(
      <strong key={key} className={styles.safeStrong}>
        {renderInlines(node.children, key)}
      </strong>,
    )
  })
  return out
}

function renderScheduleList(rows: ScheduleRow[], key: string): ReactNode {
  return (
    <ul
      key={key}
      className={styles.scheduleList}
      data-testid="assistant-schedule-list"
    >
      {rows.map((row, j) => (
        <li key={`${key}-${j}`} className={styles.scheduleRow}>
          <span className={styles.scheduleTime}>{row.time}</span>
          <span className={styles.scheduleTitle}>
            {renderInlines(row.titleInlines, `${key}-t-${j}`)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function renderBlocks(blocks: SafeBlock[]): ReactNode {
  return blocks.map((block, i) => {
    if (block.type === 'paragraph') {
      const plain = plainTextFromInlines(block.children)
      const schedule = scheduleRowsFromParagraphLines(plain)
      if (schedule) return renderScheduleList(schedule, `sched-p-${i}`)
      return (
        <p key={`p-${i}`} className={styles.safeParagraph}>
          {renderInlines(block.children, `p-${i}`)}
        </p>
      )
    }
    if (block.type === 'unordered_list') {
      const schedule = scheduleRowsFromListItems(block.items)
      if (schedule) return renderScheduleList(schedule, `sched-ul-${i}`)
      return (
        <ul key={`ul-${i}`} className={styles.safeList}>
          {block.items.map((item, j) => (
            <li key={`ul-${i}-${j}`}>{renderInlines(item, `ul-${i}-${j}`)}</li>
          ))}
        </ul>
      )
    }
    const scheduleOl = scheduleRowsFromListItems(block.items)
    if (scheduleOl) return renderScheduleList(scheduleOl, `sched-ol-${i}`)
    return (
      <ol key={`ol-${i}`} className={styles.safeListOrdered}>
        {block.items.map((item, j) => (
          <li key={`ol-${i}-${j}`}>{renderInlines(item, `ol-${i}-${j}`)}</li>
        ))}
      </ol>
    )
  })
}

/**
 * Safe rich-text for Assistant answers.
 * React elements only — no HTML injection APIs, no model hrefs.
 */
export function AssistantSafeText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const blocks = parseSafeMarkdown(text)
  if (blocks.length === 0) return null
  return (
    <div
      className={[styles.safeText, className].filter(Boolean).join(' ')}
      data-testid="assistant-safe-text"
    >
      {renderBlocks(blocks)}
    </div>
  )
}
