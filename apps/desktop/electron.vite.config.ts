import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** @brief 当前 Electron 应用目录 / Current Electron application directory. */
const directory = path.dirname(fileURLToPath(import.meta.url))

/** @brief 工作区共享包别名 / Workspace shared-package aliases. */
const workspaceAliases = {
  '@ai-job-workspace/app': path.resolve(directory, '../../packages/app/src'),
  '@ai-job-workspace/platform': path.resolve(directory, '../../packages/platform/src')
}

/**
 * @brief Electron-Vite 三进程构建配置 / electron-vite three-process build configuration.
 *
 * @note preload 显式输出 CommonJS，以兼容启用 sandbox 的 preload 运行环境。
 */
export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['@ai-job-workspace/platform']
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
    plugins: [react()],
    resolve: {
      alias: workspaceAliases
    }
  }
})
