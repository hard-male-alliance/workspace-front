import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { WorkspaceApp as SharedWorkspaceApp } from '@ai-job-workspace/app'
import type { WorkspaceAppProps } from '@ai-job-workspace/app'
import { createDiagnostics } from '@ai-job-workspace/app/diagnostics'
import { appI18n, appI18nReady } from '@ai-job-workspace/app/i18n'
import {
  InMemoryInterviewGateway,
  InMemoryWorkspaceGateway,
  InMemoryKnowledgeGateway,
  InMemoryResumeGateway
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
  return {
    interview: new InMemoryInterviewGateway(),
    knowledge: new InMemoryKnowledgeGateway(),
    resume: new InMemoryResumeGateway(),
    workspace: new InMemoryWorkspaceGateway(),
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
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
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
