import { motion, type MotionValue, useTransform } from 'framer-motion'
import { CheckCircle2, FileSpreadsheet, FileText, MapPin, UserRound } from 'lucide-react'
import {
  LV2_SEASON_IMPORT_ASSIGNMENT,
  LV2_SEASON_IMPORT_ATTACHMENT,
  LV2_SEASON_IMPORT_COPY,
  LV2_SEASON_IMPORT_ROWS,
  LV2_SEASON_IMPORT_SHEET,
  LV2_SEASON_IMPORT_STEPS,
} from '@/features/landing-v2/mobile-story/seasonImportClaims'
import {
  seasonImportAssignFieldsOpAt,
  seasonImportAssignOpAt,
  seasonImportEyebrowOpAt,
  seasonImportHeadlineOpAt,
  seasonImportIconOpAt,
  seasonImportPanelContainerOpAt,
  seasonImportPanelsYAt,
  seasonImportPdfOpAt,
  seasonImportProcessOpAt,
  seasonImportReadyOpAt,
  seasonImportRevealYAt,
  seasonImportRowSelectAt,
  seasonImportSheetOpAt,
  seasonImportSupportOpAt,
} from '@/features/landing-v2/mobile-story/seasonImportProgress'
import { SeasonImportPdfBadge } from '@/features/landing-v2/mobile-story/SeasonImportPdfBadge'
import styles from './StudioImportReveal.module.css'

type Props = {
  progress: MotionValue<number>
}

/** Hard paint kill — opacity:0 alone can leave Safari compositor ghosts. */
function paintVisibility(opacity: number): 'hidden' | 'visible' {
  return opacity < 0.02 ? 'hidden' : 'visible'
}

function ClientMark() {
  return <UserRound className={styles.mark} aria-hidden strokeWidth={1.4} />
}

const GRID_FIELDS = LV2_SEASON_IMPORT_ASSIGNMENT.fields.slice(0, 4)
const DETAIL_FIELDS = LV2_SEASON_IMPORT_ASSIGNMENT.fields.slice(4)

/**
 * Centered Import hero + premium two-panel product visualization.
 * No 2027 morph — spreadsheet and assignment are sibling sales visuals.
 */
export function StudioImportReveal({ progress }: Props) {
  const iconOp = useTransform(progress, (p) => seasonImportIconOpAt(p))
  const iconY = useTransform(progress, (p) => {
    const op = seasonImportIconOpAt(p)
    return op < 0.02 ? 0 : seasonImportRevealYAt(op)
  })
  const iconVis = useTransform(iconOp, (o) => paintVisibility(Number(o)))

  const eyebrowOp = useTransform(progress, (p) => seasonImportEyebrowOpAt(p))
  const eyebrowY = useTransform(progress, (p) => {
    const op = seasonImportEyebrowOpAt(p)
    return op < 0.02 ? 0 : seasonImportRevealYAt(op)
  })
  const eyebrowVis = useTransform(eyebrowOp, (o) => paintVisibility(Number(o)))

  const headlineOp = useTransform(progress, (p) => seasonImportHeadlineOpAt(p))
  const headlineY = useTransform(progress, (p) => {
    const op = seasonImportHeadlineOpAt(p)
    return op < 0.02 ? 0 : seasonImportRevealYAt(op)
  })
  const headlineVis = useTransform(headlineOp, (o) => paintVisibility(Number(o)))

  const supportOp = useTransform(progress, (p) => seasonImportSupportOpAt(p))
  const supportY = useTransform(progress, (p) => {
    const op = seasonImportSupportOpAt(p)
    return op < 0.02 ? 0 : seasonImportRevealYAt(op)
  })
  const supportVis = useTransform(supportOp, (o) => paintVisibility(Number(o)))

  const processOp = useTransform(progress, (p) => seasonImportProcessOpAt(p))
  const processY = useTransform(progress, (p) => {
    const op = seasonImportProcessOpAt(p)
    return op < 0.02 ? 0 : seasonImportRevealYAt(op)
  })
  const processVis = useTransform(processOp, (o) => paintVisibility(Number(o)))

  const panelsOp = useTransform(progress, (p) => seasonImportPanelContainerOpAt(p))
  const panelsY = useTransform(progress, (p) => {
    const op = seasonImportPanelContainerOpAt(p)
    return op < 0.02 ? 0 : seasonImportPanelsYAt(op)
  })
  const panelsVis = useTransform(panelsOp, (o) => paintVisibility(Number(o)))

  const sheetOp = useTransform(progress, (p) => seasonImportSheetOpAt(p))
  const sheetVis = useTransform(sheetOp, (o) => paintVisibility(Number(o)))

  const rowSelect = useTransform(progress, (p) => seasonImportRowSelectAt(p))
  const rowSelectBg = useTransform(rowSelect, (t) => {
    const v = Number(t)
    return `color-mix(in srgb, var(--import-ink) ${Math.round(v * 5.5)}%, transparent)`
  })
  const rowSelectBar = useTransform(rowSelect, (t) => {
    const v = Number(t)
    return `inset 2px 0 0 color-mix(in srgb, var(--import-ink) ${Math.round(v * 55)}%, transparent)`
  })

  const pdfOp = useTransform(progress, (p) => seasonImportPdfOpAt(p))
  const pdfY = useTransform(progress, (p) => {
    const op = seasonImportPdfOpAt(p)
    return op < 0.02 ? 0 : (1 - op) * 10
  })
  const pdfVis = useTransform(pdfOp, (o) => paintVisibility(Number(o)))

  const assignOp = useTransform(progress, (p) => seasonImportAssignOpAt(p))
  const assignY = useTransform(progress, (p) => {
    const op = seasonImportAssignOpAt(p)
    return op < 0.02 ? 0 : (1 - op) * 20
  })
  const assignVis = useTransform(assignOp, (o) => paintVisibility(Number(o)))

  const fieldsOp = useTransform(progress, (p) => seasonImportAssignFieldsOpAt(p))
  const fieldsVis = useTransform(fieldsOp, (o) => paintVisibility(Number(o)))

  const readyOp = useTransform(progress, (p) => seasonImportReadyOpAt(p))
  const readyY = useTransform(progress, (p) => {
    const op = seasonImportReadyOpAt(p)
    return op < 0.02 ? 0 : (1 - op) * 10
  })
  const readyVis = useTransform(readyOp, (o) => paintVisibility(Number(o)))

  return (
    <div className={styles.root} data-studio-import="" data-studio-import-owner="mobile">
      <div className={styles.hero}>
        <div className={styles.heroLead} data-lv2-import-hero="">
          <motion.div
            className={styles.iconWrap}
            data-studio-import-icon=""
            style={{ opacity: iconOp, y: iconY, visibility: iconVis }}
            aria-hidden
          >
            <FileSpreadsheet className={styles.icon} strokeWidth={1.5} />
          </motion.div>

          <motion.p
            className={styles.eyebrow}
            data-studio-import-eyebrow=""
            style={{ opacity: eyebrowOp, y: eyebrowY, visibility: eyebrowVis }}
          >
            {LV2_SEASON_IMPORT_COPY.eyebrow}
          </motion.p>

          <motion.h2
            id="lv2-studio-import-heading"
            className={styles.headline}
            data-studio-import-headline=""
            style={{ opacity: headlineOp, y: headlineY, visibility: headlineVis }}
          >
            <span className={styles.line}>{LV2_SEASON_IMPORT_COPY.headlineLine1}</span>
            <span className={styles.line}>{LV2_SEASON_IMPORT_COPY.headlineLine2}</span>
          </motion.h2>

          <motion.p
            className={styles.support}
            data-studio-import-support=""
            style={{ opacity: supportOp, y: supportY, visibility: supportVis }}
          >
            {LV2_SEASON_IMPORT_COPY.support}
          </motion.p>
        </div>

        <motion.ol
          className={styles.process}
          data-studio-import-process=""
          aria-label="Kroki importu"
          style={{ opacity: processOp, y: processY, visibility: processVis }}
        >
          {LV2_SEASON_IMPORT_STEPS.map((step, i) => (
            <li key={step}>
              <span className={styles.stepIndex}>{i + 1}</span>
              <span className={styles.stepLabel}>{step}</span>
              {i < LV2_SEASON_IMPORT_STEPS.length - 1 ? (
                <span className={styles.stepArrow} aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          ))}
        </motion.ol>
      </div>

      <motion.div
        className={styles.panels}
        data-studio-import-panels=""
        data-import-workspace=""
        style={{ opacity: panelsOp, y: panelsY, visibility: panelsVis }}
      >
        <motion.article
          className={styles.sheet}
          data-import-panel="sheet"
          style={{ opacity: sheetOp, visibility: sheetVis }}
        >
          <header className={styles.sheetHead}>
            <div className={styles.sheetIdentity}>
              <span className={styles.sheetGlyph} aria-hidden>
                <FileSpreadsheet strokeWidth={1.5} />
              </span>
              <div>
                <p className={styles.surfaceEyebrow}>{LV2_SEASON_IMPORT_SHEET.label}</p>
                <p className={styles.sheetTitle}>{LV2_SEASON_IMPORT_SHEET.filename}</p>
              </div>
            </div>
            <p className={styles.sheetStatus}>{LV2_SEASON_IMPORT_SHEET.status}</p>
          </header>

          <div className={styles.table} role="table" aria-label="Podgląd arkusza">
            <div className={styles.tableHead} role="row">
              {LV2_SEASON_IMPORT_SHEET.columns.map((col) => (
                <span key={col} role="columnheader">
                  {col}
                </span>
              ))}
            </div>
            {LV2_SEASON_IMPORT_ROWS.map((row) =>
              row.selected ? (
                <motion.div
                  key={row.id}
                  className={styles.tableRow}
                  role="row"
                  data-selected="true"
                  style={{ backgroundColor: rowSelectBg, boxShadow: rowSelectBar }}
                >
                  <strong role="cell" className={styles.coupleCell}>
                    <ClientMark />
                    {row.couple}
                  </strong>
                  <span role="cell">{row.date}</span>
                  <span role="cell">{row.packageName}</span>
                  <span role="cell">{row.value}</span>
                </motion.div>
              ) : (
                <div key={row.id} className={styles.tableRow} role="row" data-selected="false">
                  <strong role="cell" className={styles.coupleCell}>
                    <ClientMark />
                    {row.couple}
                  </strong>
                  <span role="cell">{row.date}</span>
                  <span role="cell">{row.packageName}</span>
                  <span role="cell">{row.value}</span>
                </div>
              ),
            )}
          </div>

          <motion.div
            className={styles.attachment}
            data-studio-import-pdf=""
            style={{ opacity: pdfOp, y: pdfY, visibility: pdfVis }}
          >
            <p className={styles.attachmentLabel}>Powiązany dokument</p>
            <div className={styles.attachmentBody}>
              <SeasonImportPdfBadge />
              <div className={styles.attachmentMeta}>
                <strong>{LV2_SEASON_IMPORT_ATTACHMENT.filename}</strong>
                <span>{LV2_SEASON_IMPORT_ATTACHMENT.note}</span>
              </div>
            </div>
          </motion.div>
        </motion.article>

        <motion.article
          className={styles.assignment}
          data-import-panel="result"
          style={{ opacity: assignOp, y: assignY, visibility: assignVis }}
        >
          <header className={styles.assignHead}>
            <p className={styles.surfaceEyebrow}>{LV2_SEASON_IMPORT_ASSIGNMENT.eyebrow}</p>
            <p className={styles.assignTitle}>{LV2_SEASON_IMPORT_ASSIGNMENT.couple}</p>
          </header>

          <motion.div
            className={styles.fieldsBlock}
            data-studio-import-fields=""
            style={{ opacity: fieldsOp, visibility: fieldsVis }}
          >
            <dl className={styles.meta}>
              {GRID_FIELDS.map((field) => (
                <div key={field.label} className={styles.metaChip}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>

            <ul className={styles.details}>
              {DETAIL_FIELDS.map((field) => (
                <li key={field.label}>
                  <span className={styles.detailIcon} aria-hidden>
                    {field.label === 'Lokalizacja' ? (
                      <MapPin strokeWidth={1.5} />
                    ) : (
                      <FileText strokeWidth={1.5} />
                    )}
                  </span>
                  <div>
                    <span className={styles.detailLabel}>{field.label}</span>
                    <strong className={styles.detailValue}>{field.value}</strong>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            className={styles.readyBlock}
            data-studio-import-ready=""
            style={{ opacity: readyOp, y: readyY, visibility: readyVis }}
          >
            <p className={styles.readyStatus} data-status="ready">
              <CheckCircle2 className={styles.readyIcon} aria-hidden strokeWidth={1.6} />
              {LV2_SEASON_IMPORT_ASSIGNMENT.status}
            </p>
            <button type="button" className={styles.cta} tabIndex={-1}>
              {LV2_SEASON_IMPORT_ASSIGNMENT.cta}
            </button>
          </motion.div>
        </motion.article>
      </motion.div>
    </div>
  )
}
