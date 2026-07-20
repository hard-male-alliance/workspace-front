/** @file 有界知识摄取任务轮询 / Bounded Knowledge ingestion Job polling. */

import type { KnowledgeGateway } from '../../domain/gateways'
import type { UiKnowledgeIngestionJob, UiKnowledgeIngestionJobId } from '../../domain/models'

const DEFAULT_MAX_ATTEMPTS = 30
const DEFAULT_INTERVAL_MS = 1_500

/** @brief 轮询达到明确上限 / Polling reached its explicit bound. */
export class KnowledgePollingTimeoutError extends Error {
  override readonly name = 'KnowledgePollingTimeoutError'

  constructor() {
    super('Knowledge ingestion polling reached its attempt limit.')
  }
}

/** @brief 可注入的等待函数 / Injectable wait function. */
export type KnowledgePollingWait = (milliseconds: number, signal?: AbortSignal) => Promise<void>

/** @brief 知识摄取轮询选项 / Knowledge ingestion polling options. */
export interface PollKnowledgeIngestionOptions {
  readonly gateway: Pick<KnowledgeGateway, 'getKnowledgeIngestionJob'>
  readonly jobId: UiKnowledgeIngestionJobId
  readonly signal?: AbortSignal
  readonly maxAttempts?: number
  readonly intervalMs?: number
  readonly wait?: KnowledgePollingWait
}

/** @brief 创建平台标准取消错误 / Create the platform-standard cancellation error. */
function createAbortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/** @brief 在边界处检查取消状态 / Check cancellation at a boundary. */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw createAbortError()
  }
}

/** @brief 默认可取消等待，并在完成时清理监听器 / Default abortable wait with listener cleanup. */
const defaultWait: KnowledgePollingWait = async (milliseconds, signal): Promise<void> => {
  throwIfAborted(signal)

  await new Promise<void>((resolve, reject) => {
    const finish = (callback: () => void): void => {
      globalThis.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', handleAbort)
      callback()
    }
    const handleAbort = (): void => {
      finish(() => reject(createAbortError()))
    }
    const timeoutId = globalThis.setTimeout(() => finish(resolve), milliseconds)
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

/** @brief 判断摄取任务是否已终止 / Determine whether an ingestion Job is terminal. */
function isTerminal(status: UiKnowledgeIngestionJob['status']): boolean {
  return ['succeeded', 'failed', 'cancelled', 'expired'].includes(status)
}

/**
 * @brief 在固定次数内轮询摄取任务 / Poll an ingestion Job within a fixed attempt bound.
 * @throws {KnowledgePollingTimeoutError} 任务未在上限内终止 / Job did not terminate within the bound.
 * @throws {DOMException} 调用被取消 / Operation was aborted.
 */
export async function pollKnowledgeIngestion(
  options: PollKnowledgeIngestionOptions
): Promise<UiKnowledgeIngestionJob> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const wait = options.wait ?? defaultWait

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive integer.')
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(options.signal)
    const job = await options.gateway.getKnowledgeIngestionJob(options.jobId, options.signal)
    if (isTerminal(job.status)) {
      return job
    }
    if (attempt < maxAttempts) {
      await wait(intervalMs, options.signal)
      throwIfAborted(options.signal)
    }
  }

  throw new KnowledgePollingTimeoutError()
}
