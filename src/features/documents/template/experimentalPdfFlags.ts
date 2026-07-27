/**
 * Feature flags for experimental DOCX → PDF (Gotenberg / LibreOffice).
 * Server secrets (GOTENBERG_*) never appear here.
 */

export function isExperimentalPdfExportEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_EXPERIMENTAL_PDF_EXPORT === 'true'
}
