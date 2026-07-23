import { beforeEach } from 'vitest'
import { render } from 'vitest-browser-react'
import { WorkspaceApp } from '@ai-job-workspace/app'
import type { AppGateways } from '@ai-job-workspace/app/application'
import { createDiagnostics } from '@ai-job-workspace/app/diagnostics'
import { appI18n, appI18nReady } from '@ai-job-workspace/app/i18n'
import {
  InMemoryIdentityGateway,
  InMemoryInterviewGateway,
  InMemoryKnowledgeGateway,
  InMemoryResumeGateway,
  InMemoryWorkspaceGateway,
  InMemoryWorkspaceOperationsGateway,
  InMemoryWorkspaceOperationsStore
} from '@ai-job-workspace/app/testing'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'

/**
 * @brief 为真实浏览器测试创建独享 Gateway / Create per-test gateways for real-browser tests.
 * @return 不共享可变状态的 Gateway 集合 / Gateway collection without shared mutable state.
 */
function createBrowserTestGateways(): AppGateways {
  /** @brief 同时实现 Resume 各用例端口的独享测试适配器 / Isolated test adapter implementing each Resume use-case port. */
  const operationsStore = new InMemoryWorkspaceOperationsStore()
  /** @brief 与 Resume command 共享状态的 Workspace Operations adapter / Workspace Operations adapter sharing state with Resume commands. */
  const workspaceOperations = new InMemoryWorkspaceOperationsGateway({}, operationsStore)
  const resume = new InMemoryResumeGateway({ operationsStore })
  return {
    identity: new InMemoryIdentityGateway(),
    interview: new InMemoryInterviewGateway(),
    knowledge: new InMemoryKnowledgeGateway(),
    resume,
    resumeCreation: resume,
    resumeTemplates: resume,
    workspace: new InMemoryWorkspaceGateway(),
    workspaceOperations
  }
}

/**
 * @brief 在 Chromium 中渲染独享的工作区应用 / Render an isolated workspace application in Chromium.
 * @param initialPath 用户旅程的初始路由 / Initial route for the user journey.
 * @return 可通过可访问语义查询的浏览器渲染结果 / Browser render result queryable by accessible semantics.
 */
export async function renderBrowserWorkspace(
  initialPath: string
): Promise<Awaited<ReturnType<typeof render>>> {
  return render(
    <WorkspaceApp
      artifactSave={{
        maximumArtifactBytes: null,
        saveArtifact: () => Promise.resolve({ status: 'saved' })
      }}
      diagnostics={createDiagnostics({ sinks: [] })}
      gateways={createBrowserTestGateways()}
      initialPath={initialPath}
      runtimeInfo={{ appVersion: APPLICATION_VERSION, platform: 'web' }}
    />
  )
}

/**
 * @brief 注册浏览器测试的每用例隔离初始化 / Register per-test browser isolation setup.
 * @return 无返回值 / No return value.
 */
export function installBrowserWorkspaceTestSetup(): void {
  beforeEach(async (): Promise<void> => {
    await appI18nReady
    await appI18n.changeLanguage('zh-SG')
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })
}
