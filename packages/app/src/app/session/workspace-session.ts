/** @file 身份与 Workspace 权威组合的应用会话 / Application session combining Identity and Workspace authorities. */

import type { AppGateways } from '../../application'
import type { UiCurrentUser, UiWorkspace, UiWorkspaceId } from '../../published-language'

/** @brief Identity 与 Workspace 端口合成的原始权威 / Raw authority composed from Identity and Workspace ports. */
interface WorkspaceAuthority {
  /** @brief 当前已认证用户 / Current authenticated user. */
  readonly currentUser: UiCurrentUser
  /** @brief 当前主体可访问的 Workspace / Workspaces accessible to the current principal. */
  readonly workspaces: readonly UiWorkspace[]
}

/** @brief 当前应用会话的 Workspace 访问快照 / Workspace-access snapshot for the current application session. */
export interface WorkspaceSessionAccess {
  /** @brief 当前已认证用户 / Current authenticated user. */
  readonly currentUser: UiCurrentUser
  /** @brief 本次应用会话选中的工作区 / Workspace selected for this application session. */
  readonly currentWorkspace: UiWorkspace | undefined
  /** @brief 当前用户可访问的工作区 / Workspaces accessible to the current user. */
  readonly workspaces: readonly UiWorkspace[]
}

/** @brief 当前工作区会话端口 / Current-workspace session port. */
export interface WorkspaceSession {
  /**
   * @brief 读取本次应用会话缓存的访问快照 / Read the access snapshot cached for this application session.
   * @return 当前用户、当前工作区与全部可访问工作区 / Current user, current Workspace, and all accessible Workspaces.
   */
  readonly getAccess: () => Promise<WorkspaceSessionAccess>
  /**
   * @brief 读取本次应用会话选中的工作区 / Read the workspace selected for this application session.
   * @return 当前工作区；无可访问工作区时为 undefined / Current workspace, or undefined when none is accessible.
   */
  readonly getCurrentWorkspace: () => Promise<UiWorkspace | undefined>
  /** @brief 读取 Workspace 选择修订号，用于隔离依赖当前 Workspace 的资源 / Read the selection revision used to isolate Workspace-scoped resources. */
  readonly getSelectionRevision: () => number
  /**
   * @brief 重新读取身份与 Workspace 访问权威 / Reload identity and Workspace-access authority.
   * @return 重新校验选择后的访问快照 / Access snapshot after revalidating the selection.
   */
  readonly refreshAccess: () => Promise<WorkspaceSessionAccess>
  /**
   * @brief 显式选择一个可访问的 Workspace / Explicitly select an accessible Workspace.
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
 * @brief 将服务端默认 Workspace 稳定地排在列表首位 / Stably place the server-default Workspace first.
 * @param currentUser 当前用户权威 / Current-user authority.
 * @param workspaces 可访问 Workspace / Accessible Workspaces.
 * @return 保留既有 v1 展示顺序的 Workspace 列表 / Workspace list preserving existing v1 display order.
 */
function orderWorkspaces(
  currentUser: UiCurrentUser,
  workspaces: readonly UiWorkspace[]
): readonly UiWorkspace[] {
  if (currentUser.defaultWorkspaceId === null) return workspaces
  return [...workspaces].sort((left, right): number => {
    if (left.id === currentUser.defaultWorkspaceId) return -1
    if (right.id === currentUser.defaultWorkspaceId) return 1
    return 0
  })
}

/**
 * @brief 为应用生命周期创建单一工作区选择 / Create one workspace selection for the application lifecycle.
 * @param identityGateway Identity 上下文端口 / Identity context port.
 * @param workspaceGateway Workspace 上下文端口 / Workspace context port.
 * @return 会并行组合权威、合并并发读取且失败后允许重试的会话端口 / Session port that composes authorities concurrently, coalesces reads, and permits retry after failure.
 */
export function createWorkspaceSession(
  identityGateway: AppGateways['identity'],
  workspaceGateway: AppGateways['workspace']
): WorkspaceSession {
  /** @brief 当前共享的访问权威读取 / Current shared authority read. */
  let currentAccessRequest: Promise<WorkspaceSessionAccess> | undefined
  /** @brief 最近一次成功读取的原始访问权威 / Most recently loaded raw authority. */
  let currentAuthority: WorkspaceAuthority | undefined
  /** @brief 当前权威对应的用户身份 / User identity associated with the current authority. */
  let currentUserId: UiCurrentUser['id'] | undefined
  /** @brief 用户显式选择或有效默认偏好得到的 Workspace ID / Workspace ID from explicit selection or a valid default preference. */
  let selectedWorkspaceId: UiWorkspaceId | undefined
  /** @brief Workspace 选择变化的单调修订号 / Monotonic Workspace-selection revision. */
  let selectionRevision = 0
  /** @brief 选择失效订阅者 / Selection-invalidation subscribers. */
  const listeners = new Set<() => void>()

  /**
   * @brief 从权威中查找一个 Workspace / Find one Workspace in an authority snapshot.
   * @param authority 当前组合权威 / Current composed authority.
   * @param workspaceId 候选 Workspace ID / Candidate Workspace ID.
   * @return 可访问 Workspace；不存在时为 undefined / Accessible Workspace, or undefined when absent.
   */
  function findWorkspace(
    authority: WorkspaceAuthority,
    workspaceId: UiWorkspaceId | null | undefined
  ): UiWorkspace | undefined {
    if (workspaceId === null || workspaceId === undefined) return undefined
    return authority.workspaces.find((workspace) => workspace.id === workspaceId)
  }

  /**
   * @brief 投影当前访问快照，不把列表顺序当作选择 / Project current access without treating list order as selection.
   * @param authority 当前组合权威 / Current composed authority.
   * @return 当前应用会话快照 / Current application-session snapshot.
   */
  function projectAccess(authority: WorkspaceAuthority): WorkspaceSessionAccess {
    return {
      currentUser: authority.currentUser,
      currentWorkspace: findWorkspace(authority, selectedWorkspaceId),
      workspaces: authority.workspaces
    }
  }

  /** @brief 通知依赖 Workspace 身份的消费者丢弃旧资源 / Notify Workspace-scoped consumers to discard stale resources. */
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
    /** @brief 当前主体是否发生变化 / Whether the current principal changed. */
    const principalChanged =
      currentUserId !== undefined && currentUserId !== authority.currentUser.id
    /** @brief 是否为首次权威读取 / Whether this is the initial authority read. */
    const isInitialAuthority = currentUserId === undefined

    if (isInitialAuthority || principalChanged) {
      selectedWorkspaceId = findWorkspace(authority, authority.currentUser.defaultWorkspaceId)?.id
    } else if (findWorkspace(authority, selectedWorkspaceId) === undefined) {
      selectedWorkspaceId = undefined
    }

    currentAuthority = authority
    currentUserId = authority.currentUser.id
    if (!isInitialAuthority && (principalChanged || previousWorkspaceId !== selectedWorkspaceId)) {
      notifySelectionChanged()
    }
    return projectAccess(authority)
  }

  /**
   * @brief 并行读取 Identity 与 Workspace 权威 / Read Identity and Workspace authorities concurrently.
   * @return 合成后的访问权威 / Composed access authority.
   */
  async function loadAuthority(): Promise<WorkspaceAuthority> {
    /** @brief 并行读取的当前用户与可访问 Workspace / Concurrently loaded current user and accessible Workspaces. */
    const [currentUser, workspaces] = await Promise.all([
      identityGateway.loadCurrentUser(),
      workspaceGateway.listAccessibleWorkspaces()
    ])
    return { currentUser, workspaces: orderWorkspaces(currentUser, workspaces) }
  }

  /**
   * @brief 读取并缓存会话访问快照 / Read and cache the session-access snapshot.
   * @return 当前会话访问快照 / Current session-access snapshot.
   */
  function getAccess(): Promise<WorkspaceSessionAccess> {
    currentAccessRequest ??= loadAuthority()
      .then(acceptAuthority)
      .catch((error: unknown): never => {
        currentAccessRequest = undefined
        throw error
      })

    return currentAccessRequest
  }

  /**
   * @brief 从缓存的访问快照读取当前工作区 / Read the current Workspace from the cached access snapshot.
   * @return 当前工作区引用 / Current Workspace reference.
   */
  function getCurrentWorkspace(): Promise<UiWorkspace | undefined> {
    return getAccess().then((access) => access.currentWorkspace)
  }

  /** @brief 读取 Workspace 选择修订号 / Read the Workspace-selection revision. */
  function getSelectionRevision(): number {
    return selectionRevision
  }

  /** @brief 丢弃缓存并重新组合权威 / Discard the cache and recompose authority. */
  function refreshAccess(): Promise<WorkspaceSessionAccess> {
    currentAccessRequest = undefined
    return getAccess()
  }

  /**
   * @brief 显式选择可访问 Workspace / Explicitly select an accessible Workspace.
   * @param workspaceId 用户选择的 Workspace ID / Workspace ID selected by the user.
   * @return 选择完成后的 Promise / Promise fulfilled after selection.
   */
  async function selectWorkspace(workspaceId: UiWorkspaceId): Promise<void> {
    await getAccess()
    if (
      currentAuthority === undefined ||
      findWorkspace(currentAuthority, workspaceId) === undefined
    ) {
      throw new Error('The selected Workspace is not accessible to the current user.')
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
    refreshAccess,
    selectWorkspace,
    subscribe
  }
}
