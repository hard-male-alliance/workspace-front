/** @file API v2 Resume library 页面集成测试 / API v2 Resume-library page integration tests. */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppGateways } from '../../src/application'
import { AppDataProvider, useWorkspaceSession } from '../../src/app/AppData'
import { DiagnosticsProvider } from '../../src/app/Diagnostics'
import { InMemoryIdentityGateway } from '../../src/contexts/identity/infrastructure/memory/gateway'
import { InMemoryInterviewGateway } from '../../src/contexts/interview/infrastructure/memory/gateway'
import { InMemoryKnowledgeGateway } from '../../src/contexts/knowledge/infrastructure/memory/gateway'
import type { ResumeGateway } from '../../src/contexts/resume/application/gateway'
import {
  asUiResumeCursor,
  type UiResumeSummary,
  type UiResumeSummaryPage
} from '../../src/contexts/resume/domain/models'
import type { UiResumeId } from '../../src/contexts/resume/domain/document'
import {
  MOCK_DAWN_TEMPLATE_ID,
  MOCK_RESUME_WORKSPACE_ID
} from '../../src/contexts/resume/infrastructure/memory/data'
import { InMemoryResumeGateway } from '../../src/contexts/resume/infrastructure/memory/gateway'
import { ResumeListPage } from '../../src/contexts/resume/presentation/ResumeListPage'
import type { UiWorkspaceAccess } from '../../src/contexts/workspace/domain/models'
import { asUiWorkspaceSlug } from '../../src/contexts/workspace/domain/models'
import { DEMO_WORKSPACE_ACCESSES } from '../../src/contexts/workspace/infrastructure/memory/data'
import { InMemoryWorkspaceGateway } from '../../src/contexts/workspace/infrastructure/memory/gateway'
import { InMemoryWorkspaceOperationsGateway } from '../../src/contexts/workspace-operations/infrastructure/memory/gateway'
import { createDiagnostics } from '../../src/infrastructure/observability'
import { appI18n, setAppLocale } from '../../src/i18n'
import { asUiOpaqueId, type UiWorkspaceId } from '../../src/shared-kernel/identity'

/** @brief DOM 测试的无输出诊断端口 / Silent diagnostics port for DOM tests. */
const diagnostics = createDiagnostics({ sinks: [] })

/** @brief 第二个 Workspace 的测试 ID / Test ID for the second Workspace. */
const SECOND_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_resume_library_second')

/**
 * @brief 创建契约完整的 ResumeSummary fixture / Create a contract-complete ResumeSummary fixture.
 * @param id Resume ID / Resume ID.
 * @param title 用户可见标题 / User-visible title.
 * @param workspaceId 所属 Workspace / Owning Workspace.
 * @param updatedAt 最近更新时刻 / Most recent update timestamp.
 * @return API v2 产品投影 / API v2 product projection.
 */
function createSummary(
  id: UiResumeId,
  title: string,
  workspaceId: UiWorkspaceId = MOCK_RESUME_WORKSPACE_ID,
  updatedAt = '2026-07-20T08:30:00.000Z'
): UiResumeSummary {
  return {
    createdAt: '2026-07-01T00:00:00.000Z',
    id,
    locale: 'zh-SG',
    revision: 3,
    templateId: MOCK_DAWN_TEMPLATE_ID,
    templateVersion: '1.0.0',
    title,
    updatedAt,
    workspaceId
  }
}

/**
 * @brief 组合页面测试依赖 / Compose page-test dependencies.
 * @param resume Resume 端口 / Resume port.
 * @param workspace 可选 WorkspaceAccess 端口 / Optional WorkspaceAccess port.
 * @return 完整应用端口集 / Complete application-port set.
 */
function createGateways(
  resume: ResumeGateway,
  workspace = new InMemoryWorkspaceGateway()
): AppGateways {
  /** @brief 本页面不使用但保持组合契约完整的 Resume 能力适配器 / Resume capability adapter keeping composition complete although unused by this page. */
  const resumeCapabilities = new InMemoryResumeGateway()
  return {
    identity: new InMemoryIdentityGateway(),
    interview: new InMemoryInterviewGateway(),
    knowledge: new InMemoryKnowledgeGateway(),
    resume,
    resumeCreation: resumeCapabilities,
    resumeTemplates: resumeCapabilities,
    workspace,
    workspaceOperations: new InMemoryWorkspaceOperationsGateway()
  }
}

/**
 * @brief 为 Resume library 注入路由、i18n、诊断和应用端口 / Inject routing, i18n, diagnostics, and application ports for the Resume library.
 * @param gateways 当前测试端口 / Ports for the current test.
 * @param children 可选的会话测试控件 / Optional session test controls.
 * @return 完整页面测试树 / Complete page-test tree.
 */
function ResumeListTestRoot({
  children,
  gateways
}: {
  readonly children?: ReactNode
  readonly gateways: AppGateways
}): React.JSX.Element {
  return (
    <I18nextProvider i18n={appI18n}>
      <MemoryRouter initialEntries={['/resumes']}>
        <DiagnosticsProvider diagnostics={diagnostics}>
          <AppDataProvider gateways={gateways}>
            {children}
            <ResumeListPage />
          </AppDataProvider>
        </DiagnosticsProvider>
      </MemoryRouter>
    </I18nextProvider>
  )
}

/**
 * @brief 在测试中显式切换 Workspace / Explicitly switch Workspace in a test.
 * @return 可观察的切换按钮 / Observable switch button.
 */
function WorkspaceSwitchControl(): React.JSX.Element {
  /** @brief 当前应用 Workspace 会话 / Current application Workspace session. */
  const workspaceSession = useWorkspaceSession()
  return (
    <button
      onClick={() => void workspaceSession.selectWorkspace(SECOND_WORKSPACE_ID)}
      type="button"
    >
      切换测试工作区
    </button>
  )
}

beforeEach(async (): Promise<void> => {
  await setAppLocale('zh-SG')
})

afterEach((): void => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ResumeListPage', (): void => {
  it('renders an honest terminal empty state', async (): Promise<void> => {
    render(
      <ResumeListTestRoot gateways={createGateways(new InMemoryResumeGateway({ mode: 'empty' }))} />
    )

    expect(await screen.findByRole('heading', { name: '还没有简历' })).toBeInTheDocument()
    expect(screen.getByText('当前工作区还没有简历。新建后会显示在这里。')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /编辑/u })).not.toBeInTheDocument()
  })

  it('keeps loaded summaries while retrying a failed continuation page', async (): Promise<void> => {
    /** @brief 首页摘要 / First-page summary. */
    const firstSummary = createSummary(asUiOpaqueId<'resume'>('res_library_first'), '第一份简历')
    /** @brief 后续页摘要 / Continuation-page summary. */
    const secondSummary = createSummary(asUiOpaqueId<'resume'>('res_library_second'), '第二份简历')
    /** @brief 可观察的 Resume 端口 / Observable Resume port. */
    const resume = new InMemoryResumeGateway()
    /** @brief 测试 cursor / Test cursor. */
    const cursor = asUiResumeCursor('cursor_resume_library_next')
    /** @brief 分页读取顺序 / Pagination read sequence. */
    const listPage = vi
      .spyOn(resume, 'listResumeSummariesPage')
      .mockResolvedValueOnce({ hasMore: true, items: [firstSummary], nextCursor: cursor })
      .mockRejectedValueOnce(new TypeError('continuation network failure'))
      .mockResolvedValueOnce({
        hasMore: false,
        items: [{ ...firstSummary, title: '第一份简历（最新）', revision: 4 }, secondSummary],
        nextCursor: null
      })

    render(<ResumeListTestRoot gateways={createGateways(resume)} />)

    expect(await screen.findByText('第一份简历')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法加载更多简历')
    expect(screen.getByText('第一份简历')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('第一份简历（最新）')).toBeInTheDocument()
    expect(screen.getByText('第二份简历')).toBeInTheDocument()
    expect(screen.queryByText('第一份简历')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('已显示当前工作区的全部简历')).toBeInTheDocument()
    expect(listPage).toHaveBeenCalledTimes(3)
    expect(listPage.mock.calls[1]?.[0]).toMatchObject({ cursor })
    expect(listPage.mock.calls[2]?.[0]).toMatchObject({ cursor })
  })

  it('renders an initial-page failure without fabricating Resume data', async (): Promise<void> => {
    render(
      <ResumeListTestRoot gateways={createGateways(new InMemoryResumeGateway({ mode: 'error' }))} />
    )

    expect(await screen.findByRole('heading', { name: '无法加载简历库' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('应用遇到未预期的问题')
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('aborts the stale Workspace request and ignores its late response', async (): Promise<void> => {
    /** @brief 默认 WorkspaceAccess fixture / Default WorkspaceAccess fixture. */
    const defaultAccess = DEMO_WORKSPACE_ACCESSES[0]
    if (defaultAccess === undefined) throw new Error('Expected a default WorkspaceAccess fixture.')
    /** @brief 用于切换的第二个 WorkspaceAccess / Second WorkspaceAccess used for switching. */
    const secondAccess: UiWorkspaceAccess = {
      ...defaultAccess,
      memberId: asUiOpaqueId<'workspace-member'>('member_resume_library_second'),
      workspace: {
        ...defaultAccess.workspace,
        id: SECOND_WORKSPACE_ID,
        name: '第二工作区',
        slug: asUiWorkspaceSlug('resume-library-second')
      }
    }
    /** @brief 返回两个可访问 Workspace 的测试端口 / Test port returning two accessible Workspaces. */
    const workspace = new InMemoryWorkspaceGateway()
    vi.spyOn(workspace, 'listWorkspaceAccessPage').mockResolvedValue({
      hasMore: false,
      items: [defaultAccess, secondAccess],
      nextCursor: null
    })
    /** @brief 延迟的旧 Workspace 结果 resolver / Resolver for the delayed old-Workspace result. */
    let resolveStalePage: ((page: UiResumeSummaryPage) => void) | undefined
    /** @brief 故意忽略 abort 以验证 UI 仍不接受迟到结果的 Promise / Promise intentionally ignoring abort to verify the UI still rejects late results. */
    const stalePage = new Promise<UiResumeSummaryPage>((resolve): void => {
      resolveStalePage = resolve
    })
    /** @brief 可观察的 Resume 端口 / Observable Resume port. */
    const resume = new InMemoryResumeGateway()
    /** @brief 旧 Workspace 请求收到的取消信号 / Cancellation signal received by the old-Workspace request. */
    let staleSignal: AbortSignal | undefined
    vi.spyOn(resume, 'listResumeSummariesPage').mockImplementation((input) => {
      if (input.workspaceId === MOCK_RESUME_WORKSPACE_ID) {
        staleSignal = input.signal
        return stalePage
      }
      return Promise.resolve({
        hasMore: false,
        items: [
          createSummary(
            asUiOpaqueId<'resume'>('res_second_workspace'),
            '第二工作区简历',
            SECOND_WORKSPACE_ID
          )
        ],
        nextCursor: null
      })
    })

    render(
      <ResumeListTestRoot gateways={createGateways(resume, workspace)}>
        <WorkspaceSwitchControl />
      </ResumeListTestRoot>
    )

    await waitFor((): void => expect(staleSignal).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: '切换测试工作区' }))

    expect(await screen.findByText('第二工作区简历')).toBeInTheDocument()
    expect(staleSignal?.aborted).toBe(true)

    await act(async (): Promise<void> => {
      resolveStalePage?.({
        hasMore: false,
        items: [createSummary(asUiOpaqueId<'resume'>('res_stale_workspace'), '迟到的旧工作区简历')],
        nextCursor: null
      })
      await stalePage
    })

    expect(screen.queryByText('迟到的旧工作区简历')).not.toBeInTheDocument()
    expect(screen.getByText('第二工作区简历')).toBeInTheDocument()
  })
})
