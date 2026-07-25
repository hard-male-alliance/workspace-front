import { describe, expect, it } from 'vitest'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import type { UiResumeStyleIntent } from '../domain/document'
import {
  applyTemplateStyleDraft,
  createConfirmedTemplateStyleDraftPatch,
  discardConfirmedTemplateDraft,
  getMissingTemplateSectionDraftIds,
  type TemplateStyleDraftPatch
} from './template-style-draft'

/** @brief 不依赖 adapter fixture 的完整样式权威 / Complete style authority independent of adapter fixtures. */
const TEST_STYLE_INTENT: UiResumeStyleIntent = {
  bulletStyleToken: 'disc',
  dateFormatToken: 'yyyy_mm',
  density: 0.5,
  extensions: {},
  page: {
    customHeight: null,
    customWidth: null,
    margins: {
      bottom: { unit: 'mm', value: 16 },
      left: { unit: 'mm', value: 16 },
      right: { unit: 'mm', value: 16 },
      top: { unit: 'mm', value: 16 }
    },
    maxPages: null,
    orientation: 'portrait',
    showPageNumbers: false,
    size: 'A4'
  },
  palette: {
    background: { space: 'srgb_hex', value: '#FFFFFF' },
    mutedText: { space: 'srgb_hex', value: '#666666' },
    primary: { space: 'srgb_hex', value: '#111111' },
    secondary: { space: 'srgb_hex', value: '#333333' },
    text: { space: 'srgb_hex', value: '#111111' }
  },
  sectionLayout: [
    {
      compactness: 0.5,
      headingStyleToken: null,
      keepTogether: true,
      pageBreakBefore: false,
      sectionId: asUiOpaqueId<'resume-section'>('sec_template_style_summary'),
      zone: 'main'
    },
    {
      compactness: 0.5,
      headingStyleToken: null,
      keepTogether: true,
      pageBreakBefore: false,
      sectionId: asUiOpaqueId<'resume-section'>('sec_template_style_skills'),
      zone: 'sidebar'
    }
  ],
  styleContractVersion: '1.0',
  templateSettings: {},
  typography: {
    baseSizePt: 10,
    fontFamilyToken: 'sans_clean',
    headingScale: 1.2,
    letterSpacingEm: 0,
    lineHeight: 1.4
  }
}

/** @brief Template style 稀疏草稿的并发合并规则 / Concurrent-merge rules for sparse Template style drafts. */
describe('Template style draft leaf merge', (): void => {
  it('只覆盖用户编辑的 section leaf，并保留同 section 与其他 section 的最新权威', (): void => {
    /** @brief 用户编辑 zone 的 skills layout / Skills layout whose zone the user edits. */
    const skills = TEST_STYLE_INTENT.sectionLayout.find(
      (layout) => layout.sectionId === 'sec_template_style_skills'
    )
    /** @brief 被另一客户端修改的 summary layout / Summary layout changed by another client. */
    const summary = TEST_STYLE_INTENT.sectionLayout.find(
      (layout) => layout.sectionId === 'sec_template_style_summary'
    )
    expect(skills).toBeDefined()
    expect(summary).toBeDefined()
    if (skills === undefined || summary === undefined) return

    /** @brief 409/200 conflict 后读取的最新服务端权威 / Latest server authority read after a 409/200 conflict. */
    const latestAuthority = {
      ...TEST_STYLE_INTENT,
      sectionLayout: TEST_STYLE_INTENT.sectionLayout.map((layout) => {
        if (layout.sectionId === skills.sectionId) {
          return {
            ...layout,
            compactness: 0.91,
            headingStyleToken: 'remote_heading',
            keepTogether: false
          }
        }
        return layout.sectionId === summary.sectionId
          ? { ...layout, pageBreakBefore: true, compactness: 0.33 }
          : layout
      })
    }
    /** @brief 用户只触碰一个 zone 叶的草稿 / Draft in which the user touched only one zone leaf. */
    const patch: TemplateStyleDraftPatch = {
      sectionLayoutBySectionId: { [skills.sectionId]: { zone: 'main' } }
    }
    /** @brief 重新基于最新权威形成的完整 command style / Complete command style rebuilt on latest authority. */
    const merged = applyTemplateStyleDraft(latestAuthority, patch, true)
    /** @brief 合并后的 skills layout / Skills layout after the merge. */
    const mergedSkills = merged.sectionLayout.find(
      (layout) => layout.sectionId === skills.sectionId
    )
    /** @brief 合并后的 summary layout / Summary layout after the merge. */
    const mergedSummary = merged.sectionLayout.find(
      (layout) => layout.sectionId === summary.sectionId
    )

    expect(mergedSkills).toMatchObject({
      compactness: 0.91,
      headingStyleToken: 'remote_heading',
      keepTogether: false,
      zone: 'main'
    })
    expect(mergedSummary).toMatchObject({ compactness: 0.33, pageBreakBefore: true })
  })

  it('权威删除 section 时绝不从草稿复活并报告阻塞 identity', (): void => {
    /** @brief 被并发删除的 section identity / Identity of the concurrently deleted section. */
    const deletedSectionId = TEST_STYLE_INTENT.sectionLayout[0]?.sectionId
    expect(deletedSectionId).toBeDefined()
    if (deletedSectionId === undefined) return
    /** @brief 不再包含目标 section 的最新权威 / Latest authority no longer containing the target section. */
    const latestAuthority = {
      ...TEST_STYLE_INTENT,
      sectionLayout: TEST_STYLE_INTENT.sectionLayout.filter(
        (layout) => layout.sectionId !== deletedSectionId
      )
    }
    /** @brief 仍引用被删除 section 的本地草稿 / Local draft still referencing the deleted section. */
    const patch: TemplateStyleDraftPatch = {
      sectionLayoutBySectionId: { [deletedSectionId]: { zone: 'sidebar' } }
    }

    expect(applyTemplateStyleDraft(latestAuthority, patch, true).sectionLayout).toHaveLength(
      latestAuthority.sectionLayout.length
    )
    expect(getMissingTemplateSectionDraftIds(latestAuthority, patch)).toEqual([deletedSectionId])
  })

  it('成功只清理信封确认的 leaves，保留 hidden dormant setting 且 visible remove 会收敛为 clean', (): void => {
    /** @brief 同时包含可见 remove 与 hidden set 的草稿 / Draft containing a visible remove and a hidden set. */
    const mixedPatch: TemplateStyleDraftPatch = {
      page: { size: 'LETTER' },
      templateSettings: {
        hidden_note: { kind: 'set', value: 'retain me' },
        show_contact_icons: { kind: 'remove' }
      }
    }
    /** @brief 只确认 page 与 visible remove 的冻结快照 / Frozen snapshot confirming the page and visible remove only. */
    const confirmed = createConfirmedTemplateStyleDraftPatch(
      mixedPatch,
      new Set(['show_contact_icons'])
    )
    /** @brief 清理后的模板草稿 map / Template-draft map after confirmation cleanup. */
    const remaining = discardConfirmedTemplateDraft(
      new Map([['tpl@1', mixedPatch]]),
      'tpl@1',
      confirmed
    )

    expect(remaining.get('tpl@1')).toEqual({
      templateSettings: { hidden_note: { kind: 'set', value: 'retain me' } }
    })

    /** @brief 仅含 restore-default remove 的可见草稿 / Visible draft containing only a restore-default remove. */
    const removeOnly: TemplateStyleDraftPatch = {
      templateSettings: { show_contact_icons: { kind: 'remove' } }
    }
    /** @brief visible remove 成功后的空 map / Empty map after a visible remove succeeds. */
    const cleaned = discardConfirmedTemplateDraft(
      new Map([['tpl@1', removeOnly]]),
      'tpl@1',
      createConfirmedTemplateStyleDraftPatch(removeOnly, new Set(['show_contact_icons']))
    )
    expect(cleaned.has('tpl@1')).toBe(false)
  })
})
