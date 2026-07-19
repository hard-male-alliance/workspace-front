import { describe, expect, it } from 'vitest'

import { HttpContractError } from './http-client'
import {
  parseKnowledgeSourceListDto,
  parseResumeDocumentDto,
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

describe('parseKnowledgeSourceListDto', (): void => {
  it('accepts a Resume-derived KnowledgeSource envelope', (): void => {
    const result = parseKnowledgeSourceListDto({
      items: [
        {
          config: {
            pinned_revision: null,
            resume_id: 'res_example',
            revision_mode: 'latest',
            source_type: 'resume'
          },
          created_at: '2026-07-19T00:00:00Z',
          enabled: true,
          extensions: {},
          id: 'ks_example',
          ingestion: {
            active_job_id: null,
            chunk_count: 3,
            document_count: 1,
            indexed_version_id: 'ksv_example',
            last_error: null,
            last_success_at: '2026-07-19T00:01:00Z',
            status: 'ready'
          },
          name: '我的简历',
          revision: 1,
          source_type: 'resume',
          sync_schedule: null,
          updated_at: '2026-07-19T00:01:00Z',
          visibility: {
            agent_grants: [
              {
                agent_scope: 'resume_assistant',
                allowed_operations: ['retrieve', 'derive'],
                effect: 'allow'
              }
            ],
            allow_external_model_processing: false,
            allowed_model_regions: ['cn'],
            default_effect: 'deny',
            policy_version: 1,
            retention_days: null,
            sensitivity: 'confidential',
            session_override_allowed: false
          },
          workspace_id: 'ws_example'
        }
      ],
      page: { has_more: false, next_cursor: null, total_estimate: 1 }
    })

    expect(result.items[0]?.source_type).toBe('resume')
    expect(result.items[0]?.ingestion.chunk_count).toBe(3)
    expect(result.items[0]?.visibility.agent_grants[0]?.agent_scope).toBe('resume_assistant')
  })
})
