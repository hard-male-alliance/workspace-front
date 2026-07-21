import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/** @brief 当前配置文件目录 / Current configuration directory. */
const directory = path.dirname(fileURLToPath(import.meta.url))

/** @brief Node 单元与契约测试的文件模式 / File patterns for Node unit and contract tests. */
const nodeTestFiles = ['{apps,packages}/**/*.node.test.{ts,tsx}', 'scripts/**/*.node.test.mjs']

/** @brief jsdom 页面集成测试的文件模式 / File patterns for jsdom page-integration tests. */
const domTestFiles = ['{apps,packages}/**/*.dom.test.{ts,tsx}']

/** @brief 真实浏览器行为测试的文件模式 / File patterns for real-browser behavior tests. */
const browserTestFiles = ['src/**/*.browser.test.{ts,tsx}']

/** @brief 按真实运行时隔离的 Vitest 配置 / Vitest configuration isolated by production runtime. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ai-job-workspace/app': path.resolve(directory, 'packages/app/src'),
      '@ai-job-workspace/platform': path.resolve(directory, 'packages/platform/src')
    }
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: nodeTestFiles
        }
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: domTestFiles,
          setupFiles: ['./tests/setup.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'browser',
          root: path.resolve(directory, 'packages/app'),
          include: browserTestFiles,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            viewport: {
              width: 1440,
              height: 960
            }
          }
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html']
    }
  }
})
