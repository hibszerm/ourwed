/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_ENABLE_AI_CONTRACT_LAB?: string
  readonly VITE_ENABLE_CONTRACT_AI_DEBUG_MODES?: string
  /**
   * Product wedding generation: sparse guarded AI (default true).
   * Set to "false" only for emergency rollback to slot-based transformContract.
   */
  readonly VITE_USE_SPARSE_WEDDING_CONTRACT_GENERATION?: string
  /** Experimental DOCX→PDF via Gotenberg (LibreOffice). Never put GOTENBERG_* here. */
  readonly VITE_ENABLE_EXPERIMENTAL_PDF_EXPORT?: string
  /**
   * Dev-only local PDF endpoint (npm run dev:pdf). Ignored in production builds.
   * Example: http://127.0.0.1:54322/docx-to-pdf
   */
  readonly VITE_LOCAL_PDF_FUNCTION_URL?: string
  readonly VITE_AI_CONTRACT_LAB_WEDDING_ID?: string
  readonly VITE_DOCUMENT_AI_USE_MOCK?: string
  readonly VITE_DOCUMENT_AI_DIAGNOSTIC?: string
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY?: string
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
  /** Landing page version override: "v1" | "v2" */
  readonly VITE_LANDING_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
