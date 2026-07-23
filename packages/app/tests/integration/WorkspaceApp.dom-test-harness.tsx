import { act, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { WorkspaceApp as SharedWorkspaceApp } from '@ai-job-workspace/app'
import type { WorkspaceAppProps } from '@ai-job-workspace/app'
import { createDiagnostics } from '@ai-job-workspace/app/diagnostics'
import { appI18n, appI18nReady } from '@ai-job-workspace/app/i18n'
import {
  InMemoryIdentityGateway,
  InMemoryInterviewGateway,
  InMemoryWorkspaceGateway,
  InMemoryKnowledgeGateway,
  InMemoryResumeGateway,
  InMemoryWorkspaceOperationsGateway,
  InMemoryWorkspaceOperationsStore
} from '@ai-job-workspace/app/testing'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'
import type { ArtifactSavePort } from '@ai-job-workspace/platform'

/** @brief 测试版应用属性 / Test application properties. */
export type TestWorkspaceAppProps = Omit<
  WorkspaceAppProps,
  'artifactSave' | 'diagnostics' | 'gateways' | 'runtimeInfo'
> & {
  readonly artifactSave?: WorkspaceAppProps['artifactSave']
  readonly diagnostics?: WorkspaceAppProps['diagnostics']
  readonly gateways?: WorkspaceAppProps['gateways']
  readonly runtimeInfo?: WorkspaceAppProps['runtimeInfo']
}

/**
 * @brief 创建无副作用的测试产物保存端口 / Create a side-effect-free test artifact-save port.
 * @return 总是报告保存完成且不访问 DOM 或文件系统的端口 / Port that always reports success without touching the DOM or filesystem.
 */
export function createTestArtifactSavePort(): ArtifactSavePort {
  return {
    maximumArtifactBytes: null,
    saveArtifact: (): Promise<{ readonly status: 'saved' }> => Promise.resolve({ status: 'saved' })
  }
}

/** @brief 测试可覆盖的 Gateway 集合 / Gateway overrides available to tests. */
export type TestGatewayOverrides = Partial<WorkspaceAppProps['gateways']>

/**
 * @brief 创建完全隔离的 Mock Gateway 集合 / Create a fully isolated Mock Gateway set.
 * @param overrides 单个测试需要覆盖的 Gateway / Gateways overridden by one test.
 * @return 仅属于当前调用的 Gateway 集合 / Gateway set owned by the current call.
 */
export function createTestGateways(
  overrides: TestGatewayOverrides = {}
): WorkspaceAppProps['gateways'] {
  /** @brief 同时实现 Resume 各用例端口的独享测试适配器 / Isolated test adapter implementing each Resume use-case port. */
  const operationsStore = new InMemoryWorkspaceOperationsStore()
  /** @brief 与 Resume command adapter 共享 Job/Artifact 状态的测试适配器 / Test adapter sharing Job/Artifact state with the Resume command adapter. */
  const workspaceOperations = new InMemoryWorkspaceOperationsGateway({}, operationsStore)
  /** @brief 同时实现 Resume 各用例端口的独享测试适配器 / Isolated test adapter implementing each Resume use-case port. */
  const resume = new InMemoryResumeGateway({ operationsStore })
  /** @brief 若 Resume override 同时实现公开目录，则保持两个端口的同一测试状态 / Preserve one test state across both ports when a Resume override also implements the public catalog. */
  const resumeTemplates =
    overrides.resume !== undefined &&
    'listTemplatePage' in overrides.resume &&
    'getTemplate' in overrides.resume
      ? (overrides.resume as WorkspaceAppProps['gateways']['resumeTemplates'])
      : resume
  return {
    identity: new InMemoryIdentityGateway(),
    interview: new InMemoryInterviewGateway(),
    knowledge: new InMemoryKnowledgeGateway(),
    resume,
    resumeCreation: resume,
    resumeTemplates,
    workspace: new InMemoryWorkspaceGateway(),
    workspaceOperations,
    ...overrides
  }
}

/**
 * @brief 使用每次渲染独享的依赖装配测试应用 / Render the test app with per-render dependencies.
 * @param props 应用测试属性 / Application test properties.
 * @return 测试用 React 应用元素 / React application element for tests.
 */
export function WorkspaceApp({
  artifactSave,
  diagnostics,
  gateways,
  runtimeInfo,
  ...props
}: TestWorkspaceAppProps): React.JSX.Element {
  return (
    <SharedWorkspaceApp
      {...props}
      artifactSave={artifactSave ?? createTestArtifactSavePort()}
      diagnostics={diagnostics ?? createDiagnostics({ sinks: [] })}
      gateways={gateways ?? createTestGateways()}
      runtimeInfo={runtimeInfo ?? { appVersion: APPLICATION_VERSION, platform: 'web' }}
    />
  )
}

/**
 * @brief 为当前测试文件注册隔离清理 / Register isolation cleanup for the current test file.
 * @return 无返回值 / No return value.
 */
export function installWorkspaceAppTestCleanup(): void {
  afterEach((): void => {
    cleanup()
    window.history.replaceState(null, '', '/')
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })
}

/**
 * @brief 驱动 BrowserRouter 完成同一详情路由内的资源切换 / Drive BrowserRouter through a resource change within one detail route.
 * @param path 目标应用路径 / Target application path.
 * @return 无返回值；路由提交由 act 同步刷新 / No return value; the route commit is flushed synchronously by act.
 */
export function navigateWorkspaceApp(path: string): void {
  act((): void => {
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

/**
 * @brief 设置当前测试的应用语言 / Set the application locale for the current test.
 * @param locale 应用支持的测试语言 / Supported application locale under test.
 * @return 语言切换完成 Promise / Promise fulfilled after the locale changes.
 */
export async function setWorkspaceAppTestLocale(locale: 'en-US' | 'zh-SG'): Promise<void> {
  await appI18nReady
  await appI18n.changeLanguage(locale)
}
