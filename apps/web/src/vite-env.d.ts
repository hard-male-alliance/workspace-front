/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string | undefined
  readonly VITE_API_PROTOCOL?: string | undefined
  readonly VITE_API_HOSTNAME?: string | undefined
  readonly VITE_API_PORT?: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
