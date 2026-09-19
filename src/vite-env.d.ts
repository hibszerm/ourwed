/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /**
   * Product wedding generation: sparse guarded AI (default true).
   * Set to "false" only for emergency rollback to slot-based transformContract.
   */
  readonly VITE_USE_SPARSE_WEDDING_CONTRACT_GENERATION?: string
  readonly VITE_DOCUMENT_AI_USE_MOCK?: string
  readonly VITE_DOCUMENT_AI_DIAGNOSTIC?: string
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY?: string
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
