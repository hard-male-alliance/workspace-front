import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'
import type { WebRuntimeInfo } from '@ai-job-workspace/platform'

import { WorkspaceApp } from '../../../app/WorkspaceApp'
import { createDiagnostics } from '../../../diagnostics'
import {
  DemoInterviewGateway,
  MockKnowledgeGateway,
  MockResumeGateway,
  DemoWorkspaceGateway
} from '../../../testing'
import { appI18n, appI18nReady } from '../../../i18n'
import { asUiOpaqueId } from '../../../shared-kernel/identity'

/** @brief 工作区页面测试使用的无输出 Diagnostics / No-output Diagnostics used by workspace-page tests. */
const testDiagnostics = createDiagnostics({ sinks: [] })

/** @brief Workspace 页面测试的显式 Web 宿主信息 / Explicit Web-host information for Workspace page tests. */
const testRuntimeInfo: WebRuntimeInfo = {
  appVersion: APPLICATION_VERSION,
  platform: 'web'
}

/** @brief 页面测试使用的无副作用保存端口 / Side-effect-free artifact-save port used by page tests. */
const testArtifactSave = {
  saveArtifact: (): Promise<{ readonly status: 'saved' }> => Promise.resolve({ status: 'saved' })
}

afterEach((): void => {
  cleanup()
  vi.restoreAllMocks()
})

async function renderHomeWithResumeCards(
  cards: Awaited<ReturnType<MockResumeGateway['listResumeCards']>>
): Promise<void> {
  await appI18nReady
  await appI18n.changeLanguage('zh-SG')
  const resume = new MockResumeGateway()
  vi.spyOn(resume, 'listResumeCards').mockResolvedValue(cards)

  render(
    <WorkspaceApp
      artifactSave={testArtifactSave}
      diagnostics={testDiagnostics}
      gateways={{
        interview: new DemoInterviewGateway(),
        knowledge: new MockKnowledgeGateway(),
        resume,
        workspace: new DemoWorkspaceGateway()
      }}
      initialPath="/"
      runtimeInfo={testRuntimeInfo}
    />
  )
}

describe('WorkspaceHomePage Resume navigation', (): void => {
  it('links both continue actions to the most recently updated real Resume', async (): Promise<void> => {
    await renderHomeWithResumeCards([
      {
        id: asUiOpaqueId<'resume'>('res_backend_older'),
        revision: 2,
        templateName: 'Dawn',
        title: '旧简历',
        updatedAt: '2026-07-18T00:00:00.000Z'
      },
      {
        id: asUiOpaqueId<'resume'>('res_backend_latest'),
        revision: 5,
        templateName: 'Focus',
        title: '后端最新简历',
        updatedAt: '2026-07-19T00:00:00.000Z'
      }
    ])

    const links = await screen.findAllByRole('link', { name: /继续编辑简历|后端最新简历/u })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/resumes/res_backend_latest/edit')
    }
  })

  it('renders an honest empty state without a fabricated Resume link', async (): Promise<void> => {
    await renderHomeWithResumeCards([])

    expect(await screen.findByRole('heading', { name: '还没有可编辑的简历' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '继续编辑简历' })).not.toBeInTheDocument()
    expect(document.querySelector('a[href*="res_mock"]')).not.toBeInTheDocument()
    expect(
      screen.getByText(
        '工作区与面试使用本地 Demo（模拟面试不采集真实麦克风）；简历与知识库会连接当前配置的项目后端。'
      )
    ).toBeInTheDocument()
  })

  it('uses a stable Resume entry route in the application navigation', async (): Promise<void> => {
    await renderHomeWithResumeCards([])

    expect(await screen.findByRole('link', { name: '简历' })).toHaveAttribute('href', '/resumes')
  })

  it('resolves the stable Resume entry route to the latest Resume editor', async (): Promise<void> => {
    await appI18nReady
    await appI18n.changeLanguage('zh-SG')
    const resume = new MockResumeGateway()
    const getResumeEditor = vi.spyOn(resume, 'getResumeEditor')

    render(
      <WorkspaceApp
        artifactSave={testArtifactSave}
        diagnostics={testDiagnostics}
        gateways={{
          interview: new DemoInterviewGateway(),
          knowledge: new MockKnowledgeGateway(),
          resume,
          workspace: new DemoWorkspaceGateway()
        }}
        initialPath="/resumes"
        runtimeInfo={testRuntimeInfo}
      />
    )

    await vi.waitFor((): void => {
      expect(getResumeEditor).toHaveBeenCalledWith(asUiOpaqueId<'resume'>('res_mock_ai_platform'))
    })
  })
})
