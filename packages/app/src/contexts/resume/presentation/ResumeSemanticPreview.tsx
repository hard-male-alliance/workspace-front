/** @file 可复用的 Resume 语义内容预览 / Reusable Resume semantic-content preview. */

import { useTranslation } from 'react-i18next'

import type { UiResumeDocument, UiResumeSection } from '../domain/document'
import { selectResumeDateLabel, selectResumePlainText } from './resume-document-selectors'

/** @brief 语义内容预览属性 / Semantic-content preview properties. */
export interface ResumeSemanticPreviewProps {
  /** @brief 要以只读方式呈现的完整 ResumeDocument / Complete ResumeDocument to render read-only. */
  readonly document: UiResumeDocument
  /** @brief 可访问区域标签 / Accessible region label. */
  readonly label: string
}

/**
 * @brief 呈现纸张中的一个语义板块 / Render one semantic section on the paper.
 * @param props 完整 section / Complete section.
 * @return 不解释模板布局的只读语义内容 / Read-only semantic content that does not infer Template layout.
 */
function ResumePaperSection({ section }: { readonly section: UiResumeSection }): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  return (
    <section className="aw-paper-section">
      <h3>{section.title || section.kind}</h3>
      {section.content !== null && section.content.text.length > 0 ? (
        <p>{selectResumePlainText(section.content)}</p>
      ) : null}
      {section.items
        .filter((item) => item.visible)
        .map((item) => {
          /** @brief 仅供展示的日期范围文本 / Presentation-only date-range label. */
          const dateLabel =
            item.dateRange === null
              ? null
              : selectResumeDateLabel(
                  item.dateRange,
                  t('resume.date.present', { defaultValue: '至今' })
                )
          return (
            <div className="aw-paper-entry" key={item.id}>
              <div className="aw-paper-entry-title">
                <span>{item.title ?? item.kind}</span>
                {dateLabel === null ? null : <span>{dateLabel}</span>}
              </div>
              {item.organization !== null || item.subtitle !== null || item.location !== null ? (
                <p>
                  {[item.organization, item.subtitle, item.location].filter(Boolean).join(' · ')}
                </p>
              ) : null}
              {item.summary !== null && item.summary.text.length > 0 ? (
                <p>{selectResumePlainText(item.summary)}</p>
              ) : null}
              {item.highlights.length > 0 ? (
                <ul>
                  {item.highlights.map((highlight, index) => (
                    <li key={`${item.id}:highlight:${index}`}>
                      {selectResumePlainText(highlight)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )
        })}
    </section>
  )
}

/**
 * @brief 呈现不冒充最终模板排版的完整 Resume 语义预览 / Render a complete Resume semantic preview without pretending to be final Template layout.
 * @param props 完整文档与可访问标签 / Complete document and accessible label.
 * @return 可用于当前编辑器和历史 revision 的同一只读投影 / The same read-only projection usable for the current editor and historical revisions.
 */
export function ResumeSemanticPreview({
  document,
  label
}: ResumeSemanticPreviewProps): React.JSX.Element {
  return (
    <article aria-label={label} className="aw-paper">
      <header className="aw-paper-header">
        <h2 className="aw-paper-name">{document.profile.fullName}</h2>
        {document.profile.headline !== null ? (
          <p className="aw-paper-role">{document.profile.headline}</p>
        ) : null}
        <p className="aw-paper-contact">
          {document.profile.contacts.map((contact) => contact.value).join(' · ')}
        </p>
      </header>
      {document.sections
        .filter((section) => section.visible)
        .map((section) => (
          <ResumePaperSection key={section.id} section={section} />
        ))}
    </article>
  )
}
