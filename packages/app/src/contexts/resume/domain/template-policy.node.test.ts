/** @file Resume Template setting 领域策略测试 / Resume Template-setting domain-policy tests. */

import { describe, expect, it } from 'vitest'

import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { uiJsonValuesEqual } from '../../../shared-kernel/json'
import type { UiResumeDocument, UiResumeStyleIntent } from './document'
import type { UiTemplateManifest } from './models'
import {
  assertAuthoritativeTemplateSettings,
  assertResumeMatchesTemplateManifest,
  collectResumeTemplateCompatibilityIssues,
  getEffectiveTemplateSettingValue,
  isTemplateSettingVisible,
  projectVisibleTemplateSettings,
  ResumeTemplateSettingPolicyError
} from './template-policy'

/** @brief 具备条件可见 setting 的最小完整模板 / Minimal complete Template containing a conditionally visible setting. */
const TEST_TEMPLATE: UiTemplateManifest = {
  bulletStyleTokens: ['disc'],
  capabilities: {
    maxColumns: 1,
    supportsCustomSections: true,
    supportsPhoto: false,
    supportsSidebar: false,
    supportsSourceMap: true
  },
  dateFormatTokens: ['yyyy_mm'],
  description: null,
  fontFamilyTokens: ['sans_clean'],
  id: asUiOpaqueId<'template'>('tpl_policy_test'),
  name: 'Policy Test',
  previewUrl: null,
  publishedAt: '2026-07-23T00:00:00.000Z',
  settings: [
    {
      choices: [],
      control: 'switch',
      defaultValue: false,
      descriptionKey: null,
      groupKey: null,
      key: 'show_extra',
      labelKey: 'template.showExtra',
      maximum: null,
      minimum: null,
      valueType: 'boolean',
      visibleWhen: null
    },
    {
      choices: [
        { descriptionKey: null, labelKey: 'template.mode.warm', value: 'warm' },
        { descriptionKey: null, labelKey: 'template.mode.ink', value: 'ink' }
      ],
      control: 'radio',
      defaultValue: 'warm',
      descriptionKey: null,
      groupKey: null,
      key: 'extra_mode',
      labelKey: 'template.extraMode',
      maximum: null,
      minimum: null,
      valueType: 'choice',
      visibleWhen: { equals: true, key: 'show_extra' }
    },
    {
      choices: [],
      control: 'slider',
      defaultValue: 0.5,
      descriptionKey: null,
      groupKey: null,
      key: 'spacing',
      labelKey: 'template.spacing',
      maximum: 1,
      minimum: 0,
      valueType: 'number',
      visibleWhen: null
    }
  ],
  supportedLocales: ['zh-SG'],
  supportedOutputFormats: ['pdf'],
  supportedPageSizes: ['A4'],
  supportedSectionKinds: ['custom'],
  version: '1.0.0',
  zones: [
    {
      acceptedSectionKinds: ['custom'],
      id: 'main',
      labelKey: 'template.zone.main',
      maxSections: null
    }
  ]
}

/**
 * @brief 构造与 TEST_TEMPLATE 完整兼容的 Resume / Build a Resume fully compatible with TEST_TEMPLATE.
 * @return 可用于逐项破坏不变量的完整 Resume 权威 / Complete Resume authority whose invariants can be broken one by one.
 */
function compatibleResume(): UiResumeDocument {
  /** @brief 测试 section identity / Test section identity. */
  const sectionId = asUiOpaqueId<'resume-section'>('sec_template_policy_test')
  return {
    createdAt: '2026-07-23T00:00:00.000Z',
    id: asUiOpaqueId<'resume'>('res_template_policy_test'),
    knowledgeSourceId: null,
    locale: 'zh-SG',
    profile: { contacts: [], fullName: 'Klee', headline: null, summary: null },
    revision: 1,
    sections: [
      {
        content: null,
        id: sectionId,
        items: [],
        kind: 'custom',
        title: 'Summary',
        visible: true
      }
    ],
    styleIntent: {
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
          sectionId,
          zone: 'main'
        }
      ],
      styleContractVersion: '1.0',
      templateSettings: { show_extra: true },
      typography: {
        baseSizePt: 10,
        fontFamilyToken: 'sans_clean',
        headingScale: 1.2,
        letterSpacingEm: 0,
        lineHeight: 1.4
      }
    },
    template: { templateId: TEST_TEMPLATE.id, templateVersion: TEST_TEMPLATE.version },
    title: 'Template policy test',
    updatedAt: '2026-07-23T00:00:00.000Z',
    workspaceId: asUiOpaqueId<'workspace'>('ws_template_policy_test')
  }
}

describe('Resume Template setting policy', (): void => {
  it('uses defaults only as an effective projection and exact visibility dependency', (): void => {
    /** @brief 条件来源定义 / Conditional-source definition. */
    const showExtra = TEST_TEMPLATE.settings[0]
    /** @brief 条件目标定义 / Conditional-target definition. */
    const extraMode = TEST_TEMPLATE.settings[1]
    if (showExtra === undefined || extraMode === undefined) {
      throw new Error('Expected Template setting fixtures.')
    }
    /** @brief 不含任何物化默认值的稀疏草稿 / Sparse draft containing no materialized defaults. */
    const draft = {}

    expect(getEffectiveTemplateSettingValue(showExtra, draft)).toBe(false)
    expect(Object.keys(draft)).toEqual([])
    expect(isTemplateSettingVisible(extraMode, TEST_TEMPLATE, draft)).toBe(false)
    expect(() =>
      isTemplateSettingVisible(extraMode, TEST_TEMPLATE, { show_extra: 1 })
    ).toThrowError(expect.objectContaining({ code: 'invalid-setting-value' }))
    expect(isTemplateSettingVisible(extraMode, TEST_TEMPLATE, { show_extra: true })).toBe(true)
  })

  it('keeps a hidden draft value dormant while excluding it from the command', (): void => {
    /** @brief 切换关闭但保留隐藏控件值的本地草稿 / Local draft with the switch off while preserving the hidden control value. */
    const draft = { extra_mode: 'ink', show_extra: false, spacing: 0.8 }

    expect(projectVisibleTemplateSettings(TEST_TEMPLATE, draft)).toEqual({
      show_extra: false,
      spacing: 0.8
    })
    expect(draft).toEqual({ extra_mode: 'ink', show_extra: false, spacing: 0.8 })
  })

  it('does not let an invalid dormant value block an unrelated visible command', (): void => {
    /** @brief 隐藏字段保留的未来版本或暂态值 / Future-version or transient value retained by the hidden field. */
    const draft = { extra_mode: 'future-mode', show_extra: false, spacing: 0.8 }

    expect(projectVisibleTemplateSettings(TEST_TEMPLATE, draft)).toEqual({
      show_extra: false,
      spacing: 0.8
    })
    expect(draft.extra_mode).toBe('future-mode')
  })

  it('fails closed for unknown, mistyped, out-of-range, and hidden authoritative values', (): void => {
    expect(() => projectVisibleTemplateSettings(TEST_TEMPLATE, { unknown: true })).toThrowError(
      expect.objectContaining({ code: 'unknown-setting' })
    )
    expect(() =>
      projectVisibleTemplateSettings(TEST_TEMPLATE, { show_extra: 'true' })
    ).toThrowError(expect.objectContaining({ code: 'invalid-setting-value' }))
    expect(() => projectVisibleTemplateSettings(TEST_TEMPLATE, { spacing: 2 })).toThrowError(
      expect.objectContaining({ code: 'invalid-setting-value' })
    )
    expect(() =>
      assertAuthoritativeTemplateSettings(TEST_TEMPLATE, {
        extra_mode: 'ink',
        show_extra: false
      })
    ).toThrowError(expect.objectContaining({ code: 'hidden-setting' }))
    expect(() =>
      assertAuthoritativeTemplateSettings(TEST_TEMPLATE, {
        extra_mode: 'ink',
        show_extra: true
      })
    ).not.toThrow()
  })

  it('compares JSON arrays and object members exactly without depending on key order', (): void => {
    expect(
      uiJsonValuesEqual(
        { alpha: [1, { enabled: true }], beta: null },
        { beta: null, alpha: [1, { enabled: true }] }
      )
    ).toBe(true)
    expect(uiJsonValuesEqual([1, 2], [2, 1])).toBe(false)
    expect(uiJsonValuesEqual(-0, 0)).toBe(true)
    expect(uiJsonValuesEqual(true, 1)).toBe(false)
    expect(ResumeTemplateSettingPolicyError.name).toBe('ResumeTemplateSettingPolicyError')
  })

  it('accepts a complete Resume only when every decidable manifest invariant holds', (): void => {
    expect(() =>
      assertResumeMatchesTemplateManifest(compatibleResume(), TEST_TEMPLATE)
    ).not.toThrow()
  })

  it('collects field-addressable schema and manifest issues through one shared policy', (): void => {
    /** @brief 合法基线 Resume / Valid baseline Resume. */
    const resume = compatibleResume()
    /** @brief 逐层保留类型但故意破坏运行时边界的候选样式 / Candidate style preserving the type shape while deliberately breaking runtime bounds. */
    const invalidStyle: UiResumeStyleIntent = {
      ...resume.styleIntent,
      bulletStyleToken: '',
      dateFormatToken: '',
      density: 2,
      page: {
        ...resume.styleIntent.page,
        customWidth: { unit: 'mm', value: Number.NaN }
      },
      palette: {
        ...resume.styleIntent.palette,
        primary: { space: 'rgba', value: '' }
      },
      sectionLayout: resume.styleIntent.sectionLayout.map((layout) => ({
        ...layout,
        compactness: 2
      })),
      styleContractVersion: '2.0' as '1.0',
      typography: {
        ...resume.styleIntent.typography,
        baseSizePt: 4,
        fontFamilyToken: ''
      }
    }

    expect(
      collectResumeTemplateCompatibilityIssues(
        {
          locale: resume.locale,
          sections: resume.sections.map((section) => ({ id: section.id, kind: section.kind })),
          styleIntent: invalidStyle
        },
        TEST_TEMPLATE
      )
    ).toEqual(
      expect.arrayContaining([
        {
          code: 'invalid-style-contract-version',
          fieldPath: ['styleIntent', 'styleContractVersion']
        },
        {
          code: 'invalid-page-intent',
          fieldPath: ['styleIntent', 'page', 'customWidth']
        },
        {
          code: 'invalid-typography',
          fieldPath: ['styleIntent', 'typography', 'fontFamilyToken']
        },
        {
          code: 'invalid-typography',
          fieldPath: ['styleIntent', 'typography', 'baseSizePt']
        },
        {
          code: 'invalid-palette',
          fieldPath: ['styleIntent', 'palette', 'primary']
        },
        { code: 'invalid-density', fieldPath: ['styleIntent', 'density'] },
        { code: 'invalid-style-token', fieldPath: ['styleIntent', 'dateFormatToken'] },
        { code: 'invalid-style-token', fieldPath: ['styleIntent', 'bulletStyleToken'] },
        {
          code: 'invalid-section-layout',
          fieldPath: [
            'styleIntent',
            'sectionLayout',
            resume.styleIntent.sectionLayout[0]!.sectionId,
            'compactness'
          ]
        }
      ])
    )
  })

  it('uses the shared style policy when asserting an authoritative Resume', (): void => {
    /** @brief 合法基线 Resume / Valid baseline Resume. */
    const resume = compatibleResume()
    /** @brief 包含空 ColorValue 的无效权威 / Invalid authority containing an empty ColorValue. */
    const invalidResume: UiResumeDocument = {
      ...resume,
      styleIntent: {
        ...resume.styleIntent,
        palette: {
          ...resume.styleIntent.palette,
          primary: { space: 'rgba', value: '' }
        }
      }
    }

    expect(() => assertResumeMatchesTemplateManifest(invalidResume, TEST_TEMPLATE)).toThrowError(
      expect.objectContaining({ code: 'invalid-palette' })
    )
  })

  it.each([
    [
      'template-identity-mismatch',
      (): UiResumeDocument => ({
        ...compatibleResume(),
        template: {
          templateId: asUiOpaqueId<'template'>('tpl_template_policy_other'),
          templateVersion: TEST_TEMPLATE.version
        }
      })
    ],
    ['unsupported-locale', (): UiResumeDocument => ({ ...compatibleResume(), locale: 'en-US' })],
    [
      'unsupported-page-size',
      (): UiResumeDocument => {
        /** @brief 基础兼容 Resume / Base compatible Resume. */
        const resume = compatibleResume()
        return {
          ...resume,
          styleIntent: {
            ...resume.styleIntent,
            page: { ...resume.styleIntent.page, size: 'LETTER' }
          }
        }
      }
    ],
    [
      'unsupported-font-token',
      (): UiResumeDocument => {
        /** @brief 基础兼容 Resume / Base compatible Resume. */
        const resume = compatibleResume()
        return {
          ...resume,
          styleIntent: {
            ...resume.styleIntent,
            typography: {
              ...resume.styleIntent.typography,
              fontFamilyToken: 'unknown_font'
            }
          }
        }
      }
    ],
    [
      'unsupported-date-token',
      (): UiResumeDocument => {
        /** @brief 基础兼容 Resume / Base compatible Resume. */
        const resume = compatibleResume()
        return {
          ...resume,
          styleIntent: { ...resume.styleIntent, dateFormatToken: 'unknown_date' }
        }
      }
    ],
    [
      'unsupported-bullet-token',
      (): UiResumeDocument => {
        /** @brief 基础兼容 Resume / Base compatible Resume. */
        const resume = compatibleResume()
        return {
          ...resume,
          styleIntent: { ...resume.styleIntent, bulletStyleToken: 'unknown_bullet' }
        }
      }
    ],
    [
      'unsupported-section-kind',
      (): UiResumeDocument => {
        /** @brief 基础兼容 Resume / Base compatible Resume. */
        const resume = compatibleResume()
        /** @brief 基础 section / Base section. */
        const section = resume.sections[0]
        if (section === undefined) throw new Error('Expected a section fixture.')
        return { ...resume, sections: [{ ...section, kind: 'experience' }] }
      }
    ],
    [
      'invalid-section-layout',
      (): UiResumeDocument => {
        /** @brief 基础兼容 Resume / Base compatible Resume. */
        const resume = compatibleResume()
        /** @brief 基础 layout / Base layout. */
        const layout = resume.styleIntent.sectionLayout[0]
        if (layout === undefined) throw new Error('Expected a layout fixture.')
        return {
          ...resume,
          styleIntent: {
            ...resume.styleIntent,
            sectionLayout: [{ ...layout, zone: 'unknown_zone' }]
          }
        }
      }
    ]
  ] as const)('fails closed with %s', (code, createInvalidResume): void => {
    expect(() =>
      assertResumeMatchesTemplateManifest(createInvalidResume(), TEST_TEMPLATE)
    ).toThrowError(expect.objectContaining({ code }))
  })

  it('enforces maxSections across all layouts targeting the same zone', (): void => {
    /** @brief 基础兼容 Resume / Base compatible Resume. */
    const resume = compatibleResume()
    /** @brief 首个 section / First section. */
    const firstSection = resume.sections[0]
    /** @brief 首个 layout / First layout. */
    const firstLayout = resume.styleIntent.sectionLayout[0]
    if (firstSection === undefined || firstLayout === undefined) {
      throw new Error('Expected section and layout fixtures.')
    }
    /** @brief 第二个 section identity / Second section identity. */
    const secondSectionId = asUiOpaqueId<'resume-section'>('sec_template_policy_second')
    /** @brief zone 上限为一的 manifest / Manifest limiting the zone to one section. */
    const limitedTemplate: UiTemplateManifest = {
      ...TEST_TEMPLATE,
      zones: [{ ...TEST_TEMPLATE.zones[0]!, maxSections: 1 }]
    }
    /** @brief 两个 section 均投向同一 zone 的 Resume / Resume placing two sections into the same zone. */
    const overflowingResume: UiResumeDocument = {
      ...resume,
      sections: [...resume.sections, { ...firstSection, id: secondSectionId }],
      styleIntent: {
        ...resume.styleIntent,
        sectionLayout: [firstLayout, { ...firstLayout, sectionId: secondSectionId }]
      }
    }

    expect(() =>
      assertResumeMatchesTemplateManifest(overflowingResume, limitedTemplate)
    ).toThrowError(expect.objectContaining({ code: 'zone-section-limit' }))
    expect(
      collectResumeTemplateCompatibilityIssues(
        {
          locale: overflowingResume.locale,
          sections: overflowingResume.sections.map((section) => ({
            id: section.id,
            kind: section.kind
          })),
          styleIntent: overflowingResume.styleIntent
        },
        limitedTemplate
      ).filter((issue) => issue.code === 'zone-section-limit')
    ).toEqual([
      {
        code: 'zone-section-limit',
        fieldPath: ['styleIntent', 'sectionLayout', firstSection.id, 'zone']
      },
      {
        code: 'zone-section-limit',
        fieldPath: ['styleIntent', 'sectionLayout', secondSectionId, 'zone']
      }
    ])
  })
})
