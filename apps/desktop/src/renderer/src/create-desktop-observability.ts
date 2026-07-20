/** @file Electron renderer 的诊断组合根 / Diagnostics composition root for the Electron renderer. */

import {
  createBufferedDiagnosticsSink,
  createConsoleDiagnosticsSink,
  createDiagnostics,
  createDiagnosticsSessionId,
  createHttpDiagnosticBatchExporter
} from '@ai-job-workspace/app'
import type { DiagnosticResource, DiagnosticSink, Diagnostics } from '@ai-job-workspace/app'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'

/**
 * @brief 创建 Electron renderer 的统一 Diagnostics / Create unified Diagnostics for the Electron renderer.
 * @param endpoint 仅由主进程验证并经窄 bridge 提供的可选 endpoint / Optional endpoint validated only by the main process and supplied through the narrow bridge.
 * @return 始终保留本地结构化日志的诊断端口 / Diagnostics port that always retains local structured logs.
 */
export function createDesktopDiagnostics(endpoint: string | undefined): Diagnostics {
  /** @brief 仅存在于当前 renderer 内存会话的随机 ID / Random ID that exists only in this renderer memory session. */
  const sessionId = createDiagnosticsSessionId()
  /** @brief 每个导出批次附带的 renderer 资源 / Renderer resource attached to every export batch. */
  const resource: DiagnosticResource = {
    platform: 'electron',
    service_name: 'ai-job-workspace-frontend',
    service_version: APPLICATION_VERSION,
    session_id: sessionId
  }
  /** @brief 默认启用的本地日志接收器 / Local logging sink enabled by default. */
  const sinks: DiagnosticSink[] = [createConsoleDiagnosticsSink()]

  if (endpoint !== undefined) {
    /** @brief 不经产品 HTTP client 的独立诊断导出器 / Independent diagnostics exporter that does not use the product HTTP client. */
    const exporter = createHttpDiagnosticBatchExporter({ endpoint })
    sinks.push(createBufferedDiagnosticsSink({ exporter, resource }))
  }

  return createDiagnostics({ sinks })
}
