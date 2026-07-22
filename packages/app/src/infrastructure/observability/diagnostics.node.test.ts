/** @file 前端诊断基础设施的行为测试 / Behaviour tests for frontend diagnostics infrastructure. */

import { describe, expect, it, vi } from 'vitest'

import {
  classifyDiagnosticError,
  FRONTEND_DIAGNOSTICS_SCHEMA_VERSION
} from '../../observability/diagnostics'
import type {
  DiagnosticBatch,
  DiagnosticRecord,
  DiagnosticResource,
  DiagnosticsEventRegistry
} from '../../observability/diagnostics'
import {
  createBufferedDiagnosticsSink,
  createConsoleDiagnosticsSink,
  createDiagnostics,
  createDiagnosticsSessionId,
  createHttpDiagnosticBatchExporter
} from './diagnostics'
import type {
  DiagnosticSink,
  DiagnosticsCancelSchedule,
  DiagnosticsSchedule,
  DiagnosticsTimer
} from './diagnostics'

/** @brief 固定测试时钟时间 / Fixed time returned by the test clock. */
const TEST_TIME = new Date('2026-07-21T12:00:00.000Z')

/** @brief 测试用诊断资源 / Diagnostic resource used by tests. */
const TEST_RESOURCE: DiagnosticResource = {
  platform: 'web',
  service_name: 'ai-job-workspace-frontend',
  service_version: 'test-version',
  session_id: 'session-test'
}

/**
 * @brief 创建可安全上传的路由诊断记录 / Create an upload-safe route diagnostic record.
 * @param eventId 稳定测试事件 ID / Stable test event ID.
 * @return 路由切换诊断记录 / Route-transition diagnostic record.
 */
function createRouteRecord(eventId: string): DiagnosticRecord {
  return {
    attributes: { route: 'workspace.home' },
    event_id: eventId,
    level: 'info',
    name: 'app.route_changed',
    occurred_at: TEST_TIME.toISOString()
  }
}

/**
 * @brief 创建最小版本化诊断批次 / Create a minimal versioned diagnostics batch.
 * @return 可供 exporter 测试的批次 / Batch usable by exporter tests.
 */
function createBatch(): DiagnosticBatch {
  return {
    events: [createRouteRecord('event-1')],
    resource: TEST_RESOURCE,
    schema_version: FRONTEND_DIAGNOSTICS_SCHEMA_VERSION,
    sent_at: TEST_TIME.toISOString()
  }
}

/** @brief 可由测试手动完成的 Promise / Promise whose completion is controlled by a test. */
interface Deferred<TValue> {
  /** @brief 受测试控制的 Promise / Promise controlled by the test. */
  readonly promise: Promise<TValue>
  /** @brief 使 Promise 成功完成 / Resolve the Promise. */
  readonly resolve: (value: TValue) => void
  /** @brief 使 Promise 失败完成 / Reject the Promise. */
  readonly reject: (reason?: unknown) => void
}

/**
 * @brief 创建可手动完成的 Promise / Create a manually completable Promise.
 * @template TValue Promise 的值类型 / Promise value type.
 * @return 可由测试控制的 deferred / Deferred controlled by the test.
 */
function createDeferred<TValue>(): Deferred<TValue> {
  /** @brief Promise 的成功回调 / Promise resolver. */
  let resolve!: (value: TValue) => void
  /** @brief Promise 的失败回调 / Promise rejecter. */
  let reject!: (reason?: unknown) => void
  /** @brief 受控 Promise / Controlled Promise. */
  const promise = new Promise<TValue>((nextResolve, nextReject): void => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, reject, resolve }
}

/** @brief 手工调度的计时任务 / Manually scheduled timer task. */
interface ScheduledTask {
  /** @brief 定时器句柄 / Timer handle. */
  readonly id: DiagnosticsTimer
  /** @brief 定时器回调 / Timer callback. */
  readonly callback: () => void
  /** @brief 任务是否已取消 / Whether the task was cancelled. */
  cancelled: boolean
}

/** @brief 可手动触发的调度器 / Scheduler whose tasks can be triggered manually. */
interface ManualScheduler {
  /** @brief 注入生产代码的调度函数 / Scheduling function injected into production code. */
  readonly schedule: DiagnosticsSchedule
  /** @brief 注入生产代码的取消函数 / Cancelling function injected into production code. */
  readonly cancel: DiagnosticsCancelSchedule
  /** @brief 全部已调度任务 / All scheduled tasks. */
  readonly tasks: readonly ScheduledTask[]
  /**
   * @brief 运行最新且未取消的任务 / Run the latest non-cancelled task.
   * @return 无返回值 / No return value.
   */
  runLatest(): void
}

/**
 * @brief 创建手工调度器 / Create a manual scheduler.
 * @return 可观察和手动触发的调度器 / Observable and manually triggerable scheduler.
 */
function createManualScheduler(): ManualScheduler {
  /** @brief 已调度任务列表 / Scheduled task list. */
  const tasks: ScheduledTask[] = []
  /** @brief 下一个稳定的伪句柄序号 / Next stable fake handle sequence. */
  let nextId = 0

  return {
    schedule(callback): DiagnosticsTimer {
      /** @brief 当前任务的伪定时器句柄 / Fake timer handle for the current task. */
      const id = nextId as unknown as DiagnosticsTimer
      nextId += 1
      tasks.push({ callback, cancelled: false, id })
      return id
    },
    cancel(timerId): void {
      /** @brief 与句柄关联的任务 / Task associated with the handle. */
      const task = tasks.find((candidate) => candidate.id === timerId)
      if (task !== undefined) task.cancelled = true
    },
    tasks,
    runLatest(): void {
      /** @brief 最近一个仍可执行的任务 / Latest task still eligible to run. */
      const task = [...tasks].reverse().find((candidate) => !candidate.cancelled)
      if (task === undefined) throw new Error('No active scheduled task is available.')
      task.cancelled = true
      task.callback()
    }
  }
}

/**
 * @brief 取得 buffered sink 的可选 flush 方法 / Get the optional flush method of a buffered sink.
 * @param sink 待测试 sink / Sink under test.
 * @return 一定存在的 flush 函数 / Flush function that must exist.
 */
function requireFlush(sink: DiagnosticSink): () => Promise<void> {
  if (sink.flush === undefined)
    throw new Error('Expected a buffered diagnostics sink to expose flush.')
  return sink.flush.bind(sink)
}

describe('classifyDiagnosticError', (): void => {
  it('distinguishes a deadline from user-driven cancellation', (): void => {
    expect(classifyDiagnosticError(new DOMException('deadline exceeded', 'TimeoutError'))).toBe(
      'timeout'
    )
    expect(classifyDiagnosticError(new DOMException('navigation', 'AbortError'))).toBe('aborted')
    expect(
      classifyDiagnosticError({ diagnosticKind: 'network', name: 'HttpCommandOutcomeUnknownError' })
    ).toBe('outcome_unknown')
    expect(classifyDiagnosticError({ name: 'HttpCommandOutcomeUnknownError' })).toBe(
      'outcome_unknown'
    )
  })
})

describe('createDiagnostics', (): void => {
  it('falls back to a safe session ID when the platform random source is unavailable', (): void => {
    vi.stubGlobal('crypto', undefined)
    try {
      expect(createDiagnosticsSessionId()).toBe('unavailable')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('allowlists attributes, strips control characters, and isolates a broken sink', (): void => {
    /** @brief 健康 sink 收到的记录 / Records received by the healthy sink. */
    const received: DiagnosticRecord[] = []
    /** @brief 健康 sink / Healthy sink. */
    const healthySink: DiagnosticSink = {
      emit(record): void {
        received.push(record)
      }
    }
    /** @brief 诊断实例 / Diagnostics instance under test. */
    const diagnostics = createDiagnostics({
      clock: (): Date => TEST_TIME,
      createId: (): string => 'event\u0000id',
      sinks: [
        {
          emit(): void {
            throw new Error('A sink must not break the product.')
          }
        },
        healthySink
      ]
    })
    /** @brief 绕过静态类型模拟不可信调用方的属性 / Attributes from an untrusted caller bypassing static types. */
    const untrustedAttributes = {
      ignored_sensitive_value: 'person@example.test',
      route: 'person@example.test'
    } as unknown as Readonly<DiagnosticsEventRegistry['app.route_changed']>

    expect((): void => diagnostics.emit('app.route_changed', untrustedAttributes)).not.toThrow()
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      attributes: {},
      event_id: 'redacted',
      name: 'app.route_changed',
      occurred_at: TEST_TIME.toISOString()
    })
    expect(JSON.stringify(received[0])).not.toContain('person@example.test')
  })

  it('permits a no-sink diagnostic port and absorbs sink flush failures', async (): Promise<void> => {
    /** @brief 无上传或控制台接收器的端口 / Port without exporters or console sinks. */
    const noSinkDiagnostics = createDiagnostics({ sinks: [] })
    /** @brief 会在 flush 时失败的 sink / Sink that fails during flush. */
    const failingFlushSink: DiagnosticSink = {
      emit(): void {
        // The emit path is intentionally empty for this isolation test.
      },
      flush: (): Promise<void> => Promise.reject(new Error('Sensitive transport error.'))
    }
    /** @brief 具有失败 flush sink 的端口 / Port containing a failing flush sink. */
    const diagnostics = createDiagnostics({ sinks: [failingFlushSink] })

    expect((): void =>
      noSinkDiagnostics.emit('app.route_changed', { route: 'workspace.home' })
    ).not.toThrow()
    await expect(noSinkDiagnostics.flush()).resolves.toBeUndefined()
    await expect(diagnostics.flush()).resolves.toBeUndefined()
  })

  it('rejects a retired Resume template-selection operation after static types are bypassed', (): void => {
    /** @brief 接收清洗后记录的测试 sink / Test sink receiving sanitized records. */
    const received: DiagnosticRecord[] = []
    /** @brief 同时验证已退役与仍有效 operation 的诊断实例 / Diagnostics instance validating retired and active operations together. */
    const diagnostics = createDiagnostics({
      clock: (): Date => TEST_TIME,
      createId: (): string => `event-${String(received.length + 1)}`,
      sinks: [{ emit: (record): number => received.push(record) }]
    })
    /** @brief 绕过静态注册表注入的旧 operation / Retired operation injected by bypassing the static registry. */
    const retiredAttributes = {
      duration_ms: 12,
      operation: 'resume.template_select'
    } as unknown as Readonly<DiagnosticsEventRegistry['resume.command_completed']>

    diagnostics.emit('resume.command_completed', retiredAttributes)
    diagnostics.emit('resume.command_completed', {
      duration_ms: 13,
      operation: 'resume.section_update'
    })

    expect(received[0]?.attributes).toEqual({ duration_ms: 12 })
    expect(received[1]?.attributes).toEqual({
      duration_ms: 13,
      operation: 'resume.section_update'
    })
  })
})

describe('createConsoleDiagnosticsSink', (): void => {
  it('selects the severity method and absorbs console failures', (): void => {
    /** @brief 可观察的测试控制台 / Observable test console. */
    const target = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn((): never => {
        throw new Error('Console is unavailable.')
      })
    }
    /** @brief 控制台 sink / Console sink under test. */
    const sink = createConsoleDiagnosticsSink({ console: target })
    /** @brief info 级记录 / Info-level record. */
    const infoRecord = createRouteRecord('console-info')
    /** @brief warn 级记录 / Warn-level record. */
    const warningRecord: DiagnosticRecord = {
      ...infoRecord,
      event_id: 'console-warn',
      level: 'warn'
    }

    expect((): void => sink.emit(infoRecord)).not.toThrow()
    expect((): void => sink.emit(warningRecord)).not.toThrow()
    expect(target.info).toHaveBeenCalledWith('[ai-job-workspace]', infoRecord)
    expect(target.warn).toHaveBeenCalledWith('[ai-job-workspace]', warningRecord)
  })
})

describe('createHttpDiagnosticBatchExporter', (): void => {
  it('posts a versioned batch to its independent fixed endpoint', async (): Promise<void> => {
    /** @brief 网络边界替身 / Fetch boundary double. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }))
    /** @brief 超时句柄 / Timeout handle returned by the scheduler. */
    const timeoutId = 42 as unknown as DiagnosticsTimer
    /** @brief 可观察的超时调度器 / Observable timeout scheduler. */
    const schedule = vi.fn<DiagnosticsSchedule>(() => timeoutId)
    /** @brief 可观察的超时取消器 / Observable timeout canceller. */
    const cancelSchedule = vi.fn<DiagnosticsCancelSchedule>()
    /** @brief 独立 exporter / Independent exporter under test. */
    const exporter = createHttpDiagnosticBatchExporter({
      cancelSchedule,
      endpoint: 'https://diagnostics.example.test/api/v1/frontend-diagnostics/batches',
      fetchImpl,
      schedule,
      timeoutMilliseconds: 50
    })
    /** @brief 待发送批次 / Batch to send. */
    const batch = createBatch()

    await expect(exporter.export(batch)).resolves.toBe(true)
    /** @brief exporter 发起的独立请求 / Independent request issued by the exporter. */
    const request = fetchImpl.mock.calls[0]?.[1]
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://diagnostics.example.test/api/v1/frontend-diagnostics/batches'
    )
    expect(request?.body).toBe(JSON.stringify(batch))
    expect(request?.cache).toBe('no-store')
    expect(request?.credentials).toBe('omit')
    expect(request?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(request?.keepalive).toBe(true)
    expect(request?.method).toBe('POST')
    expect(request?.redirect).toBe('error')
    expect(request?.referrerPolicy).toBe('no-referrer')
    expect(request?.signal).toBeInstanceOf(AbortSignal)
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 50)
    expect(cancelSchedule).toHaveBeenCalledWith(timeoutId)
  })

  it('turns network and non-2xx failures into a false result without throwing', async (): Promise<void> => {
    /** @brief 会先拒绝再返回 HTTP 失败的网络替身 / Fetch double that rejects then returns an HTTP failure. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('Sensitive endpoint failure.'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    /** @brief exporter / Exporter under test. */
    const exporter = createHttpDiagnosticBatchExporter({
      endpoint: 'https://diagnostics.example.test/api/v1/frontend-diagnostics/batches',
      fetchImpl
    })
    /** @brief 待发送批次 / Batch to send. */
    const batch = createBatch()

    await expect(exporter.export(batch)).resolves.toBe(false)
    await expect(exporter.export(batch)).resolves.toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('createBufferedDiagnosticsSink', (): void => {
  it('batches FIFO records and allows only one in-flight export', async (): Promise<void> => {
    /** @brief 手工定时器 / Manual timer boundary. */
    const scheduler = createManualScheduler()
    /** @brief 第一批传输的受控结果 / Controlled result for the first batch. */
    const firstExport = createDeferred<boolean>()
    /** @brief 第二批传输的受控结果 / Controlled result for the second batch. */
    const secondExport = createDeferred<boolean>()
    /** @brief 可观察 exporter / Observable exporter. */
    const exportBatch = vi
      .fn<(batch: DiagnosticBatch) => Promise<boolean>>()
      .mockReturnValueOnce(firstExport.promise)
      .mockReturnValueOnce(secondExport.promise)
    /** @brief 有界 sink / Bounded sink under test. */
    const sink = createBufferedDiagnosticsSink({
      cancelSchedule: scheduler.cancel,
      clock: (): Date => TEST_TIME,
      exporter: { export: exportBatch },
      flushIntervalMilliseconds: 100,
      maxBatchSize: 2,
      maxQueueSize: 4,
      resource: TEST_RESOURCE,
      schedule: scheduler.schedule
    })
    /** @brief 可调用的 flush / Required flush function. */
    const flush = requireFlush(sink)

    sink.emit(createRouteRecord('event-1'))
    sink.emit(createRouteRecord('event-2'))
    sink.emit(createRouteRecord('event-3'))
    // The producer deliberately enters the exporter on a microtask so `emit` remains non-blocking.
    await Promise.resolve()
    expect(exportBatch).toHaveBeenCalledTimes(1)
    expect(exportBatch.mock.calls[0]?.[0]?.events.map((record) => record.event_id)).toEqual([
      'event-1',
      'event-2'
    ])

    /** @brief 当前单飞 flush / Current single-flight flush. */
    const firstFlush = flush()
    firstExport.resolve(true)
    await firstFlush
    expect(exportBatch).toHaveBeenCalledTimes(1)

    /** @brief 第二批 flush / Second-batch flush. */
    const secondFlush = flush()
    /** @brief 等待非阻塞 producer 启动第二次 export / Wait for the non-blocking producer to start the second export. */
    await Promise.resolve()
    expect(exportBatch).toHaveBeenCalledTimes(2)
    expect(exportBatch.mock.calls[1]?.[0]?.events.map((record) => record.event_id)).toEqual([
      'event-3'
    ])
    secondExport.resolve(true)
    await secondFlush
  })

  it('caps queued records by discarding the oldest low-priority record', async (): Promise<void> => {
    /** @brief 可观察 exporter / Observable exporter. */
    const exportBatch = vi
      .fn<(batch: DiagnosticBatch) => Promise<boolean>>()
      .mockResolvedValue(true)
    /** @brief 有界 sink / Bounded sink under test. */
    const sink = createBufferedDiagnosticsSink({
      clock: (): Date => TEST_TIME,
      exporter: { export: exportBatch },
      maxBatchSize: 4,
      maxQueueSize: 2,
      resource: TEST_RESOURCE
    })
    /** @brief 可调用的 flush / Required flush function. */
    const flush = requireFlush(sink)

    sink.emit(createRouteRecord('event-1'))
    sink.emit(createRouteRecord('event-2'))
    sink.emit(createRouteRecord('event-3'))
    await flush()

    expect(exportBatch.mock.calls[0]?.[0]?.events.map((record) => record.event_id)).toEqual([
      'event-2',
      'event-3'
    ])
  })

  it('never evicts an in-flight batch or deletes newer records after capacity pressure', async (): Promise<void> => {
    /** @brief 手工定时器 / Manual timer boundary. */
    const scheduler = createManualScheduler()
    /** @brief 第一批传输的受控结果 / Controlled result for the first batch. */
    const firstExport = createDeferred<boolean>()
    /** @brief 第二批传输的受控结果 / Controlled result for the second batch. */
    const secondExport = createDeferred<boolean>()
    /** @brief 可观察 exporter / Observable exporter. */
    const exportBatch = vi
      .fn<(batch: DiagnosticBatch) => Promise<boolean>>()
      .mockReturnValueOnce(firstExport.promise)
      .mockReturnValueOnce(secondExport.promise)
    /** @brief 有界 sink / Bounded sink under test. */
    const sink = createBufferedDiagnosticsSink({
      cancelSchedule: scheduler.cancel,
      clock: (): Date => TEST_TIME,
      exporter: { export: exportBatch },
      maxBatchSize: 2,
      maxQueueSize: 3,
      resource: TEST_RESOURCE,
      schedule: scheduler.schedule
    })
    /** @brief 可调用的 flush / Required flush function. */
    const flush = requireFlush(sink)

    sink.emit(createRouteRecord('event-a'))
    sink.emit(createRouteRecord('event-b'))
    await Promise.resolve()
    sink.emit(createRouteRecord('event-c'))
    sink.emit(createRouteRecord('event-d'))

    expect(exportBatch.mock.calls[0]?.[0]?.events.map((record) => record.event_id)).toEqual([
      'event-a',
      'event-b'
    ])
    /** @brief 等待中的第一批 flush / Pending first-batch flush. */
    const firstFlush = flush()
    firstExport.resolve(true)
    await firstFlush

    /** @brief 待导出的第二批 flush / Pending second-batch flush. */
    const secondFlush = flush()
    await Promise.resolve()
    expect(exportBatch.mock.calls[1]?.[0]?.events.map((record) => record.event_id)).toEqual([
      'event-d'
    ])
    secondExport.resolve(true)
    await secondFlush
  })

  it('keeps a failed batch and schedules a retry without emitting another diagnostic event', async (): Promise<void> => {
    /** @brief 手工定时器 / Manual timer boundary. */
    const scheduler = createManualScheduler()
    /** @brief 第一批传输的受控失败 / Controlled failure for the first batch. */
    const firstExport = createDeferred<boolean>()
    /** @brief 重试传输的受控成功 / Controlled success for the retry. */
    const retryExport = createDeferred<boolean>()
    /** @brief 可观察 exporter / Observable exporter. */
    const exportBatch = vi
      .fn<(batch: DiagnosticBatch) => Promise<boolean>>()
      .mockReturnValueOnce(firstExport.promise)
      .mockReturnValueOnce(retryExport.promise)
    /** @brief 有界 sink / Bounded sink under test. */
    const sink = createBufferedDiagnosticsSink({
      cancelSchedule: scheduler.cancel,
      clock: (): Date => TEST_TIME,
      exporter: { export: exportBatch },
      flushIntervalMilliseconds: 100,
      maxBatchSize: 1,
      maxQueueSize: 2,
      resource: TEST_RESOURCE,
      schedule: scheduler.schedule
    })
    /** @brief 可调用的 flush / Required flush function. */
    const flush = requireFlush(sink)

    sink.emit(createRouteRecord('event-retry'))
    /** @brief 当前失败中的 flush / Current failing flush. */
    const firstFlush = flush()
    firstExport.reject(new Error('Sensitive network failure.'))
    await firstFlush

    expect(exportBatch).toHaveBeenCalledTimes(1)
    expect(scheduler.tasks.filter((task) => !task.cancelled)).toHaveLength(1)
    scheduler.runLatest()
    /** @brief 已由重试定时器启动的 flush / Flush started by the retry timer. */
    const retryFlush = flush()
    // Retry export is likewise intentionally deferred to preserve the synchronous emit contract.
    await Promise.resolve()
    expect(exportBatch).toHaveBeenCalledTimes(2)
    expect(exportBatch.mock.calls[1]?.[0]?.events.map((record) => record.event_id)).toEqual([
      'event-retry'
    ])
    retryExport.resolve(true)
    await retryFlush
  })

  it('drops a failed in-flight batch when disposal wins the race', async (): Promise<void> => {
    /** @brief 手工定时器 / Manual timer boundary. */
    const scheduler = createManualScheduler()
    /** @brief 导出器延迟返回的失败 / Failure returned by the exporter after disposal. */
    const delayedExport = createDeferred<boolean>()
    /** @brief 可观察 exporter / Observable exporter. */
    const exportBatch = vi
      .fn<(batch: DiagnosticBatch) => Promise<boolean>>()
      .mockReturnValue(delayedExport.promise)
    /** @brief 有界 sink / Bounded sink under test. */
    const sink = createBufferedDiagnosticsSink({
      cancelSchedule: scheduler.cancel,
      clock: (): Date => TEST_TIME,
      exporter: { export: exportBatch },
      flushIntervalMilliseconds: 100,
      maxBatchSize: 1,
      maxQueueSize: 2,
      resource: TEST_RESOURCE,
      schedule: scheduler.schedule
    })
    /** @brief 可调用的 flush / Required flush function. */
    const flush = requireFlush(sink)

    sink.emit(createRouteRecord('event-disposed'))
    await Promise.resolve()
    expect(exportBatch).toHaveBeenCalledTimes(1)

    sink.dispose?.()
    /** @brief 销毁后才发生的网络失败 / Network failure occurring after disposal. */
    const inFlightFlush = flush()
    delayedExport.reject(new Error('Sensitive network failure after disposal.'))
    await inFlightFlush
    await Promise.resolve()

    expect(scheduler.tasks.filter((task) => !task.cancelled)).toHaveLength(0)
    await flush()
    expect(exportBatch).toHaveBeenCalledTimes(1)
  })
})
