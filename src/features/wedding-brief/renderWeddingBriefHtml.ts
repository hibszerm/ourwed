/**
 * Wedding Brief PDF HTML — offline field guide / call sheet.
 * Stable operational overview + dynamic questionnaire sections.
 * V1.1: editorial typography, location presentation dedupe, pagination polish.
 * PDF engine/API frozen.
 */

import {
  normalizeBriefWhitespace,
  textsSemanticallyEqual,
} from '@/features/wedding-brief/briefNormalize'
import type {
  BriefLocation,
  BriefTimelineItem,
  WeddingBriefPdfData,
} from '@/features/wedding-brief/types'
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

/**
 * Presentation-only: hide standard places already shown on Plan dnia.
 * Does not mutate wedding_places or timeline business logic.
 */
export function selectLocationsForBriefDirectory(
  locations: BriefLocation[],
  timeline: BriefTimelineItem[],
): BriefLocation[] {
  if (!locations.length) return []
  if (!timeline.length) return locations

  const timelineTokens: string[] = []
  for (const item of timeline) {
    const name = normalizeBriefWhitespace(item.placeName || '')
    const addr = normalizeBriefWhitespace(item.shortAddress || '')
    if (name) timelineTokens.push(name)
    if (addr) timelineTokens.push(addr)
  }
  if (!timelineTokens.length) return locations

  return locations.filter((loc) => {
    const name = normalizeBriefWhitespace(loc.name || '')
    const addr = normalizeBriefWhitespace(loc.address || '')
    const represented = timelineTokens.some(
      (tok) =>
        (name && textsSemanticallyEqual(name, tok)) ||
        (addr && textsSemanticallyEqual(addr, tok)) ||
        (name && textsSemanticallyEqual(addr, tok)) ||
        (addr && textsSemanticallyEqual(name, tok)),
    )
    return !represented
  })
}

const CSS = `
@page {
  size: A4 portrait;
  margin: 11mm 12mm 15mm 12mm;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: "Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif;
  font-size: 10pt;
  line-height: 1.45;
  color: #161616;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  word-wrap: break-word;
  overflow-wrap: anywhere;
}
.doc-label {
  font-size: 7.5pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8a8a8a;
  margin: 0 0 2px;
}
h1 {
  font-size: 18pt;
  font-weight: 650;
  letter-spacing: -0.025em;
  margin: 0 0 3px;
  line-height: 1.15;
  color: #0a0a0a;
}
.header-meta {
  font-size: 10pt;
  color: #404040;
  margin: 0 0 2px;
}
.snapshot {
  font-size: 8pt;
  color: #9a9a9a;
  margin: 0 0 12px;
}
.section {
  margin: 0 0 14px;
}
.section-title {
  font-size: 8pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #0a0a0a;
  margin: 0 0 8px;
  padding: 0;
  border: 0;
  font-weight: 650;
  break-after: avoid;
  page-break-after: avoid;
}
.assignment {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 18px;
  margin: 0 0 14px;
}
.assignment-item label {
  display: block;
  font-size: 7pt;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9a9a9a;
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
  page-break-inside: avoid;
}
.contact {
  padding: 0;
  break-inside: avoid;
}
.contact-role {
  font-size: 7pt;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9a9a9a;
  margin: 0 0 2px;
}
.contact-name {
  font-weight: 650;
  font-size: 11pt;
  margin: 0 0 1px;
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
  grid-template-columns: 46px 1fr;
  gap: 10px;
  padding: 5px 0;
  border: 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
.timeline-item.untimed .timeline-time {
  color: #c0c0c0;
  font-weight: 500;
  font-size: 8pt;
}
.timeline-time {
  font-weight: 700;
  font-size: 11.5pt;
  color: #0a0a0a;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.timeline-title {
  font-weight: 600;
  margin: 0 0 1px;
  font-size: 10pt;
  color: #0a0a0a;
}
.timeline-meta {
  font-size: 8.5pt;
  color: #737373;
  margin: 0;
}
.timeline-travel {
  grid-column: 1 / -1;
  margin: 2px 0 1px;
  padding: 0 0 0 46px;
  font-size: 7.5pt;
  font-weight: 500;
  color: #9a9a9a;
  letter-spacing: 0.02em;
  line-height: 1.3;
}
.timeline-item.has-travel {
  padding-top: 8px;
}
.nie-przegap {
  background: #faf8f4;
  border: 1px solid #ebe4d6;
  border-radius: 3px;
  padding: 9px 11px;
  margin: 0 0 14px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.nie-przegap .section-title {
  margin-bottom: 6px;
  color: #5c4a2a;
  letter-spacing: 0.1em;
}
.nie-item {
  margin: 0 0 7px;
  break-inside: avoid;
}
.nie-item:last-child { margin-bottom: 0; }
.nie-label {
  font-size: 7.5pt;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #7a6540;
  margin: 0 0 2px;
}
.nie-body {
  margin: 0;
  font-size: 10pt;
  color: #2a2418;
  white-space: pre-wrap;
  line-height: 1.4;
}
.loc-card {
  padding: 4px 0 6px;
  margin: 0;
  border: 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
.loc-roles {
  font-size: 7pt;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9a9a9a;
  margin: 0 0 1px;
}
.loc-name {
  font-weight: 650;
  font-size: 10pt;
  margin: 0 0 1px;
}
.loc-address {
  margin: 0;
  white-space: pre-line;
  color: #404040;
  font-size: 9pt;
}
.meta-block {
  margin: 10px 0 0;
  /* Allow many vendors/sessions to split; individual rows stay together. */
  break-inside: auto;
  page-break-inside: auto;
}
.meta-block .section-title {
  color: #9a9a9a;
  font-weight: 600;
  letter-spacing: 0.1em;
  margin-bottom: 6px;
  break-after: avoid;
  page-break-after: avoid;
}
.vendor-row {
  padding: 0 0 7px;
  border: 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
.vendor-row:last-child { padding-bottom: 0; }
.vendor-role {
  display: block;
  color: #9a9a9a;
  font-size: 7pt;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 1px;
}
.vendor-name {
  display: block;
  font-size: 10pt;
  font-weight: 550;
  color: #0a0a0a;
  line-height: 1.35;
}
.detail-layer {
  margin-top: 4px;
  padding-top: 8px;
}
.q-section {
  margin: 0 0 12px;
}
.q-section-start {
  break-inside: avoid;
  page-break-inside: avoid;
}
/* Compact sections (few short answers): keep whole section together. */
.q-section-compact {
  break-inside: avoid;
  page-break-inside: avoid;
}
.q-section-compact .q-section-keep {
  break-inside: avoid;
  page-break-inside: avoid;
}
.q-section-title {
  font-size: 10.5pt;
  font-weight: 650;
  letter-spacing: -0.01em;
  text-transform: none;
  color: #0a0a0a;
  margin: 0 0 7px;
  padding: 0;
  border: 0;
  break-after: avoid;
  page-break-after: avoid;
}
.q-item {
  margin: 0 0 7px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.q-item.q-long {
  margin: 0 0 10px;
  break-inside: auto;
  page-break-inside: auto;
}
.q-item.q-long .q-label {
  break-after: avoid;
  page-break-after: avoid;
}
.q-label {
  display: block;
  font-size: 7.5pt;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: #8f8f8f;
  margin: 0 0 2px;
  break-after: avoid;
  page-break-after: avoid;
}
.q-value {
  margin: 0;
  font-size: 10.5pt;
  font-weight: 500;
  color: #0a0a0a;
  white-space: pre-wrap;
  line-height: 1.42;
}
.settlement-meta {
  margin: 8px 0 0;
  padding: 0;
  border: 0;
  break-before: auto;
  page-break-before: auto;
  break-inside: avoid;
  page-break-inside: avoid;
}
.settlement-meta .section-title {
  font-size: 6.5pt;
  letter-spacing: 0.14em;
  color: #b0b0b0;
  font-weight: 600;
  margin-bottom: 3px;
  text-transform: uppercase;
}
.settlement {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1px 10px;
  font-size: 8pt;
  color: #6a6a6a;
  max-width: 280px;
}
.settlement div {
  display: contents;
}
.settlement div span {
  display: block;
  font-size: 6.5pt;
  color: #b0b0b0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 0;
}
.settlement div b {
  display: block;
  font-weight: 500;
  font-size: 8pt;
  color: #595959;
  text-align: right;
  padding: 1px 0;
}
.settlement-paid {
  grid-column: 1 / -1;
  font-size: 8pt;
  color: #6a6a6a;
  margin: 2px 0 0;
  font-weight: 500;
}
.muted {
  color: #8a8a8a;
  font-size: 9pt;
}
.footer-space { height: 4px; }
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

function formatBriefTravelDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  const rounded = Math.round(km * 10) / 10
  if (Number.isInteger(rounded)) return `${rounded} km`
  return `${rounded.toFixed(1).replace('.', ',')} km`
}

function formatBriefTravelDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const totalMin = Math.max(0, Math.round(seconds / 60))
  if (totalMin < 60) return `ok. ${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `ok. ${h} godz. ${m} min` : `ok. ${h} godz.`
}

function formatBriefTravelConnector(travel: {
  distanceMeters: number
  durationSeconds: number
}): string {
  const dist = formatBriefTravelDistance(travel.distanceMeters)
  const dur = formatBriefTravelDuration(travel.durationSeconds)
  return [dist, dur].filter(Boolean).join(' · ')
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
      const travelLabel = item.travelFromPrevious
        ? formatBriefTravelConnector(item.travelFromPrevious)
        : ''
      const travel = travelLabel
        ? `<div class="timeline-travel">${esc(travelLabel)}</div>`
        : ''
      const hasTravel = travel ? ' has-travel' : ''
      return `<li class="timeline-item${hasTravel}${item.untimed || !item.time ? ' untimed' : ''}">
        ${travel}
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

function renderLocations(
  locations: BriefLocation[],
  timeline: BriefTimelineItem[],
): string {
  const extra = selectLocationsForBriefDirectory(locations, timeline)
  if (!extra.length) return ''
  const cards = extra
    .map((loc) => {
      const roles = (loc.roles?.length ? loc.roles : []).join(' · ')
      const name =
        loc.name && loc.name !== loc.address
          ? `<div class="loc-name">${esc(loc.name)}</div>`
          : ''
      return `<div class="loc-card">
        ${roles ? `<div class="loc-roles">${esc(roles)}</div>` : ''}
        ${name}
        <p class="loc-address">${esc(loc.address || loc.name || '')}</p>
      </div>`
    })
    .join('')
  return `<section class="section"><h2 class="section-title">Dodatkowe lokalizacje</h2>${cards}</section>`
}

/**
 * Compact questionnaire section: few short answers — keep whole section together.
 * Large / long-text sections remain splittable (heading+first only).
 */
export function isCompactQuestionnaireSection(
  items: Array<{ type: string; displayValue: string }>,
): boolean {
  if (items.length === 0 || items.length > 4) return false
  return items.every(
    (i) => i.type !== 'long_text' && i.displayValue.length <= 180,
  )
}

function renderQuestionnaireSections(data: WeddingBriefPdfData): string {
  if (!data.questionnaireSections?.length) return ''
  const body = data.questionnaireSections
    .map((sec) => {
      if (!sec.items.length) return ''
      const compact = isCompactQuestionnaireSection(sec.items)
      const renderItem = (item: (typeof sec.items)[number]) => {
        const long =
          item.type === 'long_text' || item.displayValue.length > 180
        return `<div class="q-item${long ? ' q-long' : ''}" data-question-id="${esc(item.questionId)}">
            <span class="q-label">${esc(item.label)}</span>
            <p class="q-value">${nl2br(item.displayValue)}</p>
          </div>`
      }
      const title = sec.title
        ? `<h2 class="q-section-title">${esc(sec.title)}</h2>`
        : ''
      const compactClass = compact ? ' q-section-compact' : ''
      if (compact) {
        const all = sec.items.map(renderItem).join('')
        return `<section class="q-section${compactClass}" data-section-id="${esc(sec.id)}" data-compact="1">
          <div class="q-section-keep">${title}${all}</div>
        </section>`
      }
      const [first, ...rest] = sec.items
      const head = `<div class="q-section-start">${title}${renderItem(first!)}</div>`
      const tail = rest.map(renderItem).join('')
      return `<section class="q-section${compactClass}" data-section-id="${esc(sec.id)}" data-compact="0">${head}${tail}</section>`
    })
    .join('')
  return `<div class="detail-layer">${body}</div>`
}

function renderVendors(data: WeddingBriefPdfData): string {
  if (!data.vendors.length) return ''
  const rows = data.vendors
    .map((v) => {
      // Structured role+name when role exists; otherwise single clean value (no guessing).
      if (v.role?.trim()) {
        return `<div class="vendor-row">
          <span class="vendor-role">${esc(v.role)}</span>
          <span class="vendor-name">${esc(v.name)}</span>
          ${v.detail ? `<span class="vendor-name">${esc(v.detail)}</span>` : ''}
        </div>`
      }
      return `<div class="vendor-row">
        <span class="vendor-name">${esc(v.name)}</span>
        ${v.detail ? `<span class="vendor-name">${esc(v.detail)}</span>` : ''}
      </div>`
    })
    .join('')
  return `<section class="meta-block" data-testid="brief-vendors"><h2 class="section-title">Usługodawcy</h2>${rows}</section>`
}

function renderSessions(data: WeddingBriefPdfData): string {
  if (!data.sessions?.length) return ''
  const rows = data.sessions
    .map((s) => {
      const meta = [s.date, s.time, s.location].filter(Boolean).join(' · ')
      return `<div class="q-item">
        <span class="q-label">${esc(s.title)}</span>
        <p class="q-value">${esc(meta)}${
          s.notes ? `<br/>${nl2br(s.notes)}` : ''
        }</p>
      </div>`
    })
    .join('')
  return `<section class="meta-block"><h2 class="section-title">Sesje</h2>${rows}</section>`
}

function renderOrphanFallback(data: WeddingBriefPdfData): string {
  if (!data.additionalOperational.length) return ''
  const rows = data.additionalOperational
    .map(
      (item) => `<div class="q-item">
      <span class="q-label">${esc(item.label)}</span>
      <p class="q-value">${nl2br(item.value)}</p>
    </div>`,
    )
    .join('')
  return `<section class="q-section"><h2 class="q-section-title">Pozostałe odpowiedzi</h2>${rows}</section>`
}

function renderSettlement(data: WeddingBriefPdfData): string {
  const s = data.settlement
  if (!s) return ''
  const row = (label: string, value: string) =>
    `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`
  if (s.settled || s.remainingToPay <= 0) {
    return `<section class="settlement-meta"><h2 class="section-title">Rozliczenie</h2>
      <div class="settlement">
        ${row('Wartość', formatCurrency(s.contractValue))}
        ${row('Wpłacono', formatCurrency(s.totalPaid))}
        <p class="settlement-paid">Rozliczenie uregulowane.</p>
      </div></section>`
  }
  return `<section class="settlement-meta"><h2 class="section-title">Rozliczenie</h2>
    <div class="settlement">
      ${row('Wartość', formatCurrency(s.contractValue))}
      ${row('Wpłacono', formatCurrency(s.totalPaid))}
      ${row('Pozostało', formatCurrency(s.remainingToPay))}
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
  ${renderLocations(data.locations, data.timeline)}
  ${renderQuestionnaireSections(data)}
  ${renderOrphanFallback(data)}
  ${renderVendors(data)}
  ${renderSessions(data)}
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
