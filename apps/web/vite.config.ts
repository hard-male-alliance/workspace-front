import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

import { createWebContentSecurityPolicy } from './src/diagnostics-config'
import type { PublicWebEnvironment } from './src/diagnostics-config'

/** @brief 当前配置文件目录 / Current configuration directory. */
const directory = path.dirname(fileURLToPath(import.meta.url))

/** @brief Web Vite 构建配置 / Web Vite build configuration. */
/** @note package scripts use Vite's runner config loader because this monorepo config imports TypeScript workspace modules. */
export default defineConfig(({ mode }) => {
  /** @brief Vite 读取的公开构建环境变量 / Public build environment read by Vite. */
  const environment = loadEnv(mode, directory, 'VITE_') as PublicWebEnvironment
  /** @brief 构建时确定的严格 CSP / Strict CSP determined at build time. */
  const contentSecurityPolicy = createWebContentSecurityPolicy({
    environment,
    includeDevelopmentSources: mode === 'development'
  })

  return {
    plugins: [
      react(),
      {
        name: 'inject-workspace-content-security-policy',
        transformIndexHtml(html): string {
          return html.replace('__AI_JOB_WORKSPACE_CONTENT_SECURITY_POLICY__', contentSecurityPolicy)
        }
      }
    ],
    resolve: {
      alias: {
        '@ai-job-workspace/app': path.resolve(directory, '../../packages/app/src'),
        '@ai-job-workspace/platform': path.resolve(directory, '../../packages/platform/src')
      }
    },
    server: {
      port: 5173,
      strictPort: true
    },
    preview: {
      port: 4173,
      strictPort: true
    }
  }
})
