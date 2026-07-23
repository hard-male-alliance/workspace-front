/** @file Electron main 的 API v2 Artifact 原生流式保存服务 / Native streaming API v2 Artifact save service in Electron main. */

import { randomUUID } from 'node:crypto'
import { open, rename, rm, type FileHandle } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type {
  ArtifactSavePort,
  ResumeArtifactSaveFormat,
  SafeArtifactFileName,
  SaveArtifactRequest,
  SaveArtifactResult
} from '@ai-job-workspace/platform'
import {
  resolveResumeArtifactSaveFormat,
  resumeArtifactSaveFormatForFileName
} from '@ai-job-workspace/platform'
import {
  ApiV2AuthenticationRequiredError,
  ApiV2ContractError,
  createApiV2Client,
  getWorkspaceArtifact,
  getWorkspaceArtifactContent,
  type ApiV2AuthenticationPort,
  type Artifact,
  type CompleteArtifactContent
} from '@ai-job-workspace/product-api-v2'

/** @brief 独占临时文件的固定名称前缀 / Fixed filename prefix for exclusive temporary files. */
const TEMPORARY_FILE_PREFIX = '.ai-job-workspace-'

/** @brief 创建独占临时文件的最大碰撞重试数 / Maximum collision retries when creating an exclusive temporary file. */
const TEMPORARY_FILE_ATTEMPTS = 8

/** @brief 临时文件 UUID 的规范文本语法 / Canonical textual syntax for temporary-file UUIDs. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

/** @brief 原生保存对话框结果 / Native save-dialog result. */
export type NativeArtifactSaveDialogResult =
  { readonly cancelled: true } | { readonly cancelled: false; readonly filePath: string }

/** @brief 原生保存对话框的最小宿主端口 / Minimal host port for the native save dialog. */
export interface NativeArtifactSaveDialog {
  /**
   * @brief 让用户选择 Resume Artifact 目标位置 / Let the user choose a destination for a Resume Artifact.
   * @param suggestedFileName 已净化的建议文件名 / Sanitized suggested filename.
   * @param format 已由 kind、MIME 与扩展名共同核验的闭合格式 / Closed format jointly validated from kind, MIME, and extension.
   * @return 取消或仅在 main 可见的目标路径 / Cancellation or a destination path visible only in main.
   */
  readonly chooseArtifactDestination: (
    suggestedFileName: SafeArtifactFileName,
    format: ResumeArtifactSaveFormat
  ) => Promise<NativeArtifactSaveDialogResult>
}

/** @brief Artifact 服务测试缝；生产实现直接委托 API v2 防腐层 / Artifact-service test seam whose production implementation delegates directly to the API v2 anti-corruption layer. */
export interface NativeArtifactApi {
  /** @brief 读取权威 metadata / Read authoritative metadata. */
  readonly readArtifact: (
    workspaceId: string,
    artifactId: string,
    signal: AbortSignal
  ) => Promise<Artifact>
  /** @brief 读取完整且已验证的 content stream / Read a complete validated content stream. */
  readonly readCompleteContent: (
    artifact: Artifact,
    signal: AbortSignal
  ) => Promise<CompleteArtifactContent>
}

/** @brief 原生产物保存服务依赖 / Native artifact-save service dependencies. */
export interface NativeArtifactSaveServiceOptions {
  /** @brief main-only API v2 认证端口 / Main-only API v2 authentication port. */
  readonly authentication: ApiV2AuthenticationPort
  /** @brief 原生对话框端口 / Native dialog port. */
  readonly dialog: NativeArtifactSaveDialog
  /** @brief 测试可替换的 Artifact API / Artifact API replaceable in tests. */
  readonly artifactApi?: NativeArtifactApi | undefined
  /** @brief 测试可替换的 UUID 工厂 / UUID factory replaceable in tests. */
  readonly createUuid?: (() => string) | undefined
}

/** @brief 保存服务生命周期 / Artifact-save service lifecycle. */
type ArtifactSaveLifecycle = 'active' | 'suspended' | 'closed'

/** @brief 已打开的独占临时文件 / Open exclusive temporary file. */
interface OpenTemporaryFile {
  /** @brief 仅当前操作持有的文件句柄 / File handle owned only by the current operation. */
  readonly handle: FileHandle
  /** @brief 与目标处于同一目录的临时路径 / Temporary path in the destination directory. */
  readonly path: string
}

/**
 * @brief 让宿主取消不必等待不可取消的异步依赖终止 / Let host cancellation stop waiting for an asynchronous dependency that cannot itself be cancelled.
 * @param operation 始终被观察到终态的底层任务 / Underlying operation whose terminal state remains observed.
 * @param signal 宿主拥有的取消信号 / Host-owned cancellation signal.
 * @return 当前保存生命周期的可取消观察 / Cancellable observation for the current save lifecycle.
 */
function observeWithSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Artifact save cancelled.', 'AbortError'))
  }
  return new Promise<T>((resolve, reject): void => {
    /** @brief 当前观察者的取消回调 / Abort callback for the current observer. */
    const abort = (): void => reject(new DOMException('Artifact save cancelled.', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    void operation.then(
      (value): void => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown): void => {
        signal.removeEventListener('abort', abort)
        reject(error instanceof Error ? error : new Error('The Artifact save dependency failed.'))
      }
    )
  })
}

/**
 * @brief 创建直接调用严格 API v2 consumer 的 Artifact API / Create an Artifact API that directly calls the strict API v2 consumers.
 * @param authentication main-only 认证端口 / Main-only authentication port.
 * @return 不接受 URL 或路径输入的 Artifact API / Artifact API accepting no URL or filesystem path input.
 */
function createNativeArtifactApi(authentication: ApiV2AuthenticationPort): NativeArtifactApi {
  /** @brief 生产 API v2 Bearer client / Production API v2 Bearer client. */
  const client = createApiV2Client({ authentication, transportProfile: { kind: 'production' } })
  return Object.freeze({
    async readArtifact(
      workspaceId: string,
      artifactId: string,
      signal: AbortSignal
    ): Promise<Artifact> {
      return (await getWorkspaceArtifact(client, { artifactId, signal, workspaceId })).value
    },
    async readCompleteContent(
      artifact: Artifact,
      signal: AbortSignal
    ): Promise<CompleteArtifactContent> {
      /** @brief 未使用 Range 的完整 Artifact response / Complete Artifact response requested without a Range. */
      const content = await getWorkspaceArtifactContent(client, { artifact, signal })
      if (content.kind !== 'complete') {
        throw new ApiV2ContractError(
          'A native Artifact save requires a complete API v2 content representation.'
        )
      }
      return content
    }
  })
}

/**
 * @brief 精确比较原生保存前后的 Artifact metadata / Exactly compare Artifact metadata before and after the native save dialog.
 * @param left 打开对话框前的权威快照 / Authoritative snapshot before opening the dialog.
 * @param right 打开内容流前重新读取的权威快照 / Authoritative snapshot reread before opening the content stream.
 * @return 所有资源、主体与内容描述字段均未漂移时为 true / True when every resource, subject, and content descriptor field is unchanged.
 */
function artifactsEqual(left: Artifact, right: Artifact): boolean {
  return (
    left.id === right.id &&
    left.revision === right.revision &&
    left.created_at === right.created_at &&
    left.updated_at === right.updated_at &&
    left.workspace_id === right.workspace_id &&
    left.kind === right.kind &&
    left.media_type.toLowerCase() === right.media_type.toLowerCase() &&
    left.size_bytes === right.size_bytes &&
    left.sha256 === right.sha256 &&
    left.content_url === right.content_url &&
    left.page_count === right.page_count &&
    left.expires_at === right.expires_at &&
    left.subject.resource_type === right.subject.resource_type &&
    left.subject.id === right.subject.id &&
    Object.hasOwn(left.subject, 'revision') === Object.hasOwn(right.subject, 'revision') &&
    left.subject.revision === right.subject.revision
  )
}

/**
 * @brief 在目标目录创建不可跟随符号链接的独占临时文件 / Create an exclusive non-symlink-following temporary file in the destination directory.
 * @param targetPath 用户选择的目标路径 / Destination path selected by the user.
 * @param createUuid 不可预测名称工厂 / Unpredictable-name factory.
 * @return 已打开的 mode-0600 临时文件 / Open mode-0600 temporary file.
 */
async function openTemporaryFile(
  targetPath: string,
  createUuid: () => string
): Promise<OpenTemporaryFile> {
  /** @brief 与目标相同的目录，保证最终 rename 不跨文件系统 / Destination directory, ensuring the final rename does not cross filesystems. */
  const directory = dirname(targetPath)
  /** @brief 最后一次独占创建错误 / Last exclusive-create failure. */
  let lastError: unknown
  for (let attempt = 0; attempt < TEMPORARY_FILE_ATTEMPTS; attempt += 1) {
    /** @brief 当前不可预测 UUID / Current unpredictable UUID. */
    const uuid = createUuid()
    if (!UUID_PATTERN.test(uuid)) {
      throw new Error('The native Artifact temporary-file UUID is invalid.')
    }
    /** @brief 固定长度且不含目标文件名的临时路径 / Fixed-length temporary path containing no destination filename. */
    const temporaryPath = join(directory, `${TEMPORARY_FILE_PREFIX}${uuid}.part`)
    try {
      /** @brief `wx` 拒绝已存在文件及符号链接目标 / `wx` rejects existing files and symlink targets. */
      const handle = await open(temporaryPath, 'wx', 0o600)
      return { handle, path: temporaryPath }
    } catch (error: unknown) {
      lastError = error
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Could not create an exclusive temporary Artifact file.')
}

/**
 * @brief 在支持目录 fsync 的宿主上尽力持久化 rename 目录项 / Best-effort persistence of a rename directory entry on hosts supporting directory fsync.
 * @param targetPath 已完成 rename 的目标路径 / Destination path after rename completes.
 * @return 尝试完成后的 Promise；不把平台不支持误报为保存失败 / Promise after the attempt, without misreporting platform non-support as save failure.
 * @note rename 已成功后不能安全地把目录 fsync 失败转换成可重试保存，否则可能覆盖用户文件两次 / Once rename succeeds, directory-fsync failure cannot safely become a retryable save error because that could overwrite twice.
 */
async function syncParentDirectoryBestEffort(targetPath: string): Promise<void> {
  /** @brief 当前平台允许时打开的父目录句柄 / Parent-directory handle when supported by the current platform. */
  let directoryHandle: FileHandle | null = null
  try {
    directoryHandle = await open(dirname(targetPath), 'r')
    await directoryHandle.sync()
  } catch {
    // Platform/filesystem support varies; the completed rename remains the authoritative result.
  } finally {
    await directoryHandle?.close().catch(() => undefined)
  }
}

/**
 * @brief 把一个字节块完整写入文件 / Write one byte chunk completely to a file.
 * @param handle 目标临时文件 / Destination temporary file.
 * @param chunk 当前字节块 / Current byte chunk.
 * @param position 文件绝对偏移 / Absolute file offset.
 * @return 下一个文件偏移 / Next file offset.
 */
async function writeCompleteChunk(
  handle: FileHandle,
  chunk: Uint8Array,
  position: number
): Promise<number> {
  /** @brief 当前 chunk 内已写入偏移 / Offset already written within the current chunk. */
  let chunkOffset = 0
  while (chunkOffset < chunk.byteLength) {
    /** @brief 当前系统调用写入结果 / Result of the current system write. */
    const { bytesWritten } = await handle.write(
      chunk,
      chunkOffset,
      chunk.byteLength - chunkOffset,
      position + chunkOffset
    )
    if (bytesWritten < 1) throw new Error('The native Artifact file write made no progress.')
    chunkOffset += bytesWritten
  }
  return position + chunk.byteLength
}

/**
 * @brief 将完整且验证中的 content stream 写入同目录临时文件 / Write a complete validating content stream into a same-directory temporary file.
 * @param content API v2 验证后的完整 content / Complete API v2 content under validation.
 * @param targetPath 用户选择的目标路径 / User-selected destination path.
 * @param signal 保存操作取消信号 / Save-operation cancellation signal.
 * @param createUuid 临时文件 UUID 工厂 / Temporary-file UUID factory.
 * @return 完整 fsync 后的临时路径 / Temporary path after complete fsync.
 */
async function stageArtifactContent(
  content: CompleteArtifactContent,
  targetPath: string,
  signal: AbortSignal,
  createUuid: () => string
): Promise<string> {
  /** @brief 已独占打开的临时文件 / Exclusively opened temporary file. */
  const temporary = await openTemporaryFile(targetPath, createUuid)
  /** @brief 尚未完成的 stream reader / Stream reader not yet completed. */
  const reader = content.body?.getReader() ?? null
  /** @brief 当前写入字节总数 / Total byte count written so far. */
  let writtenByteLength = 0
  /** @brief 是否已到达可信 EOF / Whether trusted EOF was reached. */
  let reachedEnd = reader === null
  try {
    signal.throwIfAborted()
    if (reader === null && content.expectedByteLength !== 0) {
      throw new ApiV2ContractError('A non-empty API v2 Artifact has no content stream.')
    }
    while (reader !== null && !reachedEnd) {
      /** @brief 当前网络流读取结果 / Current network-stream read result. */
      const result = await observeWithSignal(reader.read(), signal)
      signal.throwIfAborted()
      if (result.done) {
        reachedEnd = true
        break
      }
      writtenByteLength = await writeCompleteChunk(
        temporary.handle,
        result.value,
        writtenByteLength
      )
    }
    if (writtenByteLength !== content.expectedByteLength) {
      throw new ApiV2ContractError(
        'The staged Artifact byte length differs from its validated representation.'
      )
    }
    signal.throwIfAborted()
    await temporary.handle.sync()
    await temporary.handle.close()
    return temporary.path
  } catch (error: unknown) {
    if (!reachedEnd && reader !== null) void reader.cancel(error).catch(() => undefined)
    await temporary.handle.close().catch(() => undefined)
    await rm(temporary.path, { force: true }).catch(() => undefined)
    throw error
  }
}

/** @brief Electron main 的 Artifact 保存应用服务 / Artifact-save application service in Electron main. */
export class NativeArtifactSaveService implements ArtifactSavePort {
  /** @brief 原生流式保存不设置应用层 Artifact 大小上限 / Native streaming saves have no application-level Artifact-size ceiling. */
  readonly maximumArtifactBytes = null
  /** @brief 权威 Artifact API / Authoritative Artifact API. */
  private readonly artifactApi: NativeArtifactApi
  /** @brief 原生目标选择器 / Native destination selector. */
  private readonly dialog: NativeArtifactSaveDialog
  /** @brief 不可预测临时名称工厂 / Unpredictable temporary-name factory. */
  private readonly createUuid: () => string
  /** @brief 当前服务生命周期 / Current service lifecycle. */
  private lifecycle: ArtifactSaveLifecycle = 'active'
  /** @brief 所有活跃保存任务 / All active save operations. */
  private readonly operations = new Set<Promise<SaveArtifactResult>>()
  /** @brief 所有活跃保存任务的取消器 / Abort controllers for all active save operations. */
  private readonly operationAborts = new Set<AbortController>()

  /**
   * @brief 创建 main-only Artifact 保存服务 / Construct the main-only Artifact-save service.
   * @param options 认证、原生对话框与测试缝 / Authentication, native dialog, and test seams.
   */
  constructor(options: NativeArtifactSaveServiceOptions) {
    this.artifactApi = options.artifactApi ?? createNativeArtifactApi(options.authentication)
    this.dialog = options.dialog
    this.createUuid = options.createUuid ?? randomUUID
  }

  /**
   * @brief 保存一个由 main 重新解析的 Resume Artifact / Save one Resume Artifact re-resolved by main.
   * @param request 仅含 Workspace/Artifact ID 与安全文件名 / Request containing only Workspace/Artifact IDs and a safe filename.
   * @return 保存或用户取消终态 / Saved or user-cancelled terminal state.
   */
  saveArtifact(request: SaveArtifactRequest, signal?: AbortSignal): Promise<SaveArtifactResult> {
    if (this.lifecycle !== 'active') {
      return Promise.reject(new ApiV2AuthenticationRequiredError())
    }
    if (this.operations.size > 0) {
      return Promise.reject(new Error('A native Artifact save is already in progress.'))
    }
    /** @brief 本次保存的独立取消器 / Independent abort controller for this save. */
    const abort = new AbortController()
    /** @brief 将调用方生命周期取消转发到 main-owned operation / Forward caller-lifecycle cancellation into the main-owned operation. */
    const forwardAbort = (): void => abort.abort(signal?.reason)
    if (signal?.aborted === true) {
      forwardAbort()
    } else {
      signal?.addEventListener('abort', forwardAbort, { once: true })
    }
    /** @brief 完整 metadata、对话框、下载与落盘任务 / Complete metadata, dialog, download, and file operation. */
    const operation = this.performSave(request, abort.signal)
    this.operations.add(operation)
    this.operationAborts.add(abort)
    /** @brief 仅移除当前终态任务 / Remove only this terminal operation. */
    const release = (): void => {
      signal?.removeEventListener('abort', forwardAbort)
      this.operations.delete(operation)
      this.operationAborts.delete(abort)
    }
    void operation.then(release, release)
    return operation
  }

  /**
   * @brief 执行一次权威 Resume Artifact 保存 / Perform one authoritative Resume Artifact save.
   * @param request 封闭 renderer 请求 / Closed renderer request.
   * @param signal 本次保存取消信号 / Cancellation signal for this save.
   * @return 保存或取消终态 / Saved or cancelled terminal state.
   */
  private async performSave(
    request: SaveArtifactRequest,
    signal: AbortSignal
  ): Promise<SaveArtifactResult> {
    /** @brief 仅读取一次的 Workspace ID / Workspace ID read exactly once. */
    const workspaceId = request.workspaceId
    /** @brief 仅读取一次的 Artifact ID / Artifact ID read exactly once. */
    const artifactId = request.artifactId
    /** @brief 跨品牌边界后重新验证的建议文件名 / Suggested filename revalidated after crossing the branded boundary. */
    const suggestedFileNameCandidate: string = request.suggestedFileName
    /** @brief 建议文件名声明的唯一目标格式 / Sole target format declared by the suggested filename. */
    const requestedFormat = resumeArtifactSaveFormatForFileName(suggestedFileNameCandidate)
    if (requestedFormat === null) {
      throw new ApiV2ContractError(
        'The native Artifact filename is unsafe or has an unsupported format.'
      )
    }
    /** @brief 已重新验证的格式感知安全文件名 / Revalidated format-aware safe filename. */
    const suggestedFileName = suggestedFileNameCandidate as SafeArtifactFileName
    /** @brief main 从 API v2 重新读取的权威 metadata / Authoritative metadata reread by main from API v2. */
    const artifact = await this.artifactApi.readArtifact(workspaceId, artifactId, signal)
    if (artifact.workspace_id !== workspaceId || artifact.id !== artifactId) {
      throw new ApiV2ContractError(
        'The authoritative Artifact identity differs from the native save request.'
      )
    }
    /** @brief 权威 kind 与 MIME 共同解析出的闭合格式 / Closed format jointly resolved from authoritative kind and MIME. */
    const format = resolveResumeArtifactSaveFormat(artifact.kind, artifact.media_type)
    if (format === null || format.kind !== requestedFormat.kind) {
      throw new ApiV2ContractError(
        'The selected Artifact kind, media type, and filename format do not match.'
      )
    }
    signal.throwIfAborted()
    /** @brief 只在 main 可见的原生目标选择 / Native destination selection visible only in main. */
    /** @brief 即使 OS 对话框本身不可取消，退出/登出也不等待它 / Even if the OS dialog itself is not cancellable, shutdown and sign-out do not wait for it. */
    const selection = await observeWithSignal(
      this.dialog.chooseArtifactDestination(suggestedFileName, format),
      signal
    )
    if (selection.cancelled) return Object.freeze({ status: 'cancelled' })
    if (!isAbsolute(selection.filePath) || selection.filePath.includes('\0')) {
      throw new Error('The native save dialog returned an invalid destination path.')
    }
    signal.throwIfAborted()
    /** @brief 对话框返回后再次读取、必须与原快照完全一致的 metadata / Metadata reread after the dialog that must exactly match the original snapshot. */
    const currentArtifact = await this.artifactApi.readArtifact(workspaceId, artifactId, signal)
    if (!artifactsEqual(artifact, currentArtifact)) {
      throw new ApiV2ContractError(
        'The Artifact metadata changed before the native content stream was opened.'
      )
    }
    if (
      currentArtifact.expires_at !== null &&
      Date.parse(currentArtifact.expires_at) <= Date.now()
    ) {
      throw new ApiV2ContractError('The selected Artifact expired before it could be saved.')
    }
    /** @brief 带 Bearer 且持续进行长度/hash 验证的完整流 / Complete Bearer-authenticated stream under length/hash validation. */
    const content = await this.artifactApi.readCompleteContent(currentArtifact, signal)
    if (
      content.mediaType.toLowerCase() !== format.mediaType ||
      content.expectedByteLength !== artifact.size_bytes
    ) {
      await content.body?.cancel().catch(() => undefined)
      throw new ApiV2ContractError(
        'The Artifact content descriptor differs from its authoritative format metadata.'
      )
    }
    /** @brief 与目标同目录、完整 fsync 的临时文件 / Same-directory temporary file after complete fsync. */
    const temporaryPath = await stageArtifactContent(
      content,
      selection.filePath,
      signal,
      this.createUuid
    )
    try {
      signal.throwIfAborted()
      await rename(temporaryPath, selection.filePath)
      await syncParentDirectoryBestEffort(selection.filePath)
    } catch (error: unknown) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
    return Object.freeze({ status: 'saved' })
  }

  /**
   * @brief 为登出暂停新保存、取消并等待现有任务静止 / Suspend new saves for sign-out, cancel, and await existing operations.
   * @return 所有已发起任务完成清理后兑现 / Resolves after every started operation has cleaned up.
   */
  async suspendAndQuiesce(): Promise<void> {
    if (this.lifecycle === 'closed') return
    this.lifecycle = 'suspended'
    for (const abort of this.operationAborts) abort.abort()
    await Promise.allSettled([...this.operations])
  }

  /** @brief 在成功重新授权后恢复保存能力 / Resume saves after successful reauthorization. */
  resume(): void {
    if (this.lifecycle === 'suspended') this.lifecycle = 'active'
  }

  /**
   * @brief 应用退出前永久关闭并静止保存能力 / Permanently close and quiesce artifact saving before application exit.
   * @return 所有任务已停止并清理 / Resolves after all operations stop and clean up.
   */
  async closeAndQuiesce(): Promise<void> {
    if (this.lifecycle === 'closed') return
    this.lifecycle = 'closed'
    for (const abort of this.operationAborts) abort.abort()
    await Promise.allSettled([...this.operations])
  }
}
