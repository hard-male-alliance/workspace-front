import { describe, expect, it } from 'vitest'

import type { ResumeDocumentDto, TemplateManifestDto } from './transport-types'
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
  it('maps the formal manifest without inventing a preview asset', (): void => {
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

describe('mapResumeDocumentDto', (): void => {
  it('maps a ResumeDocument into the existing editor document model', (): void => {
    const measurement = { unit: 'mm', value: 18 }
    const color = (value: string): { readonly space: string; readonly value: string } => ({
      space: 'srgb_hex',
      value
    })
    const dto: ResumeDocumentDto = {
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
          kind: 'summary',
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
      kind: 'summary'
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
})
