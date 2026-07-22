import { describe, expect, it } from 'vitest'

import { boundedArray, record } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  assertResumeMatchesTemplate,
  encodeCreateResumeRequest,
  parseResumeDocument,
  type CreateResumeRequest
} from './resume-document'
import { parseTemplateList, parseTemplateManifest, type TemplateManifest } from './template'

/** @brief 测试模板 ID / Template ID used by tests. */
const TEMPLATE_ID = 'template_01K0EXAMPLE00000001'

/** @brief 测试 Workspace ID / Workspace ID used by tests. */
const WORKSPACE_ID = 'workspace_01K0EXAMPLE0000001'

/**
 * @brief 构造合法 measurement / Build a valid measurement.
 * @param value measurement 数值 / Measurement value.
 * @return API v2 Measurement JSON / API v2 Measurement JSON.
 */
function measurement(value: number): Record<string, unknown> {
  return { unit: 'mm', value }
}

/**
 * @brief 构造完整合法 TemplateManifest / Build a complete valid TemplateManifest.
 * @return API v2 TemplateManifest JSON / API v2 TemplateManifest JSON.
 */
function templateManifest(): Record<string, unknown> {
  return {
    bullet_style_tokens: ['disc'],
    capabilities: {
      max_columns: 2,
      supports_custom_sections: true,
      supports_photo: true,
      supports_sidebar: true,
      supports_source_map: true
    },
    date_format_tokens: ['iso'],
    description: 'Production template',
    font_family_tokens: ['inter'],
    id: TEMPLATE_ID,
    name: 'Dawn',
    preview_url: 'https://cdn.example.com/templates/dawn.png',
    published_at: '2026-07-22T12:00:00Z',
    settings: [
      {
        choices: [],
        control: 'switch',
        default: true,
        description_key: null,
        group_key: 'profile',
        key: 'show.photo',
        label_key: 'template.show_photo',
        maximum: null,
        minimum: null,
        value_type: 'boolean',
        visible_when: null
      },
      {
        choices: [],
        control: 'color',
        default: { space: 'srgb_hex', value: '#336699' },
        description_key: null,
        group_key: 'colors',
        key: 'accent.color',
        label_key: 'template.accent_color',
        maximum: null,
        minimum: null,
        value_type: 'color',
        visible_when: { equals: true, key: 'show.photo' }
      }
    ],
    supported_locales: ['en-US', 'zh-CN'],
    supported_output_formats: ['pdf', 'png'],
    supported_page_sizes: ['A4', 'LETTER'],
    supported_section_kinds: ['experience', 'custom'],
    version: '2.4.0',
    zones: [
      {
        accepted_section_kinds: ['experience', 'custom'],
        id: 'main',
        label_key: 'template.zone.main',
        max_sections: 2
      }
    ]
  }
}

/**
 * @brief 构造合法 RichText / Build valid RichText.
 * @param text 正文 / Text body.
 * @return API v2 RichText JSON / API v2 RichText JSON.
 */
function richText(text = 'Lead'): Record<string, unknown> {
  return { marks: [{ end: [...text].length, kind: 'strong', start: 0 }], text }
}

/**
 * @brief 构造完整合法 ResumeDocument / Build a complete valid ResumeDocument.
 * @return API v2 ResumeDocument JSON / API v2 ResumeDocument JSON.
 */
function resumeDocument(): Record<string, unknown> {
  return {
    created_at: '2026-07-22T12:00:00Z',
    id: 'resume_01K0EXAMPLE000000000001',
    knowledge_source_id: null,
    locale: 'en-US',
    profile: {
      contacts: [
        {
          id: 'contact_01K0EXAMPLE000000001',
          kind: 'email',
          label: null,
          url: 'mailto:klee@example.com',
          value: 'klee@example.com'
        }
      ],
      full_name: 'Klee Example',
      headline: 'Computer Scientist',
      summary: richText('A😀B')
    },
    revision: 7,
    sections: [
      {
        content: null,
        id: 'section_01K0EXAMPLE000000001',
        items: [
          {
            date_range: { end: '2026-02', start: '2024-02-29' },
            highlights: [richText()],
            id: 'item_01K0EXAMPLE0000000001',
            kind: 'experience',
            location: 'Singapore',
            organization: 'Example Labs',
            skills: ['TypeScript'],
            subtitle: null,
            summary: null,
            tags: ['frontend'],
            title: 'Staff Engineer',
            url: 'https://example.com/work',
            visible: true
          }
        ],
        kind: 'experience',
        title: 'Experience',
        visible: true
      }
    ],
    style: {
      bullet_style_token: 'disc',
      date_format_token: 'iso',
      density: 0.5,
      extensions: { 'com.example.layout': { stable: true } },
      page: {
        custom_height: null,
        custom_width: null,
        margins: {
          bottom: measurement(15),
          left: measurement(15),
          right: measurement(15),
          top: measurement(15)
        },
        max_pages: 2,
        orientation: 'portrait',
        show_page_numbers: false,
        size: 'A4'
      },
      palette: {
        background: { space: 'srgb_hex', value: '#ffffff' },
        muted_text: { space: 'srgb_hex', value: '#666666' },
        primary: { space: 'srgb_hex', value: '#336699' },
        secondary: { space: 'srgb_hex', value: '#99aabb' },
        text: { space: 'srgb_hex', value: '#111111' }
      },
      section_layout: [
        {
          compactness: 0.4,
          heading_style_token: null,
          keep_together: true,
          page_break_before: false,
          section_id: 'section_01K0EXAMPLE000000001',
          zone: 'main'
        }
      ],
      style_contract_version: '1.0',
      template_settings: {
        'accent.color': { space: 'srgb_hex', value: '#336699' },
        'show.photo': true
      },
      typography: {
        base_size_pt: 10,
        font_family_token: 'inter',
        heading_scale: 1.3,
        letter_spacing_em: 0,
        line_height: 1.4
      }
    },
    template: { template_id: TEMPLATE_ID, version: '2.4.0' },
    title: 'Klee Resume',
    updated_at: '2026-07-22T12:05:00Z',
    workspace_id: WORKSPACE_ID
  }
}

/**
 * @brief 取得 Resume fixture 的首个 item / Get the first item in a Resume fixture.
 * @param document Resume fixture / Resume fixture.
 * @return 可变 item object / Mutable item object.
 */
function firstItem(document: Record<string, unknown>): Record<string, unknown> {
  /** @brief sections 数组 / Sections array. */
  const sections = boundedArray(document.sections, 'fixture.sections', 100)
  /** @brief 首个 section / First section. */
  const section = record(sections[0], 'fixture.sections[0]')
  /** @brief items 数组 / Items array. */
  const items = boundedArray(section.items, 'fixture.sections[0].items', 1000)
  return record(items[0], 'fixture.sections[0].items[0]')
}

describe('API v2 TemplateManifest contract', (): void => {
  it('decodes every published field and a valid cursor-page union', (): void => {
    /** @brief 完整模板 / Complete template. */
    const manifest = templateManifest()
    expect(
      parseTemplateList({
        items: [manifest],
        page: { has_more: true, next_cursor: 'next-page' }
      })
    ).toMatchObject({
      items: [
        {
          capabilities: { max_columns: 2 },
          id: TEMPLATE_ID,
          settings: [{ key: 'show.photo' }, { key: 'accent.color' }],
          supported_output_formats: ['pdf', 'png'],
          zones: [{ id: 'main' }]
        }
      ],
      page: { has_more: true, next_cursor: 'next-page' }
    })
  })

  it('rejects extra nested fields and an inconsistent cursor-page union', (): void => {
    /** @brief 含未知 capability 的模板 / Template with an unknown capability. */
    const invalidManifest = templateManifest()
    record(invalidManifest.capabilities, 'fixture.capabilities').legacy_flag = true
    expect(() => parseTemplateManifest(invalidManifest)).toThrow(ApiV2ContractError)

    expect(() =>
      parseTemplateList({
        items: [templateManifest()],
        page: { has_more: false, next_cursor: 'must-be-null' }
      })
    ).toThrow(/inconsistent/u)
  })

  it('rejects internally inconsistent zones, setting defaults, and visibility values', (): void => {
    /** @brief 引用未支持 kind 的模板 / Template referencing an unsupported kind. */
    const invalidZone = templateManifest()
    /** @brief zones 数组 / Zones array. */
    const zones = boundedArray(invalidZone.zones, 'fixture.zones', 20)
    record(zones[0], 'fixture.zones[0]').accepted_section_kinds = ['education']
    expect(() => parseTemplateManifest(invalidZone)).toThrow(/unsupported section kind/u)

    /** @brief 默认类型错误的模板 / Template with a mistyped default. */
    const invalidDefault = templateManifest()
    /** @brief settings 数组 / Settings array. */
    const settings = boundedArray(invalidDefault.settings, 'fixture.settings', 100)
    record(settings[0], 'fixture.settings[0]').default = 'yes'
    expect(() => parseTemplateManifest(invalidDefault)).toThrow(/does not match/u)

    /** @brief 可见性比较值类型错误的模板 / Template with a mistyped visibility value. */
    const invalidVisibility = templateManifest()
    /** @brief 可见性 settings / Visibility settings. */
    const visibilitySettings = boundedArray(invalidVisibility.settings, 'fixture.settings', 100)
    /** @brief accent setting / Accent setting. */
    const accent = record(visibilitySettings[1], 'fixture.settings[1]')
    record(accent.visible_when, 'fixture.visible_when').equals = 'yes'
    expect(() => parseTemplateManifest(invalidVisibility)).toThrow(/does not match/u)
  })

  it('rejects credential-bearing preview URLs', (): void => {
    /** @brief 含 URL credential 的模板 / Template containing URL credentials. */
    const invalid = templateManifest()
    invalid.preview_url = 'https://user:secret@example.com/preview.png'
    expect(() => parseTemplateManifest(invalid)).toThrow(/network URL/u)
  })
})

describe('API v2 CreateResumeRequest encoder', (): void => {
  it('omits absent clone_from_resume_id without inventing null', (): void => {
    /** @brief 不克隆的创建请求 / Create request without cloning. */
    const request: CreateResumeRequest = {
      locale: 'en-US',
      template: { template_id: TEMPLATE_ID, version: '2.4.0' },
      title: 'New Resume'
    }
    /** @brief 编码后的创建请求 / Encoded create request. */
    const encoded = encodeCreateResumeRequest(request)
    expect(encoded).toEqual(request)
    expect(Object.hasOwn(encoded, 'clone_from_resume_id')).toBe(false)
  })

  it('preserves explicit null and validates a present clone ID', (): void => {
    expect(
      encodeCreateResumeRequest({
        clone_from_resume_id: null,
        locale: 'en-US',
        template: { template_id: TEMPLATE_ID, version: '2.4.0' },
        title: 'Blank clone'
      })
    ).toHaveProperty('clone_from_resume_id', null)
    expect(
      encodeCreateResumeRequest({
        clone_from_resume_id: 'resume_01K0SOURCE0000000000001',
        locale: 'en-US',
        template: { template_id: TEMPLATE_ID, version: '2.4.0' },
        title: 'Clone'
      })
    ).toHaveProperty('clone_from_resume_id', 'resume_01K0SOURCE0000000000001')
  })

  it('rejects extra keys and v1 template spelling', (): void => {
    /** @brief 运行时含额外 key 的请求 / Request carrying an extra key at runtime. */
    const extra: CreateResumeRequest = {
      locale: 'en-US',
      template: { template_id: TEMPLATE_ID, version: '2.4.0' },
      title: 'New Resume'
    }
    record(extra, 'fixture.create_request').legacy = true
    expect(() => encodeCreateResumeRequest(extra)).toThrow(/legacy/u)

    /** @brief 运行时使用 v1 模板版本拼写的请求 / Request using v1 template-version spelling at runtime. */
    const v1Spelling: CreateResumeRequest = {
      locale: 'en-US',
      template: { template_id: TEMPLATE_ID, version: '2.4.0' },
      title: 'New Resume'
    }
    /** @brief 可变模板引用 / Mutable template reference. */
    const template = record(v1Spelling.template, 'fixture.create_request.template')
    delete template.version
    template.template_version = '2.4.0'
    expect(() => encodeCreateResumeRequest(v1Spelling)).toThrow(ApiV2ContractError)
  })
})

describe('API v2 ResumeDocument contract', (): void => {
  it('decodes the complete SIR and validates it against the pinned template', (): void => {
    /** @brief 已验证 Resume / Validated Resume. */
    const resume = parseResumeDocument(resumeDocument())
    /** @brief 已验证模板 / Validated template. */
    const template: TemplateManifest = parseTemplateManifest(templateManifest())
    expect(resume).toMatchObject({
      profile: { full_name: 'Klee Example' },
      revision: 7,
      sections: [{ items: [{ date_range: { end: '2026-02', start: '2024-02-29' } }] }],
      style: { style_contract_version: '1.0' },
      template: { template_id: TEMPLATE_ID, version: '2.4.0' },
      workspace_id: WORKSPACE_ID
    })
    expect(() => assertResumeMatchesTemplate(resume, template)).not.toThrow()
  })

  it('uses Unicode code-point mark offsets and rejects out-of-bounds or crossing marks', (): void => {
    /** @brief Emoji offset 越界 Resume / Resume with an out-of-bounds emoji offset. */
    const outOfBounds = resumeDocument()
    /** @brief profile object / Profile object. */
    const outOfBoundsProfile = record(outOfBounds.profile, 'fixture.profile')
    outOfBoundsProfile.summary = {
      marks: [{ end: 4, kind: 'strong', start: 0 }],
      text: 'A😀B'
    }
    expect(() => parseResumeDocument(outOfBounds)).toThrow(/text length/u)

    /** @brief crossing marks Resume / Resume with crossing marks. */
    const crossing = resumeDocument()
    record(crossing.profile, 'fixture.profile').summary = {
      marks: [
        { end: 3, kind: 'strong', start: 0 },
        { end: 4, kind: 'emphasis', start: 2 }
      ],
      text: 'Lead'
    }
    expect(() => parseResumeDocument(crossing)).toThrow(/crossing/u)
  })

  it('decodes TextMark as a href-safe discriminated union', (): void => {
    /** @brief 含合法 link mark 的 Resume / Resume containing a valid link mark. */
    const linked = resumeDocument()
    record(linked.profile, 'fixture.profile').summary = {
      marks: [{ end: 4, href: 'https://example.com/profile', kind: 'link', start: 0 }],
      text: 'Klee'
    }
    /** @brief 已解码摘要 / Decoded summary. */
    const summary = parseResumeDocument(linked).profile.summary
    if (summary === null) throw new Error('Expected a decoded RichText summary.')
    /** @brief 已解码首个 mark / First decoded mark. */
    const mark = summary.marks[0]
    if (mark === undefined || mark.kind !== 'link') {
      throw new Error('Expected a link TextMark.')
    }
    /** @brief 由 kind 判别后保证存在的 href / href guaranteed after narrowing by kind. */
    const href: string = mark.href
    expect(href).toBe('https://example.com/profile')

    /** @brief 缺少 href 的 link mark / Link mark missing its href. */
    const missingHref = resumeDocument()
    record(missingHref.profile, 'fixture.profile').summary = {
      marks: [{ end: 4, kind: 'link', start: 0 }],
      text: 'Klee'
    }
    expect(() => parseResumeDocument(missingHref)).toThrow(ApiV2ContractError)

    /** @brief 非 link mark 携带 href 的 Resume / Resume whose non-link mark carries an href. */
    const styledHref = resumeDocument()
    record(styledHref.profile, 'fixture.profile').summary = {
      marks: [{ end: 4, href: 'https://example.com/', kind: 'strong', start: 0 }],
      text: 'Klee'
    }
    expect(() => parseResumeDocument(styledHref)).toThrow(/must be null/u)
  })

  it('rejects impossible and reversed partial date ranges', (): void => {
    /** @brief 不存在日期的 Resume / Resume with a nonexistent date. */
    const impossible = resumeDocument()
    firstItem(impossible).date_range = { end: '2026', start: '2025-02-29' }
    expect(() => parseResumeDocument(impossible)).toThrow(/real calendar date/u)

    /** @brief 倒序日期的 Resume / Resume with a reversed date range. */
    const reversed = resumeDocument()
    firstItem(reversed).date_range = { end: '2024-12-31', start: '2025' }
    expect(() => parseResumeDocument(reversed)).toThrow(/reversed/u)
  })

  it('rejects duplicate section/item IDs across the Resume entity namespace', (): void => {
    /** @brief section 与 item 共用 ID 的 Resume / Resume whose section and item share an ID. */
    const invalid = resumeDocument()
    firstItem(invalid).id = 'section_01K0EXAMPLE000000001'
    expect(() => parseResumeDocument(invalid)).toThrow(/duplicate entity ID/u)
  })

  it('rejects unknown fields and dangling layout references', (): void => {
    /** @brief 含未知 wire 字段的 Resume / Resume with an unknown wire field. */
    const extra = resumeDocument()
    record(extra.profile, 'fixture.profile').avatar_css = 'url(secret)'
    expect(() => parseResumeDocument(extra)).toThrow(/not allowed/u)

    /** @brief dangling layout 的 Resume / Resume with a dangling layout. */
    const dangling = resumeDocument()
    /** @brief style object / Style object. */
    const danglingStyle = record(dangling.style, 'fixture.style')
    /** @brief layout 数组 / Layout array. */
    const layouts = boundedArray(danglingStyle.section_layout, 'fixture.section_layout', 100)
    record(layouts[0], 'fixture.section_layout[0]').section_id = 'section_01K0MISSING0000000001'
    expect(() => parseResumeDocument(dangling)).toThrow(/unknown section ID/u)
  })

  it('accepts every dimension combination permitted by ResumePageIntent Schema', (): void => {
    /** @brief 未声明自定义尺寸的 CUSTOM 页面 / CUSTOM page without declared custom dimensions. */
    const customWithoutDimensions = resumeDocument()
    /** @brief CUSTOM 页面 object / CUSTOM page object. */
    const customPage = record(
      record(customWithoutDimensions.style, 'fixture.style').page,
      'fixture.page'
    )
    customPage.size = 'CUSTOM'
    expect(parseResumeDocument(customWithoutDimensions).style.page).toMatchObject({
      custom_height: null,
      custom_width: null,
      size: 'CUSTOM'
    })

    /** @brief 携带自定义尺寸的标准 A4 页面 / Standard A4 page carrying custom dimensions. */
    const standardWithDimensions = resumeDocument()
    /** @brief 标准页面 object / Standard page object. */
    const standardPage = record(
      record(standardWithDimensions.style, 'fixture.style').page,
      'fixture.page'
    )
    standardPage.custom_width = measurement(210)
    standardPage.custom_height = measurement(297)
    expect(parseResumeDocument(standardWithDimensions).style.page).toMatchObject({
      custom_height: { unit: 'mm', value: 297 },
      custom_width: { unit: 'mm', value: 210 },
      size: 'A4'
    })
  })

  it('rejects template identity, zone, token, and setting incompatibilities', (): void => {
    /** @brief 已验证模板 / Validated template. */
    const template = parseTemplateManifest(templateManifest())
    /** @brief 模板 identity 不匹配的 Resume / Resume with a mismatching template identity. */
    const wrongIdentity = parseResumeDocument({
      ...resumeDocument(),
      template: { template_id: TEMPLATE_ID, version: '9.0.0' }
    })
    expect(() => assertResumeMatchesTemplate(wrongIdentity, template)).toThrow(/identity/u)

    /** @brief setting 值类型错误的 Resume / Resume with a mistyped setting value. */
    const wrongSettingFixture = resumeDocument()
    /** @brief template settings / Template settings. */
    const templateSettings = record(
      record(wrongSettingFixture.style, 'fixture.style').template_settings,
      'fixture.template_settings'
    )
    templateSettings['show.photo'] = false
    /** @brief 已验证但与模板可见性冲突的 Resume / Validated Resume conflicting with template visibility. */
    const wrongSetting = parseResumeDocument(wrongSettingFixture)
    expect(() => assertResumeMatchesTemplate(wrongSetting, template)).toThrow(/not visible/u)

    /** @brief 未声明 token 的 Resume / Resume with an undeclared token. */
    const wrongTokenFixture = resumeDocument()
    record(
      record(wrongTokenFixture.style, 'fixture.style').typography,
      'fixture.typography'
    ).font_family_token = 'comic-sans'
    /** @brief 已验证但模板不兼容的 token Resume / Validated Resume with a template-incompatible token. */
    const wrongToken = parseResumeDocument(wrongTokenFixture)
    expect(() => assertResumeMatchesTemplate(wrongToken, template)).toThrow(/font token/u)
  })

  it('compares complete BCP 47 locale tags without ASCII casing sensitivity or fallback', (): void => {
    /** @brief 已验证模板 / Validated template. */
    const template = parseTemplateManifest(templateManifest())
    /** @brief 大小写不同但语义相同的 locale Resume / Resume with a casing-variant equivalent locale. */
    const casingVariant = resumeDocument()
    casingVariant.locale = 'EN-us'
    expect(() =>
      assertResumeMatchesTemplate(parseResumeDocument(casingVariant), template)
    ).not.toThrow()

    /** @brief 仅共享 language subtag 的 Resume / Resume sharing only the language subtag. */
    const languageOnly = resumeDocument()
    languageOnly.locale = 'en'
    expect(() => assertResumeMatchesTemplate(parseResumeDocument(languageOnly), template)).toThrow(
      /locale is not supported/u
    )
  })

  it('preserves special JSON keys so undeclared template settings cannot disappear', (): void => {
    /** @brief 含特殊 setting key 的 Resume / Resume containing a special setting key. */
    const fixture = resumeDocument()
    /** @brief Resume style object / Resume style object. */
    const style = record(fixture.style, 'fixture.style')
    style.template_settings = JSON.parse(
      '{"__proto__":{"unexpected":true},"accent.color":{"space":"srgb_hex","value":"#336699"},"show.photo":true}'
    ) as unknown
    /** @brief 已验证且保留 own key 的 Resume / Validated Resume preserving the own key. */
    const resume = parseResumeDocument(fixture)
    /** @brief 已验证模板 / Validated template. */
    const template = parseTemplateManifest(templateManifest())

    expect(Object.hasOwn(resume.style.template_settings, '__proto__')).toBe(true)
    expect(() => assertResumeMatchesTemplate(resume, template)).toThrow(
      /setting __proto__ is not declared/u
    )
  })
})
