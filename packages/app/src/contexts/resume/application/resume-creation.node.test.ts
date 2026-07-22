import { describe, expect, it, vi, type Mock } from 'vitest'

import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { asUiConcurrencyToken } from '../../../shared-kernel/concurrency'
import {
  asUiResumeTemplateCursor,
  asUiResumeTemplatePageLimit,
  UI_RESUME_TEMPLATE_PAGE_LIMIT_MAX,
  type UiCreateResumeFromTemplateCommand,
  type UiCreatedResume,
  type UiResumeTemplatePage
} from '../domain/creation'
import type { UiResumeDocument, UiTemplateManifest } from '../domain/models'
import {
  createResumeFromTemplate,
  loadResumeCreationTemplatePage,
  ResumeCreationError,
  supportsResumeLocale,
  type ResumeCreationPort,
  type ResumeTemplateCatalogPort
} from './resume-creation'
/** @brief 测试中的稳定创建尝试 ID / Stable creation-attempt ID used by tests. */
const CREATION_ATTEMPT_ID = asUiOpaqueId<'command'>('resume_create_attempt_0001')

/** @brief 测试中的 Workspace ID / Workspace ID used by tests. */
const WORKSPACE_ID = asUiOpaqueId<'workspace'>('workspace_resume_creation_0001')

/** @brief 测试中的来源 Resume ID / Source Resume ID used by tests. */
const SOURCE_RESUME_ID = asUiOpaqueId<'resume'>('resume_clone_source_0001')

/** @brief 测试中的第二个 Resume ID / Second Resume ID used by tests. */
const CREATED_RESUME_ID = asUiOpaqueId<'resume'>('resume_created_from_template_0001')

/** @brief 测试中的 Template ID / Template ID used by tests. */
const TEMPLATE_ID = asUiOpaqueId<'template'>('template_resume_creation_0001')

/** @brief 测试中的不可变 Template 清单 / Immutable Template manifest used by tests. */
const TEMPLATE_MANIFEST: UiTemplateManifest = {
  bulletStyleTokens: ['disc'],
  capabilities: {
    maxColumns: 1,
    supportsCustomSections: true,
    supportsPhoto: false,
    supportsSidebar: false,
    supportsSourceMap: true
  },
  dateFormatTokens: ['yyyy_mm'],
  description: 'A compact template for application-use-case tests.',
  fontFamilyTokens: ['sans_clean'],
  id: TEMPLATE_ID,
  name: 'Test Template',
  previewUrl:
    'https://api.hmalliances.org:8022/api/v2/resume-templates/template_resume_creation_0001/preview',
  publishedAt: '2026-07-01T00:00:00.000Z',
  settings: [],
  supportedLocales: ['zh-SG', 'en-US'],
  supportedOutputFormats: ['pdf'],
  supportedPageSizes: ['A4'],
  supportedSectionKinds: ['experience'],
  version: '1.0.0',
  zones: [
    {
      acceptedSectionKinds: ['experience'],
      id: 'main',
      labelKey: 'template.zone.main',
      maxSections: null
    }
  ]
}

/** @brief 测试中的权威 Resume 文档 / Authoritative Resume document used by tests. */
const RESUME_DOCUMENT: UiResumeDocument = {
  createdAt: '2026-07-02T00:00:00.000Z',
  id: CREATED_RESUME_ID,
  knowledgeSourceId: null,
  locale: 'zh-SG',
  profile: {
    contacts: [],
    fullName: 'Klee',
    headline: null,
    summary: null
  },
  revision: 1,
  sections: [],
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
      background: { space: 'srgb_hex', value: '#ffffff' },
      mutedText: { space: 'srgb_hex', value: '#555555' },
      primary: { space: 'srgb_hex', value: '#111111' },
      secondary: { space: 'srgb_hex', value: '#333333' },
      text: { space: 'srgb_hex', value: '#111111' }
    },
    sectionLayout: [],
    styleContractVersion: '1.0',
    templateSettings: {},
    typography: {
      baseSizePt: 10,
      fontFamilyToken: 'sans_clean',
      headingScale: 1.2,
      letterSpacingEm: 0,
      lineHeight: 1.4
    }
  },
  template: { templateId: TEMPLATE_ID, templateVersion: TEMPLATE_MANIFEST.version },
  title: 'AI Platform Engineer',
  updatedAt: '2026-07-02T00:00:00.000Z',
  workspaceId: WORKSPACE_ID
}

/**
 * @brief 构造创建命令 / Build a Resume-creation command.
 * @param overrides 待覆盖字段 / Fields to override.
 * @return 完整创建命令 / Complete creation command.
 */
function createCommand(
  overrides: Partial<UiCreateResumeFromTemplateCommand> = {}
): UiCreateResumeFromTemplateCommand {
  return {
    creationAttemptId: CREATION_ATTEMPT_ID,
    locale: 'zh-SG',
    signal: new AbortController().signal,
    source: { kind: 'new' },
    template: {
      templateId: TEMPLATE_MANIFEST.id,
      templateVersion: TEMPLATE_MANIFEST.version
    },
    title: 'AI Platform Engineer',
    workspaceId: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造创建成功结果 / Build a successful creation result.
 * @param command 创建命令 / Creation command.
 * @return 与命令一致的权威结果 / Authoritative result consistent with the command.
 */
function createResult(command: UiCreateResumeFromTemplateCommand): UiCreatedResume {
  return {
    concurrencyToken: asUiConcurrencyToken('"resume-created-1"'),
    resume: {
      ...RESUME_DOCUMENT,
      id: CREATED_RESUME_ID,
      locale: command.locale,
      template: command.template,
      title: command.title,
      workspaceId: command.workspaceId
    }
  }
}

/**
 * @brief 可观察的 Template 目录测试端口 / Observable Template-catalog test port.
 */
interface TemplateCatalogHarness extends ResumeTemplateCatalogPort {
  /** @brief 精确读取 spy / Exact-read spy. */
  readonly getTemplateSpy: Mock<ResumeTemplateCatalogPort['getTemplate']>
  /** @brief 分页读取 spy / Page-read spy. */
  readonly listTemplatePageSpy: Mock<ResumeTemplateCatalogPort['listTemplatePage']>
}

/**
 * @brief 可观察的 Resume 创建测试端口 / Observable Resume-creation test port.
 */
interface ResumeCreationHarness extends ResumeCreationPort {
  /** @brief 创建调用 spy / Creation-call spy. */
  readonly createResumeSpy: Mock<ResumeCreationPort['createResume']>
}

/**
 * @brief 构造 Template 目录测试端口 / Build a Template-catalog test port.
 * @param page 目录页 / Catalog page.
 * @param exactTemplate 精确版本读取结果 / Exact-version read result.
 * @return 可观察调用的 Template 目录端口 / Template-catalog port with observable calls.
 */
function createCatalog(
  page: UiResumeTemplatePage = {
    hasMore: false,
    items: [TEMPLATE_MANIFEST],
    nextCursor: null
  },
  exactTemplate: UiTemplateManifest = TEMPLATE_MANIFEST
): TemplateCatalogHarness {
  /** @brief 精确 Template 读取 spy / Exact Template-read spy. */
  const getTemplateSpy = vi.fn<ResumeTemplateCatalogPort['getTemplate']>(() =>
    Promise.resolve(exactTemplate)
  )
  /** @brief Template 分页读取 spy / Template page-read spy. */
  const listTemplatePageSpy = vi.fn<ResumeTemplateCatalogPort['listTemplatePage']>(() =>
    Promise.resolve(page)
  )
  return {
    getTemplate: getTemplateSpy,
    getTemplateSpy,
    listTemplatePage: listTemplatePageSpy,
    listTemplatePageSpy
  }
}

/**
 * @brief 构造 Resume 创建测试端口 / Build a Resume-creation test port.
 * @param command 用于生成权威结果的命令 / Command used to produce the authoritative result.
 * @return 可观察调用的创建端口 / Creation port with an observable call.
 */
function createCreationPort(command: UiCreateResumeFromTemplateCommand): ResumeCreationHarness {
  /** @brief Resume 创建 spy / Resume-creation spy. */
  const createResumeSpy = vi.fn<ResumeCreationPort['createResume']>(() =>
    Promise.resolve(createResult(command))
  )
  return {
    createResume: createResumeSpy,
    createResumeSpy
  }
}

describe('Resume Template creation catalog', (): void => {
  it('keeps Template cursors opaque and bounded by the frozen contract', (): void => {
    expect(asUiResumeTemplateCursor('opaque_template_cursor')).toBe('opaque_template_cursor')
    expect(() => asUiResumeTemplateCursor('')).toThrow(TypeError)
    expect(() => asUiResumeTemplateCursor('x'.repeat(2049))).toThrow(TypeError)
  })

  it('accepts only integer Template page sizes in the API v2 range', (): void => {
    expect(asUiResumeTemplatePageLimit(1)).toBe(1)
    expect(asUiResumeTemplatePageLimit(UI_RESUME_TEMPLATE_PAGE_LIMIT_MAX)).toBe(200)
    /** @brief 代表越界或非整数的页大小 / Page sizes representing out-of-range or non-integer values. */
    for (const invalidLimit of [0, 1.5, UI_RESUME_TEMPLATE_PAGE_LIMIT_MAX + 1]) {
      expect(() => asUiResumeTemplatePageLimit(invalidLimit)).toThrow(RangeError)
    }
  })

  it('preserves the API v2 cursor relation and explains unsupported locales', async (): Promise<void> => {
    /** @brief 下一页 cursor / Next-page cursor. */
    const nextCursor = asUiResumeTemplateCursor('template_cursor_next')
    /** @brief 不支持中文内容的 Template / Template that does not support Chinese content. */
    const englishOnlyTemplate: UiTemplateManifest = {
      ...TEMPLATE_MANIFEST,
      id: asUiOpaqueId<'template'>('template_english_only'),
      supportedLocales: ['en-US']
    }
    /** @brief 返回两类兼容性的目录端口 / Catalog port returning both compatibility states. */
    const catalog = createCatalog({
      hasMore: true,
      items: [TEMPLATE_MANIFEST, englishOnlyTemplate],
      nextCursor
    })
    /** @brief 本次目录读取取消信号 / Cancellation signal for this catalog read. */
    const signal = new AbortController().signal

    await expect(
      loadResumeCreationTemplatePage(catalog, {
        cursor: null,
        limit: asUiResumeTemplatePageLimit(50),
        resumeLocale: 'zh-SG',
        signal
      })
    ).resolves.toEqual({
      hasMore: true,
      items: [
        { kind: 'selectable', template: TEMPLATE_MANIFEST },
        { kind: 'unsupported-locale', locale: 'zh-SG', template: englishOnlyTemplate }
      ],
      nextCursor
    })
    expect(catalog.listTemplatePageSpy).toHaveBeenCalledWith({
      cursor: null,
      limit: 50,
      signal
    })
  })

  it('compares BCP 47 casing exactly without inventing a language fallback', (): void => {
    expect(supportsResumeLocale(TEMPLATE_MANIFEST, 'ZH-sg')).toBe(true)
    expect(supportsResumeLocale(TEMPLATE_MANIFEST, 'zh')).toBe(false)
  })

  it('rejects an invalid Resume locale before reading the catalog', async (): Promise<void> => {
    /** @brief 未调用的目录端口 / Catalog port that must not be called. */
    const catalog = createCatalog()

    await expect(
      loadResumeCreationTemplatePage(catalog, {
        cursor: null,
        limit: asUiResumeTemplatePageLimit(50),
        resumeLocale: 'not_a_locale',
        signal: new AbortController().signal
      })
    ).rejects.toMatchObject({
      failure: { field: 'locale', kind: 'invalid-input' }
    } satisfies Partial<ResumeCreationError>)
    expect(catalog.listTemplatePageSpy).not.toHaveBeenCalled()
  })
})

describe('createResumeFromTemplate', (): void => {
  it('reconfirms the immutable Template and forwards one stable new-document command', async (): Promise<void> => {
    /** @brief 用户确认的创建命令 / User-confirmed creation command. */
    const command = createCommand()
    /** @brief 精确 Template 目录 / Exact Template catalog. */
    const catalog = createCatalog()
    /** @brief Workspace-scoped 创建端口 / Workspace-scoped creation port. */
    const creation = createCreationPort(command)

    await expect(createResumeFromTemplate(catalog, creation, command)).resolves.toEqual(
      createResult(command)
    )
    expect(catalog.getTemplateSpy).toHaveBeenCalledWith(command.template, command.signal)
    expect(creation.createResumeSpy).toHaveBeenCalledOnce()
    expect(creation.createResumeSpy).toHaveBeenCalledWith(command)
  })

  it('preserves the contract clone source as a closed command variant', async (): Promise<void> => {
    /** @brief 从既有 Resume 克隆的命令 / Command cloning an existing Resume. */
    const command = createCommand({ source: { kind: 'clone', resumeId: SOURCE_RESUME_ID } })
    /** @brief 创建端口 / Creation port. */
    const creation = createCreationPort(command)

    await createResumeFromTemplate(createCatalog(), creation, command)

    expect(creation.createResumeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: { kind: 'clone', resumeId: SOURCE_RESUME_ID } })
    )
  })

  it.each([
    ['unsafe attempt', { creationAttemptId: asUiOpaqueId<'command'>('short') }],
    ['empty title', { title: '' }],
    ['oversized title', { title: '界'.repeat(301) }],
    ['invalid locale', { locale: 'zh_SG' }]
  ])('rejects %s before touching either port', async (_label, overrides): Promise<void> => {
    /** @brief 无效创建命令 / Invalid creation command. */
    const command = createCommand(overrides)
    /** @brief 不应调用的 Template 目录 / Template catalog that must not be called. */
    const catalog = createCatalog()
    /** @brief 不应调用的创建端口 / Creation port that must not be called. */
    const creation = createCreationPort(command)

    await expect(createResumeFromTemplate(catalog, creation, command)).rejects.toBeInstanceOf(
      ResumeCreationError
    )
    expect(catalog.getTemplateSpy).not.toHaveBeenCalled()
    expect(creation.createResumeSpy).not.toHaveBeenCalled()
  })

  it('rejects a Template version returned for a different immutable identity', async (): Promise<void> => {
    /** @brief 创建命令 / Creation command. */
    const command = createCommand()
    /** @brief 返回错误版本的清单 / Manifest carrying the wrong version. */
    const wrongVersion: UiTemplateManifest = { ...TEMPLATE_MANIFEST, version: '2.0.0' }
    /** @brief 不应调用的创建端口 / Creation port that must not be called. */
    const creation = createCreationPort(command)

    await expect(
      createResumeFromTemplate(createCatalog(undefined, wrongVersion), creation, command)
    ).rejects.toMatchObject({ failure: { kind: 'invalid-template-result' } })
    expect(creation.createResumeSpy).not.toHaveBeenCalled()
  })

  it('rejects a Template that cannot represent the requested Resume locale', async (): Promise<void> => {
    /** @brief 使用不受支持语言的命令 / Command using an unsupported locale. */
    const command = createCommand({ locale: 'fr-FR' })
    /** @brief 不应调用的创建端口 / Creation port that must not be called. */
    const creation = createCreationPort(command)

    await expect(
      createResumeFromTemplate(createCatalog(), creation, command)
    ).rejects.toMatchObject({
      failure: {
        kind: 'unsupported-template-locale',
        locale: 'fr-FR',
        template: command.template
      }
    })
    expect(creation.createResumeSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['workspace', { workspaceId: asUiOpaqueId<'workspace'>('workspace_other_0001') }],
    ['title', { title: 'A different title' }],
    ['locale', { locale: 'en-US' }],
    [
      'template',
      {
        template: {
          templateId: asUiOpaqueId<'template'>('template_other_0001'),
          templateVersion: '1.0.0'
        }
      }
    ]
  ] as const)(
    'rejects a creation result outside the command %s boundary',
    async (field, resumeOverrides): Promise<void> => {
      /** @brief 用户确认的创建命令 / User-confirmed creation command. */
      const command = createCommand()
      /** @brief 返回边界外表示的创建端口 / Creation port returning an out-of-bound representation. */
      const creation: ResumeCreationPort = {
        createResume: vi.fn(() =>
          Promise.resolve({
            ...createResult(command),
            resume: { ...createResult(command).resume, ...resumeOverrides }
          })
        )
      }

      await expect(
        createResumeFromTemplate(createCatalog(), creation, command)
      ).rejects.toMatchObject({ failure: { field, kind: 'invalid-creation-result' } })
    }
  )

  it('rejects a clone response that reuses the source Resume identity', async (): Promise<void> => {
    /** @brief 克隆命令 / Clone command. */
    const command = createCommand({ source: { kind: 'clone', resumeId: SOURCE_RESUME_ID } })
    /** @brief 非法复用来源 ID 的创建端口 / Creation port illegally reusing the source ID. */
    const creation: ResumeCreationPort = {
      createResume: vi.fn(() =>
        Promise.resolve({
          ...createResult(command),
          resume: { ...createResult(command).resume, id: SOURCE_RESUME_ID }
        })
      )
    }

    await expect(
      createResumeFromTemplate(createCatalog(), creation, command)
    ).rejects.toMatchObject({
      failure: { field: 'identity', kind: 'invalid-creation-result' }
    })
  })

  it('rejects a creation result without a strong concurrency token', async (): Promise<void> => {
    /** @brief 用户确认的创建命令 / User-confirmed creation command. */
    const command = createCommand()
    /** @brief 模拟越过 TypeScript 边界的非法端口结果 / Invalid port result simulating a value crossing the TypeScript boundary. */
    const invalidResult = {
      ...createResult(command),
      concurrencyToken: 'W/"resume-created-1"'
    } as unknown as UiCreatedResume
    /** @brief 返回弱 ETag 的创建端口 / Creation port returning a weak ETag. */
    const creation: ResumeCreationPort = {
      createResume: (): Promise<UiCreatedResume> => Promise.resolve(invalidResult)
    }

    await expect(
      createResumeFromTemplate(createCatalog(), creation, command)
    ).rejects.toMatchObject({
      failure: { field: 'concurrency-token', kind: 'invalid-creation-result' }
    })
  })

  it('honours cancellation before any catalog or creation work', async (): Promise<void> => {
    /** @brief 已取消的调用方控制器 / Already-aborted caller controller. */
    const controller = new AbortController()
    controller.abort(new DOMException('Cancelled by test.', 'AbortError'))
    /** @brief 已取消的创建命令 / Aborted creation command. */
    const command = createCommand({ signal: controller.signal })
    /** @brief 不应调用的 Template 目录 / Template catalog that must not be called. */
    const catalog = createCatalog()
    /** @brief 不应调用的创建端口 / Creation port that must not be called. */
    const creation = createCreationPort(command)

    await expect(createResumeFromTemplate(catalog, creation, command)).rejects.toMatchObject({
      name: 'AbortError'
    })
    expect(catalog.getTemplateSpy).not.toHaveBeenCalled()
    expect(creation.createResumeSpy).not.toHaveBeenCalled()
  })
})
