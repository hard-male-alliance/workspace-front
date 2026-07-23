/** @file Resume 聚合写操作的单通道协调器 / Single-lane coordinator for Resume aggregate mutations. */

import type { UiResumeId } from '../domain/document'

/**
 * @brief 同一 Resume 已有写操作尚未完成 / A write for the same Resume is still in flight.
 * @note 该错误只表示客户端本地互斥，不代表服务端冲突，也不要求权威重载。 / This error represents client-side exclusion only; it is not a server conflict and does not require an authority reload.
 */
export class ResumeMutationInProgressError extends Error {
  /** @brief 稳定错误名称 / Stable error name. */
  override readonly name = 'ResumeMutationInProgressError'

  constructor() {
    super('A Resume mutation is already in progress for this aggregate.')
  }
}

/**
 * @brief 按 Resume 聚合 ID 阻止并发写意图 / Prevent concurrent write intents per Resume aggregate ID.
 * @note 不排队或重放用户意图；调用方必须在当前写完成后基于新 revision 重新产生意图。 / User intents are neither queued nor replayed; callers must create a new intent from the new revision after the active write finishes.
 */
export class ResumeMutationLane {
  /** @brief 当前正在写入的 Resume ID / Resume IDs currently being mutated. */
  readonly #activeResumeIds = new Set<string>()

  /**
   * @brief 在目标 Resume 的唯一写通道中执行操作 / Run an operation in the target Resume's exclusive write lane.
   * @template TResult 写操作结果 / Mutation result.
   * @param resumeId 目标 Resume 聚合 ID / Target Resume aggregate ID.
   * @param mutation 延迟到获得通道后执行的写操作 / Mutation deferred until the lane is acquired.
   * @return 写操作结果 / Mutation result.
   * @throws {ResumeMutationInProgressError} 同一聚合已有写操作执行中 / A mutation for the same aggregate is already in flight.
   */
  async run<TResult>(resumeId: UiResumeId, mutation: () => Promise<TResult>): Promise<TResult> {
    if (this.#activeResumeIds.has(resumeId)) {
      throw new ResumeMutationInProgressError()
    }

    this.#activeResumeIds.add(resumeId)
    try {
      return await mutation()
    } finally {
      this.#activeResumeIds.delete(resumeId)
    }
  }
}
