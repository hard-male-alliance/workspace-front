/** @file PDF 产物的同目录原子文件写入 / Same-directory atomic file writing for PDF artifacts. */

import { open, rename, rm } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** @brief 默认 PDF 最大字节数（25 MiB） / Default maximum PDF size in bytes (25 MiB). */
export const MAX_PDF_BYTES = 25 * 1024 * 1024

/** @brief 可流式读取的 PDF 响应体 / Stream-readable PDF response body. */
export interface PdfResponseBody {
  /**
   * @brief 获取响应流读取器 / Get the response-stream reader.
   * @return 字节流读取器 / Byte-stream reader.
   */
  readonly getReader: () => ReadableStreamDefaultReader<Uint8Array>
}

/**
 * @brief 将 PDF 流写入同目录独占临时文件并原子改名 / Write a PDF stream to an exclusive same-directory temporary file and atomically rename it.
 * @param destination 用户选择的最终路径 / Final path selected by the user.
 * @param body PDF 字节流 / PDF byte stream.
 * @param maximumBytes 允许写入的最大字节数 / Maximum number of bytes allowed.
 * @param signal 可选统一截止信号 / Optional shared deadline signal.
 * @return 写入完成后的 Promise / Promise fulfilled after writing completes.
 * @throws 实际流大小超限或任一文件操作失败时抛出 / Throws when streamed bytes exceed the limit or a file operation fails.
 */
export async function writePdfAtomically(
  destination: string,
  body: PdfResponseBody,
  maximumBytes: number = MAX_PDF_BYTES,
  signal?: AbortSignal
): Promise<void> {
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

    while (true) {
      /** @brief 当前流读取结果 / Current stream-read result. */
      const chunk = await reader.read()
      signal?.throwIfAborted()
      if (chunk.done) break

      writtenBytes += chunk.value.byteLength
      if (writtenBytes > maximumBytes) {
        void reader
          .cancel('PDF artifact exceeded the configured size limit.')
          .catch((): void => undefined)
        throw new Error('PDF artifact exceeds the 25 MiB size limit.')
      }
      await file.writeFile(chunk.value)
      signal?.throwIfAborted()
    }

    await file.sync()
    signal?.throwIfAborted()
    await file.close()
    file = undefined
    signal?.throwIfAborted()
    await rename(temporaryPath, destination)
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
