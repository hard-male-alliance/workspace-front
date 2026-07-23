/** @file 跨限界上下文共享的最小应用失败语义 / Minimal application-failure semantics shared across bounded contexts. */

/**
 * @brief 已由应用边界确认、且不携带 HTTP 推测的命令冲突 / Command conflict confirmed by an application boundary without inferred HTTP semantics.
 * @note 子类仍负责发布各自限界上下文的恢复事实；共享层只允许外层安全分类。 / Subclasses remain responsible for publishing recovery facts for their bounded context; the shared layer only enables safe outer-layer classification.
 */
export abstract class ConfirmedCommandConflictError extends Error {}
