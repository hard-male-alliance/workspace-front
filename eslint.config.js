import eslint from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** @brief 仅应用于 TypeScript 源码的类型感知规则 / Type-aware rules applied only to TypeScript source. */
const typeCheckedTypeScriptConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ['**/*.{ts,tsx}']
}))

/** @brief ESLint flat config / ESLint 扁平化配置。 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      'workspace-shared-docs/**'
    ]
  },
  eslint.configs.recommended,
  ...typeCheckedTypeScriptConfigs,
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.es2024,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } }
      ]
    }
  },
  {
    files: [
      'apps/web/src/**/*.{ts,tsx}',
      'apps/desktop/src/renderer/**/*.{ts,tsx}',
      'packages/app/src/**/*.{ts,tsx}'
    ],
    ignores: ['**/*.node.test.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'electron', 'electron/*'],
              message:
                'Renderer 与共享应用代码不得依赖 Node.js 或 Electron；请通过宿主端口注入能力。 / Renderer and shared app code must receive host capabilities through ports.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['packages/platform/src/**/*.{ts,tsx}'],
    ignores: ['**/*.node.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'electron', 'electron/*', 'react', 'react-dom', 'react-dom/*'],
              message:
                '平台契约必须保持宿主与 UI 无关。 / Platform contracts must remain independent of hosts and UI frameworks.'
            }
          ]
        }
      ]
    }
  },
  {
    files: [
      '*.config.{ts,js,mjs}',
      'apps/*/*.config.{ts,js,mjs}',
      'apps/desktop/src/main/**/*.{ts,tsx}',
      'apps/desktop/src/preload/**/*.{ts,tsx}'
    ],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['apps/desktop/src/{main,preload}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react-dom/*', '@testing-library/*'],
              message:
                'Electron main/preload 不能依赖 React 或 DOM 测试工具。 / Electron main and preload cannot depend on React or DOM testing tools.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['**/*.node.test.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest
      }
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['jsdom', '@testing-library/*'],
              message:
                'Node 测试不得引入模拟 DOM；请将用户界面行为归入 dom 或 browser project。 / Node tests must not import a simulated DOM.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['**/*.{dom,browser}.test.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest
      }
    }
  }
)
