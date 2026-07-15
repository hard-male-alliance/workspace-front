import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** @brief 当前配置文件目录 / Current configuration directory. */
const directory = path.dirname(fileURLToPath(import.meta.url))

/** @brief Web Vite 构建配置 / Web Vite build configuration. */
export default defineConfig({
  plugins: [react()],
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
})
