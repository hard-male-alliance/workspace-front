import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { createDiagnostics } from '../infrastructure/observability'
import { useAsyncResource } from './AppData'
import { DiagnosticsProvider } from './Diagnostics'

/** @brief 可由测试精确兑现的 Promise / Promise that a test can settle precisely. */
interface Deferred<TValue> {
  /** @brief 受控 Promise / Controlled promise. */
  readonly promise: Promise<TValue>
  /** @brief 以成功值兑现 Promise / Fulfil the promise with a successful value. */
  readonly resolve: (value: TValue) => void
}

/**
 * @brief 创建测试控制的异步结果 / Create an asynchronous result controlled by a test.
 * @template TValue 成功值类型 / Successful value type.
 * @return 可独立兑现的 Promise 与 resolver / Independently settleable promise and resolver.
 */
function createDeferred<TValue>(): Deferred<TValue> {
  /** @brief 底层 Promise resolver / Underlying promise resolver. */
  let resolvePromise: ((value: TValue) => void) | undefined
  /** @brief 等待测试兑现的 Promise / Promise awaiting test settlement. */
  const promise = new Promise<TValue>((resolve): void => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve: (value): void => {
      resolvePromise?.(value)
    }
  }
}

/** @brief Hook 测试共享的无输出诊断端口 / Silent diagnostics port shared by hook tests. */
const diagnostics = createDiagnostics({ sinks: [] })

/**
 * @brief 为异步资源 Hook 注入诊断上下文 / Inject diagnostics context for the async-resource Hook.
 * @param props 测试子树 / Test subtree.
 * @return 已注入诊断端口的测试子树 / Test subtree with diagnostics injected.
 */
function AsyncResourceTestProvider({
  children
}: {
  readonly children: ReactNode
}): React.JSX.Element {
  return <DiagnosticsProvider diagnostics={diagnostics}>{children}</DiagnosticsProvider>
}

/** @brief 异步资源生命周期测试 / Async-resource lifecycle tests. */
describe('useAsyncResource', (): void => {
  it('returns loading immediately when the domain resource key changes', async (): Promise<void> => {
    /** @brief A 资源加载结果 / Resource A load result. */
    const resourceA = createDeferred<string>()
    /** @brief B 资源加载结果 / Resource B load result. */
    const resourceB = createDeferred<string>()
    /** @brief 当前 key 应读取的受控资源 / Controlled resource that the current key should load. */
    let currentResource = resourceA
    /** @brief 跨 key 保持同一函数身份的加载器 / Loader retaining the same function identity across keys. */
    const load = (): Promise<string> => currentResource.promise
    /** @brief 被测 Hook 与重渲染控制器 / Hook under test and its rerender control. */
    const { result, rerender } = renderHook(
      ({ resourceKey }: { readonly resourceKey: string }) =>
        useAsyncResource('resume.editor', load, resourceKey),
      {
        initialProps: { resourceKey: 'resume-a' },
        wrapper: AsyncResourceTestProvider
      }
    )

    await act(async (): Promise<void> => {
      resourceA.resolve('authoritative-a')
      await resourceA.promise
    })
    await waitFor((): void => expect(result.current.status).toBe('ready'))
    expect(result.current).toMatchObject({ data: 'authoritative-a', status: 'ready' })

    currentResource = resourceB
    rerender({ resourceKey: 'resume-b' })

    expect(result.current.status).toBe('loading')
    expect(result.current).not.toHaveProperty('data')
  })

  it('ignores a late A response after B has become authoritative', async (): Promise<void> => {
    /** @brief 延迟兑现的 A 资源 / Late resource A. */
    const resourceA = createDeferred<string>()
    /** @brief 先兑现的 B 资源 / Earlier resource B. */
    const resourceB = createDeferred<string>()
    /** @brief A 的稳定加载器 / Stable loader for A. */
    const loadA = (): Promise<string> => resourceA.promise
    /** @brief B 的稳定加载器 / Stable loader for B. */
    const loadB = (): Promise<string> => resourceB.promise
    /** @brief 被测 Hook 与重渲染控制器 / Hook under test and its rerender control. */
    const { result, rerender } = renderHook(
      ({
        load,
        resourceKey
      }: {
        readonly load: () => Promise<string>
        readonly resourceKey: string
      }) => useAsyncResource('knowledge.visibility', load, resourceKey),
      {
        initialProps: { load: loadA, resourceKey: 'source-a' },
        wrapper: AsyncResourceTestProvider
      }
    )

    rerender({ load: loadB, resourceKey: 'source-b' })
    await act(async (): Promise<void> => {
      resourceB.resolve('authoritative-b')
      await resourceB.promise
    })
    await waitFor((): void =>
      expect(result.current).toMatchObject({ data: 'authoritative-b', status: 'ready' })
    )

    await act(async (): Promise<void> => {
      resourceA.resolve('stale-a')
      await resourceA.promise
    })

    expect(result.current).toMatchObject({ data: 'authoritative-b', status: 'ready' })
  })
})
