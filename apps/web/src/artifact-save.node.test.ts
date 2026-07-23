import {
  asUiConcurrencyToken,
  asUiOpaqueId,
  type UiWorkspaceId
} from '@ai-job-workspace/app/application'
import { sanitizePdfFileName, type SafePdfFileName } from '@ai-job-workspace/platform'
import { describe, expect, it, vi } from 'vitest'
import {
  createWebArtifactSave,
  WEB_ARTIFACT_BLOB_MAX_BYTES,
  type WebArtifactSaveOptions
} from './artifact-save'

/** @brief 测试 Workspace 身份 / Test Workspace identity. */
const WORKSPACE_ID = asUiOpaqueId<'workspace'>('workspace_web_download') as UiWorkspaceId

/** @brief 测试 Artifact 身份 / Test Artifact identity. */
const ARTIFACT_ID = asUiOpaqueId<'workspace-artifact'>('artifact_web_download')

/** @brief 测试 metadata 强 ETag / Test strong metadata ETag. */
const METADATA_ETAG = asUiConcurrencyToken('"artifact-metadata-1"')

/** @brief 测试 content 强 ETag / Test strong content ETag. */
const CONTENT_ETAG = asUiConcurrencyToken('"artifact-content-1"')

/** @brief Web 下载所需的 Operations 端口类型 / Operations-port type required by Web downloads. */
type TestWorkspaceOperations = WebArtifactSaveOptions['workspaceOperations']

/** @brief 测试 Artifact 可覆盖字段 / Overridable test Artifact fields. */
type TestArtifactOverrides = Partial<
  Awaited<ReturnType<TestWorkspaceOperations['getArtifact']>>['artifact']
>

/**
 * @brief 构造权威测试 Artifact / Build an authoritative test Artifact.
 * @param overrides 需要覆盖的字段 / Fields to override.
 * @return 权威 Artifact 响应 / Authoritative Artifact response.
 */
function artifactAuthority(
  overrides: TestArtifactOverrides = {}
): Awaited<ReturnType<TestWorkspaceOperations['getArtifact']>> {
  return {
    artifact: {
      createdAt: '2026-07-23T00:00:00.000Z',
      expiresAt: null,
      id: ARTIFACT_ID,
      kind: 'resume_pdf',
      mediaType: 'application/pdf',
      pageCount: 1,
      revision: 1,
      sha256: '0'.repeat(64),
      sizeBytes: 4,
      subject: {
        id: 'resume_web_download',
        resourceType: 'resume',
        revision: 7
      },
      updatedAt: '2026-07-23T00:00:00.000Z',
      workspaceId: WORKSPACE_ID,
      ...overrides
    },
    concurrencyToken: METADATA_ETAG,
    requestId: 'request_metadata_web_download'
  }
}

/**
 * @brief 构造测试内容响应 / Build a test content response.
 * @param body 未消费字节流 / Unconsumed byte stream.
 * @param byteLength 声明的完整字节数 / Declared complete byte count.
 * @return 已验证内容描述 / Validated content descriptor.
 */
function artifactContent(
  body: ReadableStream<Uint8Array> | null,
  byteLength = 4
): Awaited<ReturnType<TestWorkspaceOperations['readArtifactContent']>> {
  return {
    acceptsByteRanges: true,
    body,
    byteLength,
    disposition: 'attachment',
    entityTag: CONTENT_ETAG,
    mediaType: 'application/pdf',
    requestId: 'request_content_web_download'
  }
}

/** @brief 无 DOM 副作用的测试浏览器端口 / Test browser ports without DOM side effects. */
interface TestBrowserPorts {
  /** @brief 注入创建器的配置 / Options injected into the factory. */
  readonly options: Required<Pick<WebArtifactSaveOptions, 'document' | 'objectUrls' | 'schedule'>>
  /** @brief 创建的 Blob / Blob passed to createObjectURL. */
  readonly blobs: Blob[]
}

/** @brief 可由测试显式兑现的异步结果 / Asynchronous result explicitly settled by a test. */
interface TestDeferred<Value> {
  /** @brief 尚未兑现的 Promise / Promise awaiting explicit settlement. */
  readonly promise: Promise<Value>
  /** @brief 以指定值兑现 Promise / Resolve the Promise with a value. */
  readonly resolve: (value: Value) => void
}

/**
 * @brief 创建测试可控的异步结果 / Create a test-controlled asynchronous result.
 * @return Promise 与其兑现函数 / Promise and its resolve function.
 */
function testDeferred<Value>(): TestDeferred<Value> {
  /** @brief Promise 兑现函数 / Promise resolve function. */
  let resolve!: (value: Value) => void
  /** @brief 等待测试显式兑现的 Promise / Promise awaiting explicit test settlement. */
  const promise = new Promise<Value>((settle): void => {
    resolve = settle
  })
  return { promise, resolve }
}

/**
 * @brief 构造无 DOM 副作用的测试浏览器端口 / Build test browser ports without DOM side effects.
 * @return 测试端口及已捕获 Blob / Test ports and captured Blobs.
 */
function testBrowserPorts(): TestBrowserPorts {
  /** @brief 已捕获的 Blob / Captured Blobs. */
  const blobs: Blob[] = []
  /** @brief 模拟下载锚点 / Simulated download anchor. */
  const anchor = {
    click: vi.fn(),
    download: '',
    hidden: false,
    href: '',
    rel: '',
    remove: vi.fn()
  } as unknown as HTMLAnchorElement

  return {
    blobs,
    options: {
      document: {
        body: {
          appendChild: vi.fn((node: Node): Node => node)
        } as Pick<HTMLElement, 'appendChild'>,
        createElement: vi.fn((): HTMLAnchorElement => anchor)
      },
      objectUrls: {
        createObjectURL: vi.fn((blob: Blob): string => {
          blobs.push(blob)
          return 'blob:https://workspace.example.test/download'
        }),
        revokeObjectURL: vi.fn()
      },
      schedule: vi.fn()
    }
  }
}

/**
 * @brief 构造完整的测试保存端口 / Build a complete test save port.
 * @param workspaceOperations Workspace Operations mock / Workspace Operations mock.
 * @param browser 浏览器测试端口 / Browser test ports.
 * @return Web Artifact 保存端口 / Web Artifact-save port.
 */
function testSavePort(
  workspaceOperations: TestWorkspaceOperations,
  browser: TestBrowserPorts
): ReturnType<typeof createWebArtifactSave> {
  return createWebArtifactSave({
    ...browser.options,
    workspaceOperations
  })
}

describe('createWebArtifactSave in the Node runtime', (): void => {
  it('publishes the exact Web Blob ceiling through the host capability port', (): void => {
    /** @brief 不会被能力探测调用的 Workspace Operations / Workspace Operations unused by capability discovery. */
    const workspaceOperations: TestWorkspaceOperations = {
      getArtifact: vi.fn(),
      readArtifactContent: vi.fn()
    }
    /** @brief 暴露宿主能力的保存服务 / Save service exposing host capabilities. */
    const save = testSavePort(workspaceOperations, testBrowserPorts())

    expect(save.maximumArtifactBytes).toBe(WEB_ARTIFACT_BLOB_MAX_BYTES)
  })

  it('rereads authoritative metadata and consumes the protected stream through EOF', async (): Promise<void> => {
    /** @brief 可观察的操作顺序 / Observable operation order. */
    const operations: string[] = []
    /** @brief metadata 读取 mock / Metadata-read mock. */
    const getArtifact = vi.fn<TestWorkspaceOperations['getArtifact']>(() => {
      operations.push('metadata')
      return Promise.resolve(artifactAuthority())
    })
    /** @brief 内容读取 mock / Content-read mock. */
    const readArtifactContent = vi.fn<TestWorkspaceOperations['readArtifactContent']>(() => {
      operations.push('content')
      return Promise.resolve(
        artifactContent(
          new ReadableStream<Uint8Array>({
            pull(controller): void {
              operations.push('stream')
              controller.enqueue(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
              controller.close()
            }
          })
        )
      )
    })
    /** @brief 浏览器测试端口 / Test browser ports. */
    const browser = testBrowserPorts()
    /** @brief 被测保存端口 / Save port under test. */
    const save = testSavePort({ getArtifact, readArtifactContent }, browser)

    await expect(
      save.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('Klee Resume'),
        workspaceId: WORKSPACE_ID
      })
    ).resolves.toEqual({ status: 'started' })

    expect(operations).toEqual(['metadata', 'content', 'stream'])
    /** @brief 实际 metadata 读取请求 / Actual metadata-read request. */
    const metadataRequest = getArtifact.mock.calls[0]?.[0]
    /** @brief 实际 content 读取请求 / Actual content-read request. */
    const contentRequest = readArtifactContent.mock.calls[0]?.[0]
    expect(metadataRequest).toMatchObject({
      artifactId: ARTIFACT_ID,
      workspaceId: WORKSPACE_ID
    })
    expect(metadataRequest?.signal).toBeInstanceOf(AbortSignal)
    expect(contentRequest).toMatchObject({
      artifact: { id: ARTIFACT_ID, workspaceId: WORKSPACE_ID }
    })
    expect(contentRequest?.signal).toBeInstanceOf(AbortSignal)
    expect(browser.blobs).toHaveLength(1)
    expect(browser.blobs[0]).toMatchObject({ size: 4, type: 'application/pdf' })
  })

  it('rejects oversized metadata before opening the content stream', async (): Promise<void> => {
    /** @brief metadata 读取 mock / Metadata-read mock. */
    const getArtifact = vi.fn<TestWorkspaceOperations['getArtifact']>(() =>
      Promise.resolve(artifactAuthority({ sizeBytes: WEB_ARTIFACT_BLOB_MAX_BYTES + 1 }))
    )
    /** @brief 不应调用的内容读取 mock / Content-read mock that must not be called. */
    const readArtifactContent = vi.fn<TestWorkspaceOperations['readArtifactContent']>()
    /** @brief 被测保存端口 / Save port under test. */
    const save = testSavePort({ getArtifact, readArtifactContent }, testBrowserPorts())

    await expect(
      save.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('large'),
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toMatchObject({
      code: 'artifact-too-large',
      name: 'WebArtifactSaveError'
    })
    expect(readArtifactContent).not.toHaveBeenCalled()
  })

  it('fails closed on a non-PDF Artifact before reading protected content', async (): Promise<void> => {
    /** @brief metadata 读取 mock / Metadata-read mock. */
    const getArtifact = vi.fn<TestWorkspaceOperations['getArtifact']>(() =>
      Promise.resolve(artifactAuthority({ kind: 'resume_json', mediaType: 'application/json' }))
    )
    /** @brief 不应调用的内容读取 mock / Content-read mock that must not be called. */
    const readArtifactContent = vi.fn<TestWorkspaceOperations['readArtifactContent']>()
    /** @brief 被测保存端口 / Save port under test. */
    const save = testSavePort({ getArtifact, readArtifactContent }, testBrowserPorts())

    await expect(
      save.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('resume'),
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toMatchObject({ code: 'artifact-not-downloadable' })
    expect(readArtifactContent).not.toHaveBeenCalled()
  })

  it('cancels the reader and aborts transport when streamed bytes exceed metadata', async (): Promise<void> => {
    /** @brief stream 是否被取消 / Whether the stream was cancelled. */
    let streamCancelled = false
    /** @brief 传给内容端口的取消信号 / Abort signal passed to the content port. */
    let contentSignal: AbortSignal | undefined
    /** @brief 超出声明长度的内容流 / Content stream exceeding its declared length. */
    const body = new ReadableStream<Uint8Array>({
      pull(controller): void {
        controller.enqueue(new Uint8Array([0x25, 0x50]))
      },
      cancel(): void {
        streamCancelled = true
      }
    })
    /** @brief metadata 读取 mock / Metadata-read mock. */
    const getArtifact = vi.fn<TestWorkspaceOperations['getArtifact']>(() =>
      Promise.resolve(artifactAuthority({ sizeBytes: 1 }))
    )
    /** @brief 内容读取 mock / Content-read mock. */
    const readArtifactContent = vi.fn<TestWorkspaceOperations['readArtifactContent']>((request) => {
      contentSignal = request.signal
      return Promise.resolve(artifactContent(body, 1))
    })
    /** @brief 被测保存端口 / Save port under test. */
    const save = testSavePort({ getArtifact, readArtifactContent }, testBrowserPorts())

    await expect(
      save.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('resume'),
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toMatchObject({ code: 'artifact-content-mismatch' })
    expect(streamCancelled).toBe(true)
    expect(contentSignal?.aborted).toBe(true)
  })

  it('validates the branded filename again before any network request', async (): Promise<void> => {
    /** @brief 不应调用的 metadata 读取 mock / Metadata-read mock that must not be called. */
    const getArtifact = vi.fn<TestWorkspaceOperations['getArtifact']>()
    /** @brief 不应调用的内容读取 mock / Content-read mock that must not be called. */
    const readArtifactContent = vi.fn<TestWorkspaceOperations['readArtifactContent']>()
    /** @brief 被测保存端口 / Save port under test. */
    const save = testSavePort({ getArtifact, readArtifactContent }, testBrowserPorts())

    await expect(
      save.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: '../secret.pdf' as SafePdfFileName,
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toMatchObject({ code: 'artifact-not-downloadable' })
    expect(getArtifact).not.toHaveBeenCalled()
    expect(readArtifactContent).not.toHaveBeenCalled()
  })

  it('quiesces an uncooperative late content read before it can trigger a DOM download', async (): Promise<void> => {
    /** @brief 忽略取消并迟到兑现的 content descriptor / Content descriptor resolving late despite cancellation. */
    const lateContent =
      testDeferred<Awaited<ReturnType<TestWorkspaceOperations['readArtifactContent']>>>()
    /** @brief metadata 读取 mock / Metadata-read mock. */
    const getArtifact = vi.fn<TestWorkspaceOperations['getArtifact']>(() =>
      Promise.resolve(artifactAuthority())
    )
    /** @brief 故意不响应 AbortSignal 的内容读取 / Content read deliberately ignoring AbortSignal. */
    const readArtifactContent = vi.fn<TestWorkspaceOperations['readArtifactContent']>(
      () => lateContent.promise
    )
    /** @brief 可观察 DOM 副作用的浏览器端口 / Browser ports exposing observable DOM side effects. */
    const browser = testBrowserPorts()
    /** @brief 待测保存服务 / Save service under test. */
    const save = testSavePort({ getArtifact, readArtifactContent }, browser)
    /** @brief 尚在 content 边界挂起的保存 / Save pending at the content boundary. */
    const operation = save.saveArtifact({
      artifactId: ARTIFACT_ID,
      suggestedFileName: sanitizePdfFileName('resume'),
      workspaceId: WORKSPACE_ID
    })
    await vi.waitFor((): void => expect(readArtifactContent).toHaveBeenCalledOnce())

    /** @brief 登出静止屏障 / Sign-out quiescence barrier. */
    const quiesced = save.suspendAndQuiesce()
    lateContent.resolve(
      artifactContent(
        new ReadableStream<Uint8Array>({
          start(controller): void {
            controller.enqueue(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
            controller.close()
          }
        })
      )
    )

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    await expect(quiesced).resolves.toBeUndefined()
    expect(browser.blobs).toHaveLength(0)
    expect(browser.options.document.createElement).not.toHaveBeenCalled()
  })

  it('honours an external abort before late metadata can reach the DOM', async (): Promise<void> => {
    /** @brief 忽略取消并迟到兑现的 metadata / Metadata resolving late despite cancellation. */
    const lateMetadata = testDeferred<Awaited<ReturnType<TestWorkspaceOperations['getArtifact']>>>()
    /** @brief 故意不响应 AbortSignal 的 metadata 读取 / Metadata read deliberately ignoring AbortSignal. */
    const getArtifact = vi.fn<TestWorkspaceOperations['getArtifact']>(() => lateMetadata.promise)
    /** @brief 取消后不得触发的 content 读取 / Content read that must not run after cancellation. */
    const readArtifactContent = vi.fn<TestWorkspaceOperations['readArtifactContent']>(() =>
      Promise.resolve(
        artifactContent(
          new ReadableStream<Uint8Array>({
            start(controller): void {
              controller.enqueue(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
              controller.close()
            }
          })
        )
      )
    )
    /** @brief 可观察 DOM 副作用的浏览器端口 / Browser ports exposing observable DOM side effects. */
    const browser = testBrowserPorts()
    /** @brief 待测保存服务 / Save service under test. */
    const save = testSavePort({ getArtifact, readArtifactContent }, browser)
    /** @brief 外部调用方生命周期 / External caller lifecycle. */
    const controller = new AbortController()
    /** @brief 尚在 metadata 边界挂起的保存 / Save pending at the metadata boundary. */
    const operation = save.saveArtifact(
      {
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('resume'),
        workspaceId: WORKSPACE_ID
      },
      controller.signal
    )

    controller.abort(new DOMException('View generation changed.', 'AbortError'))
    lateMetadata.resolve(artifactAuthority())

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(readArtifactContent).not.toHaveBeenCalled()
    expect(browser.blobs).toHaveLength(0)
    expect(browser.options.document.createElement).not.toHaveBeenCalled()
  })
})
