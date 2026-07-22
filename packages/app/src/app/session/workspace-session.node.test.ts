/** @file Identity 与 Workspace v2 权威会话测试 / Identity and Workspace v2 authority-session tests. */

import { describe, expect, it, vi } from 'vitest'

import {
  asUiEmailAddress,
  asUiOAuthScope,
  asUiPrincipalSubject,
  asUiUserLocale,
  type IdentityGateway,
  type UiCurrentUser
} from '../../contexts/identity'
import {
  asUiWorkspaceCursor,
  asUiWorkspaceRevision,
  asUiWorkspaceSlug,
  asUiWorkspaceTimestamp,
  type UiWorkspaceAccess,
  type UiWorkspaceAccessPage,
  type UiWorkspaceAccessPageRequest,
  type WorkspaceGateway
} from '../../contexts/workspace'
import { asUiOpaqueId } from '../../shared-kernel/identity'
import { createWorkspaceSession } from './workspace-session'

/** @brief 测试用 WorkspaceAccess / WorkspaceAccess used by tests. */
function workspaceAccess(
  id: string,
  role: UiWorkspaceAccess['role'] = 'editor'
): UiWorkspaceAccess {
  return {
    memberId: asUiOpaqueId<'workspace-member'>(`member_${id}`),
    role,
    workspace: {
      createdAt: asUiWorkspaceTimestamp('2026-07-22T00:00:00.000Z'),
      dataRegion: 'cn',
      id: asUiOpaqueId<'workspace'>(id),
      name: `Workspace ${id}`,
      plan: 'team',
      revision: asUiWorkspaceRevision(1),
      slug: asUiWorkspaceSlug(id.replaceAll('_', '-')),
      updatedAt: asUiWorkspaceTimestamp('2026-07-22T00:00:00.000Z')
    }
  }
}

/** @brief 构造符合 v2 Page 关系不变量的测试页 / Build a test page satisfying the v2 Page relation invariant. */
function workspacePage(
  items: readonly UiWorkspaceAccess[],
  nextCursor: string | null = null
): UiWorkspaceAccessPage {
  return nextCursor === null
    ? { hasMore: false, items, nextCursor: null }
    : { hasMore: true, items, nextCursor: asUiWorkspaceCursor(nextCursor) }
}

/** @brief 测试用 Identity 与 Workspace 权威 / Identity and Workspace authorities used by tests. */
interface TestAuthority {
  /** @brief 当前用户权威 / Current-user authority. */
  readonly currentUser: UiCurrentUser
  /** @brief 以 cursor 键控的 WorkspaceAccess 页面 / WorkspaceAccess pages keyed by cursor. */
  readonly pages: ReadonlyMap<string | null, UiWorkspaceAccessPage>
}

/**
 * @brief 创建可控 v2 权威 / Create controllable v2 authorities.
 * @param input 用户与第一页覆盖 / User and first-page overrides.
 * @return Identity 与 Workspace 测试权威 / Identity and Workspace test authority.
 */
function testAuthority(input?: {
  readonly defaultWorkspaceId?: string | null
  readonly firstPage?: UiWorkspaceAccessPage
  readonly subject?: string
  readonly userId?: string
}): TestAuthority {
  /** @brief 默认第一页访问权威 / Default first-page access authority. */
  const firstPage =
    input?.firstPage ??
    workspacePage([workspaceAccess('ws_one', 'owner'), workspaceAccess('ws_two')])
  return {
    currentUser: {
      defaultWorkspaceId:
        input?.defaultWorkspaceId === undefined || input.defaultWorkspaceId === null
          ? null
          : asUiOpaqueId<'workspace'>(input.defaultWorkspaceId),
      displayName: 'Workspace Tester',
      email: asUiEmailAddress('workspace.tester@example.com'),
      emailVerified: true,
      id: asUiOpaqueId<'user'>(input?.userId ?? 'user_one'),
      locale: asUiUserLocale('zh-SG'),
      scopes: new Set([asUiOAuthScope('workspace.read')]),
      subject: asUiPrincipalSubject(input?.subject ?? 'oidc-subject-one')
    },
    pages: new Map([[null, firstPage]])
  }
}

/**
 * @brief 创建可原子替换的 v2 Gateways / Create v2 Gateways backed by replaceable authority.
 * @param initial 初始测试权威 / Initial test authority.
 * @return 独立端口与权威替换函数 / Independent ports and an authority replacement function.
 */
function controllableGateways(initial: TestAuthority): {
  readonly identity: IdentityGateway
  readonly setAuthority: (authority: TestAuthority) => void
  readonly workspace: WorkspaceGateway
} {
  /** @brief 两个端口当前读取的权威 / Authority currently read by both ports. */
  let authority = initial
  return {
    identity: {
      loadCurrentUser: (signal): Promise<UiCurrentUser> => {
        signal.throwIfAborted()
        return Promise.resolve(authority.currentUser)
      }
    },
    setAuthority(next): void {
      authority = next
    },
    workspace: {
      listWorkspaceAccessPage: (
        request: UiWorkspaceAccessPageRequest
      ): Promise<UiWorkspaceAccessPage> => {
        request.signal.throwIfAborted()
        /** @brief 当前 cursor 对应的权威页 / Authority page for the current cursor. */
        const page = authority.pages.get(request.cursor)
        if (page === undefined) return Promise.reject(new Error('Unknown test cursor.'))
        return Promise.resolve(page)
      }
    }
  }
}

describe('createWorkspaceSession', (): void => {
  it('并行读取 Identity 与首个 WorkspaceAccess 页面并传递同一取消信号', async (): Promise<void> => {
    /** @brief 两个未完成读取共享的初始权威 / Initial authority shared by two pending reads. */
    const authority = testAuthority({ defaultWorkspaceId: 'ws_one' })
    /** @brief 已启动端口的顺序 / Order in which ports started. */
    const started: string[] = []
    /** @brief Identity 读取完成器 / Identity-read resolver. */
    let resolveIdentity: ((user: UiCurrentUser) => void) | undefined
    /** @brief Workspace 页面读取完成器 / Workspace-page resolver. */
    let resolvePage: ((page: UiWorkspaceAccessPage) => void) | undefined
    /** @brief Identity 收到的信号 / Signal received by Identity. */
    let identitySignal: AbortSignal | undefined
    /** @brief Workspace 收到的信号 / Signal received by Workspace. */
    let workspaceSignal: AbortSignal | undefined
    /** @brief 可控 Identity 端口 / Controllable Identity port. */
    const identity: IdentityGateway = {
      loadCurrentUser: (signal) => {
        started.push('identity')
        identitySignal = signal
        return new Promise<UiCurrentUser>((resolve) => {
          resolveIdentity = resolve
        })
      }
    }
    /** @brief 可控 Workspace 端口 / Controllable Workspace port. */
    const workspace: WorkspaceGateway = {
      listWorkspaceAccessPage: (request) => {
        started.push('workspace')
        workspaceSignal = request.signal
        expect(request).toMatchObject({ cursor: null, limit: 200 })
        return new Promise<UiWorkspaceAccessPage>((resolve) => {
          resolvePage = resolve
        })
      }
    }
    /** @brief 尚未完成的组合读取 / Pending composed read. */
    const access = createWorkspaceSession(identity, workspace).getAccess()

    expect(started).toEqual(['identity', 'workspace'])
    expect(identitySignal).toBe(workspaceSignal)
    resolveIdentity?.(authority.currentUser)
    resolvePage?.(authority.pages.get(null)!)
    await expect(access).resolves.toMatchObject({
      currentWorkspaceAccess: { role: 'owner', workspace: { id: 'ws_one' } }
    })
  })

  it('保留服务端顺序并且只在已加载访问页内采用默认 Workspace', async (): Promise<void> => {
    /** @brief 默认值位于未加载页的权威 / Authority whose default appears only on a later page. */
    const authority = testAuthority({
      defaultWorkspaceId: 'ws_three',
      firstPage: workspacePage([workspaceAccess('ws_two'), workspaceAccess('ws_one')], 'cursor_two')
    })
    /** @brief 第二页 WorkspaceAccess / Second WorkspaceAccess page. */
    const secondPage = workspacePage([workspaceAccess('ws_three', 'viewer')])
    /** @brief 包含第二页的权威 / Authority including the second page. */
    const pagedAuthority: TestAuthority = {
      ...authority,
      pages: new Map([
        [null, authority.pages.get(null)!],
        ['cursor_two', secondPage]
      ])
    }
    const gateways = controllableGateways(pagedAuthority)
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)

    await expect(session.getAccess()).resolves.toMatchObject({
      accesses: [{ workspace: { id: 'ws_two' } }, { workspace: { id: 'ws_one' } }],
      currentWorkspaceAccess: undefined,
      hasMoreWorkspaces: true,
      nextWorkspaceCursor: 'cursor_two'
    })
    await expect(session.loadMoreWorkspaceAccesses()).resolves.toMatchObject({
      accesses: [
        { workspace: { id: 'ws_two' } },
        { workspace: { id: 'ws_one' } },
        { workspace: { id: 'ws_three' } }
      ],
      currentWorkspaceAccess: undefined,
      hasMoreWorkspaces: false,
      nextWorkspaceCursor: null
    })
  })

  it('追加页面时按 Workspace ID 去重并保留显式选择', async (): Promise<void> => {
    /** @brief 第一页 / First page. */
    const firstPage = workspacePage(
      [workspaceAccess('ws_one'), workspaceAccess('ws_two')],
      'cursor_two'
    )
    /** @brief 带跨页重复项的第二页 / Second page containing a cross-page duplicate. */
    const secondPage = workspacePage([workspaceAccess('ws_two'), workspaceAccess('ws_three')])
    /** @brief 两页测试权威 / Two-page test authority. */
    const authority: TestAuthority = {
      ...testAuthority({ defaultWorkspaceId: 'ws_one', firstPage }),
      pages: new Map([
        [null, firstPage],
        ['cursor_two', secondPage]
      ])
    }
    const gateways = controllableGateways(authority)
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)
    await session.selectWorkspace(asUiOpaqueId<'workspace'>('ws_two'))

    await expect(session.loadMoreWorkspaceAccesses()).resolves.toMatchObject({
      accesses: [
        { workspace: { id: 'ws_one' } },
        { workspace: { id: 'ws_two' } },
        { workspace: { id: 'ws_three' } }
      ],
      currentWorkspaceAccess: { workspace: { id: 'ws_two' } }
    })
  })

  it('拒绝未推进或跨页循环的 cursor 以免产品界面进入分页死循环', async (): Promise<void> => {
    /** @brief 第一页 / First page. */
    const firstPage = workspacePage([workspaceAccess('ws_one')], 'cursor_same')
    /** @brief 错误地返回同一 cursor 的第二页 / Second page incorrectly returning the same cursor. */
    const loopingPage = workspacePage([workspaceAccess('ws_two')], 'cursor_same')
    /** @brief cursor 不推进的测试权威 / Test authority whose cursor does not advance. */
    const authority: TestAuthority = {
      ...testAuthority({ defaultWorkspaceId: 'ws_one', firstPage }),
      pages: new Map([
        [null, firstPage],
        ['cursor_same', loopingPage]
      ])
    }
    const gateways = controllableGateways(authority)
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)

    await expect(session.loadMoreWorkspaceAccesses()).rejects.toThrow('entered a cycle')
    await expect(session.getAccess()).resolves.toMatchObject({
      accesses: [{ workspace: { id: 'ws_one' } }],
      hasMoreWorkspaces: true,
      nextWorkspaceCursor: 'cursor_same'
    })

    /** @brief 第一页指向 cursor A 的跨页循环权威 / Cross-page cyclic authority whose first page points to cursor A. */
    const cyclicFirstPage = workspacePage([workspaceAccess('ws_one')], 'cursor_a')
    /** @brief cursor A 指向 cursor B / Cursor A pointing to cursor B. */
    const cyclicSecondPage = workspacePage([workspaceAccess('ws_two')], 'cursor_b')
    /** @brief cursor B 错误地返回 cursor A / Cursor B incorrectly returning cursor A. */
    const cyclicThirdPage = workspacePage([workspaceAccess('ws_three')], 'cursor_a')
    /** @brief 三页循环权威 / Three-page cyclic authority. */
    const cyclicAuthority: TestAuthority = {
      ...testAuthority({ defaultWorkspaceId: 'ws_one', firstPage: cyclicFirstPage }),
      pages: new Map([
        [null, cyclicFirstPage],
        ['cursor_a', cyclicSecondPage],
        ['cursor_b', cyclicThirdPage]
      ])
    }
    const cyclicGateways = controllableGateways(cyclicAuthority)
    const cyclicSession = createWorkspaceSession(cyclicGateways.identity, cyclicGateways.workspace)

    await expect(cyclicSession.loadMoreWorkspaceAccesses()).resolves.toMatchObject({
      nextWorkspaceCursor: 'cursor_b'
    })
    await expect(cyclicSession.loadMoreWorkspaceAccesses()).rejects.toThrow('entered a cycle')
    await expect(cyclicSession.getAccess()).resolves.toMatchObject({
      accesses: [{ workspace: { id: 'ws_one' } }, { workspace: { id: 'ws_two' } }],
      nextWorkspaceCursor: 'cursor_b'
    })
  })

  it('没有有效默认值时不把第一页第一项当作隐式 Workspace', async (): Promise<void> => {
    const gateways = controllableGateways(testAuthority())
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)

    await expect(session.getCurrentWorkspace()).resolves.toBeUndefined()
    await expect(session.getAccess()).resolves.toMatchObject({
      currentWorkspaceAccess: undefined
    })
  })

  it('拒绝选择不在已加载访问权威中的 Workspace', async (): Promise<void> => {
    const gateways = controllableGateways(testAuthority({ defaultWorkspaceId: 'ws_one' }))
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)

    await expect(
      session.selectWorkspace(asUiOpaqueId<'workspace'>('ws_forbidden'))
    ).rejects.toThrow('not accessible')
    await expect(session.getCurrentWorkspace()).resolves.toMatchObject({ id: 'ws_one' })
  })

  it('subject 变化时使旧主体的选择失效，即使用户资源 ID 相同', async (): Promise<void> => {
    const gateways = controllableGateways(
      testAuthority({ defaultWorkspaceId: 'ws_one', subject: 'subject_one' })
    )
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)
    const listener = vi.fn()
    session.subscribe(listener)
    await session.selectWorkspace(asUiOpaqueId<'workspace'>('ws_two'))
    gateways.setAuthority(
      testAuthority({ defaultWorkspaceId: 'ws_one', subject: 'subject_two', userId: 'user_one' })
    )

    await expect(session.refreshAccess()).resolves.toMatchObject({
      currentUser: { subject: 'subject_two' },
      currentWorkspaceAccess: { workspace: { id: 'ws_one' } }
    })
    expect(session.getSelectionRevision()).toBe(2)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('subject 不变时不因用户资源 ID 变化而丢失仍有效的显式选择', async (): Promise<void> => {
    const gateways = controllableGateways(
      testAuthority({ defaultWorkspaceId: 'ws_one', subject: 'stable_subject', userId: 'user_one' })
    )
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)
    const listener = vi.fn()
    session.subscribe(listener)
    await session.selectWorkspace(asUiOpaqueId<'workspace'>('ws_two'))
    gateways.setAuthority(
      testAuthority({ defaultWorkspaceId: 'ws_one', subject: 'stable_subject', userId: 'user_two' })
    )

    await expect(session.refreshAccess()).resolves.toMatchObject({
      currentUser: { id: 'user_two' },
      currentWorkspaceAccess: { workspace: { id: 'ws_two' } }
    })
    expect(session.getSelectionRevision()).toBe(1)
    expect(listener).toHaveBeenCalledOnce()
  })
})
