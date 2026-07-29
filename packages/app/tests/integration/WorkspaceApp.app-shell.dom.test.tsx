import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryIdentityGateway, InMemoryWorkspaceGateway } from '@ai-job-workspace/app/testing'
import { ApiV2ProblemError } from '@ai-job-workspace/product-api-v2'
import { asUiEmailAddress, asUiPrincipalSubject } from '../../src/contexts/identity'
import { asUiWorkspaceSlug } from '../../src/contexts/workspace'
import { asUiOpaqueId } from '../../src/shared-kernel/identity'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/**
 * @brief 读取确定性的 Identity 与 WorkspaceAccess fixture / Read deterministic Identity and WorkspaceAccess fixtures.
 * @return 当前用户与首个访问权威 / Current user and first access authority.
 */
async function readDemoAuthority(): Promise<{
  readonly currentUser: Awaited<ReturnType<InMemoryIdentityGateway['loadCurrentUser']>>
  readonly firstAccess: Awaited<
    ReturnType<InMemoryWorkspaceGateway['listWorkspaceAccessPage']>
  >['items'][number]
}> {
  /** @brief fixture 读取共享的取消信号 / Shared cancellation signal for fixture reads. */
  const signal = new AbortController().signal
  /** @brief 并行读取的 Identity 与访问页 / Concurrently read Identity and access page. */
  const [currentUser, page] = await Promise.all([
    new InMemoryIdentityGateway().loadCurrentUser(signal),
    new InMemoryWorkspaceGateway().listWorkspaceAccessPage({ cursor: null, limit: 200, signal })
  ])
  /** @brief 首个 fixture 访问权威 / First fixture access authority. */
  const firstAccess = page.items[0]
  if (firstAccess === undefined) throw new Error('WorkspaceAccess fixture is missing.')
  return { currentUser, firstAccess }
}

/** @brief 应用外壳与工作台用户行为测试 / App-shell and workspace user-behaviour tests. */
interface TestAccountSessionInput {
  readonly displayName: string
  readonly email: string
  readonly subject: string
  readonly userId: string
  readonly workspaceId: string
  readonly workspaceName: string
  readonly workspaceSlug: string
}

async function createAccountSessionGateways(
  input: TestAccountSessionInput
): Promise<ReturnType<typeof createTestGateways>> {
  const { currentUser, firstAccess } = await readDemoAuthority()
  const workspaceId = asUiOpaqueId<'workspace'>(input.workspaceId)
  const access = {
    ...firstAccess,
    memberId: asUiOpaqueId<'workspace-member'>(`member_${input.workspaceId}`),
    workspace: {
      ...firstAccess.workspace,
      id: workspaceId,
      name: input.workspaceName,
      slug: asUiWorkspaceSlug(input.workspaceSlug)
    }
  }

  return createTestGateways({
    identity: {
      loadCurrentUser: vi.fn().mockResolvedValue({
        ...currentUser,
        defaultWorkspaceId: workspaceId,
        displayName: input.displayName,
        email: asUiEmailAddress(input.email),
        id: asUiOpaqueId<'user'>(input.userId),
        subject: asUiPrincipalSubject(input.subject)
      })
    },
    workspace: {
      listWorkspaceAccessPage: vi.fn().mockResolvedValue({
        hasMore: false,
        items: [access],
        nextCursor: null
      })
    }
  })
}

interface AccountSwitchHarnessProps {
  readonly accountA: ReturnType<typeof createTestGateways>
  readonly accountB: ReturnType<typeof createTestGateways>
}

function AccountSwitchHarness({
  accountA,
  accountB
}: AccountSwitchHarnessProps): React.JSX.Element {
  const [phase, setPhase] = useState<'account-a' | 'account-b' | 'signed-out'>('account-a')

  if (phase === 'signed-out') {
    return (
      <main>
        <h1>Signed out locally</h1>
        <button onClick={(): void => setPhase('account-b')} type="button">
          Establish account B session
        </button>
      </main>
    )
  }

  return (
    <WorkspaceApp
      gateways={phase === 'account-a' ? accountA : accountB}
      initialPath="/"
      key={phase}
      onSignOut={(): Promise<void> => {
        setPhase('signed-out')
        return Promise.resolve()
      }}
    />
  )
}

describe('WorkspaceApp app shell', (): void => {
  it('仅在宿主提供能力时呈现并调用退出登录', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 宿主登出 spy / Host sign-out spy. */
    const onSignOut = vi.fn((): Promise<void> => Promise.resolve())

    render(<WorkspaceApp initialPath="/" onSignOut={onSignOut} />)
    fireEvent.click(await screen.findByRole('button', { name: '退出登录' }))

    await waitFor((): void => expect(onSignOut).toHaveBeenCalledOnce())
  })

  it('clears account A state before showing a later account B session', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    const accountA = await createAccountSessionGateways({
      displayName: 'Account Alpha',
      email: 'account.alpha@example.com',
      subject: 'subject_account_alpha',
      userId: 'user_account_alpha',
      workspaceId: 'ws_account_alpha',
      workspaceName: 'Alpha Workspace',
      workspaceSlug: 'alpha-workspace'
    })
    const accountB = await createAccountSessionGateways({
      displayName: 'Account Beta',
      email: 'account.beta@example.com',
      subject: 'subject_account_beta',
      userId: 'user_account_beta',
      workspaceId: 'ws_account_beta',
      workspaceName: 'Beta Workspace',
      workspaceSlug: 'beta-workspace'
    })

    render(<AccountSwitchHarness accountA={accountA} accountB={accountB} />)

    expect(await screen.findByText('Account Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Workspace')).not.toBeInTheDocument()
    expect(screen.queryByText('Account Beta')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta Workspace')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^(Sign out|退出登录)$/u }))
    expect(await screen.findByRole('heading', { name: 'Signed out locally' })).toBeInTheDocument()
    expect(screen.queryByText('Account Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Alpha Workspace')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Establish account B session' }))

    expect(await screen.findByText('Account Beta')).toBeInTheDocument()
    expect(screen.queryByText('Beta Workspace')).not.toBeInTheDocument()
    expect(screen.queryByText('Account Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Alpha Workspace')).not.toBeInTheDocument()
  })

  it('keeps one current workspace selection while navigating across contexts', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 跨路由复用的测试 Gateway / Test gateways reused across routes. */
    const gateways = createTestGateways()
    /** @brief 内存 Identity 原始读取 / Original in-memory Identity read. */
    const readDemoUser = gateways.identity.loadCurrentUser.bind(gateways.identity)
    /** @brief 内存 Workspace 原始读取 / Original in-memory Workspace read. */
    const readDemoWorkspacePage = gateways.workspace.listWorkspaceAccessPage.bind(
      gateways.workspace
    )
    /** @brief 非固定姓名的 Identity 读取 / Identity read with a non-hardcoded name. */
    const loadCurrentUser = vi
      .spyOn(gateways.identity, 'loadCurrentUser')
      .mockImplementation(async (signal) => ({
        ...(await readDemoUser(signal)),
        displayName: 'Ada Lovelace'
      }))
    /** @brief 非固定工作区名称的 Workspace 读取 / Workspace read with a non-hardcoded name. */
    const listWorkspaceAccessPage = vi
      .spyOn(gateways.workspace, 'listWorkspaceAccessPage')
      .mockImplementation(async (request) => {
        /** @brief 原始访问页 / Original access page. */
        const page = await readDemoWorkspacePage(request)
        return {
          ...page,
          items: page.items.map((access, index) =>
            index === 0
              ? { ...access, workspace: { ...access.workspace, name: 'Production Workspace' } }
              : access
          )
        }
      })

    render(<WorkspaceApp gateways={gateways} initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    fireEvent.click(screen.getByRole('link', { name: '简历' }))
    await screen.findByRole('heading', { name: '简历库' })
    fireEvent.click(screen.getByRole('link', { name: '模拟面试' }))
    await screen.findByRole('heading', { name: '模拟面试' })

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('A', { selector: '.aw-avatar' })).toBeInTheDocument()
    expect(screen.queryByText('Production Workspace')).not.toBeInTheDocument()
    expect(screen.queryByText('Klee')).not.toBeInTheDocument()
    expect(loadCurrentUser).toHaveBeenCalledTimes(1)
    expect(listWorkspaceAccessPage).toHaveBeenCalledTimes(1)
  })

  it('uses the first accessible Workspace when authority has no valid default', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 无默认 Workspace 的身份权威 / Identity authority without a default Workspace. */
    const { currentUser } = await readDemoAuthority()
    /** @brief 测试 Identity gateway / Test Identity gateway. */
    const identity = {
      loadCurrentUser: vi.fn().mockResolvedValue({ ...currentUser, defaultWorkspaceId: null })
    }

    render(<WorkspaceApp gateways={createTestGateways({ identity })} initialPath="/" />)

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '当前工作区' })).not.toBeInTheDocument()
  })

  it('shows the selected WorkspaceAccess role, plan, and data region', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    /** @brief 首页中的访问权威定义列表 / Access-authority definition list on the home page. */
    const authority = screen.getByLabelText('工作区访问权限')
    expect(within(authority).getByText('所有者')).toBeInTheDocument()
    expect(within(authority).getByText('个人版')).toBeInTheDocument()
    expect(within(authority).getByText('中国大陆')).toBeInTheDocument()
    expect(within(authority).queryByText('member_mock_klee_owner')).not.toBeInTheDocument()
  })

  it('does not invent an account while the Workspace authority is loading', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 永不完成的 Identity 启动读取 / Identity bootstrap read that never settles. */
    const pendingIdentity = new Promise<never>(() => undefined)

    render(
      <WorkspaceApp
        gateways={createTestGateways({
          identity: { loadCurrentUser: (): Promise<never> => pendingIdentity }
        })}
        initialPath="/"
      />
    )

    expect(screen.getByText('正在加载账户…')).toBeInTheDocument()
    expect(screen.getByText('正在加载工作区…')).toBeInTheDocument()
    expect(screen.queryByText('Klee')).not.toBeInTheDocument()
  })

  it('shows a safe retryable shell error without leaking adapter details', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 明确失败的 Identity gateway / Explicitly failing Identity gateway. */
    const identity = new InMemoryIdentityGateway({ mode: 'error' })
    /** @brief 启动读取观察 / Bootstrap-read observation. */
    const loadCurrentUser = vi.spyOn(identity, 'loadCurrentUser')

    render(<WorkspaceApp gateways={createTestGateways({ identity })} initialPath="/" />)

    expect(await screen.findByText('账户信息暂时不可用')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '无法加载工作区' })).toBeInTheDocument()
    expect(screen.queryByText('In-memory gateway is configured to fail.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor((): void => expect(loadCurrentUser).toHaveBeenCalledTimes(2))
  })

  it('turns a Workspace 401 into localized guidance without exposing ProblemDetails text', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 返回真实 API v2 身份失败语义的 Identity 端口 / Identity port returning real API v2 authentication-failure semantics. */
    const identity = {
      loadCurrentUser: vi.fn().mockRejectedValue(
        new ApiV2ProblemError(
          {
            code: 'auth.token_expired',
            detail: 'private auth detail at https://internal.example.test/oidc',
            errors: [],
            extensions: null,
            instance: null,
            request_id: 'req_auth_12345678',
            retryable: false,
            status: 401,
            title: 'private authentication title',
            type: 'https://api.hmalliances.org/problems/token-expired'
          },
          null
        )
      )
    }

    render(<WorkspaceApp gateways={createTestGateways({ identity })} initialPath="/" />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This content requires sign-in')
    expect(alert).toHaveTextContent('Support reference: req_auth_12345678')
    expect(alert).not.toHaveTextContent(/private|internal\.example/u)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('renders only the runtime identity injected by its host composition root', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 显式注入的 Electron 测试运行时 / Explicitly injected Electron test runtime. */
    const { container } = render(
      <WorkspaceApp
        initialPath="/"
        runtimeInfo={{
          apiBaseUrl: 'https://api.example.test',
          appVersion: '9.9.9-test',
          platform: 'electron'
        }}
      />
    )

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('data-runtime-platform', 'electron')
    expect(container.firstElementChild).toHaveAttribute('data-runtime-version', '9.9.9-test')
  })

  it('renders the shared workspace home through Mock gateways', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/" />)

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '继续编辑简历' })).toHaveAttribute(
      'href',
      '/resumes/res_mock_ai_platform/edit'
    )
  })

  it('starts in dark mode and lets the student switch to the light theme locally', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    fireEvent.click(screen.getByRole('button', { name: '切换为浅色主题' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem('inkwell-theme')).toBe('light')
  })

  it('presents the action-first dashboard and keeps every existing workspace area reachable', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/" />)

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日最重要的事' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '继续处理' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '最近更新' })).toBeInTheDocument()

    expect(screen.getByRole('link', { name: '工作台' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '简历' })).toHaveAttribute('href', '/resumes')
    expect(screen.getByRole('link', { name: '模拟面试' })).toHaveAttribute('href', '/interviews')
    expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('href', '/knowledge')
    expect(screen.queryByRole('link', { name: '可见性' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '状态' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '反馈' })).not.toBeInTheDocument()
  })

  it('renders simplified RoleStory chrome without placeholder or workspace controls', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前测试身份与默认工作区 / Current test identity and default Workspace. */
    const { currentUser, firstAccess } = await readDemoAuthority()

    const { container } = render(<WorkspaceApp initialPath="/" />)

    await screen.findByRole('heading', { name: "Today's workspace" })
    expect(screen.getByRole('link', { name: 'RoleStory workspace home' })).toHaveTextContent(
      'RoleStory'
    )
    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Current workspace' })).not.toBeInTheDocument()

    /** @brief 左下角精简后的账户区域 / Simplified account region in the lower-left corner. */
    const account = container.querySelector('.aw-account')
    expect(account).not.toBeNull()
    if (account === null) throw new Error('Expected the account region.')
    expect(within(account).getByText(currentUser.displayName)).toBeInTheDocument()
    expect(within(account).queryByText(firstAccess.workspace.name)).not.toBeInTheDocument()
    expect(within(account).queryByText('Owner')).not.toBeInTheDocument()
    expect(within(account).queryByText('Personal')).not.toBeInTheDocument()
  })

  it('renders English chrome and retains accessible names for compact navigation', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')

    render(<WorkspaceApp initialPath="/" />)

    expect(await screen.findByRole('heading', { name: "Today's workspace" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/resumes')
    expect(screen.getByRole('link', { name: 'Mock interview' })).toHaveAttribute(
      'href',
      '/interviews'
    )
    expect(document.documentElement.lang).toBe('en-US')
    expect(document.title).toBe('Career Workspace')
  })
})
