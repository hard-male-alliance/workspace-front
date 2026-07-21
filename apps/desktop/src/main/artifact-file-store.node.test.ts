import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { writePdfAtomically } from './artifact-file-store'

/** @brief 当前测试创建的临时目录 / Temporary directories created by the current tests. */
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

/**
 * @brief 创建包含单个字节块的测试流 / Create a test stream containing one byte chunk.
 * @param bytes 流中的字节 / Bytes in the stream.
 * @return 可读字节流 / Readable byte stream.
 */
function createBody(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      controller.enqueue(bytes)
      controller.close()
    }
  })
}

describe('writePdfAtomically', () => {
  it('经同目录独占临时文件替换目标内容且不遗留临时文件', async () => {
    /** @brief 当前测试目录 / Directory owned by this test. */
    const directory = await mkdtemp(join(tmpdir(), 'ai-job-workspace-artifact-'))
    temporaryDirectories.push(directory)
    /** @brief 最终 PDF 路径 / Final PDF path. */
    const destination = join(directory, 'resume.pdf')
    await writeFile(destination, 'old')

    /** @brief 用于验证读取锁被释放的 PDF 流 / PDF stream used to verify reader-lock release. */
    const body = createBody(new TextEncoder().encode('%PDF-new'))
    await writePdfAtomically(destination, body, 100)

    expect(await readFile(destination, 'utf8')).toBe('%PDF-new')
    expect(await readdir(directory)).toEqual(['resume.pdf'])
    expect(body.locked).toBe(false)
  })

  it('实际流超限时保留旧目标并清理临时文件', async () => {
    /** @brief 当前测试目录 / Directory owned by this test. */
    const directory = await mkdtemp(join(tmpdir(), 'ai-job-workspace-artifact-'))
    temporaryDirectories.push(directory)
    /** @brief 最终 PDF 路径 / Final PDF path. */
    const destination = join(directory, 'resume.pdf')
    await writeFile(destination, 'old')

    await expect(
      writePdfAtomically(destination, createBody(new Uint8Array(11)), 10)
    ).rejects.toThrow('25 MiB')
    expect(await readFile(destination, 'utf8')).toBe('old')
    expect(await readdir(directory)).toEqual(['resume.pdf'])
  })

  it('最终 rename 失败时清理已写入的独占临时文件', async () => {
    /** @brief 当前测试目录 / Directory owned by this test. */
    const directory = await mkdtemp(join(tmpdir(), 'ai-job-workspace-artifact-'))
    temporaryDirectories.push(directory)
    /** @brief 故意充当目标的非空目录 / Non-empty directory intentionally used as the destination. */
    const conflictingDirectory = await mkdtemp(join(directory, 'resume.pdf-'))
    await writeFile(join(conflictingDirectory, 'keep'), 'keep')

    await expect(
      writePdfAtomically(
        conflictingDirectory,
        createBody(new TextEncoder().encode('%PDF-new')),
        100
      )
    ).rejects.toThrow()
    expect(await readdir(directory)).toEqual([basename(conflictingDirectory)])
  })

  it('统一截止信号会取消挂起流、保留旧目标并释放读取锁', async () => {
    /** @brief 当前测试目录 / Directory owned by this test. */
    const directory = await mkdtemp(join(tmpdir(), 'ai-job-workspace-artifact-'))
    temporaryDirectories.push(directory)
    /** @brief 最终 PDF 路径 / Final PDF path. */
    const destination = join(directory, 'resume.pdf')
    await writeFile(destination, 'old')
    /** @brief 永不主动产生数据的底层响应流 / Underlying response stream that never produces data itself. */
    const stream = new ReadableStream<Uint8Array>({
      /** @brief 模拟永不完成的底层取消 / Simulate an underlying cancellation that never settles. */
      cancel(): Promise<void> {
        return new Promise((): void => undefined)
      },
      /** @brief 保持读取挂起 / Keep reads pending. */
      pull(): void {}
    })
    /** @brief 通知测试读取器已经取得 / Notify the test that the reader has been acquired. */
    let notifyReaderAcquired: (() => void) | undefined
    /** @brief 等待读取器取得的 Promise / Promise waiting for reader acquisition. */
    const readerAcquired = new Promise<void>((resolve): void => {
      notifyReaderAcquired = resolve
    })
    /** @brief 可观察读取器取得时刻的 PDF 正文 / PDF body exposing the reader-acquisition moment. */
    const body = {
      getReader(): ReadableStreamDefaultReader<Uint8Array> {
        notifyReaderAcquired?.()
        return stream.getReader()
      }
    }
    /** @brief 驱动截止信号的控制器 / Controller driving the deadline signal. */
    const controller = new AbortController()

    /** @brief 正在等待响应流的原子写入 / Atomic write waiting for the response stream. */
    const operation = writePdfAtomically(destination, body, 100, controller.signal)
    /** @brief 在中止前即安装的失败断言 / Rejection assertion installed before aborting. */
    const rejection = expect(operation).rejects.toThrow('test deadline')
    await readerAcquired
    controller.abort(new Error('test deadline'))

    await rejection
    expect(await readFile(destination, 'utf8')).toBe('old')
    expect(await readdir(directory)).toEqual(['resume.pdf'])
    expect(stream.locked).toBe(false)
  })
})
