import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { InterviewGateway, KnowledgeGateway, ResumeGateway, WorkspaceGateway } from '../domain'

/** @brief 共享页面需要的 gateway 集合 / Gateway collection required by shared pages. */
export interface AppGateways {
  /** @brief 工作区数据 gateway / Workspace data gateway. */
  readonly workspace: WorkspaceGateway
  /** @brief 简历数据 gateway / Resume data gateway. */
  readonly resume: ResumeGateway
  /** @brief 面试数据 gateway / Interview data gateway. */
  readonly interview: InterviewGateway
  /** @brief 知识库数据 gateway / Knowledge data gateway. */
  readonly knowledge: KnowledgeGateway
}

/** @brief gateway 依赖注入上下文 / Gateway dependency-injection context. */
const AppGatewayContext = createContext<AppGateways | null>(null)

/** @brief 应用数据提供器属性 / App data-provider properties. */
export interface AppDataProviderProps {
  /** @brief 页面可使用的 gateway 集合 / Gateway collection accessible to pages. */
  readonly gateways: AppGateways
  /** @brief 使用数据依赖的子树 / Child tree that consumes data dependencies. */
  readonly children: ReactNode
}

/**
 * @brief 注入可替换的数据 gateway / Inject replaceable data gateways.
 * @param props 提供器属性 / Provider properties.
 * @return 数据依赖上下文提供器 / Data-dependency context provider.
 */
export function AppDataProvider({ children, gateways }: AppDataProviderProps): React.JSX.Element {
  return <AppGatewayContext.Provider value={gateways}>{children}</AppGatewayContext.Provider>
}

/**
 * @brief 读取当前页面的数据 gateway / Read the current page data gateways.
 * @return 已注入的 gateway 集合 / Injected gateway collection.
 * @throws 未被 AppDataProvider 包裹时抛出错误 / Throws when not wrapped by AppDataProvider.
 */
export function useAppGateways(): AppGateways {
  /** @brief 当前 gateway 依赖 / Current gateway dependency. */
  const gateways = useContext(AppGatewayContext)

  if (gateways === null) {
    throw new Error('Workspace pages require AppDataProvider.')
  }

  return gateways
}

/** @brief 异步资源状态 / Async resource state. */
export type AsyncResource<TValue> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: TValue }
  | { readonly status: 'error'; readonly error: Error }

/**
 * @brief 加载 gateway 返回的异步资源 / Load an asynchronous resource returned by a gateway.
 * @template TValue 成功资源类型 / Successful resource type.
 * @param load 稳定的异步加载函数 / Stable async loader function.
 * @return 加载中、成功或失败的资源状态 / Loading, ready, or failed resource state.
 * @note 调用方应以 useCallback 包装 load，避免无意重复请求。
 */
export function useAsyncResource<TValue>(load: () => Promise<TValue>): AsyncResource<TValue> {
  /** @brief 资源当前状态 / Current resource state. */
  const [resource, setResource] = useState<AsyncResource<TValue>>({ status: 'loading' })

  useEffect((): (() => void) => {
    /** @brief effect 是否仍然存活 / Whether the effect is still active. */
    let active = true

    void load()
      .then((data): void => {
        if (active) {
          setResource({ status: 'ready', data })
        }
      })
      .catch((reason: unknown): void => {
        if (active) {
          setResource({
            status: 'error',
            error: reason instanceof Error ? reason : new Error('Unable to load workspace data.')
          })
        }
      })

    return (): void => {
      active = false
    }
  }, [load])

  return resource
}
