import { useTranslation } from 'react-i18next'

import { ErrorState } from '../ui'
import { classifyResourceFailure } from './resource-errors'

/** @brief 安全失败说明属性 / Safe failure-description properties. */
export interface ResourceFailureMessageProps {
  /** @brief 应用端口返回的未知错误 / Unknown error returned by the application port. */
  readonly error: unknown
}

/** @brief 不重复原命令的显式恢复动作 / Explicit recovery action that does not repeat the original command. */
export interface ResourceRecoveryAction {
  /** @brief 用户可理解的动作标签 / User-understandable action label. */
  readonly label: string
  /** @brief 重新读取或导航等安全恢复动作 / Safe recovery action such as reloading or navigating. */
  readonly onInvoke: () => void
}

/** @brief 页面资源错误状态属性 / Page-resource error-state properties. */
export interface ResourceErrorStateProps {
  /** @brief 可选恢复动作标签 / Optional recovery-action label. */
  readonly actionLabel?: string
  /** @brief 应用端口返回的未知错误 / Unknown error returned by the application port. */
  readonly error: unknown
  /** @brief 保留页面上下文的错误标题 / Error title preserving page context. */
  readonly title: string
  /** @brief 原地重新执行资源请求 / Retry the resource request in place. */
  readonly onRetry: () => void
  /** @brief 即使原命令不可重试也可执行的安全恢复 / Safe recovery available even when the original command is not retryable. */
  readonly recoveryAction?: ResourceRecoveryAction
}

/** @brief 失败类别到安全本地化文案的映射 / Failure-category to safe localized-copy mapping. */
const RESOURCE_FAILURE_MESSAGE_KEYS = {
  'authentication-required': 'errors.authenticationRequired',
  forbidden: 'errors.forbidden',
  'not-found': 'errors.notFound',
  conflict: 'errors.conflict',
  'invalid-request': 'errors.invalidRequest',
  'rate-limited': 'errors.rateLimited',
  'service-unavailable': 'errors.serviceUnavailable',
  'invalid-response': 'errors.invalidResponse',
  network: 'errors.network',
  'outcome-unknown': 'errors.outcomeUnknown',
  'capability-unavailable': 'errors.capabilityUnavailable',
  unknown: 'errors.unknown'
} as const

/**
 * @brief 只呈现分类后的本地化失败说明 / Render only the classified, localized failure description.
 * @param props 未知技术错误 / Unknown technical error.
 * @return 不含后端 title、detail、URL、配置或响应正文的文本 / Text without backend titles, details, URLs, configuration, or response bodies.
 * @note 命令级内联提示使用本组件，避免每个限界上下文重新实现一套容易泄漏的错误映射。
 * Command-level inline notices use this component so bounded contexts do not reimplement a leak-prone error mapping.
 */
export function ResourceFailureMessage({ error }: ResourceFailureMessageProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 已脱敏的页面失败语义 / Sanitized page-failure semantics. */
  const failure = classifyResourceFailure(error)
  /** @brief 当前失败的本地化说明 / Localized description for the current failure. */
  const message = t(RESOURCE_FAILURE_MESSAGE_KEYS[failure.kind])
  /** @brief 可选的安全支持编号 / Optional safe support reference. */
  const reference =
    failure.referenceId === null
      ? ''
      : ` ${t('errors.reference', { referenceId: failure.referenceId })}`

  return <>{`${message}${reference}`}</>
}

/**
 * @brief 呈现不泄漏后端细节且带恢复动作的资源错误 / Present a resource error with safe copy and a recovery action.
 * @param props 错误、页面标题与重试动作 / Error, page title, and retry action.
 * @return 保持共享视觉样式的错误状态 / Error state preserving the shared visual style.
 */
export function ResourceErrorState({
  actionLabel,
  error,
  onRetry,
  recoveryAction,
  title
}: ResourceErrorStateProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 已脱敏的页面失败语义 / Sanitized page-failure semantics. */
  const failure = classifyResourceFailure(error)

  return (
    <ErrorState
      action={
        recoveryAction !== undefined ? (
          <button className="aw-quiet-button" onClick={recoveryAction.onInvoke} type="button">
            {recoveryAction.label}
          </button>
        ) : failure.retryable ? (
          <button className="aw-quiet-button" onClick={onRetry} type="button">
            {actionLabel ?? t('common.retry')}
          </button>
        ) : undefined
      }
      description={<ResourceFailureMessage error={error} />}
      title={title}
    />
  )
}
