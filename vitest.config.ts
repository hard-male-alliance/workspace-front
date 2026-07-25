import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import testProjects from './test-projects.json'

/** @brief 当前配置文件目录 / Current configuration directory. */
const directory = path.dirname(fileURLToPath(import.meta.url))

/** @brief 测试运行时类别 / Test runtime category. */
type TestProjectName = keyof typeof testProjects

/**
 * @brief 从唯一项目清单生成 Vitest include glob / Create Vitest include globs from the canonical project manifest.
 * @param projectName 测试运行时类别 / Test runtime category.
 * @param projectRoot 相对仓库根的 Vitest project root / Vitest project root relative to the repository.
 * @return 当前 project 的全部 include glob / All include globs for the project.
 */
function createTestFilePatterns(projectName: TestProjectName, projectRoot = '.'): string[] {
  return testProjects[projectName].flatMap((definition) =>
    definition.roots.map((root) => {
      /** @brief 相对当前 project root 的测试根 / Test root relative to the current project root. */
      const relativeRoot = path.posix.relative(projectRoot, root)
      /** @brief 单扩展名或 brace 扩展名模式 / Single-extension or brace-extension pattern. */
      const extensionPattern =
        definition.extensions.length === 1
          ? definition.extensions[0]
          : `{${definition.extensions.join(',')}}`
      return `${relativeRoot}/**/*.${projectName}.test.${extensionPattern}`
    })
  )
}

/** @brief Node 单元与契约测试的文件模式 / File patterns for Node unit and contract tests. */
const nodeTestFiles = createTestFilePatterns('node')

/** @brief jsdom 页面集成测试的文件模式 / File patterns for jsdom page-integration tests. */
const domTestFiles = createTestFilePatterns('dom')

/** @brief 真实浏览器行为测试的文件模式 / File patterns for real-browser behavior tests. */
const browserTestFiles = createTestFilePatterns('browser', 'packages/app')

/** @brief 按真实运行时隔离的 Vitest 配置 / Vitest configuration isolated by production runtime. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ai-job-workspace/app': path.resolve(directory, 'packages/app/src'),
      '@ai-job-workspace/platform': path.resolve(directory, 'packages/platform/src'),
      '@ai-job-workspace/product-api-v2': path.resolve(directory, 'packages/product-api-v2/src')
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
        /** @brief 预打包已知启动依赖以减少 Browser Mode 运行期重新优化 / Prebundle known startup dependencies to reduce Browser Mode runtime re-optimization. */
        optimizeDeps: {
          include: [
            'i18next',
            'lucide-react',
            'react',
            'react-dom',
            'react-i18next',
            'react-router-dom',
            'react/jsx-dev-runtime',
            'react/jsx-runtime',
            'vitest-browser-react'
          ]
        },
        test: {
          name: 'browser',
          root: path.resolve(directory, 'packages/app'),
          include: browserTestFiles,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            screenshotDirectory: path.resolve(directory, '.vitest-attachments'),
            instances: [
              {
                browser: 'chromium',
                name: 'desktop',
                viewport: { width: 1440, height: 960 }
              },
              {
                browser: 'chromium',
                name: 'mobile',
                viewport: { width: 390, height: 844 }
              }
            ]
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
