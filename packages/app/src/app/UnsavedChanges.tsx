/** @file 应用级未保存更改登记表 / Application-level unsaved-change registry. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/** @brief 未保存更改登记函数 / Unsaved-change registration function. */
type RegisterUnsavedChanges = (source: string) => () => void

/** @brief 未保存更改上下文值 / Unsaved-change context value. */
interface UnsavedChangesContextValue {
  /** @brief 当前是否存在任意未保存来源 / Whether any unsaved source is currently active. */
  readonly isDirty: boolean
  /** @brief 登记一个活动来源并返回它的独立取消函数 / Register one active source and return its independent disposer. */
  readonly register: RegisterUnsavedChanges
}

/** @brief 应用级未保存更改上下文 / Application-level unsaved-change context. */
const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

/** @brief 未保存更改提供器属性 / Unsaved-change provider properties. */
export interface UnsavedChangesProviderProps {
  /** @brief 可登记未保存更改的应用子树 / Application subtree that may register unsaved changes. */
  readonly children: ReactNode
}

/**
 * @brief 合并多个同时活动的未保存来源 / Combine multiple concurrently active unsaved-change sources.
 * @param props 提供器属性 / Provider properties.
 * @return 向子树提供单一应用级 dirty 信号的上下文 / Context providing one application-level dirty signal to descendants.
 */
export function UnsavedChangesProvider({
  children
}: UnsavedChangesProviderProps): React.JSX.Element {
  /** @brief 以唯一登记标识隔离的活动来源 / Active sources isolated by unique registration identities. */
  const [activeRegistrations, setActiveRegistrations] = useState<ReadonlySet<symbol>>(
    () => new Set()
  )
  /** @brief 登记一个来源且仅允许对应 disposer 移除它 / Register one source and allow only its disposer to remove it. */
  const register = useCallback<RegisterUnsavedChanges>((source) => {
    /** @brief 本次登记的不透明标识 / Opaque identity for this registration. */
    const registration = Symbol(source)
    /** @brief disposer 是否已经执行 / Whether the disposer already ran. */
    let disposed = false

    setActiveRegistrations((current) => new Set(current).add(registration))
    return (): void => {
      if (disposed) return
      disposed = true
      setActiveRegistrations((current) => {
        if (!current.has(registration)) return current
        /** @brief 移除当前登记后的新集合 / New set after removing this registration. */
        const next = new Set(current)
        next.delete(registration)
        return next
      })
    }
  }, [])
  /** @brief 聚合后的应用级 dirty 信号 / Aggregated application-level dirty signal. */
  const isDirty = activeRegistrations.size > 0
  /** @brief 仅在聚合状态改变时更新的上下文值 / Context value updated only when aggregate state changes. */
  const value = useMemo<UnsavedChangesContextValue>(
    () => ({ isDirty, register }),
    [isDirty, register]
  )

  useEffect((): (() => void) | undefined => {
    if (!isDirty || typeof window === 'undefined') return undefined

    /**
     * @brief 请求浏览器确认硬导航或关闭页面 / Ask the browser to confirm a hard navigation or page close.
     * @param event 浏览器 beforeunload 事件 / Browser beforeunload event.
     * @return 无返回值 / No return value.
     */
    const preventUnsavedUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = true
    }

    window.addEventListener('beforeunload', preventUnsavedUnload)
    return (): void => {
      window.removeEventListener('beforeunload', preventUnsavedUnload)
    }
  }, [isDirty])

  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

/**
 * @brief 登记或取消页面的未保存状态 / Register or clear a page's unsaved state.
 * @param source 在调试中可识别的稳定来源名 / Stable source name identifiable during debugging.
 * @param isDirty 该来源当前是否含未保存更改 / Whether this source currently contains unsaved changes.
 * @return 无返回值 / No return value.
 * @note 来源卸载时会自动取消登记；不会把草稿写入持久化存储 / The source unregisters on unmount; no draft is written to persistent storage.
 */
export function useUnsavedChanges(source: string, isDirty: boolean): void {
  /** @brief 当前未保存更改登记表 / Current unsaved-change registry. */
  const registry = useContext(UnsavedChangesContext)
  if (registry === null) throw new Error('Unsaved changes require UnsavedChangesProvider.')
  /** @brief 不随聚合 dirty 状态变化的稳定登记函数 / Stable registration function independent of aggregate dirty changes. */
  const { register } = registry

  useEffect((): (() => void) | undefined => {
    if (!isDirty) return undefined
    return register(source)
  }, [isDirty, register, source])
}

/**
 * @brief 读取聚合后的应用级未保存状态 / Read the aggregated application-level unsaved state.
 * @return 任意活动来源 dirty 时为 true / True when any active source is dirty.
 */
export function useHasUnsavedChanges(): boolean {
  /** @brief 当前未保存更改登记表 / Current unsaved-change registry. */
  const registry = useContext(UnsavedChangesContext)
  if (registry === null) throw new Error('Unsaved changes require UnsavedChangesProvider.')
  return registry.isDirty
}
