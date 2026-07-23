/** @file Interview API v2 细粒度应用端口 / Fine-grained Interview API v2 application ports. */

import type { UiWorkspaceJobAuthority } from '../../workspace-operations'
import type {
  UiInterviewReport,
  UiInterviewScenarioAuthority,
  UiInterviewScenarioPage,
  UiInterviewSessionAuthority,
  UiInterviewSessionPage,
  UiInterviewTranscriptPage,
  UiRealtimeConnection
} from '../domain/models'
import type {
  UiCreateInterviewReportJobCommand,
  UiCreateInterviewScenarioCommand,
  UiCreateInterviewSessionCommand,
  UiCreateRealtimeConnectionCommand,
  UiEndInterviewSessionCommand,
  UiInterviewReportRead,
  UiInterviewScenarioPageRead,
  UiInterviewScenarioRead,
  UiInterviewSessionPageRead,
  UiInterviewSessionRead,
  UiInterviewTranscriptPageRead,
  UiUpdateInterviewScenarioCommand
} from './requests'

/** @brief InterviewScenario 的四个资源用例 / Four resource use cases for InterviewScenario. */
export interface InterviewScenarioGateway {
  /** @brief 读取一页场景 / Read one page of scenarios. */
  listInterviewScenarioPage(request: UiInterviewScenarioPageRead): Promise<UiInterviewScenarioPage>

  /** @brief 幂等创建场景并返回强 ETag 权威 / Idempotently create a scenario and return strong-ETag authority. */
  createInterviewScenario(
    command: UiCreateInterviewScenarioCommand
  ): Promise<UiInterviewScenarioAuthority>

  /** @brief 读取一个场景及同响应强 ETag / Read one scenario and the strong ETag from the same response. */
  getInterviewScenario(request: UiInterviewScenarioRead): Promise<UiInterviewScenarioAuthority>

  /** @brief 以最小 merge patch 和强 If-Match 更新场景 / Update a scenario with a minimal merge patch and strong If-Match. */
  updateInterviewScenario(
    command: UiUpdateInterviewScenarioCommand
  ): Promise<UiInterviewScenarioAuthority>
}

/** @brief InterviewSession、Connection 和 Transcript 的六个资源用例 / Six resource use cases for InterviewSession, Connection, and Transcript. */
export interface InterviewSessionGateway {
  /** @brief 读取一页会话 / Read one page of sessions. */
  listInterviewSessionPage(request: UiInterviewSessionPageRead): Promise<UiInterviewSessionPage>

  /** @brief 幂等创建持久会话，不隐式创建 realtime 连接 / Idempotently create a persistent session without implicitly creating a realtime connection. */
  createInterviewSession(
    command: UiCreateInterviewSessionCommand
  ): Promise<UiInterviewSessionAuthority>

  /** @brief 读取一个会话及同响应强 ETag / Read one session and the strong ETag from the same response. */
  getInterviewSession(request: UiInterviewSessionRead): Promise<UiInterviewSessionAuthority>

  /** @brief 幂等签发一个短期 realtime 描述符 / Idempotently issue one short-lived realtime descriptor. */
  createRealtimeConnection(
    command: UiCreateRealtimeConnectionCommand
  ): Promise<UiRealtimeConnection>

  /** @brief 幂等请求结束会话并返回通用 Workspace Job / Idempotently request session ending and return a generic Workspace Job. */
  requestInterviewSessionEnd(
    command: UiEndInterviewSessionCommand
  ): Promise<UiWorkspaceJobAuthority>

  /** @brief 读取一页持久化转录 / Read one page of persisted transcript segments. */
  listInterviewTranscriptPage(
    request: UiInterviewTranscriptPageRead
  ): Promise<UiInterviewTranscriptPage>
}

/** @brief InterviewReport 的两个资源用例 / Two resource use cases for InterviewReport. */
export interface InterviewReportGateway {
  /** @brief 幂等创建报告 Job 并复用通用 Workspace Job 权威 / Idempotently create a report Job and reuse generic Workspace Job authority. */
  createInterviewReportJob(
    command: UiCreateInterviewReportJobCommand
  ): Promise<UiWorkspaceJobAuthority>

  /** @brief 读取一个不可变报告资源 / Read one immutable report resource. */
  getInterviewReport(request: UiInterviewReportRead): Promise<UiInterviewReport>
}

/**
 * @brief Interview REST 资源端口组合 / Composition of Interview REST resource ports.
 * @note Realtime 帧协议不属于本端口 / The realtime frame protocol does not belong to this port.
 */
export interface InterviewGateway
  extends InterviewScenarioGateway, InterviewSessionGateway, InterviewReportGateway {}
