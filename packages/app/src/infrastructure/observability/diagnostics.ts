/** @file 有界且失败隔离的前端诊断基础设施 / Bounded and failure-isolated frontend diagnostics infrastructure. */

import {
  DIAGNOSTIC_ROUTES,
  FRONTEND_DIAGNOSTICS_SCHEMA_VERSION
} from '../../observability/diagnostics'
import type {
  DiagnosticBatch,
  DiagnosticCommandOperation,
  DiagnosticEventName,
  DiagnosticErrorKind,
  DiagnosticHttpMethod,
  DiagnosticHttpOperation,
  DiagnosticLevel,
  DiagnosticRecord,
  DiagnosticResource,
  DiagnosticResourceName,
  DiagnosticRuntimeErrorSource,
  Diagnostics,
  DiagnosticsEventRegistry,
  DiagnosticPlatform,
  DiagnosticConfigurationErrorReason
} from '../../observability/diagnostics'

/** @brief 可注入的当前时间读取器 / Injectable current-time reader. */
export type DiagnosticsClock = () => Date

/** @brief 可注入的稳定事件 ID 生成器 / Injectable stable event-ID generator. */
export type DiagnosticsIdFactory = () => string

/** @brief 当前平台 setTimeout 返回的定时器句柄 / Timer handle returned by the current platform's setTimeout. */
export type DiagnosticsTimer = ReturnType<typeof globalThis.setTimeout>

/** @brief 可注入的定时器调度器 / Injectable timer scheduler. */
export type DiagnosticsSchedule = (
  callback: () => void,
  delayMilliseconds: number
) => DiagnosticsTimer

/** @brief 可注入的定时器取消器 / Injectable timer canceller. */
export type DiagnosticsCancelSchedule = (timerId: DiagnosticsTimer) => void

/** @brief 接收已脱敏诊断记录的端口 / Port that receives sanitized diagnostic records. */
export interface DiagnosticSink {
  /** @brief 接收单个诊断记录 / Receive one diagnostic record. */
  emit(record: DiagnosticRecord): void
  /** @brief 尝试完成已缓冲工作 / Attempt to finish buffered work. */
  flush?(): Promise<void>
  /** @brief 释放接收器资源 / Release sink resources. */
  dispose?(): void
}

/** @brief 可注入的最小控制台边界 / Injectable minimal console boundary. */
export interface DiagnosticsConsole {
  /** @brief 输出调试级记录 / Output a debug-level record. */
  debug(...data: readonly unknown[]): void
  /** @brief 输出信息级记录 / Output an info-level record. */
  info(...data: readonly unknown[]): void
  /** @brief 输出警告级记录 / Output a warning-level record. */
  warn(...data: readonly unknown[]): void
  /** @brief 输出错误级记录 / Output an error-level record. */
  error(...data: readonly unknown[]): void
}

/** @brief 控制台诊断 sink 的选项 / Options for the console diagnostics sink. */
export interface ConsoleDiagnosticsSinkOptions {
  /** @brief 可测试替换的控制台 / Console replaceable in tests. */
  readonly console?: DiagnosticsConsole
}

/** @brief HTTP 诊断批量导出器 / HTTP diagnostic batch exporter. */
export interface DiagnosticBatchExporter {
  /**
   * @brief 尝试导出一个诊断批次 / Attempt to export one diagnostics batch.
   * @param batch 已脱敏的版本化批次 / Sanitized versioned batch.
   * @return 接收器确认 2xx 时为 true / True when the receiver confirms with 2xx.
   */
  export(batch: DiagnosticBatch): Promise<boolean>
}

/** @brief HTTP 批量导出器选项 / Options for the HTTP batch exporter. */
export interface HttpDiagnosticBatchExporterOptions {
  /** @brief 已由宿主配置验证的固定 endpoint / Fixed endpoint validated by host configuration. */
  readonly endpoint: string
  /** @brief 测试可替换的 fetch 实现 / Fetch implementation replaceable in tests. */
  readonly fetchImpl?: typeof fetch
  /** @brief 单次上传的超时上限 / Timeout cap for one upload. */
  readonly timeoutMilliseconds?: number
  /** @brief 可测试替换的定时器调度器 / Timer scheduler replaceable in tests. */
  readonly schedule?: DiagnosticsSchedule
  /** @brief 可测试替换的定时器取消器 / Timer canceller replaceable in tests. */
  readonly cancelSchedule?: DiagnosticsCancelSchedule
}

/** @brief 有界缓冲 sink 的选项 / Options for a bounded buffered sink. */
export interface BufferedDiagnosticsSinkOptions {
  /** @brief 每个 export batch 共同使用的应用资源 / Application resource shared by every export batch. */
  readonly resource: DiagnosticResource
  /** @brief 批次实际投递器 / Actual batch exporter. */
  readonly exporter: DiagnosticBatchExporter
  /** @brief 可选的当前时间读取器 / Optional current-time reader. */
  readonly clock?: DiagnosticsClock
  /** @brief 最大驻留事件数 / Maximum resident event count. */
  readonly maxQueueSize?: number
  /** @brief 单个网络批次的最大事件数 / Maximum event count in one network batch. */
  readonly maxBatchSize?: number
  /** @brief 首次入队后的延迟 flush 时间 / Delayed flush time after first enqueue. */
  readonly flushIntervalMilliseconds?: number
  /** @brief 可测试替换的定时器调度器 / Timer scheduler replaceable in tests. */
  readonly schedule?: DiagnosticsSchedule
  /** @brief 可测试替换的定时器取消器 / Timer canceller replaceable in tests. */
  readonly cancelSchedule?: DiagnosticsCancelSchedule
}

/** @brief 完整 Diagnostics 实例的创建选项 / Creation options for a complete Diagnostics instance. */
export interface CreateDiagnosticsOptions {
  /** @brief 已注册的事件接收器 / Registered event sinks. */
  readonly sinks: readonly DiagnosticSink[]
  /** @brief 可选的当前时间读取器 / Optional current-time reader. */
  readonly clock?: DiagnosticsClock
  /** @brief 可选的事件 ID 生成器 / Optional event-ID generator. */
  readonly createId?: DiagnosticsIdFactory
}

/** @brief 默认的单批最大事件数 / Default maximum events per batch. */
const DEFAULT_MAX_BATCH_SIZE = 20

/** @brief 默认的内存队列上限 / Default in-memory queue limit. */
const DEFAULT_MAX_QUEUE_SIZE = 200

/** @brief 默认延迟 flush 周期 / Default delayed-flush interval. */
const DEFAULT_FLUSH_INTERVAL_MILLISECONDS = 5_000

/** @brief 导出失败后的最长重试等待时间 / Maximum retry wait after an export failure. */
const MAX_RETRY_DELAY_MILLISECONDS = 60_000

/** @brief 默认单次 HTTP 上传超时 / Default timeout for a single HTTP upload. */
const DEFAULT_UPLOAD_TIMEOUT_MILLISECONDS = 3_000

/** @brief 单个字符串属性的最大长度 / Maximum length of one string attribute. */
const MAX_ATTRIBUTE_STRING_LENGTH = 256

/** @brief 可接受的最长诊断时长 / Longest duration accepted for one diagnostic event. */
const MAX_DURATION_MILLISECONDS = 86_400_000

/** @brief 可上传的规范化路由名称 / Normalized route names permitted for upload. */
const diagnosticRoutes = new Set<string>(DIAGNOSTIC_ROUTES)

/** @brief 可上传的平台枚举 / Platform enumeration permitted for upload. */
const diagnosticPlatforms = new Set<DiagnosticPlatform>(['web', 'electron'])

/** @brief 可上传的 HTTP 方法枚举 / HTTP-method enumeration permitted for upload. */
const diagnosticHttpMethods = new Set<DiagnosticHttpMethod>(['GET', 'PATCH', 'POST'])

/** @brief 可上传的 HTTP 操作枚举 / HTTP-operation enumeration permitted for upload. */
const diagnosticHttpOperations = new Set<DiagnosticHttpOperation>([
  'interview.report.read',
  'interview.scenario.list',
  'interview.scenario.read',
  'interview.session.create',
  'interview.session.list',
  'interview.session.read',
  'knowledge.source.list',
  'knowledge.source.read',
  'knowledge.source.update',
  'resume.document.create',
  'resume.document.list',
  'resume.document.read',
  'resume.operation.apply',
  'resume.render_job.create',
  'resume.render_job.read',
  'resume.template.list',
  'resume.template.read',
  'workspace.list',
  'workspace.me.read',
  'unknown'
])

/** @brief 可上传的用户命令枚举 / User-command enumeration permitted for upload. */
const diagnosticCommandOperations = new Set<DiagnosticCommandOperation>([
  'interview.answer_submit',
  'interview.create',
  'resume.authority_reload',
  'resume.create',
  'resume.pdf_render',
  'resume.section_delete',
  'resume.section_reorder',
  'resume.section_update'
])

/** @brief 可上传的异步资源枚举 / Asynchronous-resource enumeration permitted for upload. */
const diagnosticResourceNames = new Set<DiagnosticResourceName>([
  'interview.history',
  'interview.runtime',
  'interview.setup',
  'interview.summary',
  'knowledge.sources',
  'knowledge.visibility',
  'resume.creation',
  'resume.editor',
  'resume.entry',
  'resume.template_settings',
  'workspace.session',
  'workspace.home'
])

/** @brief 可上传的错误类别枚举 / Error-kind enumeration permitted for upload. */
const diagnosticErrorKinds = new Set<DiagnosticErrorKind>([
  'aborted',
  'backend_problem',
  'configuration',
  'contract',
  'network',
  'outcome_unknown',
  'react_render',
  'timeout',
  'unknown'
])

/** @brief 可上传的运行时错误来源 / Runtime-error sources permitted for upload. */
const diagnosticRuntimeErrorSources = new Set<DiagnosticRuntimeErrorSource>([
  'react_boundary',
  'unhandled_rejection',
  'window_error'
])

/** @brief 可上传的诊断配置失败原因 / Diagnostics-configuration failure reasons permitted for upload. */
const diagnosticConfigurationErrorReasons = new Set<DiagnosticConfigurationErrorReason>([
  'invalid_host',
  'invalid_port',
  'invalid_protocol',
  'insecure_protocol',
  'partial'
])

/**
 * @brief 每个事件允许出现的属性键 / Allowed attribute keys for each event.
 * @note 此表是运行时第二道 allowlist，防止 `as unknown as` 绕过 TypeScript 的封闭事件 registry。
 */
const allowedAttributeKeys: Readonly<{
  readonly [TName in DiagnosticEventName]: readonly (keyof DiagnosticsEventRegistry[TName])[]
}> = {
  'app.started': ['app_version', 'platform', 'upload_enabled'],
  'app.route_changed': ['route'],
  'diagnostics.config_invalid': ['reason'],
  'http.request_completed': ['duration_ms', 'method', 'operation', 'request_id', 'status'],
  'http.request_cancelled': ['duration_ms', 'method', 'operation', 'request_id'],
  'http.request_failed': [
    'duration_ms',
    'error_kind',
    'method',
    'operation',
    'request_id',
    'status'
  ],
  'interview.command_completed': ['duration_ms', 'operation'],
  'interview.command_failed': ['duration_ms', 'error_kind', 'operation'],
  'knowledge.command_started': ['operation'],
  'knowledge.command_completed': ['duration_ms', 'operation'],
  'knowledge.command_failed': ['duration_ms', 'error_kind', 'operation'],
  'resource.load_completed': ['duration_ms', 'resource'],
  'resource.load_failed': ['duration_ms', 'error_kind', 'resource'],
  'resume.command_completed': ['duration_ms', 'operation'],
  'resume.command_failed': ['duration_ms', 'error_kind', 'operation'],
  'preference.theme_changed': ['theme'],
  'preference.theme_storage_unavailable': [],
  'runtime.info_loaded': ['app_version', 'platform', 'upload_enabled'],
  'runtime.info_failed': ['error_kind'],
  'runtime.unhandled_error': ['error_kind', 'source']
}

/** @brief 读取当前 UTC 时间的默认实现 / Default implementation that reads the current UTC time. */
const defaultClock: DiagnosticsClock = (): Date => new Date()

/**
 * @brief 创建随机诊断事件 ID / Create a random diagnostic event ID.
 * @return 不写入持久化存储的随机 ID / Random ID not written to persistent storage.
 */
function createDefaultId(): string {
  return createDiagnosticsSessionId()
}

/**
 * @brief 删除控制字符并限制字符串长度 / Remove control characters and cap a string length.
 * @param value 可能来自不可信边界的字符串 / String that may originate at an untrusted boundary.
 * @return 可安全写入日志的短字符串 / Short string safe to write to logs.
 */
function sanitizeString(value: string): string {
  return value.replace(/\p{Cc}/gu, ' ').slice(0, MAX_ATTRIBUTE_STRING_LENGTH)
}

/**
 * @brief 清洗仅应含随机关联符的 opaque ID / Sanitize an opaque ID that should contain only random correlation characters.
 * @param value 未经信任的 ID 文本 / Untrusted ID text.
 * @return 可安全关联的 ID；格式不合法时为固定占位符 / Safely correlatable ID, or a fixed placeholder when malformed.
 */
function sanitizeOpaqueId(value: unknown): string {
  if (typeof value !== 'string') return 'redacted'
  const sanitized = sanitizeString(value)
  return /^[A-Za-z0-9_-]{1,128}$/u.test(sanitized) ? sanitized : 'redacted'
}

/**
 * @brief 创建不影响产品启动的内存诊断会话 ID / Create an in-memory diagnostics session ID without affecting product startup.
 * @return 格式受限的随机 ID；随机源不可用时为固定安全值 / Format-constrained random ID, or a fixed safe value when randomness is unavailable.
 */
export function createDiagnosticsSessionId(): string {
  try {
    const value = globalThis.crypto?.randomUUID()
    return typeof value === 'string' ? sanitizeOpaqueId(value) : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/**
 * @brief 判断字符串属性是否匹配注册表语义 / Determine whether a string attribute matches registry semantics.
 * @param name 已注册事件名称 / Registered event name.
 * @param key 属性键 / Attribute key.
 * @param value 已清洗的字符串值 / Sanitized string value.
 * @return 值可安全上传时为 true / True when the value is safe to upload.
 */
function isAllowedDiagnosticString(name: DiagnosticEventName, key: string, value: string): boolean {
  if (key === 'app_version') return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u.test(value)
  if (key === 'request_id') return /^[A-Za-z0-9_-]{1,128}$/u.test(value)
  if (key === 'route') return diagnosticRoutes.has(value)
  if (key === 'platform') return diagnosticPlatforms.has(value as DiagnosticPlatform)
  if (key === 'method') return diagnosticHttpMethods.has(value as DiagnosticHttpMethod)
  if (key === 'resource') return diagnosticResourceNames.has(value as DiagnosticResourceName)
  if (key === 'error_kind') return diagnosticErrorKinds.has(value as DiagnosticErrorKind)
  if (key === 'source')
    return diagnosticRuntimeErrorSources.has(value as DiagnosticRuntimeErrorSource)
  if (key === 'reason') {
    return diagnosticConfigurationErrorReasons.has(value as DiagnosticConfigurationErrorReason)
  }
  if (key === 'theme') return value === 'dark' || value === 'light'
  if (key !== 'operation') return false

  if (name.startsWith('http.')) {
    return diagnosticHttpOperations.has(value as DiagnosticHttpOperation)
  }
  if (!diagnosticCommandOperations.has(value as DiagnosticCommandOperation)) return false
  if (name.startsWith('interview.')) return value.startsWith('interview.')
  if (name.startsWith('knowledge.')) return value.startsWith('knowledge.')
  return name.startsWith('resume.') && value.startsWith('resume.')
}

/**
 * @brief 判断数值属性是否匹配注册表语义 / Determine whether a numeric attribute matches registry semantics.
 * @param key 属性键 / Attribute key.
 * @param value 未经信任的数值 / Untrusted numeric value.
 * @return 数值安全且低基数时为 true / True when the number is safe and low-cardinality.
 */
function isAllowedDiagnosticNumber(key: string, value: number): boolean {
  if (!Number.isInteger(value)) return false
  if (key === 'duration_ms') return value >= 0 && value <= MAX_DURATION_MILLISECONDS
  return key === 'status' && value >= 100 && value <= 599
}

/**
 * @brief 清洗每个 batch 共享的诊断资源 / Sanitize the diagnostic resource shared by every batch.
 * @param resource 不可信或被测试替换的资源对象 / Resource object that may be untrusted or test-replaced.
 * @return 字段受限且可安全导出的资源 / Resource with constrained fields safe to export.
 */
function sanitizeDiagnosticResource(resource: DiagnosticResource): DiagnosticResource {
  /** @brief 资源版本的候选安全文本 / Candidate safe resource-version text. */
  const version = sanitizeString(resource.service_version)
  return Object.freeze({
    platform: diagnosticPlatforms.has(resource.platform) ? resource.platform : 'web',
    service_name: 'ai-job-workspace-frontend',
    service_version: /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u.test(version) ? version : 'unknown',
    session_id: sanitizeOpaqueId(resource.session_id)
  })
}

/**
 * @brief 将属性值限制为可序列化原始值 / Restrict an attribute value to serializable primitives.
 * @param name 已注册事件名称 / Registered event name.
 * @param key 属性键 / Attribute key.
 * @param value 未知属性值 / Unknown attribute value.
 * @return 已清洗原始值；不允许时为 undefined / Sanitized primitive, or undefined when disallowed.
 */
function sanitizeAttributeValue(
  name: DiagnosticEventName,
  key: string,
  value: unknown
): boolean | number | string | null | undefined {
  if (typeof value === 'string') {
    const sanitized = sanitizeString(value)
    return isAllowedDiagnosticString(name, key, sanitized) ? sanitized : undefined
  }
  if (typeof value === 'boolean') return key === 'upload_enabled' ? value : undefined
  if (value === null) return key === 'status' && name === 'http.request_failed' ? value : undefined
  if (typeof value === 'number' && isAllowedDiagnosticNumber(key, value)) return value
  return undefined
}

/**
 * @brief 为一个已注册事件复制并清洗属性 / Copy and sanitize attributes for one registered event.
 * @template TName 事件名称 / Event name.
 * @param name 已注册事件名称 / Registered event name.
 * @param attributes 声明为类型安全但仍需运行时防护的属性 / Attributes declared type-safe but still guarded at runtime.
 * @return 只含 allowlist 原始值的冻结属性 / Frozen attributes containing only allowlisted primitives.
 */
function sanitizeAttributes<TName extends DiagnosticEventName>(
  name: TName,
  attributes: Readonly<DiagnosticsEventRegistry[TName]>
): Readonly<DiagnosticsEventRegistry[TName]> {
  /** @brief 已清洗的可序列化属性容器 / Sanitized serializable attribute container. */
  const sanitized: Record<string, boolean | number | string | null> = {}

  for (const key of allowedAttributeKeys[name] as readonly string[]) {
    const value = sanitizeAttributeValue(
      name,
      key,
      (attributes as Readonly<Record<string, unknown>>)[key]
    )
    if (value !== undefined) sanitized[key] = value
  }

  return Object.freeze(sanitized) as Readonly<DiagnosticsEventRegistry[TName]>
}

/**
 * @brief 归一化正整数配置 / Normalize a positive-integer configuration value.
 * @param value 候选数值 / Candidate numeric value.
 * @param fallback 无效时使用的默认值 / Default used for invalid input.
 * @return 合法正整数 / Valid positive integer.
 */
function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback
}

/**
 * @brief 为新记录腾出一个待发送队列位置 / Make one pending-queue slot for an incoming record.
 * @param queue 不含正在导出的 batch 的待发送队列 / Pending queue excluding the batch currently exporting.
 * @param incoming 需要入队的新记录 / Incoming record that needs a slot.
 * @return 已腾出空间时为 true / True when a slot was made available.
 * @note 优先丢弃 debug/info；若全是高优先级记录则仅让新 error/warn 替换最早待发送记录，绝不改动 in-flight batch。
 */
function discardForCapacity(queue: DiagnosticRecord[], incoming: DiagnosticRecord): boolean {
  const discardIndex = queue.findIndex(
    (record) => record.level === 'debug' || record.level === 'info'
  )
  if (discardIndex >= 0) {
    queue.splice(discardIndex, 1)
    return true
  }

  if (incoming.level === 'debug' || incoming.level === 'info' || queue.length === 0) {
    return false
  }

  queue.shift()
  return true
}

/**
 * @brief 根据严重级别选择控制台函数 / Select a console function by severity.
 * @param target 控制台边界 / Console boundary.
 * @param level 诊断严重级别 / Diagnostic severity level.
 * @return 对应输出函数 / Corresponding output function.
 */
function selectConsoleMethod(
  target: DiagnosticsConsole,
  level: DiagnosticLevel
): (...data: readonly unknown[]) => void {
  if (level === 'debug') return target.debug.bind(target)
  if (level === 'info') return target.info.bind(target)
  if (level === 'warn') return target.warn.bind(target)
  return target.error.bind(target)
}

/**
 * @brief 创建本地结构化控制台日志接收器 / Create a local structured-console log sink.
 * @param options 控制台替换选项 / Console replacement options.
 * @return 永不向调用方抛错的 sink / Sink that never throws to its caller.
 */
export function createConsoleDiagnosticsSink(
  options: ConsoleDiagnosticsSinkOptions = {}
): DiagnosticSink {
  /** @brief 运行时可用的控制台 / Console available at runtime. */
  const target = options.console ?? console

  return {
    emit(record): void {
      try {
        selectConsoleMethod(target, record.level)('[ai-job-workspace]', record)
      } catch {
        // Diagnostics must never break product execution, even if a console is unavailable.
      }
    }
  }
}

/**
 * @brief 创建独立的 HTTP 诊断批量导出器 / Create an independent HTTP diagnostics batch exporter.
 * @param options 已验证 endpoint 与可注入网络边界 / Validated endpoint and injectable network boundary.
 * @return 不经过产品 HTTP client 的批量导出器 / Batch exporter that does not pass through the product HTTP client.
 */
export function createHttpDiagnosticBatchExporter(
  options: HttpDiagnosticBatchExporterOptions
): DiagnosticBatchExporter {
  /** @brief 网络 fetch 实现 / Network fetch implementation. */
  const fetchImpl = options.fetchImpl ?? fetch
  /** @brief 单次传输超时 / Timeout for one transmission. */
  const timeoutMilliseconds = positiveInteger(
    options.timeoutMilliseconds,
    DEFAULT_UPLOAD_TIMEOUT_MILLISECONDS
  )
  /** @brief 定时器调度函数 / Timer scheduling function. */
  const schedule: DiagnosticsSchedule =
    options.schedule ??
    ((callback, delay): DiagnosticsTimer => globalThis.setTimeout(callback, delay))
  /** @brief 定时器取消函数 / Timer cancellation function. */
  const cancelSchedule: DiagnosticsCancelSchedule =
    options.cancelSchedule ?? ((timerId): void => globalThis.clearTimeout(timerId))

  return {
    async export(batch): Promise<boolean> {
      /** @brief 请求级取消控制器 / Request-level cancellation controller. */
      const controller = new AbortController()
      /** @brief 到期后取消导出的定时器 / Timer that cancels the export after the deadline. */
      const timeoutId = schedule((): void => controller.abort(), timeoutMilliseconds)

      try {
        const response = await fetchImpl(options.endpoint, {
          body: JSON.stringify(batch),
          cache: 'no-store',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          method: 'POST',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        })
        return response.ok
      } catch {
        return false
      } finally {
        cancelSchedule(timeoutId)
      }
    }
  }
}

/**
 * @brief 创建有界且单飞的批量诊断 sink / Create a bounded single-flight batch diagnostics sink.
 * @param options 队列、资源和导出器选项 / Queue, resource, and exporter options.
 * @return 失败不会影响调用方的缓冲 sink / Buffered sink whose failures do not affect callers.
 */
export function createBufferedDiagnosticsSink(
  options: BufferedDiagnosticsSinkOptions
): DiagnosticSink {
  /** @brief 尚未开始导出的 FIFO 队列 / FIFO queue that has not started export. */
  const queue: DiagnosticRecord[] = []
  /** @brief 单飞中的 flush Promise / Single in-flight flush promise. */
  let inFlight: Promise<void> | undefined
  /** @brief 正在导出的不可变 batch；不参与容量淘汰 / Immutable batch being exported and excluded from capacity eviction. */
  let inFlightRecords: readonly DiagnosticRecord[] | undefined
  /** @brief 已安排的延迟 flush 定时器 / Scheduled delayed-flush timer. */
  let scheduledTimer: DiagnosticsTimer | undefined
  /** @brief sink 是否已经释放 / Whether the sink has been disposed. */
  let disposed = false
  /** @brief 当前时间读取器 / Current-time reader. */
  const clock = options.clock ?? defaultClock
  /** @brief 最大队列容量 / Maximum queue capacity. */
  const maxQueueSize = positiveInteger(options.maxQueueSize, DEFAULT_MAX_QUEUE_SIZE)
  /** @brief 单次批量最大事件数 / Maximum events in one batch. */
  const maxBatchSize = positiveInteger(options.maxBatchSize, DEFAULT_MAX_BATCH_SIZE)
  /** @brief 延迟 flush 周期 / Delayed flush interval. */
  const flushIntervalMilliseconds = positiveInteger(
    options.flushIntervalMilliseconds,
    DEFAULT_FLUSH_INTERVAL_MILLISECONDS
  )
  /** @brief 定时器调度函数 / Timer scheduling function. */
  const schedule: DiagnosticsSchedule =
    options.schedule ??
    ((callback, delay): DiagnosticsTimer => globalThis.setTimeout(callback, delay))
  /** @brief 定时器取消函数 / Timer cancellation function. */
  const cancelSchedule: DiagnosticsCancelSchedule =
    options.cancelSchedule ?? ((timerId): void => globalThis.clearTimeout(timerId))
  /** @brief 已脱敏的固定 batch 资源 / Sanitized fixed resource for every batch. */
  const resource = sanitizeDiagnosticResource(options.resource)

  /**
   * @brief 安排一次未来的 best-effort flush / Schedule one future best-effort flush.
   * @return 无返回值 / No return value.
   */
  const scheduleFlush = (delayMilliseconds = flushIntervalMilliseconds): void => {
    if (disposed || scheduledTimer !== undefined || queue.length === 0) return
    scheduledTimer = schedule((): void => {
      scheduledTimer = undefined
      void flush()
    }, delayMilliseconds)
  }

  /** @brief 连续未被接收器确认的导出次数 / Consecutive exports not accepted by the receiver. */
  let consecutiveExportFailures = 0

  /**
   * @brief 计算有上限的指数退避时间 / Calculate a capped exponential-backoff delay.
   * @return 下一次失败重试前的等待毫秒数 / Milliseconds to wait before the next failed-export retry.
   * @note 不加入随机抖动（jitter），因为每个 renderer 独立且队列仅限内存；上限避免长期断网时忙等。
   */
  const getRetryDelayMilliseconds = (): number =>
    Math.min(
      MAX_RETRY_DELAY_MILLISECONDS,
      flushIntervalMilliseconds * 2 ** Math.min(consecutiveExportFailures, 4)
    )

  /**
   * @brief 投递当前队首的一个快照批次 / Deliver one snapshot batch from the queue head.
   * @return 传输完成或失败隔离后的 Promise / Promise after delivery or isolated failure.
   */
  const flush = (): Promise<void> => {
    if (inFlight !== undefined) return inFlight
    if (disposed || queue.length === 0) return Promise.resolve()

    if (scheduledTimer !== undefined) {
      cancelSchedule(scheduledTimer)
      scheduledTimer = undefined
    }

    /** @brief 本次传输的不可变队首 batch；原子地从待发送队列移出 / Immutable head batch atomically removed from the pending queue. */
    const records = queue.splice(0, maxBatchSize)
    inFlightRecords = records
    /** @brief 版本化导出批次 / Versioned export batch. */
    const batch: DiagnosticBatch = Object.freeze({
      events: Object.freeze(records),
      resource,
      schema_version: FRONTEND_DIAGNOSTICS_SCHEMA_VERSION,
      sent_at: clock().toISOString()
    })

    /** @brief 本次接收器是否明确确认批次 / Whether the receiver explicitly accepted this batch. */
    let accepted = false

    inFlight = Promise.resolve()
      .then(async (): Promise<boolean> => options.exporter.export(batch))
      .then((nextAccepted): void => {
        accepted = nextAccepted
      })
      .catch((): void => {
        // Exporters are required to isolate failures, but the sink protects the product a second time.
      })
      .finally((): void => {
        inFlightRecords = undefined
        inFlight = undefined
        if (disposed) return

        if (accepted) {
          consecutiveExportFailures = 0
          scheduleFlush()
          return
        }

        queue.unshift(...records)
        consecutiveExportFailures += 1
        scheduleFlush(getRetryDelayMilliseconds())
      })

    return inFlight
  }

  return {
    emit(record): void {
      if (disposed) return
      /** @brief 导出中的 batch 占用的总容量 / Capacity currently occupied by the exporting batch. */
      const inFlightCount = inFlightRecords?.length ?? 0
      /** @brief 当前可用于待发送队列的容量 / Capacity currently available to the pending queue. */
      const pendingCapacity = Math.max(0, maxQueueSize - inFlightCount)

      if (queue.length >= pendingCapacity && !discardForCapacity(queue, record)) return
      queue.push(record)
      if (queue.length >= maxBatchSize) {
        void flush()
        return
      }
      scheduleFlush()
    },
    flush,
    dispose(): void {
      disposed = true
      if (scheduledTimer !== undefined) cancelSchedule(scheduledTimer)
      scheduledTimer = undefined
      queue.length = 0
    }
  }
}

/**
 * @brief 创建可供应用层注入的 Diagnostics 实例 / Create a Diagnostics instance injectable into application layers.
 * @param options sink、时钟和 ID 创建选项 / Sink, clock, and ID-creation options.
 * @return 同步、非阻塞、失败隔离的诊断端口 / Synchronous, non-blocking, failure-isolated diagnostics port.
 */
export function createDiagnostics(options: CreateDiagnosticsOptions): Diagnostics {
  /** @brief 记录发生时间的时钟 / Clock used to timestamp records. */
  const clock = options.clock ?? defaultClock
  /** @brief 生成记录 ID 的工厂 / Factory that generates record IDs. */
  const createId = options.createId ?? createDefaultId
  /** @brief 生命周期中可用的接收器快照 / Snapshot of sinks available for this lifecycle. */
  const sinks = [...options.sinks]
  /** @brief 实例是否已经释放 / Whether the instance has been disposed. */
  let disposed = false

  return {
    emit<TName extends DiagnosticEventName>(
      name: TName,
      attributes: Readonly<DiagnosticsEventRegistry[TName]>
    ): void {
      if (disposed) return

      try {
        /** @brief 已清洗的结构化记录 / Sanitized structured record. */
        const record = Object.freeze({
          attributes: sanitizeAttributes(name, attributes),
          event_id: sanitizeOpaqueId(createId()),
          level: getDefaultLevel(name),
          name,
          occurred_at: clock().toISOString()
        }) as DiagnosticRecord

        for (const sink of sinks) {
          try {
            sink.emit(record)
          } catch {
            // One broken sink must not hide a product event from another sink or break product work.
          }
        }
      } catch {
        // Invalid clocks, IDs, or mocked sinks must never affect product execution.
      }
    },
    async flush(): Promise<void> {
      await Promise.all(
        sinks.map(async (sink): Promise<void> => {
          try {
            await sink.flush?.()
          } catch {
            // Flush is best effort; callers must never observe diagnostics transport failures.
          }
        })
      )
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      for (const sink of sinks) {
        try {
          sink.dispose?.()
        } catch {
          // Disposal must also be isolated from product teardown.
        }
      }
    }
  }
}

/**
 * @brief 推导一个事件的默认严重级别 / Derive the default severity level for an event.
 * @param name 事件名称 / Event name.
 * @return 与事件语义相符的严重级别 / Severity level aligned with event semantics.
 */
function getDefaultLevel(name: DiagnosticEventName): DiagnosticLevel {
  if (
    name === 'http.request_failed' ||
    name === 'interview.command_failed' ||
    name === 'knowledge.command_failed' ||
    name === 'resource.load_failed' ||
    name === 'resume.command_failed' ||
    name === 'runtime.unhandled_error'
  ) {
    return 'error'
  }

  if (
    name === 'diagnostics.config_invalid' ||
    name === 'preference.theme_storage_unavailable' ||
    name === 'runtime.info_failed'
  ) {
    return 'warn'
  }

  return 'info'
}
