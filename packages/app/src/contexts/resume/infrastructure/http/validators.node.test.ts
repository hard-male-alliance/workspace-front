import { describe, expect, it } from 'vitest'

import { HttpContractError } from '../../../../infrastructure/http/http-client'
import {
  parseResumeDocumentDto,
  parseResumeListDto,
  parseResumeOperationBatchResultDto,
  parseResumeRenderJobDto,
  parseTemplateManifestDto,
  parseTemplateManifestListDto
} from './validators'

const templateManifest = {
  bullet_style_tokens: ['bullet.default'],
  capabilities: {
    max_columns: 1,
    supports_custom_sections: true,
    supports_photo: false,
    supports_sidebar: false,
    supports_source_map: true
  },
  created_at: '2026-07-19T00:00:00Z',
  date_format_tokens: ['yyyy_mm'],
  description: 'A stable template.',
  extensions: {},
  font_family_tokens: ['body.default'],
  id: 'tpl_default_v1',
  name: 'AIWS Classic',
  preview_asset_url: null,
  revision: 1,
  settings: [],
  supported_locales: ['zh-CN', 'en-US'],
  supported_output_formats: ['pdf'],
  supported_page_sizes: ['A4'],
  supported_section_kinds: ['summary'],
  template_version: '1.0',
  updated_at: '2026-07-19T00:00:00Z',
  zones: [
    {
      accepted_section_kinds: ['summary'],
      label_key: 'template.zone.main',
      max_sections: 100,
      zone_id: 'main'
    }
  ]
} as const

/** @brief 可验证结构值与条件可见性的模板设置 / Template setting exercising structured values and conditional visibility. */
const measurementSetting = {
  default: { unit: 'mm', value: 8 },
  description_key: 'template.spacing.description',
  group_key: 'template.groups.appearance',
  key: 'section_spacing',
  label_key: 'template.spacing.label',
  maximum: 20,
  minimum: 0,
  ui_control: 'measurement',
  value_type: 'measurement',
  visible_when: { equals: true, key: 'show_advanced' }
} as const

/** @brief 可验证选项值与 radio 语义的模板设置 / Template setting exercising choices and radio semantics. */
const choiceSetting = {
  choices: [
    {
      description_key: null,
      label_key: 'template.accent.warm',
      value: 'warm'
    },
    {
      description_key: 'template.accent.ink.description',
      label_key: 'template.accent.ink',
      value: 'ink'
    }
  ],
  default: 'warm',
  description_key: null,
  group_key: null,
  key: 'accent_style',
  label_key: 'template.accent.label',
  maximum: null,
  minimum: null,
  ui_control: 'radio',
  value_type: 'choice',
  visible_when: null
} as const

/**
 * @brief 构造合法 RichText / Build valid RichText.
 * @param text 纯文本投影 / Plain-text projection.
 * @param suffix ID 后缀 / ID suffix.
 * @return 冻结契约合法的段落富文本 / Paragraph RichText valid under the frozen contract.
 */
function richTextFixture(text: string, suffix: string): Record<string, unknown> {
  return {
    blocks: [
      {
        align: 'start',
        block_id: `block_${suffix}`,
        spans: [{ marks: [{ href: null, type: 'bold' }], text }],
        type: 'paragraph'
      }
    ],
    plain_text: text,
    schema_version: '1.0'
  }
}

/**
 * @brief 构造合法 PartialDate / Build a valid PartialDate.
 * @param year 年份 / Year.
 * @param month 月份 / Month.
 * @return 月精度日期 / Month-precision date.
 */
function partialDateFixture(year: number, month: number): Record<string, unknown> {
  return { day: null, month, precision: 'month', year }
}

/**
 * @brief 构造全部冻结 ResumeItem 分支 / Build every frozen ResumeItem branch.
 * @return 十种判别联合 fixture / Fixtures for all ten discriminated variants.
 */
function resumeItemFixtures(): readonly Record<string, unknown>[] {
  /** @brief 当前经历日期范围 / Current experience date range. */
  const currentRange = {
    display_override: '2023.03 — 至今',
    end: null,
    is_current: true,
    start: partialDateFixture(2023, 3)
  }
  /** @brief 已完成日期范围 / Completed date range. */
  const completedRange = {
    display_override: null,
    end: partialDateFixture(2022, 12),
    is_current: false,
    start: partialDateFixture(2020, 7)
  }

  return [
    {
      date_range: currentRange,
      description: richTextFixture('负责平台架构。', 'experience_description'),
      extensions: {},
      highlights: [richTextFixture('降低延迟。', 'experience_highlight')],
      item_id: 'item_experience',
      item_kind: 'experience',
      links: [{ kind: 'portfolio', label: null, url: 'https://example.test/work' }],
      location: 'Singapore',
      organization: 'Arcadia Systems',
      position: '平台工程师',
      tags: ['TypeScript'],
      visible: true
    },
    {
      date_range: completedRange,
      degree: '工学硕士',
      description: null,
      field_of_study: '计算机科学',
      highlights: [richTextFixture('分布式系统方向。', 'education_highlight')],
      institution: '示例大学',
      item_id: 'item_education',
      item_kind: 'education',
      location: 'Shanghai',
      score: 'GPA 3.9',
      visible: true
    },
    {
      date_range: completedRange,
      description: richTextFixture('语义简历工具。', 'project_description'),
      highlights: [],
      item_id: 'item_project_01',
      item_kind: 'project',
      name: 'AI Workspace',
      role: '维护者',
      technologies: ['React', 'Electron'],
      visible: true
    },
    {
      item_id: 'item_skill_group',
      item_kind: 'skill_group',
      name: '核心能力',
      proficiency: 'advanced',
      skills: ['TypeScript', '分布式系统'],
      visible: true
    },
    {
      authors: ['Klee', 'Ada'],
      description: richTextFixture('同行评审论文。', 'publication_description'),
      item_id: 'item_publication',
      item_kind: 'publication',
      published_at: partialDateFixture(2025, 6),
      publisher: 'Example Journal',
      title: 'Executable Boundaries',
      visible: true
    },
    {
      awarded_at: partialDateFixture(2024, 11),
      description: richTextFixture('年度奖项。', 'award_description'),
      issuer: 'Example Foundation',
      item_id: 'item_award_0001',
      item_kind: 'award',
      title: '工程卓越奖',
      visible: true
    },
    {
      credential_id: 'CERT-2024-001',
      expires_at: partialDateFixture(2027, 4),
      issued_at: partialDateFixture(2024, 4),
      issuer: 'Example Institute',
      item_id: 'item_certification',
      item_kind: 'certification',
      name: '云架构认证',
      visible: true
    },
    {
      certificate: 'CEFR C2',
      item_id: 'item_language_01',
      item_kind: 'language',
      language: 'English',
      proficiency: 'fluent',
      visible: true
    },
    {
      date_range: currentRange,
      description: null,
      highlights: [richTextFixture('维护开源文档。', 'volunteer_highlight')],
      item_id: 'item_volunteer',
      item_kind: 'volunteer',
      organization: 'Open Source Community',
      role: '维护者',
      visible: true
    },
    {
      content: richTextFixture('自定义内容。', 'custom_content'),
      data: { 'vendor.field': true },
      date_range: completedRange,
      item_id: 'item_custom_001',
      item_kind: 'custom',
      subtitle: '自定义副标题',
      title: '自定义标题',
      visible: true
    }
  ]
}

/**
 * @brief 构造合法 ResumeDocument / Build a valid ResumeDocument.
 * @param items 区段条目 / Section items.
 * @param content 区段富文本 / Section RichText.
 * @return 可按测试覆写的权威文档 JSON / Authoritative document JSON suitable for test overrides.
 */
function resumeDocumentFixture(
  items: readonly unknown[] = [],
  content: unknown = null
): Record<string, unknown> {
  /** @brief 合法测量值 / Valid measurement. */
  const measurement = { unit: 'mm', value: 18 }
  /** @brief 构造合法颜色 / Build a valid color. */
  const color = (value: string): { readonly space: string; readonly value: string } => ({
    space: 'srgb_hex',
    value
  })
  return {
    created_at: '2026-07-19T00:00:00Z',
    extensions: {},
    id: 'res_example',
    knowledge_source_id: 'ks_example',
    locale: 'zh-CN',
    profile: {
      contacts: [],
      full_name: '未命名求职者',
      headline: null,
      photo_asset_id: null,
      pronouns: null,
      summary: null
    },
    revision: 1,
    schema_version: '1.0',
    sections: [
      {
        content,
        extensions: {},
        items,
        kind: 'vendor.timeline',
        section_id: 'sec_summary',
        title: '简介',
        visible: true
      }
    ],
    style_intent: {
      bullet_style_token: 'bullet.default',
      date_format_token: 'yyyy_mm',
      density: 0.5,
      extensions: { 'vendor.layout': { keep: true } },
      page: {
        custom_height: { unit: 'percent', value: 100 },
        custom_width: { unit: 'px', value: 800 },
        margins: {
          bottom: measurement,
          left: measurement,
          right: measurement,
          top: measurement
        },
        max_pages: null,
        orientation: 'portrait',
        show_page_numbers: false,
        size: 'A4'
      },
      palette: {
        background: color('#FFFFFF'),
        muted_text: color('#666666'),
        primary: color('#1F4E79'),
        secondary: color('#4F81BD'),
        text: color('#1A1A1A')
      },
      section_layout: [],
      style_contract_version: '1.0',
      template_settings: {},
      typography: {
        base_size_pt: 10.5,
        font_family_token: 'body.default',
        heading_scale: 1.2,
        letter_spacing_em: 0,
        line_height: 1.25
      }
    },
    template: { template_id: 'tpl_default_v1', template_version: '1.0' },
    title: '我的简历',
    updated_at: '2026-07-19T00:00:00Z',
    workspace_id: 'ws_example'
  }
}

describe('parseTemplateManifestListDto', (): void => {
  it('accepts the backend template catalog envelope', (): void => {
    const result = parseTemplateManifestListDto({
      items: [templateManifest],
      page: { has_more: false, next_cursor: null, total_estimate: 1 }
    })

    expect(result.items[0]?.id).toBe('tpl_default_v1')
    expect(result.items[0]?.supported_output_formats).toEqual(['pdf'])
    expect(result.items[0]?.template_version).toBe('1.0')
    expect(result.page).toEqual({ has_more: false, next_cursor: null, total_estimate: 1 })
  })

  it('rejects a continuing page without an opaque next cursor', (): void => {
    expect(() =>
      parseTemplateManifestListDto({
        items: [templateManifest],
        page: { has_more: true, next_cursor: null, total_estimate: 2 }
      })
    ).toThrowError(HttpContractError)
  })

  it('accepts omitted optional template description and preview fields', (): void => {
    /** @brief 省略两个契约可选字段的模板 / Template omitting two contract-optional fields. */
    const minimal: Record<string, unknown> = { ...templateManifest }
    delete minimal.description
    delete minimal.preview_asset_url

    const result = parseTemplateManifestListDto({
      items: [minimal],
      page: { has_more: false, next_cursor: null, total_estimate: 1 }
    })

    expect(result.items[0]).toMatchObject({ description: null, preview_asset_url: null })
  })
})

describe('parseTemplateManifestDto strict aggregate boundary', (): void => {
  it('preserves grouped conditional settings with structured values', (): void => {
    const result = parseTemplateManifestDto({
      ...templateManifest,
      settings: [measurementSetting, choiceSetting]
    })

    expect(result.settings[0]).toMatchObject({
      default: { unit: 'mm', value: 8 },
      group_key: 'template.groups.appearance',
      visible_when: { equals: true, key: 'show_advanced' }
    })
    expect(result.settings[1]?.choices).toHaveLength(2)
  })

  it.each([
    ['manifest', { ...templateManifest, renderer_private: true }],
    [
      'capabilities',
      {
        ...templateManifest,
        capabilities: { ...templateManifest.capabilities, renderer_private: true }
      }
    ],
    [
      'zone',
      {
        ...templateManifest,
        zones: [{ ...templateManifest.zones[0], renderer_private: true }]
      }
    ],
    [
      'setting',
      {
        ...templateManifest,
        settings: [{ ...measurementSetting, renderer_private: true }]
      }
    ],
    [
      'choice',
      {
        ...templateManifest,
        settings: [
          {
            ...choiceSetting,
            choices: [{ ...choiceSetting.choices[0], renderer_private: true }]
          }
        ]
      }
    ],
    [
      'visible_when',
      {
        ...templateManifest,
        settings: [
          {
            ...measurementSetting,
            visible_when: { ...measurementSetting.visible_when, renderer_private: true }
          }
        ]
      }
    ]
  ])('rejects additional properties on %s', (_layer, manifest): void => {
    expect(() => parseTemplateManifestDto(manifest)).toThrowError(HttpContractError)
  })

  it('enforces manifest and choice collection limits before mapping', (): void => {
    /** @brief 超过清单设置上限的最小定义 / Minimal definitions exceeding the manifest setting limit. */
    const tooManySettings = Array.from({ length: 201 }, (_, index) => ({
      default: false,
      key: `flag_${index}`,
      label_key: `template.flag_${index}`,
      ui_control: 'switch',
      value_type: 'boolean'
    }))
    expect(() =>
      parseTemplateManifestDto({ ...templateManifest, settings: tooManySettings })
    ).toThrowError(HttpContractError)

    /** @brief 超过单设置选项上限的选项 / Choices exceeding one setting's limit. */
    const tooManyChoices = Array.from({ length: 101 }, (_, index) => ({
      label_key: `template.choice_${index}`,
      value: `choice-${index}`
    }))
    expect(() =>
      parseTemplateManifestDto({
        ...templateManifest,
        settings: [{ ...choiceSetting, choices: tooManyChoices, default: 'choice-0' }]
      })
    ).toThrowError(HttpContractError)
    expect(() =>
      parseTemplateManifestDto({
        ...templateManifest,
        settings: [{ ...choiceSetting, choices: null }]
      })
    ).toThrowError(HttpContractError)
  })

  it.each([
    ['setting key', { ...measurementSetting, key: 'Invalid Key' }],
    ['setting label', { ...measurementSetting, label_key: 'Template.Invalid' }],
    ['setting group', { ...measurementSetting, group_key: 'Template.Invalid' }],
    [
      'choice label',
      {
        ...choiceSetting,
        choices: [{ ...choiceSetting.choices[0], label_key: 'Template.Invalid' }]
      }
    ]
  ])('rejects an invalid stable-code pattern for %s', (_field, setting): void => {
    expect(() =>
      parseTemplateManifestDto({ ...templateManifest, settings: [setting] })
    ).toThrowError(HttpContractError)
  })

  it('enforces zone patterns, minimums and unique accepted kinds', (): void => {
    expect(() =>
      parseTemplateManifestDto({
        ...templateManifest,
        zones: [
          {
            ...templateManifest.zones[0],
            accepted_section_kinds: ['summary', 'summary'],
            max_sections: 0,
            zone_id: 'Invalid Zone'
          }
        ]
      })
    ).toThrowError(HttpContractError)
  })

  it('preserves schema-valid JSON values and open section-kind codes without inventing semantic constraints', (): void => {
    /** @brief 冻结 Schema 明确允许的递归 JSON 值 / Recursive JSON value explicitly allowed by the frozen schema. */
    const futureValue = {
      fallback: null,
      layout: ['wide', { columns: 3, enabled: true }]
    }
    /** @brief Schema 合法但当前控件不会推断为可编辑的定义 / Schema-valid definition the current control must not reinterpret as editable. */
    const futureSetting = {
      ...choiceSetting,
      choices: [{ label_key: 'template.layout.future', value: futureValue }],
      default: futureValue,
      maximum: 4,
      minimum: 5,
      ui_control: 'switch',
      visible_when: { equals: ['future', { revision: 2 }], key: 'layout_mode' }
    }

    const result = parseTemplateManifestDto({
      ...templateManifest,
      settings: [futureSetting],
      supported_section_kinds: ['summary', 'vendor.timeline'],
      zones: [
        {
          ...templateManifest.zones[0],
          accepted_section_kinds: ['summary', 'vendor.timeline']
        }
      ]
    })

    expect(result.settings[0]).toMatchObject({
      choices: [{ label_key: 'template.layout.future', value: futureValue }],
      default: futureValue,
      maximum: 4,
      minimum: 5,
      ui_control: 'switch',
      visible_when: { equals: ['future', { revision: 2 }], key: 'layout_mode' }
    })
    expect(result.supported_section_kinds).toEqual(['summary', 'vendor.timeline'])
    expect(result.zones[0]?.accepted_section_kinds).toEqual(['summary', 'vendor.timeline'])
  })

  it('enforces manifest URI, time, cardinality, uniqueness and capability bounds', (): void => {
    expect(() =>
      parseTemplateManifestDto({ ...templateManifest, preview_asset_url: '/relative.png' })
    ).toThrowError(HttpContractError)
    expect(() =>
      parseTemplateManifestDto({ ...templateManifest, updated_at: 'not-a-time' })
    ).toThrowError(HttpContractError)
    expect(() =>
      parseTemplateManifestDto({ ...templateManifest, supported_locales: [] })
    ).toThrowError(HttpContractError)
    expect(() =>
      parseTemplateManifestDto({
        ...templateManifest,
        font_family_tokens: ['body.default', 'body.default']
      })
    ).toThrowError(HttpContractError)
    expect(() =>
      parseTemplateManifestDto({
        ...templateManifest,
        capabilities: { ...templateManifest.capabilities, max_columns: 5 }
      })
    ).toThrowError(HttpContractError)
  })
})

describe('parseResumeDocumentDto', (): void => {
  it('accepts future stable section-kind codes and enforces the frozen section boundary', (): void => {
    /** @brief 携带未来开放区段 code 的合法权威文档 / Valid authoritative document carrying a future open section code. */
    const document = resumeDocumentFixture()
    /** @brief 基准区段 / Baseline section. */
    const section = (document.sections as readonly Record<string, unknown>[])[0] ?? {}
    /** @brief 基准样式意图 / Baseline style intent. */
    const style = document.style_intent as Record<string, unknown>
    /** @brief 基准页面意图 / Baseline page intent. */
    const page = style.page as Record<string, unknown>
    const result = parseResumeDocumentDto(document)

    expect(result.id).toBe('res_example')
    expect(result.template).toEqual({ template_id: 'tpl_default_v1', template_version: '1.0' })
    expect(result.sections[0]?.section_id).toBe('sec_summary')
    expect(result.sections[0]?.kind).toBe('vendor.timeline')
    expect(result.style_intent).toMatchObject({
      extensions: { 'vendor.layout': { keep: true } },
      page: {
        custom_height: { unit: 'percent', value: 100 },
        custom_width: { unit: 'px', value: 800 }
      }
    })

    expect(() =>
      parseResumeDocumentDto({
        ...document,
        sections: [{ ...section, kind: 'Vendor Timeline' }]
      })
    ).toThrowError(HttpContractError)
    expect(() =>
      parseResumeDocumentDto({
        ...document,
        sections: [{ ...section, renderer_private: true }]
      })
    ).toThrowError(HttpContractError)
    expect(() =>
      parseResumeDocumentDto({
        ...document,
        sections: [{ ...section, title: '' }]
      })
    ).toThrowError(HttpContractError)
    expect(() => parseResumeDocumentDto({ ...document, renderer_private: true })).toThrowError(
      HttpContractError
    )
    expect(() =>
      parseResumeDocumentDto({
        ...document,
        style_intent: { ...style, density: 1.1 }
      })
    ).toThrowError(HttpContractError)
    expect(() =>
      parseResumeDocumentDto({
        ...document,
        style_intent: {
          ...style,
          page: {
            ...page,
            custom_width: { unit: 'rem', value: 20 }
          }
        }
      })
    ).toThrowError(HttpContractError)
  })

  it('accepts every frozen ResumeItem variant as a strict discriminated union', (): void => {
    /** @brief 包含全部合法条目分支的解码结果 / Decoded result containing every valid item branch. */
    const result = parseResumeDocumentDto(resumeDocumentFixture(resumeItemFixtures()))

    expect(result.sections[0]?.items.map((item) => item.item_kind)).toEqual([
      'experience',
      'education',
      'project',
      'skill_group',
      'publication',
      'award',
      'certification',
      'language',
      'volunteer',
      'custom'
    ])
    expect(result.sections[0]?.items[0]).toMatchObject({
      date_range: { display_override: '2023.03 — 至今' },
      item_kind: 'experience',
      organization: 'Arcadia Systems'
    })
    expect(result.sections[0]?.items[4]).toMatchObject({
      item_kind: 'publication',
      published_at: { month: 6, year: 2025 }
    })
  })

  it('validates recursive list RichText and derives its projection when plain_text is null', (): void => {
    /** @brief 含 link mark 与一层递归子项的合法列表 / Valid list with a link mark and one recursive child. */
    const content = {
      blocks: [
        {
          block_id: 'block_list_root',
          items: [
            {
              children: [
                {
                  item_id: 'list_child_item',
                  spans: [{ text: '子项' }]
                }
              ],
              item_id: 'list_parent_item',
              spans: [
                {
                  marks: [{ href: 'https://example.test/reference', type: 'link' }],
                  text: '父项'
                }
              ]
            }
          ],
          ordered: false,
          type: 'list'
        }
      ],
      plain_text: null,
      schema_version: '1.0'
    }

    expect(parseResumeDocumentDto(resumeDocumentFixture([], content)).sections[0]?.content).toEqual(
      { plain_text: '父项\n子项' }
    )
  })

  it.each([
    [
      'unknown block property',
      {
        blocks: [
          {
            block_id: 'block_invalid_1',
            renderer_private: true,
            spans: [{ text: 'text' }],
            type: 'paragraph'
          }
        ],
        schema_version: '1.0'
      }
    ],
    [
      'unknown block discriminator',
      {
        blocks: [{ block_id: 'block_invalid_2', spans: [{ text: 'text' }], type: 'heading' }],
        schema_version: '1.0'
      }
    ],
    [
      'missing paragraph spans',
      { blocks: [{ block_id: 'block_invalid_3', type: 'paragraph' }], schema_version: '1.0' }
    ],
    [
      'too many text marks',
      {
        blocks: [
          {
            block_id: 'block_invalid_4',
            spans: [{ marks: Array.from({ length: 9 }, () => ({ type: 'bold' })), text: 'text' }],
            type: 'paragraph'
          }
        ],
        schema_version: '1.0'
      }
    ],
    [
      'explicit null text marks',
      {
        blocks: [
          {
            block_id: 'block_invalid_marks',
            spans: [{ marks: null, text: 'text' }],
            type: 'paragraph'
          }
        ],
        schema_version: '1.0'
      }
    ],
    [
      'too many recursive children',
      {
        blocks: [
          {
            block_id: 'block_invalid_5',
            items: [
              {
                children: Array.from({ length: 21 }, (_, index) => ({
                  item_id: `child_item_${index}`,
                  spans: [{ text: 'child' }]
                })),
                item_id: 'list_invalid_item',
                spans: [{ text: 'parent' }]
              }
            ],
            ordered: false,
            type: 'list'
          }
        ],
        schema_version: '1.0'
      }
    ],
    [
      'explicit null recursive children',
      {
        blocks: [
          {
            block_id: 'block_invalid_children',
            items: [
              {
                children: null,
                item_id: 'list_invalid_null',
                spans: [{ text: 'parent' }]
              }
            ],
            ordered: false,
            type: 'list'
          }
        ],
        schema_version: '1.0'
      }
    ],
    [
      'oversized span text',
      {
        blocks: [
          {
            block_id: 'block_invalid_6',
            spans: [{ text: 'x'.repeat(20_001) }],
            type: 'paragraph'
          }
        ],
        schema_version: '1.0'
      }
    ]
  ] as const)('rejects RichText with %s', (_caseName, content): void => {
    expect(() => parseResumeDocumentDto(resumeDocumentFixture([], content))).toThrowError(
      HttpContractError
    )
  })

  it.each([
    ['unknown variant property', { ...resumeItemFixtures()[0], renderer_private: true }],
    ['missing required experience position', { ...resumeItemFixtures()[0], position: undefined }],
    ['explicit null item links', { ...resumeItemFixtures()[0], links: null }],
    ['explicit null item tags', { ...resumeItemFixtures()[0], tags: null }],
    ['explicit null item highlights', { ...resumeItemFixtures()[0], highlights: null }],
    ['field from another variant', { ...resumeItemFixtures()[2], organization: 'invalid' }],
    ['explicit null project technologies', { ...resumeItemFixtures()[2], technologies: null }],
    ['empty required skill list', { ...resumeItemFixtures()[3], skills: [] }],
    [
      'too many publication authors',
      { ...resumeItemFixtures()[4], authors: Array.from({ length: 101 }, () => 'Author') }
    ],
    [
      'out-of-range award date',
      {
        ...resumeItemFixtures()[5],
        awarded_at: { day: null, month: null, precision: 'year', year: 1899 }
      }
    ],
    [
      'unknown certification date property',
      {
        ...resumeItemFixtures()[6],
        issued_at: { ...partialDateFixture(2024, 4), timezone: 'UTC' }
      }
    ],
    ['closed language proficiency', { ...resumeItemFixtures()[7], proficiency: 'near_native' }],
    [
      'too many volunteer highlights',
      {
        ...resumeItemFixtures()[8],
        highlights: Array.from({ length: 31 }, (_, index) =>
          richTextFixture(`item-${index}`, `volunteer_${index}`)
        )
      }
    ],
    [
      'malformed custom content',
      {
        ...resumeItemFixtures()[9],
        content: { blocks: [{ type: 'paragraph' }], schema_version: '1.0' }
      }
    ],
    [
      'relative item link URI',
      {
        ...resumeItemFixtures()[0],
        links: [{ kind: 'website', url: '/relative' }]
      }
    ]
  ] as const)('rejects ResumeItem with %s', (_caseName, item): void => {
    expect(() => parseResumeDocumentDto(resumeDocumentFixture([item]))).toThrowError(
      HttpContractError
    )
  })
})

describe('parseResumeListDto', (): void => {
  it('rejects fields outside the frozen pagination envelope', (): void => {
    /** @brief 合法分页元数据 / Valid page metadata. */
    const page = { has_more: false, next_cursor: null, total_estimate: 1 }
    expect(parseResumeListDto({ items: [resumeDocumentFixture()], page }).items[0]?.id).toBe(
      'res_example'
    )
    expect(() =>
      parseResumeListDto({ items: [resumeDocumentFixture()], page, renderer_private: true })
    ).toThrowError(HttpContractError)
  })
})

/**
 * @brief 构造 operation result 允许的通用 Job / Build a generic Job allowed in an operation result.
 * @return 可按测试覆写的合法 Job / Valid Job suitable for test overrides.
 */
function genericJobFixture(): Record<string, unknown> {
  return {
    created_at: '2026-07-19T00:00:00Z',
    error: null,
    expires_at: null,
    extensions: {},
    finished_at: null,
    id: 'job_operation_result',
    job_type: 'resume.optimize',
    progress: {
      completed_units: 0,
      message: null,
      percent: 0,
      phase: 'awaiting_capacity',
      total_units: 1
    },
    request_id: 'request_operation_1234',
    started_at: null,
    status: 'awaiting_capacity'
  }
}

describe('parseResumeOperationBatchResultDto', (): void => {
  it('projects only stable safe fields from a rejected operation problem', (): void => {
    const result = parseResumeOperationBatchResultDto({
      new_revision: 4,
      normalized_document: null,
      previous_revision: 4,
      results: [
        {
          operation_id: 'op_example_12345678',
          problem: {
            code: 'resume.revision_conflict',
            detail: 'private rejected value',
            retryable: true,
            status: 412,
            title: 'private title',
            type: 'urn:aiws:error:resume:revision_conflict'
          },
          status: 'rejected'
        }
      ],
      resume_id: 'res_example_12345678'
    })

    expect(result.results[0]?.problem).toEqual({
      code: 'resume.revision_conflict',
      retryable: true,
      status: 412
    })
    expect(JSON.stringify(result)).not.toContain('private')
  })

  it.each([
    [{ code: 'INVALID CODE' }],
    [{ status: 200 }],
    [{ retryable: 'yes' }],
    [{ type: undefined }],
    [{ title: undefined }],
    [{ unexpected: true }]
  ])('rejects an invalid operation problem projection', (problem): void => {
    /** @brief 完整合法 ProblemDetails 加当前非法覆盖 / Complete valid ProblemDetails with the current invalid override. */
    const invalidProblem = {
      code: 'resume.invalid',
      retryable: false,
      status: 422,
      title: 'private title',
      type: 'urn:aiws:error:resume:invalid',
      ...problem
    }
    expect(() =>
      parseResumeOperationBatchResultDto({
        new_revision: 4,
        normalized_document: null,
        previous_revision: 4,
        results: [
          {
            operation_id: 'op_example_12345678',
            problem: invalidProblem,
            status: 'rejected'
          }
        ],
        resume_id: 'res_example_12345678'
      })
    ).toThrowError(HttpContractError)
  })

  it.each([0, -1, 1.5])(
    'rejects operation revision %s outside the positive-integer contract',
    (revision): void => {
      expect(() =>
        parseResumeOperationBatchResultDto({
          new_revision: revision,
          normalized_document: null,
          previous_revision: 4,
          results: [
            {
              operation_id: 'op_example_12345678',
              problem: null,
              status: 'applied'
            }
          ],
          resume_id: 'res_example_12345678'
        })
      ).toThrowError(HttpContractError)
    }
  )

  it('accepts a strict generic render_job while preserving its open stable codes', (): void => {
    expect(() =>
      parseResumeOperationBatchResultDto({
        new_revision: 5,
        normalized_document: null,
        previous_revision: 4,
        render_job: genericJobFixture(),
        results: [
          {
            operation_id: 'op_example_12345678',
            problem: null,
            status: 'applied'
          }
        ],
        resume_id: 'res_example_12345678'
      })
    ).not.toThrow()
  })

  it.each([
    ['unknown property', { ...genericJobFixture(), renderer_private: true }],
    ['missing required ID', { ...genericJobFixture(), id: undefined }],
    ['invalid open job type', { ...genericJobFixture(), job_type: 'Resume Optimize' }],
    ['invalid timestamp', { ...genericJobFixture(), created_at: 'yesterday' }],
    ['short request ID', { ...genericJobFixture(), request_id: 'short' }],
    [
      'unknown progress property',
      {
        ...genericJobFixture(),
        progress: {
          ...(genericJobFixture().progress as Record<string, unknown>),
          renderer_private: true
        }
      }
    ],
    [
      'out-of-range progress',
      {
        ...genericJobFixture(),
        progress: { ...(genericJobFixture().progress as Record<string, unknown>), percent: 101 }
      }
    ],
    [
      'malformed nested ProblemDetails',
      {
        ...genericJobFixture(),
        error: { code: 'job.failed', retryable: false, status: 500 }
      }
    ]
  ] as const)('rejects operation render_job with %s', (_caseName, renderJob): void => {
    expect(() =>
      parseResumeOperationBatchResultDto({
        new_revision: 5,
        normalized_document: null,
        previous_revision: 4,
        render_job: renderJob,
        results: [
          {
            operation_id: 'op_example_12345678',
            problem: null,
            status: 'applied'
          }
        ],
        resume_id: 'res_example_12345678'
      })
    ).toThrowError(HttpContractError)
  })
})

/**
 * @brief 构造完整合法的 Render Job transport 值 / Build a complete valid Render Job transport value.
 * @return 可按测试覆盖的 Render Job JSON / Render Job JSON suitable for test overrides.
 */
function renderJobFixture(): Record<string, unknown> {
  return {
    artifacts: [
      {
        content_type: 'application/pdf',
        created_at: '2026-07-19T00:00:00Z',
        download_url: 'https://api.example.test/api/v1/render-artifacts/artifact_example/content',
        expires_at: null,
        extensions: {},
        format: 'pdf',
        id: 'artifact_example',
        page_count: 2,
        resume_id: 'res_example_12345678',
        resume_revision: 4,
        revision: 1,
        sha256: 'a'.repeat(64),
        size_bytes: 2_048,
        source_map_artifact_id: null,
        updated_at: '2026-07-19T00:00:00Z'
      }
    ],
    created_at: '2026-07-19T00:00:00Z',
    diagnostics: [],
    error: null,
    expires_at: null,
    extensions: {},
    finished_at: null,
    id: 'job_render_example',
    job_type: 'resume.render',
    progress: {
      completed_units: 0,
      message: null,
      percent: 0,
      phase: 'queued',
      total_units: 1
    },
    request_id: 'request_render_12345678',
    resume_id: 'res_example_12345678',
    resume_revision: 4,
    started_at: null,
    status: 'queued'
  }
}

/**
 * @brief 构造冻结 ResumeOperation oneOf 的全部合法分支 / Build every valid branch of the frozen ResumeOperation oneOf.
 * @return 十种可嵌入 RenderDiagnostic 的 operations / Ten operations suitable for embedding in a RenderDiagnostic.
 */
function resumeOperationFixtures(): readonly Record<string, unknown>[] {
  /** @brief 包含嵌套条目的合法权威文档 / Valid authoritative document containing a nested item. */
  const document = resumeDocumentFixture([resumeItemFixtures()[0]])
  /** @brief 文档中的首个区段 / First section in the document. */
  const section = (document.sections as readonly Record<string, unknown>[])[0] ?? {}
  /** @brief 文档中的样式意图 / Style intent from the document. */
  const styleIntent = document.style_intent
  /** @brief 用于 upsert_item 的合法条目 / Valid item used by upsert_item. */
  const item = resumeItemFixtures()[2] ?? {}

  return [
    {
      extensions: { 'vendor.trace': { source: 'renderer' } },
      operation_id: 'op_set_template_01',
      op: 'set_template',
      style_intent: null,
      template: { template_id: 'tpl_default_v1', template_version: '1.0' }
    },
    {
      after_section_id: null,
      operation_id: 'op_upsert_section_01',
      op: 'upsert_section',
      section
    },
    {
      operation_id: 'op_remove_section_01',
      op: 'remove_section',
      section_id: 'sec_summary'
    },
    {
      after_section_id: null,
      operation_id: 'op_move_section_01',
      op: 'move_section',
      section_id: 'sec_summary'
    },
    {
      after_item_id: null,
      item,
      operation_id: 'op_upsert_item_01',
      op: 'upsert_item',
      section_id: 'sec_summary'
    },
    {
      item_id: 'item_project_01',
      operation_id: 'op_remove_item_01',
      op: 'remove_item',
      section_id: 'sec_summary'
    },
    {
      after_item_id: null,
      from_section_id: 'sec_summary',
      item_id: 'item_project_01',
      operation_id: 'op_move_item_0001',
      op: 'move_item',
      to_section_id: 'sec_experience'
    },
    {
      field_path: ['presentation', 'headline'],
      operation_id: 'op_set_field_0001',
      op: 'set_field',
      target: { entity_type: 'section', item_id: null, section_id: 'sec_summary' },
      value: {
        enabled: true,
        labels: ['primary', null],
        nested: { count: 2.5 },
        title: '平台工程师'
      }
    },
    {
      operation_id: 'op_set_style_intent_01',
      op: 'set_style_intent',
      style_intent: styleIntent
    },
    {
      document,
      operation_id: 'op_replace_document_01',
      op: 'replace_document'
    }
  ]
}

/**
 * @brief 构造携带建议 operations 的 Render Job / Build a Render Job carrying suggested operations.
 * @param operations 待校验的建议 operations / Suggested operations to validate.
 * @return 通过公开解析入口消费的 Render Job / Render Job consumed through the public parser.
 */
function renderJobWithSuggestedOperations(operations: readonly unknown[]): Record<string, unknown> {
  return {
    ...renderJobFixture(),
    diagnostics: [
      {
        code: 'resume.layout_overflow',
        field_path: ['sections'],
        message: {
          fallback_message: '内容超出页面范围。',
          message_key: 'resume.render.layout_overflow'
        },
        node_ref: null,
        page: 2,
        severity: 'warning',
        suggested_operations: operations
      }
    ]
  }
}

/**
 * @brief 构造关键非法 ResumeOperation 用例 / Build key invalid ResumeOperation cases.
 * @return 用例名称与非法 operation / Case names paired with invalid operations.
 */
function invalidResumeOperationFixtures(): readonly (readonly [string, Record<string, unknown>])[] {
  /** @brief 合法 operation 基线 / Valid operation baselines. */
  const operations = resumeOperationFixtures()
  /** @brief 各类分支基线 / Baselines for representative branches. */
  const setTemplate = operations[0] ?? {}
  const upsertSection = operations[1] ?? {}
  const removeSection = operations[2] ?? {}
  const upsertItem = operations[4] ?? {}
  const setField = operations[7] ?? {}
  const setStyleIntent = operations[8] ?? {}
  const replaceDocument = operations[9] ?? {}
  /** @brief 各分支的嵌套对象 / Nested objects from the representative branches. */
  const section = upsertSection.section as Record<string, unknown>
  const item = upsertItem.item as Record<string, unknown>
  const styleIntent = setStyleIntent.style_intent as Record<string, unknown>
  const document = replaceDocument.document as Record<string, unknown>

  return [
    ['unknown oneOf discriminant', { ...removeSection, op: 'future_operation' }],
    ['operation extra property', { ...removeSection, renderer_private: true }],
    ['null required TemplateRef', { ...setTemplate, template: null }],
    [
      'nested ResumeSection extra property',
      { ...upsertSection, section: { ...section, renderer_private: true } }
    ],
    [
      'nested ResumeItem variant mismatch',
      { ...upsertItem, item: { ...item, organization: 'Not valid for project' } }
    ],
    [
      'closed EntityTarget enum extension',
      { ...setField, target: { entity_type: 'future_entity' } }
    ],
    ['empty required field path', { ...setField, field_path: [] }],
    ['invalid field path segment', { ...setField, field_path: ['valid', 'not-valid'] }],
    [
      'field path over maxItems',
      { ...setField, field_path: Array.from({ length: 21 }, () => 'segment') }
    ],
    [
      'out-of-range style density',
      { ...setStyleIntent, style_intent: { ...styleIntent, density: 1.01 } }
    ],
    [
      'out-of-range replacement revision',
      { ...replaceDocument, document: { ...document, revision: 0 } }
    ],
    ['explicit null non-nullable extensions', { ...removeSection, extensions: null }]
  ]
}

describe('parseResumeRenderJobDto', (): void => {
  it('accepts a complete schema-valid Render Job and Artifact', (): void => {
    /** @brief 携带大小写与参数的合法 PDF 声明 / Valid PDF declaration carrying casing and parameters. */
    const job = renderJobFixture()
    const artifacts = job.artifacts as Record<string, unknown>[]
    artifacts[0] = { ...artifacts[0], content_type: 'Application/PDF; version=1.7' }

    expect(parseResumeRenderJobDto(job)).toMatchObject({
      id: 'job_render_example',
      resume_revision: 4,
      status: 'queued'
    })
  })

  it.each(
    resumeOperationFixtures().map((operation): readonly [string, Record<string, unknown>] => [
      String(operation.op),
      operation
    ])
  )('accepts the frozen %s suggested-operation branch', (_operationKind, operation): void => {
    /** @brief 解析前 operation 的 JSON 内容 / JSON content of the operation before parsing. */
    const before = JSON.stringify(operation)
    expect(() =>
      parseResumeRenderJobDto(renderJobWithSuggestedOperations([operation]))
    ).not.toThrow()
    expect(JSON.stringify(operation)).toBe(before)
  })

  it('distinguishes an explicit null JSON value from a missing required set_field value', (): void => {
    /** @brief 合法 set_field 基线 / Valid set_field baseline. */
    const setField = resumeOperationFixtures()[7] ?? {}
    /** @brief 明确把字段值清空为 null 的合法 operation / Valid operation explicitly clearing the field to null. */
    const explicitNull = { ...setField, value: null }
    /** @brief 完全缺失 required value 的非法 operation / Invalid operation entirely missing required value. */
    const missingValue = { ...setField }
    delete missingValue.value

    expect(() =>
      parseResumeRenderJobDto(renderJobWithSuggestedOperations([explicitNull]))
    ).not.toThrow()
    expect(() =>
      parseResumeRenderJobDto(renderJobWithSuggestedOperations([missingValue]))
    ).toThrowError(HttpContractError)
  })

  it('accepts both omitted and explicitly null optional style_intent', (): void => {
    /** @brief 明确 style_intent 为 null 的合法 set_template / Valid set_template with an explicit null style_intent. */
    const explicitNull = resumeOperationFixtures()[0] ?? {}
    /** @brief 省略可选 style_intent 的合法 set_template / Valid set_template omitting optional style_intent. */
    const omitted = { ...explicitNull }
    delete omitted.style_intent

    expect(() =>
      parseResumeRenderJobDto(renderJobWithSuggestedOperations([explicitNull, omitted]))
    ).not.toThrow()
  })

  it.each(invalidResumeOperationFixtures())(
    'rejects a suggested operation with %s',
    (_caseName, operation): void => {
      expect(() =>
        parseResumeRenderJobDto(renderJobWithSuggestedOperations([operation]))
      ).toThrowError(HttpContractError)
    }
  )

  it.each([
    ['undefined', undefined],
    ['non-finite number', Number.NaN],
    ['non-JSON object', new Date('2026-07-19T00:00:00Z')],
    ['sparse array', Array(1)]
  ] as const)('rejects a set_field %s value', (_caseName, invalidValue): void => {
    /** @brief 携带非法 JSON 值的 set_field / set_field carrying an invalid JSON value. */
    const operation = { ...(resumeOperationFixtures()[7] ?? {}), value: invalidValue }
    expect(() =>
      parseResumeRenderJobDto(renderJobWithSuggestedOperations([operation]))
    ).toThrowError(HttpContractError)
  })

  it('rejects a cyclic set_field JSON value', (): void => {
    /** @brief 自引用的非法 JSON 对象 / Self-referential invalid JSON object. */
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    /** @brief 携带循环值的 set_field / set_field carrying the cyclic value. */
    const operation = { ...(resumeOperationFixtures()[7] ?? {}), value: cyclic }
    expect(() =>
      parseResumeRenderJobDto(renderJobWithSuggestedOperations([operation]))
    ).toThrowError(HttpContractError)
  })

  it('rejects more than twenty suggested operations', (): void => {
    /** @brief 超过冻结 maxItems 的建议 operations / Suggested operations exceeding the frozen maxItems. */
    const operations = Array.from({ length: 21 }, () => resumeOperationFixtures()[2])
    expect(() =>
      parseResumeRenderJobDto(renderJobWithSuggestedOperations(operations))
    ).toThrowError(HttpContractError)
  })

  it('normalizes omitted optional Artifact fields to the existing null transport projection', (): void => {
    /** @brief 待移除可选字段的 Render Job / Render Job whose optional artifact fields will be removed. */
    const job = renderJobFixture()
    /** @brief 基准 artifact / Baseline artifact. */
    const artifact = (job.artifacts as readonly Record<string, unknown>[])[0] ?? {}
    /** @brief 仅保留冻结契约必需字段的 artifact / Artifact retaining only frozen-contract required fields. */
    const requiredArtifact = { ...artifact }
    delete requiredArtifact.expires_at
    delete requiredArtifact.extensions
    delete requiredArtifact.page_count
    delete requiredArtifact.source_map_artifact_id

    expect(
      parseResumeRenderJobDto({ ...job, artifacts: [requiredArtifact] }).artifacts[0]
    ).toMatchObject({
      expires_at: null,
      page_count: null,
      source_map_artifact_id: null
    })
  })

  it('preserves a future schema-valid Render Job status as an open-enum value', (): void => {
    expect(
      parseResumeRenderJobDto({ ...renderJobFixture(), status: 'awaiting_capacity' })
    ).toMatchObject({ status: 'awaiting_capacity' })
  })

  it('rejects a PDF artifact that declares an executable media type', (): void => {
    /** @brief 携带非 PDF 媒体类型的 Render Job / Render Job carrying a non-PDF media type. */
    const job = renderJobFixture()
    /** @brief 被测 artifact 数组 / Artifact array under test. */
    const artifacts = job.artifacts as Record<string, unknown>[]
    artifacts[0] = { ...artifacts[0], content_type: 'text/html' }

    expect(() => parseResumeRenderJobDto(job)).toThrowError(
      'Backend PDF artifact must declare the application/pdf media type.'
    )
  })

  it.each([
    ['fractional Resume revision', { resume_revision: 1.5 }],
    ['wrong job type', { job_type: 'knowledge.ingest' }],
    ['unknown property', { unexpected: true }],
    ['invalid timestamp', { created_at: 'yesterday' }],
    ['invalid status code', { status: 'WAITING NOW' }]
  ] as const)('rejects a Render Job with %s', (_caseName, override): void => {
    expect(() => parseResumeRenderJobDto({ ...renderJobFixture(), ...override })).toThrowError(
      HttpContractError
    )
  })

  it.each([
    ['relative download URI', { download_url: '/api/v1/render-artifacts/a/content' }],
    ['invalid digest', { sha256: 'not-a-digest' }],
    ['negative size', { size_bytes: -1 }],
    ['fractional page count', { page_count: 1.5 }],
    ['unknown format', { format: 'rtf' }],
    ['unknown property', { unexpected: true }]
  ] as const)('rejects an Artifact with %s', (_caseName, artifactOverride): void => {
    /** @brief 当前用例覆盖后的 artifact / Artifact after applying the current case override. */
    const job = renderJobFixture()
    /** @brief 基准 artifact / Baseline artifact. */
    const artifact = (job.artifacts as readonly Record<string, unknown>[])[0]
    expect(() =>
      parseResumeRenderJobDto({
        ...job,
        artifacts: [{ ...artifact, ...artifactOverride }]
      })
    ).toThrowError(HttpContractError)
  })
})
