/** @file Electron main Artifact 流式保存测试 / Tests for Electron-main streaming Artifact saves. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sanitizePdfFileName } from '@ai-job-workspace/platform'
import {
  ApiV2AuthenticationRequiredError,
  ApiV2ContractError,
  type ApiV2AuthenticationPort,
  type Artifact,
  type CompleteArtifactContent
} from '@ai-job-workspace/product-api-v2'

import { NativeArtifactSaveService } from './artifact-save-service'
import type { NativeArtifactApi, NativeArtifactSaveDialog } from './artifact-save-service'

/** @brief 测试 Workspace ID / Test Workspace ID. */
const WORKSPACE_ID = 'workspace_01JEXAMPLE'

/** @brief 测试 Artifact ID / Test Artifact ID. */
const ARTIFACT_ID = 'artifact_01JEXAMPLE'

/** @brief 测试期间创建并在 afterEach 清理的目录 / Directories created during tests and cleaned in afterEach. */
const temporaryDirectories: string[] = []

/** @brief 不会被替换 API 使用的完整认证端口 / Complete authentication port unused by the replaced API. */
const unusedAuthentication: ApiV2AuthenticationPort = {
  getAccessToken: () => null,
  invalidateAccessToken: (): void => undefined,
  refreshAccessToken: (): Promise<void> => Promise.resolve()
}

/**
 * @brief 创建临时测试目录 / Create a temporary test directory.
 * @return 新目录绝对路径 / Absolute path of the new directory.
 */
async function createTemporaryDirectory(): Promise<string> {
  /** @brief 当前测试目录 / Current test directory. */
  const directory = await mkdtemp(join(tmpdir(), 'workspace-artifact-save-'))
  temporaryDirectories.push(directory)
  return directory
}

/**
 * @brief 创建权威 PDF Artifact / Create authoritative PDF Artifact metadata.
 * @param overrides 可选字段覆盖 / Optional field overrides.
 * @return 测试 Artifact / Test Artifact.
 */
function pdfArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    content_url: `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
    created_at: '2026-07-23T00:00:00Z',
    expires_at: null,
    id: ARTIFACT_ID,
    kind: 'resume_pdf',
    media_type: 'application/pdf',
    page_count: 1,
    revision: 1,
    sha256: 'a'.repeat(64),
    size_bytes: 3,
    subject: { id: 'resume_01JEXAMPLE', resource_type: 'resume', revision: 4 },
    updated_at: '2026-07-23T00:00:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 创建完整 content response / Create a complete content response.
 * @param chunks 流式字节块 / Streamed byte chunks.
 * @return API v2 完整 content / Complete API v2 content.
 */
function completeContent(chunks: readonly Uint8Array[]): CompleteArtifactContent {
  /** @brief 所有 chunk 的总字节数 / Total bytes across all chunks. */
  const expectedByteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  return {
    acceptsByteRanges: true,
    body: new ReadableStream<Uint8Array>({
      start(controller): void {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      }
    }),
    disposition: 'attachment',
    entityTag: '"content-etag"',
    expectedByteLength,
    expectedSha256: 'a'.repeat(64),
    kind: 'complete',
    mediaType: 'application/pdf',
    requestId: 'request_01JEXAMPLE',
    status: 200
  }
}

/**
 * @brief 创建 Artifact API mock / Create an Artifact API mock.
 * @param content 完整 content / Complete content.
 * @return 可观察 API / Observable API.
 */
function artifactApi(content: CompleteArtifactContent): NativeArtifactApi {
  return {
    readArtifact: vi.fn(() =>
      Promise.resolve(pdfArtifact({ size_bytes: content.expectedByteLength }))
    ),
    readCompleteContent: vi.fn(() => Promise.resolve(content))
  }
}

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

describe('NativeArtifactSaveService', (): void => {
  it('以常量内存分块写同目录临时文件，完整 fsync 后才替换目标', async (): Promise<void> => {
    /** @brief 保存目录与目标 / Save directory and destination. */
    const directory = await createTemporaryDirectory()
    const targetPath = join(directory, 'Klee Resume.pdf')
    /** @brief 原生目标选择器 / Native destination selector. */
    const dialog: NativeArtifactSaveDialog = {
      choosePdfDestination: vi.fn(() =>
        Promise.resolve({ cancelled: false as const, filePath: targetPath })
      )
    }
    /** @brief 两个独立网络 chunk / Two independent network chunks. */
    const content = completeContent([new Uint8Array([0x25, 0x50]), new Uint8Array([0x44, 0x46])])
    /** @brief 待测保存服务 / Save service under test. */
    const service = new NativeArtifactSaveService({
      artifactApi: artifactApi(content),
      authentication: unusedAuthentication,
      createUuid: () => '00000000-0000-4000-8000-000000000001',
      dialog
    })

    await expect(
      service.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('Klee Resume'),
        workspaceId: WORKSPACE_ID
      })
    ).resolves.toEqual({ status: 'saved' })
    expect([...(await readFile(targetPath))]).toEqual([0x25, 0x50, 0x44, 0x46])
    expect(await readdir(directory)).toEqual(['Klee Resume.pdf'])
  })

  it('用户取消时不请求大 content stream', async (): Promise<void> => {
    /** @brief 不应调用的 content reader / Content reader that must not run. */
    const readCompleteContent = vi.fn<NativeArtifactApi['readCompleteContent']>()
    /** @brief 仅 metadata 可用的 API / API providing metadata only. */
    const api: NativeArtifactApi = {
      readArtifact: (): Promise<Artifact> => Promise.resolve(pdfArtifact()),
      readCompleteContent
    }
    /** @brief 立即取消的原生对话框 / Native dialog cancelled immediately. */
    const dialog: NativeArtifactSaveDialog = {
      choosePdfDestination: (): Promise<{ readonly cancelled: true }> =>
        Promise.resolve({ cancelled: true })
    }
    /** @brief 待测服务 / Service under test. */
    const service = new NativeArtifactSaveService({
      artifactApi: api,
      authentication: unusedAuthentication,
      dialog
    })

    await expect(
      service.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('resume'),
        workspaceId: WORKSPACE_ID
      })
    ).resolves.toEqual({ status: 'cancelled' })
    expect(readCompleteContent).not.toHaveBeenCalled()
  })

  it('流失败时清理 partial 并保留用户原文件', async (): Promise<void> => {
    /** @brief 保存目录与原文件 / Save directory and original file. */
    const directory = await createTemporaryDirectory()
    const targetPath = join(directory, 'existing.pdf')
    await writeFile(targetPath, 'previous-content', 'utf8')
    /** @brief EOF 前失败的 content / Content failing before EOF. */
    const content: CompleteArtifactContent = {
      ...completeContent([]),
      body: new ReadableStream<Uint8Array>({
        start(controller): void {
          controller.error(new Error('injected stream failure'))
        }
      }),
      expectedByteLength: 10
    }
    /** @brief 待测服务 / Service under test. */
    const service = new NativeArtifactSaveService({
      artifactApi: artifactApi(content),
      authentication: unusedAuthentication,
      createUuid: () => '00000000-0000-4000-8000-000000000002',
      dialog: {
        choosePdfDestination: () =>
          Promise.resolve({ cancelled: false as const, filePath: targetPath })
      }
    })

    await expect(
      service.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('existing'),
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toThrow('injected stream failure')
    expect(await readFile(targetPath, 'utf8')).toBe('previous-content')
    expect(await readdir(directory)).toEqual(['existing.pdf'])
  })

  it('在显示对话框前失败关闭非 PDF metadata', async (): Promise<void> => {
    /** @brief 不应显示的对话框 / Dialog that must not be shown. */
    const choosePdfDestination = vi.fn<NativeArtifactSaveDialog['choosePdfDestination']>()
    /** @brief 返回非 PDF 的 API / API returning a non-PDF Artifact. */
    const api: NativeArtifactApi = {
      readArtifact: (): Promise<Artifact> =>
        Promise.resolve(
          pdfArtifact({ kind: 'resume_docx', media_type: 'application/vnd.openxmlformats' })
        ),
      readCompleteContent: vi.fn()
    }
    /** @brief 待测服务 / Service under test. */
    const service = new NativeArtifactSaveService({
      artifactApi: api,
      authentication: unusedAuthentication,
      dialog: { choosePdfDestination }
    })

    await expect(
      service.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('resume'),
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(choosePdfDestination).not.toHaveBeenCalled()
  })

  it('对话框返回后 metadata 漂移时拒绝打开 content stream', async (): Promise<void> => {
    /** @brief 保存目录与不会被创建的目标 / Save directory and destination that must not be created. */
    const directory = await createTemporaryDirectory()
    const targetPath = join(directory, 'drifted.pdf')
    /** @brief 可观察的跨边界执行顺序 / Observable ordering across trust boundaries. */
    const operations: string[] = []
    /** @brief 两次 metadata 读取计数 / Number of metadata reads. */
    let metadataReads = 0
    /** @brief 对话框前稳定、对话框后漂移的 API / API stable before the dialog and drifted after it. */
    const readArtifact = vi.fn<NativeArtifactApi['readArtifact']>(() => {
      metadataReads += 1
      operations.push(`metadata-${metadataReads}`)
      return Promise.resolve(
        metadataReads === 1
          ? pdfArtifact()
          : pdfArtifact({
              revision: 2,
              sha256: 'b'.repeat(64),
              updated_at: '2026-07-23T00:00:01Z'
            })
      )
    })
    /** @brief metadata 漂移后不得调用的 content reader / Content reader that must not run after metadata drift. */
    const readCompleteContent = vi.fn<NativeArtifactApi['readCompleteContent']>()
    /** @brief 在两次 metadata 读取之间完成的原生对话框 / Native dialog completing between metadata reads. */
    const choosePdfDestination = vi.fn<NativeArtifactSaveDialog['choosePdfDestination']>(() => {
      operations.push('dialog')
      return Promise.resolve({ cancelled: false as const, filePath: targetPath })
    })
    /** @brief 待测保存服务 / Save service under test. */
    const service = new NativeArtifactSaveService({
      artifactApi: { readArtifact, readCompleteContent },
      authentication: unusedAuthentication,
      dialog: { choosePdfDestination }
    })

    await expect(
      service.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('drifted'),
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(operations).toEqual(['metadata-1', 'dialog', 'metadata-2'])
    expect(readCompleteContent).not.toHaveBeenCalled()
    expect(await readdir(directory)).toEqual([])
  })

  it('登出暂停会取消并等待活跃保存，且拒绝新任务', async (): Promise<void> => {
    /** @brief 被 signal 取消前挂起的 metadata reader / Metadata reader pending until its signal aborts. */
    const readArtifact = vi.fn<NativeArtifactApi['readArtifact']>(
      (_workspaceId, _artifactId, signal) =>
        new Promise<Artifact>((_resolve, reject): void => {
          signal.addEventListener(
            'abort',
            (): void => reject(new DOMException('Save cancelled.', 'AbortError')),
            { once: true }
          )
        })
    )
    /** @brief 挂起 API / Pending API. */
    const api: NativeArtifactApi = { readArtifact, readCompleteContent: vi.fn() }
    /** @brief 待测服务 / Service under test. */
    const service = new NativeArtifactSaveService({
      artifactApi: api,
      authentication: unusedAuthentication,
      dialog: { choosePdfDestination: vi.fn() }
    })
    /** @brief 活跃保存 / Active save. */
    const save = service.saveArtifact({
      artifactId: ARTIFACT_ID,
      suggestedFileName: sanitizePdfFileName('resume'),
      workspaceId: WORKSPACE_ID
    })
    await expect(
      service.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('resume-copy'),
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toThrow('already in progress')

    await expect(service.suspendAndQuiesce()).resolves.toBeUndefined()
    await expect(save).rejects.toMatchObject({ name: 'AbortError' })
    await expect(
      service.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('resume'),
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toBeInstanceOf(ApiV2AuthenticationRequiredError)
    expect(readArtifact).toHaveBeenCalledOnce()
  })
})
