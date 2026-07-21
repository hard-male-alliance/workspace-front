import { describe, expect, it } from 'vitest'

import type {
  KnowledgeIngestionJobDto,
  KnowledgeSearchResultDto,
  KnowledgeSourceDto,
  ResumeDocumentDto,
  TemplateManifestDto
} from './transport-types'
import {
  mapKnowledgeIngestionJobDto,
  mapKnowledgeSearchResultDto,
  mapKnowledgeSourceDto,
  mapResumeDocumentDto,
  mapTemplateManifestDto
} from './mappers'

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
  settings: [],
  supported_locales: ['zh-CN', 'en-US'],
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
      previewAssetUrl: null,
      supportedLocales: ['zh-CN', 'en-US'],
      version: '1.0'
    })
    expect(result.zones[0]).toEqual({
      acceptedSectionKinds: ['summary'],
      id: 'main',
      labelKey: 'template.zone.main',
      maxSections: 100
    })
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
        page: {
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
  })
})

describe('mapKnowledgeSourceDto', (): void => {
  it('maps ingestion counts, visibility and a safe origin label', (): void => {
    const dto: KnowledgeSourceDto = {
      config: { resume_id: 'res_example', revision_mode: 'latest', source_type: 'resume' },
      created_at: '2026-07-19T00:00:00Z',
      enabled: true,
      id: 'ks_example',
      ingestion: {
        chunk_count: 3,
        document_count: 1,
        last_success_at: '2026-07-19T00:01:00Z',
        status: 'ready'
      },
      name: '我的简历',
      revision: 1,
      source_type: 'resume',
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

    const result = mapKnowledgeSourceDto(dto)

    expect(result).toMatchObject({
      chunkCount: 3,
      documentCount: 1,
      id: 'ks_example',
      ingestionStatus: 'ready',
      originLabel: 'res_example',
      sourceType: 'resume',
      workspaceId: 'ws_example'
    })
    expect(result.visibility.agentGrants[0]).toEqual({
      agentScope: 'resume_assistant',
      allowedOperations: ['retrieve', 'derive'],
      effect: 'allow'
    })
  })
})

describe('Knowledge ingestion and search mappings', (): void => {
  it('maps a failed ingestion Job into a safe domain status', (): void => {
    const dto: KnowledgeIngestionJobDto = {
      created_at: '2026-07-20T00:00:00Z',
      error: {
        code: 'knowledge.file_encoding_invalid',
        detail: 'The file is not valid UTF-8.',
        status: 422,
        title: 'Knowledge file encoding is invalid'
      },
      expires_at: null,
      finished_at: '2026-07-20T00:01:00Z',
      id: 'job_knowledge_12345678',
      job_type: 'knowledge.ingest',
      progress: { completed_units: 0, percent: null, phase: 'processing', total_units: 1 },
      request_id: 'request_12345678',
      source_id: 'source_knowledge_12345678',
      source_version_id: 'version_knowledge_12345678',
      started_at: '2026-07-20T00:00:10Z',
      stats: { chunks: 0, documents: 0, embedded_tokens: 0, skipped: 1 },
      status: 'failed'
    }

    expect(mapKnowledgeIngestionJobDto(dto)).toMatchObject({
      errorCode: 'knowledge.file_encoding_invalid',
      id: 'job_knowledge_12345678',
      progressPercent: null,
      sourceId: 'source_knowledge_12345678',
      status: 'failed'
    })
  })

  it('formats a safe line locator for a Knowledge search result', (): void => {
    const dto: KnowledgeSearchResultDto = {
      citation: {
        citation_id: 'citation_knowledge_12345678',
        locator: {
          line_end: 18,
          line_start: 12,
          page: null,
          path: 'notes.md',
          symbol: null,
          time_end_ms: null,
          time_start_ms: null
        },
        quote: 'A grounded result.',
        score: 0.9,
        source_id: 'source_knowledge_12345678',
        source_version_id: 'version_knowledge_12345678',
        title: 'notes.md',
        uri: null
      },
      metadata: {},
      result_id: 'result_knowledge_12345678',
      score: 0.9,
      text: 'A grounded result.'
    }

    expect(mapKnowledgeSearchResultDto(dto)).toEqual({
      id: 'result_knowledge_12345678',
      locatorLabel: 'notes.md · lines 12–18',
      quote: 'A grounded result.',
      score: 0.9,
      sourceId: 'source_knowledge_12345678',
      title: 'notes.md'
    })
  })
})
