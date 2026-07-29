/** @file KnowledgeSource 查询与命令输入 / KnowledgeSource query and command inputs. */

import type { UiCommandId } from '../../../shared-kernel/command'
import type { UiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type { UiKnowledgeSourceId, UiWorkspaceId } from '../../../shared-kernel/identity'
import type {
  UiKnowledgeSourceCursor,
  UiKnowledgeSourcePageLimit,
  UiKnowledgeVisibilityPolicy
} from '../domain/models'

/** @brief 读取一页 Workspace KnowledgeSource / Read one page of Workspace KnowledgeSources. */
export interface UiKnowledgeSourcePageRead {
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 首页为 null，后续使用服务端 cursor / Null on the first page; server cursor thereafter. */
  readonly cursor: UiKnowledgeSourceCursor | null
  /** @brief 经 API v2 约束的页大小 / Page size constrained by API v2. */
  readonly limit: UiKnowledgeSourcePageLimit
  /** @brief 页面资源身份拥有的取消信号 / Cancellation signal owned by the page-resource identity. */
  readonly signal: AbortSignal
}

/** @brief 读取单个 Workspace KnowledgeSource / Read one Workspace KnowledgeSource. */
export interface UiKnowledgeSourceRead {
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 来源 identity / Source identity. */
  readonly sourceId: UiKnowledgeSourceId
  /** @brief 资源身份拥有的取消信号 / Cancellation signal owned by the resource identity. */
  readonly signal: AbortSignal
}

/** @brief 读取 KnowledgeSource 原始内容预览 / Read an original-content preview for a KnowledgeSource. */
export interface UiKnowledgeOriginalContentRead extends UiKnowledgeSourceRead {
  /** @brief 允许返回的预览字节上限 / Maximum preview bytes permitted in the response. */
  readonly maximumBytes: number
}

/** @brief 创建手工笔记 KnowledgeSource 的冻结命令 / Frozen command for creating a manual-note KnowledgeSource. */
export interface UiCreateManualKnowledgeNoteCommand {
  /**
   * @brief 一次用户意图内稳定的命令 identity / Command identity stable within one user intent.
   * @note 结果未知后的确认重试必须复用此值及除 signal 外的全部字段 / A confirmation retry after an unknown outcome must reuse this value and every field except signal.
   */
  readonly commandId: UiCommandId
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 来源名称 / Source name. */
  readonly name: string
  /** @brief 纯文本笔记内容 / Plain-text note content. */
  readonly content: string
  /** @brief 创建时的完整策略 / Complete policy at creation time. */
  readonly visibility: UiKnowledgeVisibilityPolicy
  /** @brief 当前调用生命周期的取消信号 / Cancellation signal for the current call lifecycle. */
  readonly signal?: AbortSignal
}

/** @brief 非空 KnowledgeSource merge patch / Non-empty KnowledgeSource merge patch. */
export type UiKnowledgeSourcePatch =
  | {
      /** @brief 新名称 / New name. */
      readonly name: string
      /** @brief 可选同时替换完整策略 / Optional simultaneous complete-policy replacement. */
      readonly visibility?: UiKnowledgeVisibilityPolicy
    }
  | {
      /** @brief 未修改名称时保持省略 / Omitted when the name is not changed. */
      readonly name?: never
      /** @brief 完整策略替换 / Complete-policy replacement. */
      readonly visibility: UiKnowledgeVisibilityPolicy
    }

/** @brief 以 If-Match 更新 KnowledgeSource 的命令 / Command updating a KnowledgeSource with If-Match. */
export interface UiUpdateKnowledgeSourceCommand {
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 来源 identity / Source identity. */
  readonly sourceId: UiKnowledgeSourceId
  /** @brief 当前权威表示的强 ETag / Strong ETag of the current authoritative representation. */
  readonly concurrencyToken: UiConcurrencyToken
  /** @brief 至少修改名称或完整策略 / Patch changing at least the name or complete policy. */
  readonly patch: UiKnowledgeSourcePatch
  /** @brief 当前调用生命周期的取消信号 / Cancellation signal for the current call lifecycle. */
  readonly signal?: AbortSignal
}

/** @brief 文件摄取阶段 / File-ingestion phase. */
export type UiKnowledgeFileIngestionPhase =
  | 'hashing'
  | 'creating-upload'
  | 'uploading'
  | 'verifying'
  | 'creating-source'
  | 'queued'
  | 'processing'
  | 'completed'

/** @brief 文件上传、Source 创建和摄取的单一用户意图 / One user intent covering file upload, Source creation, and ingestion. */
export interface UiIngestKnowledgeFileCommand {
  /** @brief 跨重试稳定的完整上传意图 identity / Stable whole-upload intent identity across retries. */
  readonly commandId: UiCommandId
  readonly workspaceId: UiWorkspaceId
  readonly name: string
  readonly filename: string
  readonly mediaType: string
  readonly bytes: ArrayBuffer
  readonly signal?: AbortSignal
  readonly onProgress?: (phase: UiKnowledgeFileIngestionPhase) => void
}

/** @brief 已存在 KnowledgeSource 的处理阶段 / Processing phase for an existing KnowledgeSource. */
export type UiKnowledgeSourceIngestionPhase = 'queued' | 'processing' | 'completed'

/** @brief 对已存在来源启动或恢复摄取的稳定命令 / Stable command starting or resuming ingestion for an existing source. */
export interface UiIngestKnowledgeSourceCommand {
  /** @brief 一次处理意图内稳定的幂等命令 identity / Idempotent command identity stable within one processing intent. */
  readonly commandId: UiCommandId
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 待处理来源 / Source to process. */
  readonly sourceId: UiKnowledgeSourceId
  /** @brief 是否明确重做已就绪来源 / Whether to explicitly reprocess an already-ready source. */
  readonly force: boolean
  /** @brief 当前调用生命周期取消信号 / Cancellation signal for the current call lifecycle. */
  readonly signal?: AbortSignal
  /** @brief 可选处理进度通知 / Optional processing-progress notification. */
  readonly onProgress?: (phase: UiKnowledgeSourceIngestionPhase) => void
}

/** @brief Workspace 内真实 Knowledge 搜索请求 / Real Knowledge search request in a Workspace. */
export interface UiSearchKnowledgeCommand {
  readonly workspaceId: UiWorkspaceId
  readonly query: string
  readonly sourceIds: readonly UiKnowledgeSourceId[]
  readonly signal?: AbortSignal
}
