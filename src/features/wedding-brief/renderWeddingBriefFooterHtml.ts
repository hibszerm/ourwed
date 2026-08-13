/**
 * Quiet page footer for Wedding Brief PDF (PDFShift adapts pageNumber/totalPages).
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
    font-size: 7.5pt;
    color: #9a9a9a;
    display: flex;
    justify-content: space-between;
    padding: 0 1mm;
  }
</style></head>
<body>
  <div class="f">
    <span>${esc(data.footer.coupleDisplayName)} · ${esc(data.footer.weddingDateLabel)}</span>
    <span><span class="pageNumber"></span>/<span class="totalPages"></span> · ${esc(data.document.generatedAtLabel)}</span>
  </div>
</body></html>`
}
