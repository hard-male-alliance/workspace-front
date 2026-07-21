import { describe, expect, it } from 'vitest'

import { HttpContractError } from '../../../../infrastructure/http/http-client'
import { parseResumeDocumentDto, parseTemplateManifestListDto } from './validators'

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

describe('parseTemplateManifestListDto', (): void => {
  it('accepts the backend template catalog envelope', (): void => {
    const result = parseTemplateManifestListDto({
      items: [templateManifest],
      page: { has_more: false, next_cursor: null, total_estimate: 1 }
    })

    expect(result.items[0]?.id).toBe('tpl_default_v1')
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
})

describe('parseResumeDocumentDto', (): void => {
  it('accepts the backend minimal ResumeDocument snapshot', (): void => {
    const measurement = { unit: 'mm', value: 18 }
    const color = (value: string): { readonly space: string; readonly value: string } => ({
      space: 'srgb_hex',
      value
    })

    const result = parseResumeDocumentDto({
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
          content: null,
          extensions: {},
          items: [],
          kind: 'summary',
          section_id: 'sec_summary',
          title: '简介',
          visible: true
        }
      ],
      style_intent: {
        bullet_style_token: 'bullet.default',
        date_format_token: 'yyyy_mm',
        density: 0.5,
        extensions: {},
        page: {
          custom_height: null,
          custom_width: null,
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
    })

    expect(result.id).toBe('res_example')
    expect(result.template).toEqual({ template_id: 'tpl_default_v1', template_version: '1.0' })
    expect(result.sections[0]?.section_id).toBe('sec_summary')
  })
})
