/** @file 前端结构化日志与诊断事件的公共端口 / Public port for frontend structured logs and diagnostic events. */

import type { DiagnosticsConfigurationErrorReason } from '@ai-job-workspace/platform'

/** @brief 前端诊断协议版本 / Frontend diagnostics protocol version. */
export const FRONTEND_DIAGNOSTICS_SCHEMA_VERSION = 1 as const

/** @brief 可用的诊断严重级别 / Available diagnostic severity levels. */
export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error'

/** @brief 诊断记录所属的 renderer 平台 / Renderer platform that owns a diagnostic record. */
export type DiagnosticPlatform = 'web' | 'electron'

/** @brief 可导出的低基数前端路由名称 / Low-cardinality frontend route names eligible for export. */
export const DIAGNOSTIC_ROUTES = [
  'interview.history',
  'interview.room',
  'interview.setup',
  'interview.summary',
  'knowledge.source',
  'knowledge.sources',
  'resume.creation',
  'resume.editor',
  'resume.entry',
  'resume.output',
  'resume.review',
  'resume.template_settings',
  'unknown',
  'workspace.home'
] as const

/** @brief 可导出的规范化路由名称 / Exportable normalized route name. */
export type DiagnosticRoute = (typeof DIAGNOSTIC_ROUTES)[number]

/** @brief 安全且稳定的 HTTP 方法 / Safe and stable HTTP methods. */
export type DiagnosticHttpMethod = 'GET' | 'PATCH' | 'POST'

/** @brief 不含用户输入的 HTTP 操作分类 / HTTP operation categories without user input. */
export type DiagnosticHttpOperation =
  | 'interview.report.read'
  | 'interview.scenario.list'
  | 'interview.scenario.read'
  | 'interview.session.create'
  | 'interview.session.list'
  | 'interview.session.read'
  | 'knowledge.source.list'
  | 'knowledge.source.read'
  | 'knowledge.source.update'
  | 'resume.document.list'
  | 'resume.document.create'
  | 'resume.document.read'
  | 'resume.operation.apply'
  | 'resume.render_job.create'
  | 'resume.render_job.read'
  | 'resume.template.list'
  | 'resume.template.read'
  | 'workspace.list'
  | 'workspace.me.read'
  | 'unknown'

/** @brief 异步页面资源的固定名称 / Fixed names for asynchronous page resources. */
export type DiagnosticResourceName =
  | 'interview.history'
  | 'interview.runtime'
  | 'interview.setup'
  | 'interview.summary'
  | 'knowledge.source'
  | 'knowledge.sources'
  | 'resume.creation'
  | 'resume.editor'
  | 'resume.entry'
  | 'resume.output'
  | 'resume.review'
  | 'resume.template_settings'
  | 'workspace.session'
  | 'workspace.home'

/** @brief 用户命令的固定操作名称 / Fixed operation names for user commands. */
export type DiagnosticCommandOperation =
  | 'interview.answer_submit'
  | 'interview.create'
  | 'resume.authority_reload'
  | 'resume.create'
  | 'resume.pdf_render'
  | 'resume.render'
  | 'resume.proposal_decision'
  | 'resume.restore'
  | 'resume.section_delete'
  | 'resume.section_reorder'
  | 'resume.section_update'

/** @brief 经过归类且不带错误原文的错误类别 / Classified error kinds without raw error text. */
export type DiagnosticErrorKind =
  | 'aborted'
  | 'backend_problem'
  | 'configuration'
  | 'contract'
  | 'network'
  | 'outcome_unknown'
  | 'react_render'
  | 'timeout'
  | 'unknown'

/** @brief 运行时错误的可信来源 / Trusted sources of runtime failures. */
export type DiagnosticRuntimeErrorSource = 'react_boundary' | 'unhandled_rejection' | 'window_error'

/** @brief 诊断配置失效的无敏感原因 / Non-sensitive reasons for an invalid diagnostics configuration. */
export type DiagnosticConfigurationErrorReason = DiagnosticsConfigurationErrorReason

/**
 * @brief 关闭式事件注册表 / Closed diagnostic-event registry.
 * @note 该映射是远程可上传字段的 allowlist；严禁以 `Record<string, unknown>` 绕过它。
 */
export interface DiagnosticsEventRegistry {
  /** @brief 应用启动 / Application startup. */
  readonly 'app.started': {
    readonly app_version: string
    readonly platform: DiagnosticPlatform
    readonly upload_enabled: boolean
  }
  /** @brief 路由已经切换 / Route transition completed. */
  readonly 'app.route_changed': { readonly route: DiagnosticRoute }
  /** @brief 诊断配置无效且已关闭上传 / Diagnostics configuration was invalid and upload was disabled. */
  readonly 'diagnostics.config_invalid': {
    readonly reason: DiagnosticConfigurationErrorReason
  }
  /** @brief HTTP 请求成功完成 / HTTP request completed successfully. */
  readonly 'http.request_completed': {
    readonly duration_ms: number
    readonly method: DiagnosticHttpMethod
    readonly operation: DiagnosticHttpOperation
    readonly request_id: string
    readonly status: number
  }
  /** @brief HTTP 请求被预期取消 / HTTP request was cancelled as expected control flow. */
  readonly 'http.request_cancelled': {
    readonly duration_ms: number
    readonly method: DiagnosticHttpMethod
    readonly operation: DiagnosticHttpOperation
    readonly request_id: string
  }
  /** @brief HTTP 请求未完成 / HTTP request did not complete. */
  readonly 'http.request_failed': {
    readonly duration_ms: number
    readonly error_kind: DiagnosticErrorKind
    readonly method: DiagnosticHttpMethod
    readonly operation: DiagnosticHttpOperation
    readonly request_id: string
    readonly status: number | null
  }
  /** @brief 面试关键命令完成 / Interview command completed. */
  readonly 'interview.command_completed': {
    readonly duration_ms: number
    readonly operation: Extract<DiagnosticCommandOperation, `interview.${string}`>
  }
  /** @brief 面试关键命令失败 / Interview command failed. */
  readonly 'interview.command_failed': {
    readonly duration_ms: number
    readonly error_kind: DiagnosticErrorKind
    readonly operation: Extract<DiagnosticCommandOperation, `interview.${string}`>
  }
  /** @brief 知识关键命令已开始 / Knowledge command started. */
  readonly 'knowledge.command_started': {
    readonly operation: Extract<DiagnosticCommandOperation, `knowledge.${string}`>
  }
  /** @brief 知识关键命令完成 / Knowledge command completed. */
  readonly 'knowledge.command_completed': {
    readonly duration_ms: number
    readonly operation: Extract<DiagnosticCommandOperation, `knowledge.${string}`>
  }
  /** @brief 知识关键命令失败 / Knowledge command failed. */
  readonly 'knowledge.command_failed': {
    readonly duration_ms: number
    readonly error_kind: DiagnosticErrorKind
    readonly operation: Extract<DiagnosticCommandOperation, `knowledge.${string}`>
  }
  /** @brief 页面异步资源加载完成 / Asynchronous page resource loaded. */
  readonly 'resource.load_completed': {
    readonly duration_ms: number
    readonly resource: DiagnosticResourceName
  }
  /** @brief 页面异步资源加载失败 / Asynchronous page resource failed to load. */
  readonly 'resource.load_failed': {
    readonly duration_ms: number
    readonly error_kind: DiagnosticErrorKind
    readonly resource: DiagnosticResourceName
  }
  /** @brief 简历关键命令完成 / Resume command completed. */
  readonly 'resume.command_completed': {
    readonly duration_ms: number
    readonly operation: Extract<DiagnosticCommandOperation, `resume.${string}`>
  }
  /** @brief 简历关键命令失败 / Resume command failed. */
  readonly 'resume.command_failed': {
    readonly duration_ms: number
    readonly error_kind: DiagnosticErrorKind
    readonly operation: Extract<DiagnosticCommandOperation, `resume.${string}`>
  }
  /** @brief 主题已经切换 / Theme preference changed. */
  readonly 'preference.theme_changed': { readonly theme: 'dark' | 'light' }
  /** @brief 本地主题存储不可用 / Local theme storage was unavailable. */
  readonly 'preference.theme_storage_unavailable': Record<never, never>
  /** @brief renderer 运行时信息已确认 / Renderer runtime information confirmed. */
  readonly 'runtime.info_loaded': {
    readonly app_version: string
    readonly platform: DiagnosticPlatform
    readonly upload_enabled: boolean
  }
  /** @brief renderer 运行时信息读取失败 / Renderer runtime-information lookup failed. */
  readonly 'runtime.info_failed': { readonly error_kind: DiagnosticErrorKind }
  /** @brief 未捕获运行时错误 / Uncaught runtime error. */
  readonly 'runtime.unhandled_error': {
    readonly error_kind: DiagnosticErrorKind
    readonly source: DiagnosticRuntimeErrorSource
  }
}

/** @brief 已注册诊断事件名称 / Registered diagnostic event name. */
export type DiagnosticEventName = keyof DiagnosticsEventRegistry

/** @brief 由事件名称决定的结构化诊断记录 / Structured diagnostic record determined by its event name. */
export type DiagnosticRecord = {
  readonly [TName in DiagnosticEventName]: {
    readonly attributes: Readonly<DiagnosticsEventRegistry[TName]>
    readonly event_id: string
    readonly level: DiagnosticLevel
    readonly name: TName
    readonly occurred_at: string
  }
}[DiagnosticEventName]

/** @brief 诊断资源标识 / Resource identity attached to every diagnostics batch. */
export interface DiagnosticResource {
  /** @brief 服务稳定名称 / Stable service name. */
  readonly service_name: 'ai-job-workspace-frontend'
  /** @brief 前端应用版本 / Frontend application version. */
  readonly service_version: string
  /** @brief 仅限内存生命周期的随机会话标识 / Random session identifier limited to in-memory lifetime. */
  readonly session_id: string
  /** @brief 产生记录的 renderer 平台 / Renderer platform that emitted records. */
  readonly platform: DiagnosticPlatform
}

/** @brief 诊断接收器的版本化批量请求 / Versioned batch request for a diagnostics receiver. */
export interface DiagnosticBatch {
  /** @brief wire schema 版本 / Wire-schema version. */
  readonly schema_version: typeof FRONTEND_DIAGNOSTICS_SCHEMA_VERSION
  /** @brief 接收器发送时间 / Time at which the client sends the batch. */
  readonly sent_at: string
  /** @brief 产生事件的应用资源 / Application resource that emitted the events. */
  readonly resource: DiagnosticResource
  /** @brief 已脱敏且有界的事件 / Sanitized and bounded events. */
  readonly events: readonly DiagnosticRecord[]
}

/**
 * @brief 诊断事件的最小应用端口 / Minimal application port for diagnostic events.
 * @note `emit` 永不等待网络且必须吞掉接收器故障；业务代码不得 await 该方法。
 */
export interface Diagnostics {
  /**
   * @brief 发射一个已注册的结构化事件 / Emit a registered structured event.
   * @template TName 事件名称 / Event name.
   * @param name 低基数事件名称 / Low-cardinality event name.
   * @param attributes 经类型系统约束的安全属性 / Safe attributes constrained by the type system.
   * @return 无返回值 / No return value.
   */
  emit<TName extends DiagnosticEventName>(
    name: TName,
    attributes: Readonly<DiagnosticsEventRegistry[TName]>
  ): void
  /**
   * @brief 尝试投递已缓冲事件 / Attempt to deliver buffered events.
   * @return 所有接收器完成或安全失败后的 Promise / Promise after all sinks finish or fail safely.
   */
  flush(): Promise<void>
  /**
   * @brief 清理定时器和接收器 / Dispose timers and sinks.
   * @return 无返回值 / No return value.
   */
  dispose(): void
}

/**
 * @brief 判断错误是否代表预期取消 / Determine whether an error represents an expected cancellation.
 * @param error 未知错误 / Unknown error.
 * @return 为 AbortError 时返回 true / True for an AbortError.
 */
export function isDiagnosticAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string' &&
    error.name === 'AbortError'
  )
}

/**
 * @brief 将未知错误映射为不泄漏文本的稳定类别 / Map an unknown error to a stable category without leaking text.
 * @param error 未知错误 / Unknown error.
 * @return 可安全记录的错误类别 / Error kind safe to record.
 */
export function classifyDiagnosticError(error: unknown): DiagnosticErrorKind {
  if (isDiagnosticAbortError(error)) return 'aborted'

  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = error.name
    if (name === 'ApiV2NetworkError' && 'kind' in error) {
      if (error.kind === 'aborted') return 'aborted'
      if (error.kind === 'timeout') return 'timeout'
      return 'network'
    }
    if (name === 'TimeoutError') return 'timeout'
    if (name === 'ApiV2WriteOutcomeUnknownError') {
      return 'outcome_unknown'
    }
    if (name === 'ApiV2ProblemError') return 'backend_problem'
    if (name === 'ApiV2ContractError' || name === 'ResumeTemplateCursorLoopError') {
      return 'contract'
    }
  }

  if (error instanceof TypeError) return 'network'
  return 'unknown'
}

/**
 * @brief 安全读取错误中的 HTTP 状态码 / Safely read an HTTP status from an error.
 * @param error 未知错误 / Unknown error.
 * @return 合法状态码；不可用时为 null / Valid status code, or null when unavailable.
 */
export function getDiagnosticHttpStatus(error: unknown): number | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('status' in error) ||
    typeof error.status !== 'number' ||
    !Number.isInteger(error.status) ||
    error.status < 100 ||
    error.status > 599
  ) {
    return null
  }

  return error.status
}
