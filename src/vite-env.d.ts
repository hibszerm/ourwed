/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_ENABLE_AI_CONTRACT_LAB?: string
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
