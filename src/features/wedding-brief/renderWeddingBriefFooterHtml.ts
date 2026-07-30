/**
 * Gotenberg footer HTML for page numbers (Chromium).
 */

import type { WeddingBriefPdfData } from '@/features/wedding-brief/types'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderWeddingBriefFooterHtml(data: WeddingBriefPdfData): string {
  return `<!DOCTYPE html>
<html><head><style>
  html, body { margin: 0; padding: 0; }
  .f {
    width: 100%;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 8pt;
    color: #6b6b6b;
    display: flex;
    justify-content: space-between;
    padding: 0 2mm;
  }
</style></head>
<body>
  <div class="f">
    <span>${esc(data.footer.coupleDisplayName)} · ${esc(data.footer.weddingDateLabel)}</span>
    <span>Strona <span class="pageNumber"></span> z <span class="totalPages"></span> · Wygenerowano ${esc(data.document.generatedAtLabel)}</span>
  </div>
</body></html>`
}
