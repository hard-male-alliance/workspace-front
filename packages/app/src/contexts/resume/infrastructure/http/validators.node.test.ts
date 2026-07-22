import { describe, expect, it } from 'vitest'

import { HttpContractError } from '../../../../infrastructure/http/http-client'
import {
  parseResumeDocumentDto,
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
    })

    expect(result.id).toBe('res_example')
    expect(result.template).toEqual({ template_id: 'tpl_default_v1', template_version: '1.0' })
    expect(result.sections[0]?.section_id).toBe('sec_summary')
    expect(result.style_intent).toMatchObject({
      extensions: { 'vendor.layout': { keep: true } },
      page: {
        custom_height: { unit: 'percent', value: 100 },
        custom_width: { unit: 'px', value: 800 }
      }
    })
  })
})

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
