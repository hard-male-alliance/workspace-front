/** @file Knowledge 应用用例输入 / Knowledge application use-case inputs. */

import type { UiKnowledgeSourceId } from '../../../shared-kernel/identity'

/**
 * @brief 与宿主 File 结构兼容的上传文件 / Upload file structurally compatible with host File objects.
 * @note 应用层只要求可移植的文件值能力；DOM File 到 multipart Blob 的转换属于 HTTP adapter。
 */
export interface KnowledgeUploadFile {
  /** @brief 原始文件名 / Original filename. */
  readonly name: string
  /** @brief 文件字节数 / File size in bytes. */
  readonly size: number
  /** @brief MIME 类型 / MIME type. */
  readonly type: string
  /**
   * @brief 读取不可变文件内容 / Read immutable file contents.
   * @return 文件内容的 ArrayBuffer / ArrayBuffer containing the file bytes.
   */
  arrayBuffer(): Promise<ArrayBuffer>
}

/** @brief 上传新知识文件的应用输入 / Application input for uploading a new knowledge file. */
export interface UiKnowledgeUploadInput {
  /** @brief 待上传文件值 / File value to upload. */
  readonly file: KnowledgeUploadFile
  /** @brief 可选显示名称 / Optional display name. */
  readonly name?: string | undefined
  /** @brief 请求取消信号 / Request cancellation signal. */
  readonly signal?: AbortSignal | undefined
}

/** @brief 为已有来源上传新版本的应用输入 / Application input for uploading a source version. */
export interface UiKnowledgeVersionUploadInput {
  /** @brief 目标知识来源 ID / Target knowledge-source ID. */
  readonly sourceId: UiKnowledgeSourceId
  /** @brief 待上传文件值 / File value to upload. */
  readonly file: KnowledgeUploadFile
  /** @brief 请求取消信号 / Request cancellation signal. */
  readonly signal?: AbortSignal | undefined
}

/** @brief 知识搜索应用输入 / Knowledge-search application input. */
export interface UiKnowledgeSearchInput {
  /** @brief 自然语言查询 / Natural-language query. */
  readonly query: string
  /** @brief 允许参与检索的来源 / Sources eligible for retrieval. */
  readonly sourceIds: readonly UiKnowledgeSourceId[]
  /** @brief 请求取消信号 / Request cancellation signal. */
  readonly signal?: AbortSignal | undefined
}
