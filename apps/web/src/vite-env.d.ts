/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OAUTH_CLIENT_ID?: string | undefined
  readonly VITE_DIAGNOSTICS_HOSTNAME?: string | undefined
  readonly VITE_DIAGNOSTICS_PORT?: string | undefined
  readonly VITE_DIAGNOSTICS_PROTOCOL?: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
