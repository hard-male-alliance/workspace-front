/** @file Resume Template 真实预览展示 / Resume Template real-preview presentation. */

import { LayoutTemplate } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UiTemplateManifest } from '../../domain/models'

/** @brief Template 预览展示参数 / Template preview presentation properties. */
export interface TemplatePreviewProps {
  /** @brief 可选尺寸与布局类名 / Optional sizing and layout class name. */
  readonly className?: string
  /** @brief 是否仅作卡片装饰 / Whether the preview is only decorative within a card. */
  readonly decorative?: boolean
  /** @brief 服务端发布的不可变 manifest / Immutable manifest published by the service. */
  readonly template: UiTemplateManifest
}

/**
 * @brief 呈现服务端发布的不可变模板预览 / Render the immutable Template preview published by the service.
 * @param props 模板、尺寸类名与装饰语义 / Template, sizing class, and decorative semantics.
 * @return 真实图片，或 null/error 的明确回退 / The real image or an explicit null/error fallback.
 */
export function TemplatePreview({
  className = '',
  decorative = false,
  template
}: TemplatePreviewProps): React.JSX.Element {
  const { t } = useTranslation()
  /** @brief 当前 URL 的加载失败标记 / Load-failure marker for the current URL. */
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  /** @brief 本次 render 的不可变 URL / Immutable URL for this render. */
  const previewUrl = template.previewUrl
  if (previewUrl === null || previewUrl === failedUrl) {
    return (
      <span
        aria-label={
          decorative
            ? undefined
            : t('template.previewUnavailable', { defaultValue: '此模板未提供预览' })
        }
        className={`aw-template-thumbnail aw-template-thumbnail--empty ${className}`.trim()}
        role={decorative ? undefined : 'img'}
      >
        <LayoutTemplate aria-hidden="true" size={22} />
        <span className={decorative ? 'aw-sr-only' : ''}>
          {t('template.previewUnavailable', { defaultValue: '此模板未提供预览' })}
        </span>
      </span>
    )
  }
  return (
    <span className={`aw-template-thumbnail ${className}`.trim()}>
      <img
        alt={
          decorative
            ? ''
            : t('template.previewAlt', {
                defaultValue: '{{name}} v{{version}} 模板预览',
                name: template.name,
                version: template.version
              })
        }
        decoding="async"
        loading="lazy"
        onError={(): void => setFailedUrl(previewUrl)}
        referrerPolicy="no-referrer"
        src={previewUrl}
      />
    </span>
  )
}
