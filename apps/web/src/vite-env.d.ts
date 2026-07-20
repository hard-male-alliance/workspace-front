/// <reference types="vite/client" />

/** @brief Web 构建时公开环境变量 / Public Web build-time environment variables. */
interface ImportMetaEnv {
  readonly VITE_API_PROTOCOL?: 'http' | 'https'
  readonly VITE_API_HOSTNAME?: string
  readonly VITE_API_PORT?: string
}

/** @brief Vite import.meta 扩展 / Vite import.meta augmentation. */
interface ImportMeta {
  readonly env: ImportMetaEnv
}
