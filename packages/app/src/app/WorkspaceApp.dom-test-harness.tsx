import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { appI18n, appI18nReady } from '../i18n'
import {
  MockInterviewGateway,
  MockKnowledgeGateway,
  MockResumeGateway,
  MockWorkspaceGateway
} from '../infrastructure/mock'
import { createDiagnostics } from '../infrastructure/observability'
import type { WorkspaceAppProps } from './WorkspaceApp'
import { WorkspaceApp as SharedWorkspaceApp } from './WorkspaceApp'

/** @brief 测试版应用属性 / Test application properties. */
export type TestWorkspaceAppProps = Omit<WorkspaceAppProps, 'diagnostics' | 'gateways'> & {
  readonly diagnostics?: WorkspaceAppProps['diagnostics']
  readonly gateways?: WorkspaceAppProps['gateways']
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
    interview: new MockInterviewGateway(),
    knowledge: new MockKnowledgeGateway(),
    resume: new MockResumeGateway(),
    workspace: new MockWorkspaceGateway(),
    ...overrides
  }
}

/**
 * @brief 使用每次渲染独享的依赖装配测试应用 / Render the test app with per-render dependencies.
 * @param props 应用测试属性 / Application test properties.
 * @return 测试用 React 应用元素 / React application element for tests.
 */
export function WorkspaceApp({
  diagnostics,
  gateways,
  ...props
}: TestWorkspaceAppProps): React.JSX.Element {
  return (
    <SharedWorkspaceApp
      {...props}
      diagnostics={diagnostics ?? createDiagnostics({ sinks: [] })}
      gateways={gateways ?? createTestGateways()}
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
