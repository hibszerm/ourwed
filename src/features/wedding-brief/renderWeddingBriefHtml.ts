/**
 * Neutral Classic-inspired HTML template for Wedding Brief PDF (A4).
 * No app theme inheritance. No QR. No History/Activity.
 */

import type { WeddingBriefPdfData } from '@/features/wedding-brief/types'
import { formatCurrency } from '@/lib/utils/currency'

function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nl2br(value: string): string {
  return esc(value).replace(/\r\n|\n|\r/g, '<br/>')
}

const CSS = `
@page {
  size: A4 portrait;
  margin: 14mm 14mm 18mm 14mm;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: "Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif;
  font-size: 10.5pt;
  line-height: 1.45;
  color: #141414;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.doc-label {
  font-size: 9pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6b6b6b;
  margin: 0 0 4px;
}
.doc-brand {
  font-size: 11pt;
  font-weight: 650;
  letter-spacing: 0.02em;
  margin: 0 0 18px;
  color: #0a0a0a;
}
h1 {
  font-size: 22pt;
  font-weight: 650;
  letter-spacing: -0.02em;
  margin: 0 0 6px;
  line-height: 1.15;
  color: #0a0a0a;
}
.meta {
  font-size: 11pt;
  color: #3f3f3f;
  margin: 0 0 4px;
}
.meta-sub {
  font-size: 9.5pt;
  color: #6b6b6b;
  margin: 0 0 16px;
}
.notice {
  font-size: 8.5pt;
  color: #6b6b6b;
  margin: 0 0 18px;
  padding: 8px 10px;
  background: #f6f6f6;
  border: 1px solid #ececec;
  border-radius: 4px;
}
.section {
  margin: 0 0 16px;
}
.section-title {
  font-size: 9pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #0a0a0a;
  border-bottom: 1px solid #e6e6e6;
  padding-bottom: 4px;
  margin: 0 0 10px;
  font-weight: 650;
}
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}
.summary-item label {
  display: block;
  font-size: 8pt;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6b6b6b;
  margin-bottom: 2px;
}
.summary-item div {
  font-size: 10.5pt;
  color: #141414;
}
.warning {
  background: #f7f3ea;
  border: 1px solid #e6dcc8;
  border-radius: 4px;
  padding: 10px 12px;
  margin: 0 0 16px;
  break-inside: avoid;
}
.warning-label {
  font-size: 8pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
  color: #5c4a2a;
  margin: 0 0 4px;
}
.warning p {
  margin: 0;
  color: #2a2418;
  font-size: 10.5pt;
}
.timeline {
  margin: 0;
  padding: 0;
  list-style: none;
}
.timeline-item {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid #f0f0f0;
  break-inside: avoid;
}
.timeline-time {
  font-weight: 700;
  font-size: 11pt;
  color: #0a0a0a;
  font-variant-numeric: tabular-nums;
}
.timeline-title {
  font-weight: 600;
  margin: 0 0 2px;
}
.timeline-meta {
  font-size: 9pt;
  color: #5c5c5c;
  margin: 0;
}
.card {
  border: 1px solid #ececec;
  border-radius: 4px;
  padding: 10px 12px;
  margin: 0 0 8px;
  background: #fafafa;
  break-inside: avoid;
}
.card-role {
  font-size: 8pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b6b6b;
  margin: 0 0 4px;
}
.card-name {
  font-weight: 650;
  font-size: 11pt;
  margin: 0 0 2px;
}
.card-address {
  margin: 0;
  white-space: pre-line;
  color: #2a2a2a;
}
.card-coords {
  margin: 4px 0 0;
  font-size: 9pt;
  color: #6b6b6b;
  font-variant-numeric: tabular-nums;
}
.contact-row {
  display: grid;
  grid-template-columns: 1.1fr 1fr 1fr;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid #f0f0f0;
  break-inside: avoid;
}
.contact-role {
  font-size: 8.5pt;
  color: #6b6b6b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.qa {
  margin: 0 0 10px;
  break-inside: avoid;
}
.qa-label {
  font-size: 9pt;
  font-weight: 650;
  color: #0a0a0a;
  margin: 0 0 2px;
}
.qa-value {
  margin: 0;
  color: #2a2a2a;
  white-space: pre-wrap;
}
.qa-value.long {
  line-height: 1.5;
}
.subsection {
  margin: 14px 0 8px;
  font-size: 10.5pt;
  font-weight: 650;
}
.settlement {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
}
.settlement div span {
  display: block;
  font-size: 8pt;
  color: #6b6b6b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.muted {
  color: #6b6b6b;
  font-size: 9.5pt;
}
.footer-space {
  height: 8px;
}
`

function renderTimeline(data: WeddingBriefPdfData): string {
  if (!data.timeline.length) {
    return data.missingOperational?.includes('Brak uzupełnionego planu dnia.')
      ? `<section class="section"><h2 class="section-title">Plan dnia</h2><p class="muted">Brak uzupełnionego planu dnia.</p></section>`
      : ''
  }
  const items = data.timeline
    .map(
      (item) => `
      <li class="timeline-item">
        <div class="timeline-time">${esc(item.time)}</div>
        <div>
          <p class="timeline-title">${esc(item.title)}</p>
          ${
            item.location || item.address || item.note
              ? `<p class="timeline-meta">${esc(
                  [item.location, item.address, item.note]
                    .filter(Boolean)
                    .join(' · '),
                )}</p>`
              : ''
          }
        </div>
      </li>`,
    )
    .join('')
  return `<section class="section"><h2 class="section-title">Plan dnia</h2><ul class="timeline">${items}</ul></section>`
}

function renderLocations(data: WeddingBriefPdfData): string {
  if (!data.locations.length) return ''
  const cards = data.locations
    .map((loc) => {
      const coords =
        loc.latitude != null && loc.longitude != null
          ? `<p class="card-coords">Współrzędne: ${esc(String(loc.latitude))}, ${esc(String(loc.longitude))}</p>`
          : ''
      return `
      <article class="card">
        <p class="card-role">${esc(loc.role)}</p>
        ${loc.name ? `<p class="card-name">${esc(loc.name)}</p>` : ''}
        <p class="card-address">${nl2br(loc.address)}</p>
        ${coords}
        ${loc.note ? `<p class="timeline-meta">${esc(loc.note)}</p>` : ''}
      </article>`
    })
    .join('')
  return `<section class="section"><h2 class="section-title">Lokalizacje</h2>${cards}</section>`
}

function renderContacts(data: WeddingBriefPdfData): string {
  if (!data.contacts.length) return ''
  const rows = data.contacts
    .map(
      (c) => `
    <div class="contact-row">
      <div>
        <div class="contact-role">${esc(c.role)}</div>
        <strong>${esc(c.name)}</strong>
      </div>
      <div>${esc(c.phone || '—')}</div>
      <div>${esc(c.email || '—')}</div>
    </div>`,
    )
    .join('')
  return `<section class="section"><h2 class="section-title">Kontakty</h2>${rows}</section>`
}

function renderNotes(data: WeddingBriefPdfData): string {
  if (!data.importantNotes.length) return ''
  const critical = data.importantNotes.filter((n) => n.critical)
  const rest = data.importantNotes.filter((n) => !n.critical)
  const strip = (content: string) => content.replace(/^WAŻNE:\s*/i, '')
  const blocks = [
    ...critical.map(
      (n) => `
      <div class="warning">
        <p class="warning-label">${esc(n.label || 'WAŻNE')}</p>
        <p>${nl2br(strip(n.content))}</p>
      </div>`,
    ),
    ...rest.map(
      (n) => `
      <article class="card"><p class="card-address">${nl2br(strip(n.content))}</p></article>`,
    ),
  ].join('')
  return `<section class="section"><h2 class="section-title">Ważne uwagi</h2>${blocks}</section>`
}

function renderQuestionnaire(
  title: string,
  sections: NonNullable<WeddingBriefPdfData['questionnaire']>['sections'],
  submittedAt?: string,
): string {
  if (!sections.length) return ''
  const body = sections
    .map((section) => {
      const answers = section.answers
        .map(
          (a) => `
        <div class="qa">
          <p class="qa-label">${esc(a.label)}</p>
          <p class="qa-value${a.kind === 'long_text' ? ' long' : ''}">${nl2br(a.value)}</p>
        </div>`,
        )
        .join('')
      return `<h3 class="subsection">${esc(section.title)}</h3>${answers}`
    })
    .join('')
  return `
    <section class="section">
      <h2 class="section-title">${esc(title)}</h2>
      ${submittedAt ? `<p class="muted">Złożono: ${esc(submittedAt)}</p>` : ''}
      ${body}
    </section>`
}

function renderSettlement(data: WeddingBriefPdfData): string {
  const s = data.settlement
  if (!s) return ''
  return `
  <section class="section">
    <h2 class="section-title">Rozliczenie</h2>
    <div class="settlement">
      <div><span>Wartość zlecenia</span>${esc(formatCurrency(s.contractValue))}</div>
      <div><span>Wpłacono</span>${esc(formatCurrency(s.totalPaid))}</div>
      <div><span>Pozostało</span>${esc(formatCurrency(s.remainingToPay))}</div>
      <div><span>Termin</span>${esc(s.dueLabel || '—')}</div>
    </div>
  </section>`
}

function renderVendors(data: WeddingBriefPdfData): string {
  if (!data.vendors.length) return ''
  const rows = data.vendors
    .map(
      (v) => `
    <div class="contact-row">
      <div class="contact-role">${esc(v.role || 'Usługodawca')}</div>
      <div><strong>${esc(v.name)}</strong></div>
      <div>${esc(v.detail || '')}</div>
    </div>`,
    )
    .join('')
  return `<section class="section"><h2 class="section-title">Usługodawcy</h2>${rows}</section>`
}

function renderSessions(data: WeddingBriefPdfData): string {
  if (!data.sessions?.length) return ''
  const cards = data.sessions
    .map(
      (s) => `
    <article class="card">
      <p class="card-name">${esc(s.title)}</p>
      <p class="timeline-meta">${esc([s.date, s.time, s.location].filter(Boolean).join(' · '))}</p>
      ${s.notes ? `<p class="card-address">${nl2br(s.notes)}</p>` : ''}
    </article>`,
    )
    .join('')
  return `<section class="section"><h2 class="section-title">Sesje</h2>${cards}</section>`
}

function renderQuickSummary(data: WeddingBriefPdfData): string {
  const qs = data.quickSummary
  const contactLines = qs.keyContacts
    .slice(0, 3)
    .map((c) => `${c.name}${c.phone ? ` · ${c.phone}` : ''}`)
    .join('<br/>')
  return `
  <section class="section">
    <h2 class="section-title">Szybki przegląd</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <label>Start coverage</label>
        <div>${esc(qs.startTime || data.wedding.coverageStart || '—')}</div>
      </div>
      <div class="summary-item">
        <label>Pierwsza lokalizacja</label>
        <div>${esc(
          qs.firstLocation
            ? [qs.firstLocation.name, qs.firstLocation.address]
                .filter(Boolean)
                .join(' — ')
            : '—',
        )}</div>
      </div>
      <div class="summary-item">
        <label>Kluczowe kontakty</label>
        <div>${contactLines || '—'}</div>
      </div>
      <div class="summary-item">
        <label>Goście / pozostało</label>
        <div>${esc(
          [
            data.wedding.guestCount != null
              ? `${data.wedding.guestCount} gości`
              : null,
            qs.remainingPayment
              ? `Do zapłaty ${formatCurrency(qs.remainingPayment.remainingToPay)}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || '—',
        )}</div>
      </div>
    </div>
  </section>`
}

export function renderWeddingBriefHtml(data: WeddingBriefPdfData): string {
  const days = daysRemainingLabel(data.wedding.daysRemaining)
  const services =
    data.wedding.additionalServices.length > 0
      ? data.wedding.additionalServices.join(', ')
      : ''

  const criticalBlock = data.quickSummary.criticalNote
    ? `<div class="warning"><p class="warning-label">WAŻNE</p><p>${nl2br(
        data.quickSummary.criticalNote.replace(/^WAŻNE:\s*/i, ''),
      )}</p></div>`
    : ''

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>${esc(data.document.title)} — ${esc(data.wedding.coupleDisplayName)}</title>
  <style>${CSS}</style>
</head>
<body>
  <p class="doc-label">Brief zlecenia</p>
  <p class="doc-brand">OurWed</p>
  <h1>${esc(data.wedding.coupleDisplayName)}</h1>
  <p class="meta">${esc(data.wedding.weddingDateLabel)}${days ? ` · ${esc(days)}` : ''}</p>
  <p class="meta-sub">${esc(
    [data.wedding.packageName, services].filter(Boolean).join(' · '),
  )}</p>
  <p class="notice">Brief zawiera dane aktualne na moment wygenerowania. Wygenerowano: ${esc(data.document.generatedAtLabel)}</p>

  ${renderQuickSummary(data)}
  ${criticalBlock}
  ${renderTimeline(data)}
  ${renderLocations(data)}
  ${renderContacts(data)}
  ${renderNotes(data)}
  ${
    data.questionnaire
      ? renderQuestionnaire(
          data.questionnaire.title || 'Ankieta przedślubna',
          data.questionnaire.sections,
          data.questionnaire.submittedAt,
        )
      : ''
  }
  ${renderVendors(data)}
  ${renderSessions(data)}
  ${renderSettlement(data)}
  ${
    data.contractQuestionnaire
      ? renderQuestionnaire(
          'Dane z ankiety do umowy',
          data.contractQuestionnaire.sections,
        )
      : ''
  }
  <div class="footer-space"></div>
</body>
</html>`
}

function daysRemainingLabel(days: number | undefined): string {
  if (days == null) return ''
  if (days === 0) return 'dziś'
  if (days < 0) {
    const n = Math.abs(days)
    return `${n} ${n === 1 ? 'dzień' : 'dni'} temu`
  }
  if (days === 1) return 'za 1 dzień'
  return `za ${days} dni`
}

export function buildWeddingBriefFilename(data: WeddingBriefPdfData): string {
  const slug = data.wedding.coupleDisplayName
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź|ż/g, 'z')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  const date = data.wedding.weddingDate || 'data'
  return `brief-zlecenia-${slug || 'slub'}-${date}.pdf`
}
