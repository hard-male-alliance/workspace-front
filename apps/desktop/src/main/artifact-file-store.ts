/** @file PDF 产物的同目录原子文件写入 / Same-directory atomic file writing for PDF artifacts. */

import { open, rename, rm } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

/** @brief 可流式读取的 PDF 响应体 / Stream-readable PDF response body. */
export interface PdfResponseBody {
  /**
   * @brief 获取响应流读取器 / Get the response-stream reader.
   * @return 字节流读取器 / Byte-stream reader.
   */
  readonly getReader: () => ReadableStreamDefaultReader<Uint8Array>
}

/** @brief PDF 原子写入的完整性期望 / Integrity expectation for an atomic PDF write. */
export interface PdfArtifactIntegrityExpectation {
  /** @brief API 声明的小写 SHA-256 摘要 / Lowercase SHA-256 digest declared by the API. */
  readonly expectedSha256: string
  /** @brief API 声明的精确字节数 / Exact byte count declared by the API. */
  readonly expectedSizeBytes: number
  /** @brief 本地安全策略允许的最大字节数 / Maximum byte count allowed by local security policy. */
  readonly maximumBytes: number
  /** @brief 可选统一截止信号 / Optional shared deadline signal. */
  readonly signal?: AbortSignal
}

/** @brief 已验证 PDF 原子写入结果 / Verified atomic PDF-write result. */
export interface PdfArtifactWriteResult {
  /** @brief 实际 SHA-256 摘要 / Actual SHA-256 digest. */
  readonly sha256: string
  /** @brief 实际字节数 / Actual byte count. */
  readonly sizeBytes: number
}

/**
 * @brief 将 PDF 流写入同目录独占临时文件并原子改名 / Write a PDF stream to an exclusive same-directory temporary file and atomically rename it.
 * @param destination 用户选择的最终路径 / Final path selected by the user.
 * @param body PDF 字节流 / PDF byte stream.
 * @param expectation 服务端声明和本地上限组成的完整性期望 / Integrity expectation composed from server declarations and the local limit.
 * @return 在落盘和原子改名前核对过的字节数与摘要 / Byte count and digest verified before syncing and atomically renaming.
 * @throws 实际流超限、与完整性元数据不符或文件操作失败时抛出 / Throws when streamed bytes exceed the limit, mismatch integrity metadata, or a file operation fails.
 */
export async function writePdfAtomically(
  destination: string,
  body: PdfResponseBody,
  expectation: PdfArtifactIntegrityExpectation
): Promise<PdfArtifactWriteResult> {
  if (!Number.isSafeInteger(expectation.maximumBytes) || expectation.maximumBytes <= 0) {
    throw new Error('PDF artifact maximum size must be a positive safe integer.')
  }
  if (
    !Number.isSafeInteger(expectation.expectedSizeBytes) ||
    expectation.expectedSizeBytes < 0 ||
    expectation.expectedSizeBytes > expectation.maximumBytes
  ) {
    throw new Error('PDF artifact expected size exceeds the configured size limit.')
  }
  if (!/^[a-f0-9]{64}$/u.test(expectation.expectedSha256)) {
    throw new Error('PDF artifact expected digest must be a lowercase SHA-256 value.')
  }

  /** @brief 统一网络与写入截止信号 / Shared network-and-write deadline signal. */
  const signal = expectation.signal
  /** @brief 与目标同目录且不可预测的临时路径 / Unpredictable temporary path beside the destination. */
  const temporaryPath = join(dirname(destination), `.${randomUUID()}.pdf.tmp`)
  /** @brief 以独占模式创建的临时文件 / Temporary file created in exclusive mode. */
  let file: FileHandle | undefined
  /** @brief 当前 PDF 响应流读取器 / Current PDF response-stream reader. */
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined

  /**
   * @brief 在外部截止时取消当前响应流 / Cancel the current response stream at the external deadline.
   * @return 无返回值 / No return value.
   */
  function cancelReaderOnAbort(): void {
    void reader?.cancel(signal?.reason).catch((): void => undefined)
  }

  try {
    signal?.throwIfAborted()
    file = await open(temporaryPath, 'wx', 0o600)
    signal?.throwIfAborted()
    /** @brief PDF 响应流读取器 / PDF response-stream reader. */
    reader = body.getReader()
    signal?.addEventListener('abort', cancelReaderOnAbort, { once: true })
    /** @brief 已写入的实际字节数 / Actual byte count written so far. */
    let writtenBytes = 0
    /** @brief 随流更新的 SHA-256 计算器 / SHA-256 calculator updated with the stream. */
    const hash = createHash('sha256')

    while (true) {
      /** @brief 当前流读取结果 / Current stream-read result. */
      const chunk = await reader.read()
      signal?.throwIfAborted()
      if (chunk.done) break

      writtenBytes += chunk.value.byteLength
      if (writtenBytes > expectation.maximumBytes) {
        void reader
          .cancel('PDF artifact exceeded the configured size limit.')
          .catch((): void => undefined)
        throw new Error('PDF artifact exceeds the 25 MiB size limit.')
      }
      if (writtenBytes > expectation.expectedSizeBytes) {
        void reader
          .cancel('PDF artifact exceeded its declared byte count.')
          .catch((): void => undefined)
        throw new Error('PDF artifact size does not match its declared integrity metadata.')
      }
      hash.update(chunk.value)
      await file.writeFile(chunk.value)
      signal?.throwIfAborted()
    }

    /** @brief 流内容的最终 SHA-256 摘要 / Final SHA-256 digest of the stream contents. */
    const actualSha256 = hash.digest('hex')
    if (writtenBytes !== expectation.expectedSizeBytes) {
      throw new Error('PDF artifact size does not match its declared integrity metadata.')
    }
    if (actualSha256 !== expectation.expectedSha256) {
      throw new Error('PDF artifact digest does not match its declared integrity metadata.')
    }

    await file.sync()
    signal?.throwIfAborted()
    await file.close()
    file = undefined
    signal?.throwIfAborted()
    await rename(temporaryPath, destination)
    return { sha256: actualSha256, sizeBytes: writtenBytes }
  } catch (error: unknown) {
    await file?.close().catch((): void => undefined)
    await rm(temporaryPath, { force: true }).catch((): void => undefined)
    void reader?.cancel('PDF file writing failed.').catch((): void => undefined)
    throw error
  } finally {
    signal?.removeEventListener('abort', cancelReaderOnAbort)
    try {
      reader?.releaseLock()
    } catch {
      // A pending cancellation owns the lock until the stream settles; no privileged handle escapes.
    }
  }
}
