/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Alias viejo de la key publicable. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** 'true' habilita /sandbox en un build de producción. */
  readonly VITE_ENABLE_SANDBOX?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
