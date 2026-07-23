import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

import { resolveDesktopOAuthConfiguration } from './src/main/native-oauth-config'

/** @brief 当前 Electron 应用目录 / Current Electron application directory. */
const directory = path.dirname(fileURLToPath(import.meta.url))

/** @brief 工作区共享包别名 / Workspace shared-package aliases. */
const workspaceAliases = {
  '@ai-job-workspace/app': path.resolve(directory, '../../packages/app/src'),
  '@ai-job-workspace/platform': path.resolve(directory, '../../packages/platform/src'),
  '@ai-job-workspace/product-api-v2': path.resolve(directory, '../../packages/product-api-v2/src'),
  '@ai-job-workspace/product-runtime': path.resolve(directory, '../../packages/product-runtime/src')
}

/**
 * @brief Electron-Vite 三进程构建配置 / electron-vite three-process build configuration.
 *
 * @note preload 显式输出 CommonJS，以兼容启用 sandbox 的 preload 运行环境。
 */
export default defineConfig(({ mode }) => {
  /** @brief 当前 mode 的公开桌面构建变量 / Public desktop build variables for the current mode. */
  const fileEnvironment = loadEnv(mode, directory, 'AI_JOB_WORKSPACE_')
  /** @brief 由发布环境优先提供并在构建时验证的 public client 配置 / Public-client configuration supplied preferentially by the release environment and validated at build time. */
  const oauthConfiguration = resolveDesktopOAuthConfiguration({
    AI_JOB_WORKSPACE_OAUTH_CLIENT_ID:
      process.env.AI_JOB_WORKSPACE_OAUTH_CLIENT_ID ??
      fileEnvironment.AI_JOB_WORKSPACE_OAUTH_CLIENT_ID
  })

  return {
    main: {
      define: {
        __AI_JOB_WORKSPACE_OAUTH_CLIENT_ID__: JSON.stringify(oauthConfiguration.clientId)
      },
      build: {
        externalizeDeps: {
          exclude: ['@ai-job-workspace/platform', '@ai-job-workspace/product-api-v2']
        }
      },
      resolve: {
        alias: workspaceAliases
      }
    },
    preload: {
      resolve: {
        alias: workspaceAliases
      },
      build: {
        externalizeDeps: {
          exclude: ['@ai-job-workspace/platform']
        },
        rollupOptions: {
          output: {
            format: 'cjs',
            entryFileNames: '[name].cjs'
          }
        }
      }
    },
    renderer: {
      build: {
        minify: 'esbuild',
        reportCompressedSize: true
      },
      plugins: [react()],
      resolve: {
        alias: workspaceAliases
      }
    }
  }
})
