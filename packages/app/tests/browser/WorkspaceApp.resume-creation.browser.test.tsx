/** @file Chromium 中的 API v2 Resume 创建旅程 / API v2 Resume-creation journey in Chromium. */

import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'

import type { AppGateways } from '../../src/application'
import { AppDataProvider } from '../../src/app/AppData'
import { DiagnosticsProvider } from '../../src/app/Diagnostics'
import { InMemoryIdentityGateway } from '../../src/contexts/identity/infrastructure/memory/gateway'
import { InMemoryInterviewGateway } from '../../src/contexts/interview/infrastructure/memory/gateway'
import { InMemoryKnowledgeGateway } from '../../src/contexts/knowledge/infrastructure/memory/gateway'
import { InMemoryResumeGateway } from '../../src/contexts/resume/infrastructure/memory/gateway'
import { ResumeCreationPage } from '../../src/contexts/resume/presentation/ResumeCreationPage'
import { ResumeListPage } from '../../src/contexts/resume/presentation/ResumeListPage'
import { InMemoryWorkspaceGateway } from '../../src/contexts/workspace/infrastructure/memory/gateway'
import { createDiagnostics } from '../../src/infrastructure/observability'
import { appI18n, appI18nReady } from '../../src/i18n'

/**
 * @brief 创建浏览器旅程独享的应用端口 / Create application ports isolated to the browser journey.
 * @return Template 目录、创建和列表共享同一内存 Resume adapter 的端口 / Ports sharing one in-memory Resume adapter for catalog, creation, and listing.
 */
function createBrowserCreationGateways(): AppGateways {
  /** @brief 当前浏览器测试独享的 Resume adapter / Resume adapter isolated to this browser test. */
  const resume = new InMemoryResumeGateway()
  return {
    identity: new InMemoryIdentityGateway(),
    interview: new InMemoryInterviewGateway(),
    knowledge: new InMemoryKnowledgeGateway(),
    resume,
    resumeCreation: resume,
    resumeTemplates: resume,
    workspace: new InMemoryWorkspaceGateway()
  }
}

/**
 * @brief 渲染从 Resume library 到创建成功目标的浏览器测试树 / Render the browser test tree from Resume library to a successful creation target.
 * @return 可通过真实浏览器可访问性查询的渲染结果 / Render result queryable through real-browser accessibility semantics.
 */
async function renderResumeCreationJourney(): Promise<Awaited<ReturnType<typeof render>>> {
  return render(
    <I18nextProvider i18n={appI18n}>
      <MemoryRouter initialEntries={['/resumes']}>
        <DiagnosticsProvider diagnostics={createDiagnostics({ sinks: [] })}>
          <AppDataProvider gateways={createBrowserCreationGateways()}>
            <Routes>
              <Route element={<ResumeListPage />} path="/resumes" />
              <Route element={<ResumeCreationPage />} path="/resumes/new" />
              <Route element={<h1>Created Resume target</h1>} path="/resumes/:resumeId/edit" />
            </Routes>
          </AppDataProvider>
        </DiagnosticsProvider>
      </MemoryRouter>
    </I18nextProvider>
  )
}

beforeEach(async (): Promise<void> => {
  await appI18nReady
  await appI18n.changeLanguage('zh-SG')
})

describe('Resume creation browser journey', (): void => {
  it('opens from the library, selects through native semantics, and navigates after creation', async (): Promise<void> => {
    /** @brief 真实 Chromium 渲染结果 / Real Chromium render result. */
    const screen = await renderResumeCreationJourney()

    await expect.element(screen.getByRole('heading', { name: '简历库' })).toBeVisible()
    await screen.getByRole('link', { name: '新建简历' }).click()
    await expect.element(screen.getByRole('heading', { name: '新建简历' })).toBeVisible()

    /** @brief 浏览器原生选择的默认 Template radio / Default Template radio selected by the browser. */
    const template = screen.getByRole('radio', { name: /Dawn/u })
    await expect.element(template).toBeChecked()
    await expect
      .element(screen.getByRole('img', { name: 'Dawn 模板预览' }))
      .toHaveAttribute('referrerpolicy', 'no-referrer')

    await userEvent.fill(screen.getByRole('textbox', { name: '简历标题' }), '浏览器创建简历')
    await screen.getByRole('button', { name: '创建并开始编辑' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Created Resume target' }))
      .toBeVisible()
  })
})
