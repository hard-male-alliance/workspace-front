import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/** @brief 当前配置文件目录 / Current configuration directory. */
const directory = path.dirname(fileURLToPath(import.meta.url))

/** @brief Vitest 与 React 测试配置 / Vitest and React test configuration. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ai-job-workspace/app': path.resolve(directory, 'packages/app/src'),
      '@ai-job-workspace/platform': path.resolve(directory, 'packages/platform/src')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'apps/**/*.{test,spec}.{ts,tsx}',
      'packages/**/*.{test,spec}.{ts,tsx}',
      'scripts/**/*.{test,spec}.mjs'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html']
    }
  }
})
