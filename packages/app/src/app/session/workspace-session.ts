/** @file Identity 与 WorkspaceAccess v2 权威组合会话 / Session composing Identity and WorkspaceAccess v2 authorities. */

import type { IdentityGateway, UiCurrentUser } from '../../contexts/identity'
import type {
  UiWorkspace,
  UiWorkspaceAccess,
  UiWorkspaceAccessPage,
  UiWorkspaceCursor,
  WorkspaceGateway
} from '../../contexts/workspace'
import type { UiWorkspaceId } from '../../shared-kernel/identity'

/** @brief Workspace 会话首屏采用 v2 最大页大小 / Workspace-session first page uses the v2 maximum page size. */
const WORKSPACE_PAGE_LIMIT = 200

/** @brief Identity 与首个 WorkspaceAccess Page 合成的权威 / Authority composed from Identity and the first WorkspaceAccess Page. */
interface WorkspaceAuthority {
  /** @brief 当前已认证用户 / Current authenticated user. */
  readonly currentUser: UiCurrentUser
  /** @brief 已加载的 WorkspaceAccess 权威 / Loaded WorkspaceAccess authorities. */
  readonly accesses: readonly UiWorkspaceAccess[]
  /** @brief 是否仍有未加载 Workspace / Whether unloaded Workspaces remain. */
  readonly hasMoreWorkspaces: boolean
  /** @brief 下一页 Workspace cursor / Cursor for the next Workspace page. */
  readonly nextWorkspaceCursor: UiWorkspaceCursor | null
}

/** @brief Workspace 会话访问快照公共字段 / Common fields of a Workspace-session access snapshot. */
interface WorkspaceSessionAccessBase {
  /** @brief 当前已认证用户 / Current authenticated user. */
  readonly currentUser: UiCurrentUser
  /** @brief 已加载的 WorkspaceAccess 权威 / Loaded WorkspaceAccess authorities. */
  readonly accesses: readonly UiWorkspaceAccess[]
  /** @brief 本次应用会话选中的访问权威 / Access authority selected for this application session. */
  readonly currentWorkspaceAccess: UiWorkspaceAccess | undefined
}

/** @brief 仍有未加载 Workspace 的会话快照 / Session snapshot with unloaded Workspaces. */
interface WorkspaceSessionAccessWithMore extends WorkspaceSessionAccessBase {
  /** @brief 仍有未加载 Workspace / Unloaded Workspaces remain. */
  readonly hasMoreWorkspaces: true
  /** @brief 下一页 Workspace cursor / Cursor for the next Workspace page. */
  readonly nextWorkspaceCursor: UiWorkspaceCursor
}

/** @brief 已加载末页的 Workspace 会话快照 / Workspace-session snapshot whose final page is loaded. */
interface WorkspaceSessionAccessFinal extends WorkspaceSessionAccessBase {
  /** @brief 不再有未加载 Workspace / No unloaded Workspace remains. */
  readonly hasMoreWorkspaces: false
  /** @brief 末页没有后续 cursor / A final page has no following cursor. */
  readonly nextWorkspaceCursor: null
}

/** @brief 保留 v2 Page 关系与访问角色的 Workspace 会话快照 / Workspace-session snapshot preserving v2 Page relations and access roles. */
export type WorkspaceSessionAccess = WorkspaceSessionAccessWithMore | WorkspaceSessionAccessFinal

/** @brief 当前 Workspace 会话端口 / Current-Workspace session port. */
export interface WorkspaceSession {
  /**
   * @brief 读取本次应用会话缓存的访问快照 / Read the access snapshot cached for this application session.
   * @return 当前用户、已加载访问权威与分页状态 / Current user, loaded access authorities, and pagination state.
   */
  readonly getAccess: () => Promise<WorkspaceSessionAccess>
  /**
   * @brief 读取本次应用会话选中的 Workspace / Read the Workspace selected for this application session.
   * @return 当前 Workspace；没有有效选择时为 undefined / Current Workspace, or undefined without a valid selection.
   */
  readonly getCurrentWorkspace: () => Promise<UiWorkspace | undefined>
  /** @brief 读取 Workspace 选择修订号，用于隔离 Workspace 范围资源 / Read the selection revision used to isolate Workspace-scoped resources. */
  readonly getSelectionRevision: () => number
  /**
   * @brief 追加下一页 WorkspaceAccess / Append the next WorkspaceAccess page.
   * @param signal 可选调用方取消信号 / Optional caller cancellation signal.
   * @return 去重追加后的访问快照 / Access snapshot after deduplicated append.
   */
  readonly loadMoreWorkspaceAccesses: (signal?: AbortSignal) => Promise<WorkspaceSessionAccess>
  /**
   * @brief 重新读取 Identity 与首个 WorkspaceAccess Page / Reload Identity and the first WorkspaceAccess Page.
   * @return 重新校验选择后的访问快照 / Access snapshot after revalidating the selection.
   */
  readonly refreshAccess: () => Promise<WorkspaceSessionAccess>
  /**
   * @brief 显式选择一个已加载且可访问的 Workspace / Explicitly select a loaded, accessible Workspace.
   * @param workspaceId 用户选择的 Workspace ID / Workspace ID selected by the user.
   * @return 选择完成后的 Promise / Promise fulfilled after selection.
   */
  readonly selectWorkspace: (workspaceId: UiWorkspaceId) => Promise<void>
  /**
   * @brief 订阅 Workspace 选择变化 / Subscribe to Workspace-selection changes.
   * @param listener 不接收用户数据的失效通知 / Invalidation listener receiving no user data.
   * @return 取消订阅函数 / Unsubscribe function.
   */
  readonly subscribe: (listener: () => void) => () => void
}

/**
 * @brief 在已加载权威中查找 WorkspaceAccess / Find a WorkspaceAccess in loaded authority.
 * @param authority 当前组合权威 / Current composed authority.
 * @param workspaceId 候选 Workspace ID / Candidate Workspace ID.
 * @return 已加载访问权威；不存在时为 undefined / Loaded access authority, or undefined when absent.
 */
function findAccess(
  authority: WorkspaceAuthority,
  workspaceId: UiWorkspaceId | null | undefined
): UiWorkspaceAccess | undefined {
  if (workspaceId === null || workspaceId === undefined) return undefined
  return authority.accesses.find((access) => access.workspace.id === workspaceId)
}

/**
 * @brief 按 Workspace ID 稳定追加并去重访问权威 / Stably append and deduplicate access authorities by Workspace ID.
 * @param current 已加载访问权威 / Currently loaded access authorities.
 * @param following 后续页访问权威 / Access authorities from the following page.
 * @return 保持首现位置且用较新权威替换重复项的列表 / List preserving first-seen positions while replacing duplicates with newer authority.
 */
function appendUniqueAccesses(
  current: readonly UiWorkspaceAccess[],
  following: readonly UiWorkspaceAccess[]
): readonly UiWorkspaceAccess[] {
  /** @brief 可变结果副本 / Mutable result copy. */
  const result = [...current]
  /** @brief Workspace ID 到结果位置的索引 / Index from Workspace ID to result position. */
  const positions = new Map<UiWorkspaceId, number>(
    result.map((access, index) => [access.workspace.id, index])
  )
  for (const access of following) {
    /** @brief 已存在的结果位置 / Existing result position. */
    const position = positions.get(access.workspace.id)
    if (position === undefined) {
      positions.set(access.workspace.id, result.length)
      result.push(access)
    } else {
      result[position] = access
    }
  }
  return result
}

/**
 * @brief 为应用生命周期创建单一 Workspace 选择 / Create one Workspace selection for the application lifecycle.
 * @param identityGateway Identity 上下文端口 / Identity context port.
 * @param workspaceGateway Workspace 上下文端口 / Workspace context port.
 * @return 合并并发读取、保留 v2 Page 且按 subject 隔离 principal 的会话端口 / Session port coalescing reads, preserving v2 Page, and isolating principals by subject.
 */
export function createWorkspaceSession(
  identityGateway: IdentityGateway,
  workspaceGateway: WorkspaceGateway
): WorkspaceSession {
  /** @brief 当前共享的访问权威读取 / Current shared authority read. */
  let currentAccessRequest: Promise<WorkspaceSessionAccess> | undefined
  /** @brief 当前共享的下一页读取 / Current shared next-page read. */
  let currentLoadMoreRequest: Promise<WorkspaceSessionAccess> | undefined
  /** @brief 最近一次成功读取的访问权威 / Most recently loaded access authority. */
  let currentAuthority: WorkspaceAuthority | undefined
  /** @brief 当前权威对应的 OIDC subject / OIDC subject associated with the current authority. */
  let currentSubject: UiCurrentUser['subject'] | undefined
  /** @brief 当前显式选择或有效默认偏好得到的 Workspace ID / Workspace ID from explicit selection or a valid default preference. */
  let selectedWorkspaceId: UiWorkspaceId | undefined
  /** @brief 当前权威世代已经成功消费的追加页 cursor / Append-page cursors successfully consumed in the current authority generation. */
  let consumedWorkspaceCursors = new Set<UiWorkspaceCursor>()
  /** @brief Workspace 选择变化的单调修订号 / Monotonic Workspace-selection revision. */
  let selectionRevision = 0
  /** @brief 权威世代，用于拒绝跨 refresh 的迟到页面 / Authority generation used to reject pages arriving across refresh. */
  let authorityGeneration = 0
  /** @brief 当前首屏读取控制器 / Current first-page read controller. */
  let authorityController: AbortController | undefined
  /** @brief 当前追加页读取控制器 / Current append-page read controller. */
  let loadMoreController: AbortController | undefined
  /** @brief 选择失效订阅者 / Selection-invalidation subscribers. */
  const listeners = new Set<() => void>()

  /**
   * @brief 投影当前访问快照 / Project the current access snapshot.
   * @param authority 当前组合权威 / Current composed authority.
   * @return 保留访问角色与 Page 关系的快照 / Snapshot preserving access roles and Page relations.
   */
  function projectAccess(authority: WorkspaceAuthority): WorkspaceSessionAccess {
    /** @brief 快照公共字段 / Common snapshot fields. */
    const snapshot = {
      accesses: authority.accesses,
      currentUser: authority.currentUser,
      currentWorkspaceAccess: findAccess(authority, selectedWorkspaceId)
    }
    return authority.hasMoreWorkspaces && authority.nextWorkspaceCursor !== null
      ? {
          ...snapshot,
          hasMoreWorkspaces: true,
          nextWorkspaceCursor: authority.nextWorkspaceCursor
        }
      : { ...snapshot, hasMoreWorkspaces: false, nextWorkspaceCursor: null }
  }

  /** @brief 通知 Workspace 范围消费者丢弃旧资源 / Notify Workspace-scoped consumers to discard stale resources. */
  function notifySelectionChanged(): void {
    selectionRevision += 1
    for (const listener of listeners) listener()
  }

  /**
   * @brief 依据新权威校验当前选择 / Reconcile the selection against newly loaded authority.
   * @param authority 新读取的组合权威 / Newly loaded composed authority.
   * @return 已协调的应用会话快照 / Reconciled application-session snapshot.
   */
  function acceptAuthority(authority: WorkspaceAuthority): WorkspaceSessionAccess {
    /** @brief 协调前的 Workspace 选择 / Workspace selection before reconciliation. */
    const previousWorkspaceId = selectedWorkspaceId
    /** @brief 是否为首次权威读取 / Whether this is the initial authority read. */
    const isInitialAuthority = currentSubject === undefined
    /** @brief principal 是否按 OIDC subject 发生变化 / Whether the principal changed by OIDC subject. */
    const principalChanged =
      currentSubject !== undefined && currentSubject !== authority.currentUser.subject

    if (isInitialAuthority || principalChanged) {
      selectedWorkspaceId = findAccess(authority, authority.currentUser.defaultWorkspaceId)
        ?.workspace.id
    } else if (findAccess(authority, selectedWorkspaceId) === undefined) {
      selectedWorkspaceId = undefined
    }

    currentAuthority = authority
    currentSubject = authority.currentUser.subject
    consumedWorkspaceCursors = new Set()
    if (!isInitialAuthority && (principalChanged || previousWorkspaceId !== selectedWorkspaceId)) {
      notifySelectionChanged()
    }
    return projectAccess(authority)
  }

  /**
   * @brief 并行读取 Identity 与首个 WorkspaceAccess Page / Read Identity and the first WorkspaceAccess Page concurrently.
   * @param signal 两个端口共享的取消信号 / Cancellation signal shared by both ports.
   * @return 合成后的访问权威 / Composed access authority.
   */
  async function loadAuthority(signal: AbortSignal): Promise<WorkspaceAuthority> {
    /** @brief 并行读取的当前用户与访问页 / Concurrently loaded current user and access page. */
    const [currentUser, page] = await Promise.all([
      identityGateway.loadCurrentUser(signal),
      workspaceGateway.listWorkspaceAccessPage({
        cursor: null,
        limit: WORKSPACE_PAGE_LIMIT,
        signal
      })
    ])
    return {
      accesses: page.items,
      currentUser,
      hasMoreWorkspaces: page.hasMore,
      nextWorkspaceCursor: page.nextCursor
    }
  }

  /**
   * @brief 读取并缓存会话访问快照 / Read and cache the session-access snapshot.
   * @return 当前会话访问快照 / Current session-access snapshot.
   */
  function getAccess(): Promise<WorkspaceSessionAccess> {
    if (currentAccessRequest !== undefined) return currentAccessRequest

    /** @brief 本轮权威读取控制器 / Controller for this authority read. */
    const controller = new AbortController()
    authorityController = controller
    /** @brief 本轮权威世代 / Authority generation for this read. */
    const generation = authorityGeneration
    /** @brief 可并发共享的权威读取 / Authority read shared by concurrent callers. */
    const request = loadAuthority(controller.signal)
      .then((authority): WorkspaceSessionAccess => {
        if (generation !== authorityGeneration) {
          throw new DOMException(
            'A newer Workspace authority read superseded this request.',
            'AbortError'
          )
        }
        return acceptAuthority(authority)
      })
      .catch((error: unknown): never => {
        if (currentAccessRequest === request) currentAccessRequest = undefined
        throw error
      })
      .finally((): void => {
        if (authorityController === controller) authorityController = undefined
      })

    currentAccessRequest = request
    return request
  }

  /**
   * @brief 从缓存访问权威读取当前 Workspace / Read the current Workspace from cached access authority.
   * @return 当前 Workspace 引用 / Current Workspace reference.
   */
  function getCurrentWorkspace(): Promise<UiWorkspace | undefined> {
    return getAccess().then((access) => access.currentWorkspaceAccess?.workspace)
  }

  /** @brief 读取 Workspace 选择修订号 / Read the Workspace-selection revision. */
  function getSelectionRevision(): number {
    return selectionRevision
  }

  /**
   * @brief 追加下一页 WorkspaceAccess / Append the next WorkspaceAccess page.
   * @param signal 可选调用方取消信号 / Optional caller cancellation signal.
   * @return 去重追加后的访问快照 / Access snapshot after deduplicated append.
   */
  async function loadMoreWorkspaceAccesses(signal?: AbortSignal): Promise<WorkspaceSessionAccess> {
    await getAccess()
    if (currentLoadMoreRequest !== undefined) return currentLoadMoreRequest
    /** @brief 本轮追加前的稳定权威引用 / Stable authority reference before this append. */
    const authority = currentAuthority
    if (
      authority === undefined ||
      !authority.hasMoreWorkspaces ||
      authority.nextWorkspaceCursor === null
    ) {
      if (authority === undefined) throw new Error('Workspace authority is unavailable.')
      return projectAccess(authority)
    }

    /** @brief 本轮追加页 cursor / Cursor for this append. */
    const cursor = authority.nextWorkspaceCursor
    /** @brief 本轮追加页控制器 / Controller for this append. */
    const controller = new AbortController()
    loadMoreController = controller
    /** @brief 同时响应 refresh 与调用方取消的信号 / Signal responding to both refresh and caller cancellation. */
    const requestSignal =
      signal === undefined ? controller.signal : AbortSignal.any([controller.signal, signal])
    /** @brief 本轮追加所属权威世代 / Authority generation owning this append. */
    const generation = authorityGeneration
    /** @brief 可并发共享的追加页请求 / Append-page request shared by concurrent callers. */
    const request = workspaceGateway
      .listWorkspaceAccessPage({ cursor, limit: WORKSPACE_PAGE_LIMIT, signal: requestSignal })
      .then((page: UiWorkspaceAccessPage): WorkspaceSessionAccess => {
        if (generation !== authorityGeneration || currentAuthority !== authority) {
          throw new DOMException('A newer Workspace authority superseded this page.', 'AbortError')
        }
        /** @brief 若接受本页后全部已消费 cursor / All consumed cursors if this page is accepted. */
        const nextConsumedCursors = new Set(consumedWorkspaceCursors)
        nextConsumedCursors.add(cursor)
        if (page.hasMore && nextConsumedCursors.has(page.nextCursor)) {
          throw new Error('Workspace pagination cursor entered a cycle.')
        }
        /** @brief 追加后的权威 / Authority after appending the page. */
        const appended: WorkspaceAuthority = {
          ...authority,
          accesses: appendUniqueAccesses(authority.accesses, page.items),
          hasMoreWorkspaces: page.hasMore,
          nextWorkspaceCursor: page.nextCursor
        }
        currentAuthority = appended
        consumedWorkspaceCursors = nextConsumedCursors
        /** @brief 追加页后的快照 / Snapshot after appending the page. */
        const snapshot = projectAccess(appended)
        currentAccessRequest = Promise.resolve(snapshot)
        return snapshot
      })

    currentLoadMoreRequest = request
    try {
      return await request
    } finally {
      if (currentLoadMoreRequest === request) currentLoadMoreRequest = undefined
      if (loadMoreController === controller) loadMoreController = undefined
    }
  }

  /** @brief 丢弃缓存并重新组合首屏权威 / Discard cached pages and recompose first-page authority. */
  function refreshAccess(): Promise<WorkspaceSessionAccess> {
    authorityGeneration += 1
    authorityController?.abort()
    loadMoreController?.abort()
    authorityController = undefined
    loadMoreController = undefined
    currentAccessRequest = undefined
    currentLoadMoreRequest = undefined
    return getAccess()
  }

  /**
   * @brief 显式选择已加载可访问 Workspace / Explicitly select a loaded accessible Workspace.
   * @param workspaceId 用户选择的 Workspace ID / Workspace ID selected by the user.
   * @return 选择完成后的 Promise / Promise fulfilled after selection.
   */
  async function selectWorkspace(workspaceId: UiWorkspaceId): Promise<void> {
    await getAccess()
    if (currentAuthority === undefined || findAccess(currentAuthority, workspaceId) === undefined) {
      throw new Error('The selected Workspace is not accessible in the loaded authority.')
    }
    if (selectedWorkspaceId === workspaceId) return

    selectedWorkspaceId = workspaceId
    currentAccessRequest = Promise.resolve(projectAccess(currentAuthority))
    notifySelectionChanged()
  }

  /**
   * @brief 订阅 Workspace 选择变化 / Subscribe to Workspace-selection changes.
   * @param listener 选择失效监听器 / Selection-invalidation listener.
   * @return 取消订阅函数 / Unsubscribe function.
   */
  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return (): void => {
      listeners.delete(listener)
    }
  }

  return {
    getAccess,
    getCurrentWorkspace,
    getSelectionRevision,
    loadMoreWorkspaceAccesses,
    refreshAccess,
    selectWorkspace,
    subscribe
  }
}
