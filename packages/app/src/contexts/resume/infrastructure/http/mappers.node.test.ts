import { describe, expect, it } from 'vitest'

import type {
  ResumeDateRangeDto,
  ResumeDocumentDto,
  ResumeItemDto,
  ResumePartialDateDto,
  TemplateManifestDto
} from './transport-types'
import { mapResumeDocumentDto, mapResumeStyleIntentToDto, mapTemplateManifestDto } from './mappers'

const templateDto: TemplateManifestDto = {
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
  font_family_tokens: ['body.default'],
  id: 'tpl_default_v1',
  name: 'AIWS Classic',
  preview_asset_url: 'https://example.test/preview.png',
  revision: 1,
  settings: [
    {
      choices: [],
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
    }
  ],
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
}

describe('mapTemplateManifestDto', (): void => {
  it('keeps an arbitrary manifest preview URL out of the UI projection without a trusted-origin policy', (): void => {
    const result = mapTemplateManifestDto(templateDto)

    expect(result).toMatchObject({
      id: 'tpl_default_v1',
      name: 'AIWS Classic',
      supportedLocales: ['zh-CN', 'en-US'],
      supportedOutputFormats: ['pdf'],
      version: '1.0'
    })
    expect(result.zones[0]).toEqual({
      acceptedSectionKinds: ['summary'],
      id: 'main',
      labelKey: 'template.zone.main',
      maxSections: 100
    })
    expect(result.settings[0]).toMatchObject({
      defaultValue: { unit: 'mm', value: 8 },
      groupKey: 'template.groups.appearance',
      visibleWhen: { equals: true, key: 'show_advanced' }
    })
    expect(result).not.toHaveProperty('previewAssetUrl')
  })

  it('preserves arbitrary JSON setting values and future section-kind codes', (): void => {
    /** @brief 不应被表示层 DTO 改写的递归 JSON 值 / Recursive JSON value that the presentation DTO must not rewrite. */
    const futureValue = { fallback: null, layout: ['wide', { columns: 3 }] }
    /** @brief 携带开放值的合法清单 / Valid manifest carrying open values. */
    const futureDto: TemplateManifestDto = {
      ...templateDto,
      settings: [
        {
          ...templateDto.settings[0]!,
          choices: [{ description_key: null, label_key: 'template.future', value: futureValue }],
          default: futureValue,
          visible_when: { equals: ['future', { revision: 2 }], key: 'layout_mode' }
        }
      ],
      supported_section_kinds: ['summary', 'vendor.timeline'],
      zones: [
        {
          ...templateDto.zones[0]!,
          accepted_section_kinds: ['summary', 'vendor.timeline']
        }
      ]
    }

    const result = mapTemplateManifestDto(futureDto)

    expect(result.settings[0]).toMatchObject({
      choices: [{ descriptionKey: null, labelKey: 'template.future', value: futureValue }],
      defaultValue: futureValue,
      visibleWhen: { equals: ['future', { revision: 2 }], key: 'layout_mode' }
    })
    expect(result.supportedSectionKinds).toEqual(['summary', 'vendor.timeline'])
    expect(result.zones[0]?.acceptedSectionKinds).toEqual(['summary', 'vendor.timeline'])
  })
})

/**
 * @brief 构造 mapper 使用的 ResumeDocument DTO / Build the ResumeDocument DTO used by mapper tests.
 * @return 合法的领域映射输入 / Valid domain-mapping input.
 */
function resumeDtoFixture(): ResumeDocumentDto {
  /** @brief 合法测量值 / Valid measurement. */
  const measurement = { unit: 'mm', value: 18 }
  /** @brief 构造合法颜色 / Build a valid color. */
  const color = (value: string): { readonly space: string; readonly value: string } => ({
    space: 'srgb_hex',
    value
  })
  return {
    created_at: '2026-07-19T00:00:00Z',
    id: 'res_example',
    knowledge_source_id: 'ks_example',
    locale: 'zh-CN',
    profile: {
      contacts: [{ is_public: true, kind: 'email', label: null, value: 'student@example.test' }],
      full_name: '张同学',
      headline: '前端开发实习生',
      summary: { plain_text: '关注可靠、易用的产品体验。' }
    },
    revision: 2,
    schema_version: '1.0',
    sections: [
      {
        content: { plain_text: '关注可靠、易用的产品体验。' },
        items: [],
        kind: 'vendor.timeline',
        section_id: 'sec_summary',
        title: '个人简介',
        visible: true
      }
    ],
    style_intent: {
      bullet_style_token: 'bullet.default',
      date_format_token: 'yyyy_mm',
      density: 0.5,
      extensions: { 'vendor.layout': { keep: true } },
      page: {
        custom_height: { unit: 'px', value: 1120 },
        custom_width: { unit: 'px', value: 800 },
        margins: { bottom: measurement, left: measurement, right: measurement, top: measurement },
        max_pages: 2,
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
    updated_at: '2026-07-19T00:02:00Z',
    workspace_id: 'ws_example'
  }
}

describe('mapResumeDocumentDto', (): void => {
  it('maps a ResumeDocument and preserves an open future section-kind code', (): void => {
    /** @brief 合法 ResumeDocument DTO / Valid ResumeDocument DTO. */
    const dto = resumeDtoFixture()

    const result = mapResumeDocumentDto(dto)

    expect(result).toMatchObject({
      id: 'res_example',
      knowledgeSourceId: 'ks_example',
      profile: { fullName: '张同学', summary: '关注可靠、易用的产品体验。' },
      revision: 2,
      template: { templateId: 'tpl_default_v1', templateVersion: '1.0' },
      workspaceId: 'ws_example'
    })
    expect(result.sections[0]).toMatchObject({
      contentPreview: '关注可靠、易用的产品体验。',
      id: 'sec_summary',
      kind: 'vendor.timeline'
    })
    expect(result.styleIntent).toMatchObject({
      extensions: { 'vendor.layout': { keep: true } },
      page: {
        customHeight: { unit: 'px', value: 1120 },
        customWidth: { unit: 'px', value: 800 }
      }
    })
    expect(mapResumeStyleIntentToDto(result.styleIntent)).toMatchObject({
      extensions: { 'vendor.layout': { keep: true } },
      page: {
        custom_height: { unit: 'px', value: 1120 },
        custom_width: { unit: 'px', value: 800 }
      }
    })
  })

  it('maps each ResumeItem variant from its frozen fields without legacy date guesses', (): void => {
    /** @brief 基准 ResumeDocument DTO / Baseline ResumeDocument DTO. */
    const dto = resumeDtoFixture()
    /** @brief 构造月精度日期 / Build a month-precision date. */
    const month = (year: number, value: number): ResumePartialDateDto => ({
      day: null,
      month: value,
      precision: 'month',
      year
    })
    /** @brief 已完成日期范围 / Completed date range. */
    const completedRange: ResumeDateRangeDto = {
      display_override: null,
      end: month(2022, 12),
      is_current: false,
      start: month(2020, 7)
    }
    /** @brief 服务端本地化的当前日期范围 / Server-localized current date range. */
    const currentRange: ResumeDateRangeDto = {
      display_override: '2023.03 — 至今',
      end: null,
      is_current: true,
      start: month(2023, 3)
    }
    /** @brief 构造富文本投影 / Build a RichText projection. */
    const text = (plain_text: string): { readonly plain_text: string } => ({ plain_text })
    /** @brief 全部十种 ResumeItem DTO / All ten ResumeItem DTO variants. */
    const items: readonly ResumeItemDto[] = [
      {
        date_range: currentRange,
        description: text('经历描述'),
        highlights: [text('经历要点')],
        item_id: 'item_experience',
        item_kind: 'experience',
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
        highlights: [text('教育要点')],
        institution: '示例大学',
        item_id: 'item_education',
        item_kind: 'education',
        location: 'Shanghai',
        score: 'GPA 3.9',
        tags: [],
        visible: true
      },
      {
        date_range: completedRange,
        description: text('项目描述'),
        highlights: [],
        item_id: 'item_project_01',
        item_kind: 'project',
        name: 'AI Workspace',
        role: '维护者',
        tags: ['React'],
        technologies: ['Electron', 'React'],
        visible: true
      },
      {
        item_id: 'item_skill_group',
        item_kind: 'skill_group',
        name: '核心能力',
        proficiency: 'advanced',
        skills: ['TypeScript', '分布式系统'],
        tags: [],
        visible: true
      },
      {
        authors: ['Klee'],
        description: text('论文摘要'),
        item_id: 'item_publication',
        item_kind: 'publication',
        published_at: month(2025, 6),
        publisher: 'Example Journal',
        tags: [],
        title: 'Executable Boundaries',
        visible: true
      },
      {
        awarded_at: month(2024, 11),
        description: text('获奖说明'),
        issuer: 'Example Foundation',
        item_id: 'item_award_0001',
        item_kind: 'award',
        tags: [],
        title: '工程卓越奖',
        visible: true
      },
      {
        credential_id: 'CERT-2024-001',
        expires_at: month(2027, 4),
        issued_at: month(2024, 4),
        issuer: 'Example Institute',
        item_id: 'item_certification',
        item_kind: 'certification',
        name: '云架构认证',
        tags: [],
        visible: true
      },
      {
        certificate: 'CEFR C2',
        item_id: 'item_language_01',
        item_kind: 'language',
        language: 'English',
        proficiency: 'fluent',
        tags: [],
        visible: true
      },
      {
        date_range: currentRange,
        description: null,
        highlights: [text('志愿要点')],
        item_id: 'item_volunteer',
        item_kind: 'volunteer',
        organization: 'Open Source Community',
        role: '维护者',
        tags: [],
        visible: true
      },
      {
        content: text('自定义内容'),
        date_range: completedRange,
        item_id: 'item_custom_001',
        item_kind: 'custom',
        subtitle: '自定义副标题',
        tags: [],
        title: '自定义标题',
        visible: true
      }
    ]
    /** @brief 带全部条目的 DTO / DTO carrying every item variant. */
    const document: ResumeDocumentDto = {
      ...dto,
      sections: [{ ...dto.sections[0]!, items }]
    }
    /** @brief 按 kind 索引的 UI 条目 / UI items indexed by kind. */
    const mapped = Object.fromEntries(
      mapResumeDocumentDto(document).sections[0]!.items.map((item) => [item.kind, item])
    )

    expect(mapped.experience).toMatchObject({
      dateLabel: '2023.03 — 至今',
      highlights: ['经历描述', '经历要点'],
      subtitle: 'Arcadia Systems',
      title: '平台工程师'
    })
    expect(mapped.education).toMatchObject({
      dateLabel: '2020-07 – 2022-12',
      subtitle: '示例大学',
      title: '工学硕士 · 计算机科学'
    })
    expect(mapped.project).toMatchObject({
      dateLabel: '2020-07 – 2022-12',
      tags: ['React', 'Electron'],
      title: 'AI Workspace'
    })
    expect(mapped.skill_group).toMatchObject({ highlights: ['TypeScript', '分布式系统'] })
    expect(mapped.publication).toMatchObject({
      dateLabel: '2025-06',
      title: 'Executable Boundaries'
    })
    expect(mapped.award).toMatchObject({ dateLabel: '2024-11', title: '工程卓越奖' })
    expect(mapped.certification).toMatchObject({ dateLabel: '2024-04 – 2027-04' })
    expect(mapped.language).toMatchObject({ highlights: ['CEFR C2'], subtitle: 'fluent' })
    expect(mapped.volunteer).toMatchObject({ dateLabel: '2023.03 — 至今', title: '维护者' })
    expect(mapped.custom).toMatchObject({
      dateLabel: '2020-07 – 2022-12',
      highlights: ['自定义内容'],
      title: '自定义标题'
    })
  })
})
