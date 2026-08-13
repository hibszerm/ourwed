/**
 * Wedding Brief PDF HTML — offline field guide / call sheet.
 * Premium, quiet, operational. No questionnaire dump.
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
  margin: 12mm 12mm 16mm 12mm;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: "Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif;
  font-size: 10pt;
  line-height: 1.4;
  color: #161616;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.doc-label {
  font-size: 8pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #737373;
  margin: 0 0 2px;
}
h1 {
  font-size: 18pt;
  font-weight: 650;
  letter-spacing: -0.025em;
  margin: 0 0 4px;
  line-height: 1.15;
  color: #0a0a0a;
}
.header-meta {
  font-size: 10pt;
  color: #404040;
  margin: 0 0 2px;
}
.header-sub {
  font-size: 9pt;
  color: #737373;
  margin: 0 0 6px;
}
.snapshot {
  font-size: 8pt;
  color: #8a8a8a;
  margin: 0 0 14px;
}
.section {
  margin: 0 0 14px;
}
.section-title {
  font-size: 8pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #0a0a0a;
  border-bottom: 1px solid #e8e8e8;
  padding-bottom: 3px;
  margin: 0 0 8px;
  font-weight: 650;
}
.assignment {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 18px;
  margin: 0 0 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
}
.assignment-item label {
  display: block;
  font-size: 7.5pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a8a8a;
  margin-bottom: 1px;
}
.assignment-item div {
  font-size: 10pt;
  color: #161616;
  font-weight: 500;
}
.contacts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  break-inside: avoid;
}
.contact {
  padding: 0;
  break-inside: avoid;
}
.contact-role {
  font-size: 7.5pt;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #8a8a8a;
  margin: 0 0 2px;
}
.contact-name {
  font-weight: 650;
  font-size: 11pt;
  margin: 0 0 2px;
  color: #0a0a0a;
}
.contact-phone {
  font-size: 12pt;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: #0a0a0a;
  margin: 0;
}
.contact-email {
  font-size: 8.5pt;
  color: #737373;
  margin: 2px 0 0;
}
.timeline {
  margin: 0;
  padding: 0;
  list-style: none;
}
.timeline-item {
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid #f3f3f3;
  break-inside: avoid;
}
.timeline-item.untimed .timeline-time {
  color: #b0b0b0;
  font-weight: 500;
  font-size: 8pt;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.timeline-time {
  font-weight: 700;
  font-size: 11pt;
  color: #0a0a0a;
  font-variant-numeric: tabular-nums;
}
.timeline-title {
  font-weight: 600;
  margin: 0 0 1px;
  font-size: 10pt;
}
.timeline-meta {
  font-size: 8.5pt;
  color: #666;
  margin: 0;
}
.nie-przegap {
  background: #faf8f4;
  border: 1px solid #ebe4d6;
  border-radius: 3px;
  padding: 10px 12px;
  margin: 0 0 14px;
  break-inside: avoid;
}
.nie-przegap .section-title {
  border-bottom-color: #e4dccb;
  margin-bottom: 8px;
}
.nie-item {
  margin: 0 0 8px;
  break-inside: avoid;
}
.nie-item:last-child { margin-bottom: 0; }
.nie-label {
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #5c4a2a;
  margin: 0 0 2px;
}
.nie-body {
  margin: 0;
  font-size: 10pt;
  color: #2a2418;
  white-space: pre-wrap;
}
.loc-card {
  border: 1px solid #ececec;
  border-radius: 3px;
  padding: 8px 10px;
  margin: 0 0 7px;
  background: #fcfcfc;
  break-inside: avoid;
}
.loc-roles {
  font-size: 7.5pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a8a8a;
  margin: 0 0 3px;
}
.loc-name {
  font-weight: 650;
  font-size: 10.5pt;
  margin: 0 0 2px;
}
.loc-address {
  margin: 0;
  white-space: pre-line;
  color: #2a2a2a;
  font-size: 9.5pt;
}
.loc-coords {
  margin: 3px 0 0;
  font-size: 8.5pt;
  color: #737373;
  font-variant-numeric: tabular-nums;
}
.op-row {
  display: grid;
  grid-template-columns: 132px 1fr;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid #f5f5f5;
  break-inside: avoid;
}
.op-label {
  font-size: 9pt;
  font-weight: 650;
  color: #0a0a0a;
}
.op-value {
  margin: 0;
  color: #2a2a2a;
  white-space: pre-wrap;
  font-size: 9.5pt;
}
.vendor-row {
  padding: 4px 0;
  border-bottom: 1px solid #f5f5f5;
  break-inside: avoid;
  font-size: 9.5pt;
}
.vendor-role {
  color: #8a8a8a;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-right: 6px;
}
.settlement {
  border: 1px solid #ececec;
  border-radius: 3px;
  padding: 10px 12px;
  background: #fafafa;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
  break-inside: avoid;
}
.settlement div span {
  display: block;
  font-size: 7.5pt;
  color: #8a8a8a;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.settlement-paid {
  grid-column: 1 / -1;
  font-size: 10pt;
  color: #2a2a2a;
  margin: 0;
}
.muted {
  color: #8a8a8a;
  font-size: 9pt;
}
.footer-space { height: 6px; }
`

function daysLabel(days: number | undefined): string {
  if (days == null) return ''
  if (days === 0) return 'dziś'
  if (days === 1) return 'jutro'
  if (days > 1) return `za ${days} dni`
  if (days === -1) return 'wczoraj'
  return `${Math.abs(days)} dni temu`
}

function renderAssignment(data: WeddingBriefPdfData): string {
  const items: Array<{ label: string; value: string }> = []
  if (data.wedding.packageName?.trim()) {
    items.push({ label: 'Pakiet', value: data.wedding.packageName.trim() })
  }
  if (data.wedding.additionalServices.length) {
    items.push({
      label: 'Dodatki',
      value: data.wedding.additionalServices.join(', '),
    })
  }
  if (data.wedding.coverageStart) {
    items.push({ label: 'Start pokrycia', value: data.wedding.coverageStart })
  }
  if (data.wedding.coverageEnd) {
    items.push({ label: 'Koniec pokrycia', value: data.wedding.coverageEnd })
  }
  if (data.wedding.guestCount != null) {
    items.push({
      label: 'Liczba gości',
      value: String(data.wedding.guestCount),
    })
  }
  if (!items.length) return ''
  return `<div class="assignment">${items
    .map(
      (i) =>
        `<div class="assignment-item"><label>${esc(i.label)}</label><div>${esc(i.value)}</div></div>`,
    )
    .join('')}</div>`
}

function renderContacts(data: WeddingBriefPdfData): string {
  if (!data.contacts.length) return ''
  const cards = data.contacts
    .map((c) => {
      const phone = c.phone
        ? `<p class="contact-phone">${esc(c.phone)}</p>`
        : ''
      const email = c.email
        ? `<p class="contact-email">${esc(c.email)}</p>`
        : ''
      return `<div class="contact">
        <div class="contact-role">${esc(c.role)}</div>
        <div class="contact-name">${esc(c.name)}</div>
        ${phone}${email}
      </div>`
    })
    .join('')
  return `<section class="section"><h2 class="section-title">Kluczowe kontakty</h2><div class="contacts">${cards}</div></section>`
}

function renderTimeline(data: WeddingBriefPdfData): string {
  if (!data.timeline.length) {
    return data.missingOperational?.includes('Brak uzupełnionego planu dnia.')
      ? `<section class="section"><h2 class="section-title">Plan dnia</h2><p class="muted">Brak uzupełnionego planu dnia.</p></section>`
      : ''
  }
  const items = data.timeline
    .map((item) => {
      const meta = [item.placeName, item.shortAddress, item.context]
        .filter(Boolean)
        .join(' · ')
      const timeCell = item.time
        ? esc(item.time)
        : item.untimed
          ? '—'
          : ''
      // Use subtle dash only for untimed stages (meaningful missing clock)
      return `<li class="timeline-item${item.untimed || !item.time ? ' untimed' : ''}">
        <div class="timeline-time">${timeCell || '·'}</div>
        <div>
          <p class="timeline-title">${esc(item.title)}</p>
          ${meta ? `<p class="timeline-meta">${esc(meta)}</p>` : ''}
        </div>
      </li>`
    })
    .join('')
  return `<section class="section"><h2 class="section-title">Plan dnia</h2><ul class="timeline">${items}</ul></section>`
}

function renderCritical(data: WeddingBriefPdfData): string {
  if (!data.criticalNotes.length) return ''
  const body = data.criticalNotes
    .map(
      (n) => `<div class="nie-item">
      <div class="nie-label">${esc(n.label)}</div>
      <p class="nie-body">${nl2br(n.content)}</p>
    </div>`,
    )
    .join('')
  return `<section class="nie-przegap"><h2 class="section-title">Nie przegap</h2>${body}</section>`
}

function renderLocations(data: WeddingBriefPdfData): string {
  if (!data.locations.length) return ''
  const cards = data.locations
    .map((loc) => {
      const roles = (loc.roles?.length ? loc.roles : []).join(' · ')
      const coords =
        loc.latitude != null && loc.longitude != null
          ? `<p class="loc-coords">${esc(
              `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}`,
            )}</p>`
          : ''
      const name =
        loc.name && loc.name !== loc.address
          ? `<div class="loc-name">${esc(loc.name)}</div>`
          : ''
      return `<div class="loc-card">
        ${roles ? `<div class="loc-roles">${esc(roles)}</div>` : ''}
        ${name}
        <p class="loc-address">${esc(loc.address || loc.name || '')}</p>
        ${coords}
      </div>`
    })
    .join('')
  return `<section class="section"><h2 class="section-title">Lokalizacje</h2>${cards}</section>`
}

function renderOperational(data: WeddingBriefPdfData): string {
  if (!data.operationalSections.length) return ''
  return data.operationalSections
    .map((sec) => {
      const rows = sec.items
        .map(
          (item) => `<div class="op-row">
          <div class="op-label">${esc(item.label)}</div>
          <p class="op-value">${nl2br(item.value)}</p>
        </div>`,
        )
        .join('')
      return `<section class="section"><h2 class="section-title">${esc(sec.title)}</h2>${rows}</section>`
    })
    .join('')
}

function renderVendors(data: WeddingBriefPdfData): string {
  if (!data.vendors.length) return ''
  const rows = data.vendors
    .map((v) => {
      const role = v.role
        ? `<span class="vendor-role">${esc(v.role)}</span>`
        : ''
      return `<div class="vendor-row">${role}<strong>${esc(v.name)}</strong>${
        v.detail ? ` — ${esc(v.detail)}` : ''
      }</div>`
    })
    .join('')
  return `<section class="section"><h2 class="section-title">Usługodawcy</h2>${rows}</section>`
}

function renderSessions(data: WeddingBriefPdfData): string {
  if (!data.sessions?.length) return ''
  const rows = data.sessions
    .map((s) => {
      const meta = [s.date, s.time, s.location].filter(Boolean).join(' · ')
      return `<div class="op-row">
        <div class="op-label">${esc(s.title)}</div>
        <p class="op-value">${esc(meta)}${
          s.notes ? `<br/>${nl2br(s.notes)}` : ''
        }</p>
      </div>`
    })
    .join('')
  return `<section class="section"><h2 class="section-title">Sesje</h2>${rows}</section>`
}

function renderAdditional(data: WeddingBriefPdfData): string {
  if (!data.additionalOperational.length) return ''
  const rows = data.additionalOperational
    .map(
      (item) => `<div class="op-row">
      <div class="op-label">${esc(item.label)}</div>
      <p class="op-value">${nl2br(item.value)}</p>
    </div>`,
    )
    .join('')
  return `<section class="section"><h2 class="section-title">Dodatkowe informacje</h2>${rows}</section>`
}

function renderSettlement(data: WeddingBriefPdfData): string {
  const s = data.settlement
  if (!s) return ''
  if (s.settled || s.remainingToPay <= 0) {
    return `<section class="section"><h2 class="section-title">Rozliczenie</h2>
      <div class="settlement">
        <div><span>Wartość zlecenia</span>${esc(formatCurrency(s.contractValue))}</div>
        ${
          s.travelFeeLabel
            ? `<div><span>Dojazd</span>${esc(s.travelFeeLabel)}</div>`
            : ''
        }
        <div><span>Wpłacono</span>${esc(formatCurrency(s.totalPaid))}</div>
        <p class="settlement-paid">Rozliczenie uregulowane.</p>
      </div></section>`
  }
  return `<section class="section"><h2 class="section-title">Rozliczenie</h2>
    <div class="settlement">
      <div><span>Wartość zlecenia</span>${esc(formatCurrency(s.contractValue))}</div>
      ${
        s.travelFeeLabel
          ? `<div><span>Dojazd</span>${esc(s.travelFeeLabel)}</div>`
          : ''
      }
      <div><span>Wpłacono</span>${esc(formatCurrency(s.totalPaid))}</div>
      <div><span>Pozostało</span>${esc(formatCurrency(s.remainingToPay))}</div>
      ${
        s.dueLabel
          ? `<div><span>Termin</span>${esc(s.dueLabel)}</div>`
          : ''
      }
    </div></section>`
}

export function renderWeddingBriefHtml(data: WeddingBriefPdfData): string {
  const relative = daysLabel(data.wedding.daysRemaining)
  const dateLine = [data.wedding.weddingDateLabel, relative]
    .filter(Boolean)
    .join(' · ')

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8"/>
<title>${esc(data.document.title)} — ${esc(data.wedding.coupleDisplayName)}</title>
<style>${CSS}</style>
</head>
<body>
  <p class="doc-label">${esc(data.document.title)}</p>
  <h1>${esc(data.wedding.coupleDisplayName)}</h1>
  <p class="header-meta">${esc(dateLine)}</p>
  <p class="snapshot">Dane aktualne na moment wygenerowania · ${esc(data.document.generatedAtLabel)}</p>

  ${renderAssignment(data)}
  ${renderContacts(data)}
  ${renderTimeline(data)}
  ${renderCritical(data)}
  ${renderLocations(data)}
  ${renderOperational(data)}
  ${renderVendors(data)}
  ${renderSessions(data)}
  ${renderAdditional(data)}
  ${renderSettlement(data)}
  <div class="footer-space"></div>
</body>
</html>`
}

export function buildWeddingBriefFilename(data: WeddingBriefPdfData): string {
  const slug = data.wedding.coupleDisplayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  const date = data.wedding.weddingDate || 'brief'
  return `brief-${slug || 'zlecenie'}-${date}.pdf`
}
