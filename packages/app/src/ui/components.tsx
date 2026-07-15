import type { HTMLAttributes, ReactNode } from 'react'

import './ui.css'

/** @brief 可组合的 CSS 类名输入 / Composable CSS class-name input. */
type ClassNameInput = false | null | string | undefined

/**
 * @brief 合并非空 CSS 类名 / Join non-empty CSS class names.
 * @param classNames 候选类名 / Candidate class names.
 * @return 稳定的空格分隔类名 / Stable space-separated class names.
 */
function joinClassNames(...classNames: ClassNameInput[]): string {
  return classNames
    .filter(
      (className): className is string => typeof className === 'string' && className.length > 0
    )
    .join(' ')
}

/** @brief 空状态属性 / Empty-state properties. */
export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** @brief 空状态标题 / Empty-state title. */
  readonly title: ReactNode
  /** @brief 空状态标题的可选 DOM ID / Optional DOM ID for the empty-state title. */
  readonly titleId?: string
  /** @brief 解释空状态的正文 / Empty-state description. */
  readonly description?: ReactNode
  /** @brief 视觉提示元素 / Visual cue. */
  readonly visual?: ReactNode
  /** @brief 后续操作，例如 Button / Next action, for example a Button. */
  readonly action?: ReactNode
  /** @brief 是否采用紧凑留白 / Whether to use compact spacing. */
  readonly compact?: boolean
}

/**
 * @brief 无数据时的引导状态 / Guidance state for no data.
 * @param props 空状态属性 / Empty-state properties.
 * @return 语义化的 section 元素 / Semantic section element.
 */
export function EmptyState({
  action,
  className,
  compact = false,
  description,
  title,
  titleId,
  visual,
  ...stateAttributes
}: EmptyStateProps): ReactNode {
  return (
    <section
      {...stateAttributes}
      className={joinClassNames('ui-state', className)}
      data-compact={compact ? 'true' : 'false'}
    >
      {visual !== undefined ? <div className="ui-state__visual">{visual}</div> : null}
      <h2 className="ui-state__title" id={titleId}>
        {title}
      </h2>
      {description !== undefined ? <p className="ui-state__description">{description}</p> : null}
      {action !== undefined ? <div className="ui-state__action">{action}</div> : null}
    </section>
  )
}

/** @brief 加载状态属性 / Loading-state properties. */
export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  /** @brief 对用户可见的加载说明 / User-visible loading description. */
  readonly label: ReactNode
}

/**
 * @brief 带实时播报的加载状态 / Loading state with live announcement.
 * @param props 加载状态属性 / Loading-state properties.
 * @return role=status 的加载状态 / Loading state with role=status.
 */
export function LoadingState({
  className,
  label,
  ...loadingAttributes
}: LoadingStateProps): ReactNode {
  return (
    <div
      {...loadingAttributes}
      aria-live="polite"
      className={joinClassNames('ui-loading-state', className)}
      role="status"
    >
      <span aria-hidden="true" className="ui-spinner" />
      <span>{label}</span>
    </div>
  )
}

/** @brief 错误状态属性 / Error-state properties. */
export interface ErrorStateProps extends Omit<EmptyStateProps, 'compact' | 'visual'> {
  /** @brief 错误状态后的恢复操作 / Recovery action after an error. */
  readonly action?: ReactNode
}

/**
 * @brief 带 alert 语义的错误状态 / Error state with alert semantics.
 * @param props 错误状态属性 / Error-state properties.
 * @return role=alert 的错误提示 / Error notice with role=alert.
 */
export function ErrorState({
  action,
  className,
  description,
  title,
  titleId,
  ...errorAttributes
}: ErrorStateProps): ReactNode {
  return (
    <section
      {...errorAttributes}
      className={joinClassNames('ui-state', 'ui-error-state', className)}
      data-compact="false"
      role="alert"
    >
      <div aria-hidden="true" className="ui-state__visual">
        !
      </div>
      <h2 className="ui-state__title" id={titleId}>
        {title}
      </h2>
      {description !== undefined ? <p className="ui-state__description">{description}</p> : null}
      {action !== undefined ? <div className="ui-state__action">{action}</div> : null}
    </section>
  )
}
