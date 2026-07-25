/** @file KnowledgeSource 共享展示词汇 / Shared KnowledgeSource presentation vocabulary. */

import type { TFunction } from 'i18next'

import type {
  UiKnowledgeIngestionStatus,
  UiKnowledgeSensitivity,
  UiKnowledgeSourceType
} from '../domain/models'

/** @brief 可本地化标签定义 / Localizable-label definition. */
interface LocalizedLabel {
  /** @brief i18n key / i18n key. */
  readonly key: string
  /** @brief 资源尚未合并时的完整默认文案 / Complete fallback copy before resources are merged. */
  readonly label: string
}

/** @brief 来源类型的唯一展示词汇 / Canonical presentation vocabulary for source types. */
const SOURCE_TYPE_LABELS: Readonly<Record<UiKnowledgeSourceType, LocalizedLabel>> = {
  blog_feed: { key: 'knowledge.sourceTypes.blogFeed', label: '博客订阅' },
  cloud_drive: { key: 'knowledge.sourceTypes.cloudDrive', label: '云端文件' },
  file: { key: 'knowledge.sourceTypes.file', label: '文件' },
  git_repository: { key: 'knowledge.sourceTypes.gitRepository', label: 'Git 仓库' },
  manual_note: { key: 'knowledge.sourceTypes.manualNote', label: '手动笔记' },
  resume: { key: 'knowledge.sourceTypes.resume', label: '简历' },
  url: { key: 'knowledge.sourceTypes.url', label: '网页链接' },
  website: { key: 'knowledge.sourceTypes.website', label: '网站' }
}

/** @brief 摄取状态的唯一展示词汇 / Canonical presentation vocabulary for ingestion statuses. */
const INGESTION_STATUS_LABELS: Readonly<Record<UiKnowledgeIngestionStatus, LocalizedLabel>> = {
  chunking: { key: 'knowledge.status.chunking', label: '正在组织检索片段' },
  deleted: { key: 'knowledge.status.deleted', label: '已删除' },
  deleting: { key: 'knowledge.status.deleting', label: '正在删除' },
  embedding: { key: 'knowledge.status.embedding', label: '正在建立检索索引' },
  failed: { key: 'knowledge.status.failed', label: '处理失败' },
  fetching: { key: 'knowledge.status.fetching', label: '正在读取来源' },
  not_started: { key: 'knowledge.status.notStarted', label: '待开始处理' },
  parsing: { key: 'knowledge.status.parsing', label: '正在提取内容' },
  queued: { key: 'knowledge.status.queued', label: '已进入队列' },
  ready: { key: 'knowledge.status.ready', label: '处理完成' },
  stale: { key: 'knowledge.status.stale', label: '需要更新' }
}

/** @brief 敏感度的唯一展示词汇 / Canonical presentation vocabulary for sensitivity levels. */
const SENSITIVITY_LABELS: Readonly<Record<UiKnowledgeSensitivity, LocalizedLabel>> = {
  confidential: { key: 'visibility.sensitivity.confidential', label: '机密' },
  highly_confidential: {
    key: 'visibility.sensitivity.highlyConfidential',
    label: '高度机密'
  },
  normal: { key: 'visibility.sensitivity.normal', label: '常规' }
}

/**
 * @brief 获取来源类型本地化标签 / Get a localized source-type label.
 * @param sourceType 来源类型 / Source type.
 * @param translate 翻译函数 / Translation function.
 * @return 用户可读来源类型 / User-readable source type.
 */
export function getKnowledgeSourceTypeLabel(
  sourceType: UiKnowledgeSourceType,
  translate: TFunction
): string {
  /** @brief 当前来源类型标签 / Current source-type label. */
  const definition = SOURCE_TYPE_LABELS[sourceType]
  return translate(definition.key, { defaultValue: definition.label })
}

/**
 * @brief 获取摄取状态本地化标签 / Get a localized ingestion-status label.
 * @param status 摄取状态 / Ingestion status.
 * @param translate 翻译函数 / Translation function.
 * @return 用户可理解处理阶段 / User-understandable processing phase.
 */
export function getKnowledgeIngestionLabel(
  status: UiKnowledgeIngestionStatus,
  translate: TFunction
): string {
  /** @brief 当前摄取状态标签 / Current ingestion-status label. */
  const definition = INGESTION_STATUS_LABELS[status]
  return translate(definition.key, { defaultValue: definition.label })
}

/**
 * @brief 获取敏感度本地化标签 / Get a localized sensitivity label.
 * @param sensitivity 来源敏感度 / Source sensitivity.
 * @param translate 翻译函数 / Translation function.
 * @return 用户可读敏感度 / User-readable sensitivity.
 */
export function getKnowledgeSensitivityLabel(
  sensitivity: UiKnowledgeSensitivity,
  translate: TFunction
): string {
  /** @brief 当前敏感度标签 / Current sensitivity label. */
  const definition = SENSITIVITY_LABELS[sensitivity]
  return translate(definition.key, { defaultValue: definition.label })
}

/**
 * @brief 获取摄取状态颜色 / Get an ingestion-status tone.
 * @param status 摄取状态 / Ingestion status.
 * @return 现有设计系统状态类 / Status class from the existing design system.
 */
export function getKnowledgeIngestionTone(status: UiKnowledgeIngestionStatus): string {
  if (status === 'ready') return 'aw-status--ready'
  if (status === 'failed' || status === 'deleted') return 'aw-status--error'
  return 'aw-status--active'
}
