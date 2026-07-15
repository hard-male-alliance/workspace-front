import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
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

/** @brief 按钮视觉变体 / Button visual variant. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

/** @brief 按钮尺寸 / Button size. */
export type ButtonSize = 'small' | 'medium' | 'large'

/** @brief 共享按钮属性 / Shared button properties. */
export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type'
> {
  /** @brief 按钮内容 / Button content. */
  readonly children: ReactNode
  /** @brief 视觉变体 / Visual variant. */
  readonly variant?: ButtonVariant
  /** @brief 按钮尺寸 / Button size. */
  readonly size?: ButtonSize
  /** @brief 是否显示进行中状态 / Whether to show a pending state. */
  readonly loading?: boolean
  /** @brief 前置视觉元素 / Leading visual element. */
  readonly leadingVisual?: ReactNode
  /** @brief 后置视觉元素 / Trailing visual element. */
  readonly trailingVisual?: ReactNode
  /** @brief 原生按钮类型，默认 button / Native button type, defaulting to button. */
  readonly type?: 'button' | 'reset' | 'submit'
}

/**
 * @brief 带加载语义的通用按钮 / General button with loading semantics.
 * @param props 按钮属性 / Button properties.
 * @return 可访问的 button 元素 / Accessible button element.
 * @note 只有图标时必须传入 aria-label / Icon-only use must provide aria-label.
 */
export function Button({
  children,
  className,
  disabled,
  leadingVisual,
  loading = false,
  size = 'medium',
  trailingVisual,
  type = 'button',
  variant = 'primary',
  ...buttonAttributes
}: ButtonProps): ReactNode {
  return (
    <button
      {...buttonAttributes}
      aria-busy={loading || undefined}
      className={joinClassNames('ui-button', className)}
      data-size={size}
      data-variant={variant}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? <span aria-hidden="true" className="ui-spinner" /> : null}
      {!loading && leadingVisual !== undefined ? (
        <span aria-hidden="true" className="ui-button__visual">
          {leadingVisual}
        </span>
      ) : null}
      <span>{children}</span>
      {trailingVisual !== undefined ? (
        <span aria-hidden="true" className="ui-button__visual">
          {trailingVisual}
        </span>
      ) : null}
    </button>
  )
}

/** @brief 卡片内边距 / Card padding. */
export type CardPadding = 'compact' | 'regular' | 'spacious'

/** @brief 卡片色调 / Card tone. */
export type CardTone = 'default' | 'muted'

/** @brief 卡片层级 / Card elevation. */
export type CardElevation = 'flat' | 'raised'

/** @brief 共享卡片属性 / Shared card properties. */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** @brief 卡片内容 / Card content. */
  readonly children: ReactNode
  /** @brief 内边距密度 / Padding density. */
  readonly padding?: CardPadding
  /** @brief 背景色调 / Surface tone. */
  readonly tone?: CardTone
  /** @brief 阴影层级 / Shadow elevation. */
  readonly elevation?: CardElevation
}

/**
 * @brief 中性内容卡片 / Neutral content card.
 * @param props 卡片属性 / Card properties.
 * @return 承载内容的 div 元素 / Content-bearing div element.
 * @note 可点击卡片应使用语义化 button 或 a，再复用 ui-card 类名。
 */
export function Card({
  children,
  className,
  elevation = 'flat',
  padding = 'regular',
  tone = 'default',
  ...cardAttributes
}: CardProps): ReactNode {
  return (
    <div
      {...cardAttributes}
      className={joinClassNames('ui-card', className)}
      data-elevation={elevation}
      data-padding={padding}
      data-tone={tone}
    >
      {children}
    </div>
  )
}

/** @brief 徽标色调 / Badge tone. */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

/** @brief 共享徽标属性 / Shared badge properties. */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** @brief 徽标内容 / Badge content. */
  readonly children: ReactNode
  /** @brief 徽标色调 / Badge tone. */
  readonly tone?: BadgeTone
}

/**
 * @brief 紧凑状态徽标 / Compact status badge.
 * @param props 徽标属性 / Badge properties.
 * @return 描述状态的 span 元素 / Status-describing span element.
 */
export function Badge({
  children,
  className,
  tone = 'neutral',
  ...badgeAttributes
}: BadgeProps): ReactNode {
  return (
    <span {...badgeAttributes} className={joinClassNames('ui-badge', className)} data-tone={tone}>
      {children}
    </span>
  )
}

/** @brief 分区标题属性 / Section heading properties. */
export interface SectionHeadingProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** @brief 主标题 / Main title. */
  readonly title: ReactNode
  /** @brief 标题层级 / Heading level. */
  readonly headingLevel?: 1 | 2 | 3
  /** @brief 上眉文字 / Eyebrow text. */
  readonly eyebrow?: ReactNode
  /** @brief 说明文字 / Description. */
  readonly description?: ReactNode
  /** @brief 标题右侧操作区 / Actions beside the heading. */
  readonly actions?: ReactNode
}

/**
 * @brief 页面或分区标题 / Page or section heading.
 * @param props 标题属性 / Heading properties.
 * @return 带正确标题层级的 header 元素 / Header with a correct heading level.
 */
export function SectionHeading({
  actions,
  className,
  description,
  eyebrow,
  headingLevel = 2,
  title,
  ...headingAttributes
}: SectionHeadingProps): ReactNode {
  const Heading = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'h3'

  return (
    <header {...headingAttributes} className={joinClassNames('ui-section-heading', className)}>
      <div className="ui-section-heading__copy">
        {eyebrow !== undefined ? <p className="ui-section-heading__eyebrow">{eyebrow}</p> : null}
        <Heading className="ui-section-heading__title">{title}</Heading>
        {description !== undefined ? (
          <p className="ui-section-heading__description">{description}</p>
        ) : null}
      </div>
      {actions !== undefined ? <div className="ui-section-heading__actions">{actions}</div> : null}
    </header>
  )
}

/** @brief 空状态属性 / Empty-state properties. */
export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** @brief 空状态标题 / Empty-state title. */
  readonly title: ReactNode
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
      <h2 className="ui-state__title">{title}</h2>
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
      <h2 className="ui-state__title">{title}</h2>
      {description !== undefined ? <p className="ui-state__description">{description}</p> : null}
      {action !== undefined ? <div className="ui-state__action">{action}</div> : null}
    </section>
  )
}

/** @brief 指标展示属性 / Metric display properties. */
export interface MetricProps extends HTMLAttributes<HTMLDListElement> {
  /** @brief 指标标签 / Metric label. */
  readonly label: ReactNode
  /** @brief 指标主值 / Metric primary value. */
  readonly value: ReactNode
  /** @brief 指标补充说明 / Metric supporting detail. */
  readonly detail?: ReactNode
}

/**
 * @brief 基于定义列表的指标 / Definition-list based metric.
 * @param props 指标属性 / Metric properties.
 * @return 含 dt/dd 语义的指标 / Metric with dt/dd semantics.
 */
export function Metric({
  className,
  detail,
  label,
  value,
  ...metricAttributes
}: MetricProps): ReactNode {
  return (
    <dl {...metricAttributes} className={joinClassNames('ui-metric', className)}>
      <dt className="ui-metric__label">{label}</dt>
      <dd className="ui-metric__value">{value}</dd>
      {detail !== undefined ? <dd className="ui-metric__detail">{detail}</dd> : null}
    </dl>
  )
}

/** @brief 视觉隐藏文本属性 / Visually-hidden text properties. */
export interface VisuallyHiddenProps extends HTMLAttributes<HTMLSpanElement> {
  /** @brief 供辅助技术读取的内容 / Content for assistive technology. */
  readonly children: ReactNode
}

/**
 * @brief 仅供辅助技术读取的文本 / Text available only to assistive technology.
 * @param props 隐藏文本属性 / Visually-hidden text properties.
 * @return 视觉隐藏的 span 元素 / Visually hidden span element.
 */
export function VisuallyHidden({
  children,
  className,
  ...hiddenAttributes
}: VisuallyHiddenProps): ReactNode {
  return (
    <span {...hiddenAttributes} className={joinClassNames('ui-visually-hidden', className)}>
      {children}
    </span>
  )
}
