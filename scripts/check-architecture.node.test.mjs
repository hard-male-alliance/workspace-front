/** @file Node fixture tests for the architecture fitness gate. */

import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { checkArchitecture } from './check-architecture.mjs'

/** @brief Directory containing this test script. */
const testDirectory = path.dirname(fileURLToPath(import.meta.url))

/** @brief Absolute path of the CLI under test. */
const architectureScript = path.join(testDirectory, 'check-architecture.mjs')

/** @brief fixture Default test-project manifest used by fixtures. */
const fixtureTestProjects = JSON.stringify({
  browser: [{ extensions: ['ts', 'tsx'], roots: ['packages/app/tests/browser'] }],
  dom: [{ extensions: ['ts', 'tsx'], roots: ['apps', 'packages'] }],
  node: [
    { extensions: ['ts', 'tsx'], roots: ['apps', 'packages'] },
    { extensions: ['mjs'], roots: ['scripts'] }
  ]
})

/**
 * @brief Run a fixture in an isolated temporary repository.
 * @param {Record<string, string>} files Map of relative paths to source text.
 * @param {(rootDir: string) => Promise<void>} assertion fixture Fixture assertion.
 * @return {Promise<void>} Completion promise.
 */
async function withFixture(files, assertion) {
  /** @brief Fixture root safely created under the system temp directory. */
  const rootDir = await mkdtemp(path.join(tmpdir(), 'workspace-architecture-gate-'))

  try {
    /** @brief Complete fixture including the default project manifest. */
    const fixtureFiles = { 'test-projects.json': fixtureTestProjects, ...files }
    for (const [relativePath, text] of Object.entries(fixtureFiles)) {
      /** @brief Absolute path of the current fixture file. */
      const absolutePath = path.join(rootDir, relativePath)
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, text, 'utf8')
    }
    await assertion(rootDir)
  } finally {
    await rm(rootDir, { force: true, recursive: true })
  }
}

/**
 * @brief Select violations by rule identifier.
 * @param {{rule: string}[]} violations All violations.
 * @param {string} rule Rule identifier.
 * @return {{rule: string}[]} Matching violations.
 */
function violationsFor(violations, rule) {
  return violations.filter((violation) => violation.rule === rule)
}

describe('checkArchitecture', () => {
  it('ignores repository-local temporary source trees', async () => {
    await withFixture(
      {
        '.tmp/copied-worktree/apps/web/src/legacy.test.ts': 'export {}\n',
        'apps/web/src/main.ts': 'export const ready = true\n'
      },
      async (rootDir) => {
        const result = await checkArchitecture({ rootDir })
        expect(result.violations).toEqual([])
        expect(result.files).toBe(1)
      }
    )
  })
  it('accepts a valid runtime, context entry, layer, and production composition fixture', async () => {
    await withFixture(
      {
        'apps/desktop/src/main/index.ts':
          "import { app } from 'electron'\nimport { readFile } from 'node:fs/promises'\nvoid app\nvoid readFile\n",
        'apps/desktop/src/preload/index.ts':
          "import { contextBridge } from 'electron'\nvoid contextBridge\n",
        'apps/desktop/src/renderer/main.tsx':
          "import { createElement } from 'react'\nimport '@ai-job-workspace/product-runtime'\nvoid createElement\n",
        'apps/web/src/main.ts': "import '@ai-job-workspace/product-runtime'\n",
        'packages/app/package.json': JSON.stringify({
          name: '@ai-job-workspace/app',
          exports: {
            './resume': './src/contexts/resume/index.ts'
          }
        }),
        'packages/app/src/contexts/resume/application/gateway.ts':
          "import type { Resume } from '../domain/models'\nexport type ResumeGateway = () => Resume\n",
        'packages/app/src/contexts/resume/domain/models.ts':
          'export interface Resume { readonly id: string }\n',
        'packages/app/src/contexts/resume/index.ts':
          "export type { Resume } from './domain/models'\nexport type { ResumeGateway } from './application/gateway'\nexport { ResumePage } from './presentation/ResumePage'\n",
        'packages/app/src/contexts/resume/presentation/ResumePage.tsx':
          "import { createElement } from 'react'\nimport type { Resume } from '../domain/models'\nexport const ResumePage = (resume: Resume) => createElement('main', null, resume.id)\n",
        'packages/app/src/contexts/workspace/domain/models.ts':
          'export interface Workspace { readonly id: string }\n',
        'packages/app/src/contexts/workspace/index.ts':
          "export { WorkspacePage } from './presentation/WorkspacePage'\n",
        'packages/app/src/contexts/workspace/presentation/WorkspacePage.tsx':
          "import { ResumePage } from '../../resume'\nexport const WorkspacePage = ResumePage\n",
        'packages/app/src/styles/order.node.test.ts':
          "import { readFile } from 'node:fs/promises'\nvoid readFile\n",
        'packages/platform/src/index.ts': "export const platformVersion = 'fixture'\n",
        'packages/app/tests/browser/behavior.browser.test.tsx':
          "import { expect, it } from 'vitest'\nit('works', () => expect(true).toBe(true))\n",
        'packages/app/src/page.dom.test.tsx':
          "import { expect, it } from 'vitest'\nit('works', () => expect(true).toBe(true))\n",
        'packages/app/src/pure.node.test.ts':
          "import { expect, it } from 'vitest'\nit('works', () => expect(true).toBe(true))\n"
      },
      async (rootDir) => {
        /** @brief Check result for the valid fixture. */
        const result = await checkArchitecture({ rootDir })
        expect(result.violations).toEqual([])
      }
    )
  })

  it('rejects legacy test names and names with multiple runtime markers', async () => {
    await withFixture(
      {
        'tests/legacy.test.ts': 'export {}\n',
        'tests/multiple.node.dom.test.ts': 'export {}\n',
        'tests/valid.node.test.ts': 'export {}\n'
      },
      async (rootDir) => {
        /** @brief Check result for the test-suffix fixture. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Test-suffix violations. */
        const violations = violationsFor(result.violations, 'test-project-suffix')
        expect(violations.map((violation) => violation.file)).toEqual([
          'tests/legacy.test.ts',
          'tests/multiple.node.dom.test.ts'
        ])
      }
    )
  })

  it('rejects suffix-valid tests not collected by the matching Vitest project', async () => {
    await withFixture(
      {
        'apps/web/src/missed.browser.test.tsx': 'export {}\n',
        'packages/app/src/missed.node.test.mjs': 'export {}\n',
        'scripts/covered.node.test.mjs': 'export {}\n'
      },
      async (rootDir) => {
        /** @brief project Check result for the project-collection fixture. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Tests not collected by any project. */
        const violations = violationsFor(result.violations, 'test-project-assignment')
        expect(violations.map((violation) => violation.file)).toEqual([
          'apps/web/src/missed.browser.test.tsx',
          'packages/app/src/missed.node.test.mjs'
        ])
      }
    )
  })

  it('requires Electron main and preload tests to use Node and browser tests to stay in explicit roots', async () => {
    await withFixture(
      {
        'apps/desktop/src/main/window.dom.test.ts': 'export {}\n',
        'apps/desktop/src/main/window.node.test.ts': 'export {}\n',
        'apps/desktop/src/preload/bridge.browser.test.tsx': 'export {}\n',
        'apps/desktop/src/preload/bridge.node.test.ts': 'export {}\n',
        'apps/web/src/workflow.browser.test.tsx': 'export {}\n',
        'packages/app/tests/browser/workflow.browser.test.tsx': 'export {}\n'
      },
      async (rootDir) => {
        /** @brief Test runtime-location violations. */
        const result = await checkArchitecture({ rootDir })
        expect(
          violationsFor(result.violations, 'test-runtime-location').map(
            (violation) => violation.file
          )
        ).toEqual([
          'apps/desktop/src/main/window.dom.test.ts',
          'apps/desktop/src/preload/bridge.browser.test.tsx',
          'apps/web/src/workflow.browser.test.tsx'
        ])
      }
    )
  })

  it('requires full WorkspaceApp DOM tests to live in the package integration directory', async () => {
    await withFixture(
      {
        'packages/app/src/app/WorkspaceApp.tsx': 'export const WorkspaceApp = () => null\n',
        'packages/app/src/contexts/workspace/presentation/Home.dom.test.tsx':
          "import { WorkspaceApp } from '../../../app/WorkspaceApp'\nvoid WorkspaceApp\n",
        'packages/app/tests/integration/WorkspaceApp.dom.test.tsx':
          "import { WorkspaceApp } from '../../src/app/WorkspaceApp'\nvoid WorkspaceApp\n"
      },
      async (rootDir) => {
        /** @brief Full-app DOM-test placement result. */
        const result = await checkArchitecture({ rootDir })
        expect(
          violationsFor(result.violations, 'workspace-app-dom-test-placement').map(
            (violation) => violation.file
          )
        ).toEqual(['packages/app/src/contexts/workspace/presentation/Home.dom.test.tsx'])
      }
    )
  })

  it('isolates renderer, shared app, main/preload, and platform runtime dependencies', async () => {
    await withFixture(
      {
        'apps/desktop/src/main/bad.ts':
          "import React from 'react'\nimport { JSDOM } from 'jsdom'\nvoid React\nvoid JSDOM\n",
        'apps/desktop/src/preload/bad.ts': "import '@testing-library/dom'\n",
        'apps/desktop/src/renderer/bad.ts':
          "import { readFile } from 'node:fs/promises'\nimport { ipcRenderer } from 'electron'\nvoid readFile\nvoid ipcRenderer\n",
        'apps/web/src/bad.ts': "import path from 'node:path'\nvoid path\n",
        'packages/app/src/bad.ts': "export { app } from 'electron'\n",
        'packages/platform/src/bad.ts':
          "import React from 'react'\nimport { app } from 'electron'\nimport fs from 'fs'\nvoid React\nvoid app\nvoid fs\n"
      },
      async (rootDir) => {
        /** @brief Check result for the runtime-isolation fixture. */
        const result = await checkArchitecture({ rootDir })
        expect(violationsFor(result.violations, 'renderer-shared-runtime')).toHaveLength(4)
        expect(violationsFor(result.violations, 'desktop-main-preload-runtime')).toHaveLength(3)
        expect(violationsFor(result.violations, 'platform-runtime-neutrality')).toHaveLength(3)
      }
    )
  })

  it('rejects production source host-global augmentation in shared renderer TypeScript programs', async () => {
    await withFixture(
      {
        'apps/desktop/src/renderer/src/host-window.d.ts': [
          "import type { PlatformBridge } from '@fixture/platform'",
          'declare global { interface Window { readonly bridge?: PlatformBridge } }',
          'export {}'
        ].join('\n'),
        'packages/platform/src/host-window.ts': [
          'export {}',
          'declare global { interface Window { readonly bridge?: unknown } }'
        ].join('\n'),
        'packages/app/src/host-window.ts': [
          'export {}',
          'declare global { interface Window { readonly bridge?: unknown } }'
        ].join('\n'),
        'packages/product-runtime/src/host-window.ts': [
          'export {}',
          'declare global { interface Window { readonly bridge?: unknown } }'
        ].join('\n'),
        'apps/web/src/host-window.ts': [
          'export {}',
          'declare global { interface Window { readonly bridge?: unknown } }'
        ].join('\n')
      },
      async (rootDir) => {
        /** @brief Host-global augmentation violations. */
        const result = await checkArchitecture({ rootDir })
        /** @brief renderer Global augmentations from every renderer-program production root must be rejected. */
        const violations = violationsFor(result.violations, 'renderer-program-ambient-augmentation')
        expect(violations.map((violation) => violation.file)).toEqual([
          'apps/desktop/src/renderer/src/host-window.d.ts',
          'apps/web/src/host-window.ts',
          'packages/app/src/host-window.ts',
          'packages/platform/src/host-window.ts',
          'packages/product-runtime/src/host-window.ts'
        ])
      }
    )
  })

  it('blocks context domain/application outbound dependencies and presentation adapter dependencies', async () => {
    await withFixture(
      {
        'packages/app/src/contexts/resume/adapter/repository.ts': 'export const repository = {}\n',
        'packages/app/src/contexts/resume/application/use-case.ts':
          "import React from 'react'\nimport { repository } from '../adapter/repository'\nvoid React\nvoid repository\n",
        'packages/app/src/contexts/resume/domain/model.ts':
          "import path from 'node:path'\nimport { Page } from '../presentation/Page'\nvoid path\nvoid Page\n",
        'packages/app/src/contexts/resume/infrastructure/storage.ts': 'export const storage = {}\n',
        'packages/app/src/contexts/resume/presentation/Page.ts':
          "import { storage } from '../infrastructure/storage'\nexport const Page = storage\n"
      },
      async (rootDir) => {
        /** @brief context Check result for the context-layer fixture. */
        const result = await checkArchitecture({ rootDir })
        expect(
          violationsFor(result.violations, 'context-domain-application-dependency')
        ).toHaveLength(4)
        expect(violationsFor(result.violations, 'presentation-adapter-dependency')).toHaveLength(1)
      }
    )
  })

  it('blocks presentation from directly consuming other context gateways or named queries', async () => {
    await withFixture(
      {
        'packages/app/src/app/AppData.tsx':
          'export const useResumeGateway = () => ({})\nexport const useKnowledgeGateway = () => ({})\nexport const useWorkspaceHomeQuery = () => ({})\n',
        'packages/app/src/contexts/knowledge/presentation/KnowledgePage.tsx':
          "import * as appData from '../../../app/AppData'\nvoid appData\n",
        'packages/app/src/contexts/resume/presentation/ResumePage.tsx':
          "import { useKnowledgeGateway, useResumeGateway, useWorkspaceHomeQuery } from '../../../app/AppData'\nvoid useKnowledgeGateway\nvoid useResumeGateway\nvoid useWorkspaceHomeQuery\n"
      },
      async (rootDir) => {
        /** @brief presentation Check result for presentation-port ownership. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Cross-context port violations. */
        const violations = violationsFor(result.violations, 'presentation-cross-context-port')
        expect(violations).toHaveLength(3)
        expect(violations.map((violation) => violation.file)).toEqual([
          'packages/app/src/contexts/knowledge/presentation/KnowledgePage.tsx',
          'packages/app/src/contexts/resume/presentation/ResumePage.tsx',
          'packages/app/src/contexts/resume/presentation/ResumePage.tsx'
        ])
      }
    )
  })

  it('blocks browser ambient globals in domain/application while allowing local bindings and same-name properties', async () => {
    await withFixture(
      {
        'packages/app/src/contexts/resume/application/browser.ts': [
          'void window',
          'void document',
          'void navigator',
          'void localStorage',
          'void sessionStorage',
          'void File',
          'void Blob',
          'void FormData',
          'void WebSocket',
          'void fetch',
          'void globalThis.document',
          'export {}'
        ].join('\n'),
        'packages/app/src/contexts/resume/domain/platform-neutral.ts': [
          'const window = { document: true }',
          'const File = class {}',
          'const record = { File: true, window }',
          'function inspect(Blob: unknown) { return { Blob, File, window, value: record.File } }',
          'void inspect',
          'export {}'
        ].join('\n')
      },
      async (rootDir) => {
        /** @brief Check result for the browser-ambient-global fixture. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Browser ambient-global violations. */
        const violations = violationsFor(result.violations, 'context-browser-ambient-global')
        expect(violations).toHaveLength(11)
        expect(
          violations.every(
            (violation) =>
              violation.file === 'packages/app/src/contexts/resume/application/browser.ts'
          )
        ).toBe(true)
      }
    )
  })

  it('only allows external context consumers to import the target context root index', async () => {
    await withFixture(
      {
        'packages/app/src/application.ts':
          "import type { ResumeGateway } from './contexts/resume/application/gateway'\nvoid 0 as unknown as ResumeGateway\n",
        'packages/app/src/app/routes.ts':
          "import { ResumePage } from '../contexts/resume'\nimport type { Resume } from '../contexts/resume/domain/model'\nvoid ResumePage\nvoid 0 as unknown as Resume\n",
        'packages/app/src/contexts/resume/domain/model.ts':
          'export interface Resume { readonly id: string }\n',
        'packages/app/src/contexts/resume/index.ts':
          "export type { Resume } from './domain/model'\nexport { ResumePage } from './presentation/Page'\n",
        'packages/app/src/contexts/resume/presentation/Page.ts': 'export const ResumePage = {}\n',
        'packages/app/src/contexts/workspace/presentation/Page.ts':
          "import { ResumePage } from '../../resume'\nimport type { Resume } from '../../resume/domain/model'\nvoid ResumePage\nvoid 0 as unknown as Resume\n"
      },
      async (rootDir) => {
        /** @brief context Check result for the context-public-entry fixture. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Deep context-import violations. */
        const violations = violationsFor(result.violations, 'cross-context-deep-import')
        expect(violations).toHaveLength(2)
        expect(
          violations.every((violation) => violation.message.includes('contexts/resume/index.ts'))
        ).toBe(true)
      }
    )
  })

  it('blocks production composition from testing, demo, or memory data adapters while allowing test support source', async () => {
    await withFixture(
      {
        'apps/desktop/src/renderer/main.ts':
          "import '@ai-job-workspace/app/testing'\nimport '@ai-job-workspace/product-runtime'\n",
        'apps/desktop/src/renderer/preview.ts':
          "import '../../../../packages/app/src/demo/content'\n",
        'apps/web/src/main.node.test.ts': "import '@ai-job-workspace/app/testing'\n",
        'apps/web/src/main.ts': "import '@ai-job-workspace/app/testing'\n",
        'packages/app/src/app/compose.ts': "import '../testing'\n",
        'packages/app/src/app/compose.dom-test-harness.ts': "import '../testing'\n",
        'packages/product-runtime/src/index.ts':
          "import '@ai-job-workspace/app/testing'\nimport '../../app/src/contexts/resume/infrastructure/memory/gateway'\n",
        'packages/app/src/testing.ts': 'export const fixture = {}\n',
        'packages/app/src/demo/content.ts': 'export const demo = {}\n'
      },
      async (rootDir) => {
        /** @brief Check result for the production-composition fixture. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Production source files rejected by the rule. */
        const violatingFiles = violationsFor(result.violations, 'production-testing-composition')
          .map((violation) => violation.file)
          .sort()
        expect(violatingFiles).toEqual([
          'apps/desktop/src/renderer/main.ts',
          'apps/desktop/src/renderer/preview.ts',
          'apps/web/src/main.ts',
          'packages/app/src/app/compose.ts',
          'packages/product-runtime/src/index.ts'
        ])
      }
    )
  })

  it('blocks production composition from reaching memory data adapters through context barrels', async () => {
    await withFixture(
      {
        'apps/web/src/main.ts': "import '../../../packages/app/src/contexts/resume/index'\n",
        'packages/app/src/contexts/resume/index.ts': "export * from './composition'\n",
        'packages/app/src/contexts/resume/composition.ts':
          "export * from './infrastructure/memory/gateway'\n",
        'packages/app/src/contexts/resume/infrastructure/memory/gateway.ts':
          'export const gateway = {}\n'
      },
      async (rootDir) => {
        /** @brief Check result for the transitive production-data dependency fixture. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Rejected transitive production-data dependency. */
        const violations = violationsFor(result.violations, 'production-testing-composition')
        expect(violations).toHaveLength(1)
        expect(violations[0]?.file).toBe('packages/app/src/contexts/resume/composition.ts')
        expect(violations[0]?.message).toContain(
          'apps/web/src/main.ts -> packages/app/src/contexts/resume/index.ts -> packages/app/src/contexts/resume/composition.ts -> packages/app/src/contexts/resume/infrastructure/memory/gateway.ts'
        )
      }
    )
  })

  it('blocks non-production copy in production UI while excluding mock interview terms, tests, and memory data', async () => {
    await withFixture(
      {
        'apps/desktop/src/renderer/src/main.tsx': [
          "export const status = 'Showing demo data'",
          "export const interview = 'Mock interview'"
        ].join('\n'),
        'apps/web/src/main.ts': [
          '// Historical note: fall back to demo data.',
          "export const interview = '\u6a21\u62df\u9762\u8bd5'"
        ].join('\n'),
        'docs/history.ts': "export const oldCopy = 'Showing mock data'\n",
        'packages/app/src/contexts/knowledge/infrastructure/memory/data.ts':
          "export const placeholder = '\u6f14\u793a\u6570\u636e'\n",
        'packages/app/src/contexts/resume/presentation/ResumePage.tsx':
          'export const ResumePage = () => <p>\u5f53\u524d\u663e\u793a\u5360\u4f4d\u6570\u636e</p>\n',
        'packages/app/src/i18n/resources.ts':
          "export const resources = { status: 'Fallback data is active' }\n",
        'packages/app/src/testing.ts': "export const copy = 'Mock data'\n",
        'packages/app/src/ui/copy.node.test.ts': "export const copy = 'Fake data'\n"
      },
      async (rootDir) => {
        /** @brief Check result for production UI non-production copy. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Production UI non-production copy violations. */
        const violations = violationsFor(result.violations, 'production-ui-placeholder-copy')
        expect(violations.map((violation) => violation.file)).toEqual([
          'apps/desktop/src/renderer/src/main.tsx',
          'packages/app/src/contexts/resume/presentation/ResumePage.tsx',
          'packages/app/src/i18n/resources.ts'
        ])
      }
    )
  })

  it('only allows production source to import explicit public workspace package export paths', async () => {
    await withFixture(
      {
        'apps/web/src/main.ts': [
          "import '@fixture/library'",
          "import '@fixture/library/public'",
          "import '@fixture/library/internal'",
          "import '@fixture/library/missing'"
        ].join('\n'),
        'packages/library/package.json': JSON.stringify({
          name: '@fixture/library',
          exports: {
            '.': './src/index.ts',
            './public': './src/public.ts'
          }
        }),
        'packages/library/src/index.ts': 'export const root = true\n',
        'packages/library/src/internal.ts': 'export const internal = true\n',
        'packages/library/src/public.ts': 'export const publicValue = true\n'
      },
      async (rootDir) => {
        /** @brief workspace exports fixture Check result for the workspace-exports fixture. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Non-public workspace-import violations. */
        const violations = violationsFor(result.violations, 'workspace-package-public-export')
        expect(violations).toHaveLength(2)
        expect(violations.map((violation) => violation.line)).toEqual([3, 4])
        expect(violations[0].message).toContain('./internal')
        expect(violations[1].message).toContain('./missing')
      }
    )
  })

  it('discovers production dependency cycles through import, re-export, and dynamic import', async () => {
    await withFixture(
      {
        'packages/app/src/a.ts': "import './b'\nexport const a = 1\n",
        'packages/app/src/b.ts': "export { c } from './c.js'\n",
        'packages/app/src/c.ts': "void import('./a')\nexport const c = 1\n"
      },
      async (rootDir) => {
        /** @brief Check result for the dependency-cycle fixture. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Production-cycle violations. */
        const violations = violationsFor(result.violations, 'production-dependency-cycle')
        expect(violations).toHaveLength(1)
        expect(violations[0].message).toContain(
          'packages/app/src/a.ts -> packages/app/src/b.ts -> packages/app/src/c.ts -> packages/app/src/a.ts'
        )
      }
    )
  })

  it('discovers cross-package cycles through resolved workspace package bare imports', async () => {
    await withFixture(
      {
        'packages/alpha/package.json': JSON.stringify({
          name: '@fixture/alpha',
          exports: { '.': './src/index.ts' }
        }),
        'packages/alpha/src/index.ts':
          "import { beta } from '@fixture/beta'\nexport const alpha = beta\n",
        'packages/beta/package.json': JSON.stringify({
          name: '@fixture/beta',
          exports: { '.': './src/index.ts' }
        }),
        'packages/beta/src/index.ts':
          "import { alpha } from '@fixture/alpha'\nexport const beta = alpha\n"
      },
      async (rootDir) => {
        /** @brief Check result for the cross-package-cycle fixture. */
        const result = await checkArchitecture({ rootDir })
        /** @brief Cross-package production-cycle violations. */
        const violations = violationsFor(result.violations, 'production-dependency-cycle')
        expect(violations).toHaveLength(1)
        expect(violations[0].message).toContain(
          'packages/alpha/src/index.ts -> packages/beta/src/index.ts -> packages/alpha/src/index.ts'
        )
      }
    )
  })

  it('returns 1 for architecture violations and 2 for operational errors in the CLI', async () => {
    await withFixture(
      {
        'tests/legacy.test.ts': 'export {}\n'
      },
      async (rootDir) => {
        /** @brief Isolated CLI process with an architecture violation. */
        const violationRun = spawnSync(process.execPath, [architectureScript, '--root', rootDir], {
          encoding: 'utf8'
        })
        expect(violationRun.status).toBe(1)
        expect(violationRun.stderr).toContain('[test-project-suffix] tests/legacy.test.ts:1:1')

        /** @brief Isolated CLI process with a missing root directory. */
        const operationalErrorRun = spawnSync(
          process.execPath,
          [architectureScript, '--root', path.join(rootDir, 'missing')],
          { encoding: 'utf8' }
        )
        expect(operationalErrorRun.status).toBe(2)
        expect(operationalErrorRun.stderr).toContain('Architecture check could not run:')
      }
    )
  })
})
