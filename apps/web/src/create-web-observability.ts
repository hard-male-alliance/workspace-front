/** @file Web renderer 的诊断组合根 / Diagnostics composition root for the Web renderer. */

import {
  createBufferedDiagnosticsSink,
  createConsoleDiagnosticsSink,
  createDiagnostics,
  createDiagnosticsSessionId,
  createHttpDiagnosticBatchExporter
} from '@ai-job-workspace/app'
import type {
  DiagnosticResource,
  DiagnosticSink,
  Diagnostics,
  DiagnosticsConsole
} from '@ai-job-workspace/app'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'

import type { DiagnosticsUploadConfiguration } from './diagnostics-config'

/** @brief Web Diagnostics 创建选项 / Options for creating Web Diagnostics. */
export interface CreateWebDiagnosticsOptions {
  /** @brief 已解析的三态上传配置 / Resolved three-state upload configuration. */
  readonly configuration: DiagnosticsUploadConfiguration
  /** @brief 测试可替换的控制台 / Console replaceable in tests. */
  readonly console?: DiagnosticsConsole
  /** @brief 测试可替换的诊断 fetch / Diagnostics fetch replaceable in tests. */
  readonly fetchImpl?: typeof fetch
}

/**
 * @brief 创建 Web renderer 的统一 Diagnostics / Create unified Diagnostics for the Web renderer.
 * @param options 已解析配置与测试替换项 / Resolved configuration and test substitutions.
 * @return 始终保留本地日志、仅在有效配置下联网的 Diagnostics / Diagnostics that always retain local logs and network only with valid configuration.
 */
export function createWebDiagnostics(options: CreateWebDiagnosticsOptions): Diagnostics {
  /** @brief 仅限当前页面内存生命周期的会话 ID / Session ID limited to the current page-memory lifecycle. */
  const sessionId = createDiagnosticsSessionId()
  /** @brief 每个上传批次附带的稳定资源信息 / Stable resource information attached to each upload batch. */
  const resource: DiagnosticResource = {
    platform: 'web',
    service_name: 'ai-job-workspace-frontend',
    service_version: APPLICATION_VERSION,
    session_id: sessionId
  }
  /** @brief 默认始终启用的本地结构化日志 sink / Local structured-log sink enabled in every configuration. */
  const sinks: DiagnosticSink[] = [
    createConsoleDiagnosticsSink(options.console === undefined ? {} : { console: options.console })
  ]

  if (options.configuration.kind === 'enabled') {
    /** @brief 不经过产品 HTTP client 的独立批量导出器 / Independent batch exporter that bypasses the product HTTP client. */
    const exporter = createHttpDiagnosticBatchExporter({
      endpoint: options.configuration.endpoint,
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl })
    })
    sinks.push(createBufferedDiagnosticsSink({ exporter, resource }))
  }

  /** @brief 已组合且可注入应用树的诊断端口 / Composed diagnostics port injectable into the application tree. */
  const diagnostics = createDiagnostics({ sinks })

  if (options.configuration.kind === 'invalid') {
    diagnostics.emit('diagnostics.config_invalid', { reason: options.configuration.reason })
  }

  return diagnostics
}
