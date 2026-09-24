/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Alias viejo de la key publicable. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** 'true' habilita /sandbox en un build de producción. */
  readonly VITE_ENABLE_SANDBOX?: string
  /** 'true' registra la pelea local (dos jugadores en un teclado) en el sandbox. */
  readonly VITE_ENABLE_FIGHT_LOCAL?: string
  /** URL de psy-ws. Sin ella la pelea online no se ofrece. */
  readonly VITE_FIGHT_WS_URL?: string
  /** Id de Google Analytics 4 (G-…). Sin él no se carga Analytics. */
  readonly VITE_GA_MEASUREMENT_ID?: string
  /** 'true' manda los eventos en modo debug (se ven en DebugView). */
  readonly VITE_GA_DEBUG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
