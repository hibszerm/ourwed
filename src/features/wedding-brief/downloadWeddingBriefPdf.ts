import { convertWeddingBriefHtmlToPdf, downloadPdfBytes } from '@/features/wedding-brief/convertWeddingBriefHtmlToPdf'
import { loadWeddingBriefPdfData } from '@/features/wedding-brief/loadWeddingBriefPdfData'
import { renderWeddingBriefFooterHtml } from '@/features/wedding-brief/renderWeddingBriefFooterHtml'
import {
  buildWeddingBriefFilename,
  renderWeddingBriefHtml,
} from '@/features/wedding-brief/renderWeddingBriefHtml'

/** Shared brief PDF download used by header menu and legacy button. */
export async function downloadWeddingBriefPdf(weddingId: string): Promise<void> {
  const data = await loadWeddingBriefPdfData(weddingId)
  const html = renderWeddingBriefHtml(data)
  const footerHtml = renderWeddingBriefFooterHtml(data)
  const filename = buildWeddingBriefFilename(data)
  const pdf = await convertWeddingBriefHtmlToPdf({
    html,
    filename,
    footerHtml,
  })
  downloadPdfBytes(pdf, filename)
}
