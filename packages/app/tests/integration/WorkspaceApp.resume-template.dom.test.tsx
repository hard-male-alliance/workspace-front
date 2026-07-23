import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ApiV2ProblemError,
  ApiV2WriteOutcomeUnknownError,
  type ProblemDetails
} from '@ai-job-workspace/product-api-v2'
import { ResumeBatchConflictError } from '@ai-job-workspace/app/application'
import {
  MOCK_DAWN_TEMPLATE,
  MOCK_EDITORIAL_TEMPLATE,
  MOCK_RESUME_ID,
  MOCK_RESUME_WORKSPACE_ID,
  InMemoryResumeGateway
} from '@ai-job-workspace/app/testing'
import { asUiOpaqueId } from '../../src/shared-kernel/identity'
import { asUiResumeTemplateCursor } from '../../src/contexts/resume/domain/creation'
import type { UiTemplateManifest } from '../../src/contexts/resume/domain/models'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/**
 * @brief 渲染 API v2 模板产品页 / Render the API v2 Template product page.
 * @param resume 当前测试独享的 Resume adapter / Resume adapter owned by the current test.
 * @return Testing Library render 结果 / Testing Library render result.
 */
function renderTemplatePage(resume: InMemoryResumeGateway): ReturnType<typeof render> {
  return render(
    <WorkspaceApp
      gateways={createTestGateways({ resume })}
      initialPath="/resumes/res_mock_ai_platform/template"
    />
  )
}

/**
 * @brief 将当前模板选择切换到 Editorial 并显式修正不支持的 sidebar zone / Select Editorial and explicitly repair its unsupported sidebar zone.
 * @return 交互完成时的 Promise / Promise completed after the interaction.
 */
async function selectCompatibleEditorialTemplate(): Promise<void> {
  /** @brief Editorial 原生 radio / Native Editorial radio. */
  const editorial = await screen.findByRole('radio', { name: 'Editorial v1.0.0' })
  fireEvent.click(editorial)
  /** @brief Skills section 在 Editorial 中只能使用 main zone / Skills section can only use the main zone in Editorial. */
  const skillsZone = screen.getByRole('combobox', {
    name: 'sec_mock_skills 的区域'
  })
  expect(skillsZone).toHaveValue('sidebar')
  expect(skillsZone).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(skillsZone, { target: { value: 'main' } })
}

/**
 * @brief 构造一个完整且脱敏的 API v2 Problem / Build a complete sanitized API v2 Problem.
 * @param code 稳定 Problem code / Stable Problem code.
 * @return 可供错误投影使用的 ProblemDetails / ProblemDetails suitable for error projection.
 */
function createProblem(code: string): ProblemDetails {
  return {
    code,
    detail: null,
    errors: [],
    extensions: null,
    instance: null,
    request_id: 'request_template_1234',
    retryable: false,
    status: 409,
    title: 'Template command conflict',
    type: 'https://api.example.test/problems/template-command-conflict'
  }
}

/** @brief API STANDARD V2 模板与语义样式产品行为 / API STANDARD V2 Template and semantic-style product behaviours. */
describe('WorkspaceApp Resume Template product', (): void => {
  it('先读取 exact pinned manifest，再用原生 radio、真实 preview 和显式原子 Apply 切换模板', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief exact pinned 读取顺序 / Exact-pinned read ordering. */
    const getTemplate = vi.spyOn(resume, 'getTemplate')
    /** @brief 渐进目录读取顺序 / Progressive catalog-read ordering. */
    const listTemplates = vi.spyOn(resume, 'listTemplatePage')
    /** @brief 可观察的 API v2 set_template 命令 / Observable API v2 set_template command. */
    const apply = vi.spyOn(resume, 'updateResumeTemplateAndStyle')

    renderTemplatePage(resume)

    expect(await screen.findByRole('heading', { name: '模板与版式' })).toBeVisible()
    await vi.waitFor((): void => expect(listTemplates).toHaveBeenCalledOnce())
    expect(getTemplate).toHaveBeenCalledWith(
      {
        templateId: MOCK_DAWN_TEMPLATE.id,
        templateVersion: MOCK_DAWN_TEMPLATE.version
      },
      expect.any(AbortSignal)
    )
    expect(getTemplate.mock.invocationCallOrder[0]).toBeLessThan(
      listTemplates.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    )

    /** @brief Dawn 的真实 preview image / Real preview image for Dawn. */
    const preview = screen.getAllByRole('img', { name: /Dawn v1\.0\.0 模板预览/u })[0]
    expect(preview).toHaveAttribute('src', MOCK_DAWN_TEMPLATE.previewUrl)
    expect(preview).toHaveAttribute('loading', 'lazy')
    expect(preview).toHaveAttribute('decoding', 'async')
    expect(preview).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.getByRole('radio', { name: 'Dawn v1.0.0' })).toBeChecked()

    await selectCompatibleEditorialTemplate()
    expect(screen.getByRole('combobox', { name: '日期格式' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: '项目符号' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))

    await vi.waitFor((): void => expect(apply).toHaveBeenCalledOnce())
    /** @brief 发送到 gateway 的冻结命令 / Frozen command sent to the gateway. */
    const command = apply.mock.calls[0]?.[0]
    expect(command).toMatchObject({
      baseRevision: 18,
      resumeId: MOCK_RESUME_ID,
      targetTemplate: {
        templateId: MOCK_EDITORIAL_TEMPLATE.id,
        templateVersion: MOCK_EDITORIAL_TEMPLATE.version
      },
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    expect(command?.commandId).toMatch(/^command_/u)
    expect(command?.styleIntent.sectionLayout).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sectionId: 'sec_mock_skills', zone: 'main' })
      ])
    )
    expect(apply.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal)
    expect(await screen.findByText('模板与样式已应用。')).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Editorial v1.0.0' })).toBeChecked()
  })

  it('一次原子 Apply 提交 CUSTOM 尺寸、四向边距、palette space 与全部 section layout leaves', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 暴露 CUSTOM page 的完整测试 manifest / Complete test manifest exposing a CUSTOM page. */
    const customTemplate: UiTemplateManifest = {
      ...MOCK_DAWN_TEMPLATE,
      id: asUiOpaqueId<'template'>('tpl_custom_controls'),
      name: 'Custom Controls',
      supportedPageSizes: [...MOCK_DAWN_TEMPLATE.supportedPageSizes, 'CUSTOM'],
      version: '2.1.0'
    }
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    vi.spyOn(resume, 'listTemplatePage').mockResolvedValue({
      hasMore: false,
      items: [customTemplate],
      nextCursor: null
    })
    /** @brief 捕获唯一原子模板命令 / Capture the only atomic Template command. */
    const apply = vi.spyOn(resume, 'updateResumeTemplateAndStyle')

    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.click(await screen.findByRole('radio', { name: 'Custom Controls v2.1.0' }))
    fireEvent.change(screen.getByRole('combobox', { name: '页面规格' }), {
      target: { value: 'CUSTOM' }
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: '自定义页面宽度数值' }), {
      target: { value: '21' }
    })
    fireEvent.change(screen.getByRole('combobox', { name: '自定义页面宽度单位' }), {
      target: { value: 'cm' }
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: '自定义页面高度数值' }), {
      target: { value: '297' }
    })
    for (const [name, value] of [
      ['上边距数值', '11'],
      ['右边距数值', '12'],
      ['下边距数值', '13'],
      ['左边距数值', '14']
    ] as const) {
      fireEvent.change(screen.getByRole('spinbutton', { name }), { target: { value } })
    }
    fireEvent.change(screen.getByRole('combobox', { name: '主色颜色空间' }), {
      target: { value: 'rgba' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '主色' }), {
      target: { value: 'rgba(10, 20, 30, 0.9)' }
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'sec_mock_skills 的区域' }), {
      target: { value: 'main' }
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'sec_mock_skills 尽量保持同页' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'sec_mock_skills 前插入分页' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'sec_mock_skills 紧凑度' }), {
      target: { value: '0.77' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'sec_mock_skills 标题样式令牌' }), {
      target: { value: 'skills_dense' }
    })
    fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))

    await vi.waitFor((): void => expect(apply).toHaveBeenCalledOnce())
    /** @brief 发往 API v2 的完整原子 command / Complete atomic command sent to API v2. */
    const command = apply.mock.calls[0]?.[0]
    expect(command?.styleIntent.page).toMatchObject({
      customHeight: { unit: 'mm', value: 297 },
      customWidth: { unit: 'cm', value: 21 },
      margins: {
        bottom: { unit: 'mm', value: 13 },
        left: { unit: 'mm', value: 14 },
        right: { unit: 'mm', value: 12 },
        top: { unit: 'mm', value: 11 }
      },
      size: 'CUSTOM'
    })
    expect(command?.styleIntent.palette.primary).toEqual({
      space: 'rgba',
      value: 'rgba(10, 20, 30, 0.9)'
    })
    expect(
      command?.styleIntent.sectionLayout.find((layout) => layout.sectionId === 'sec_mock_skills')
    ).toMatchObject({
      compactness: 0.77,
      headingStyleToken: 'skills_dense',
      keepTogether: false,
      pageBreakBefore: true,
      zone: 'main'
    })
  })

  it('目标不支持当前 token 时保留原值并阻止 Apply，绝不静默选首项', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 只支持新字体 token 的目标 manifest / Target manifest supporting only a new font token. */
    const strictTemplate: UiTemplateManifest = {
      ...MOCK_EDITORIAL_TEMPLATE,
      fontFamilyTokens: ['mono_precise'],
      id: asUiOpaqueId<'template'>('tpl_strict_font'),
      name: 'Strict Font',
      supportedLocales: ['ZH-sg'],
      version: '2.0.0'
    }
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    vi.spyOn(resume, 'listTemplatePage').mockResolvedValue({
      hasMore: false,
      items: [strictTemplate],
      nextCursor: null
    })
    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.click(await screen.findByRole('radio', { name: 'Strict Font v2.0.0' }))

    /** @brief 保留权威旧值的 font selector / Font selector preserving the old authoritative value. */
    const font = screen.getByRole('combobox', { name: '字体令牌' })
    expect(font).toHaveValue('sans_clean')
    expect(font).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('option', { name: 'sans_clean（目标模板不支持）' })).toBeVisible()
    expect(screen.getByRole('button', { name: '应用模板与样式' })).toBeDisabled()

    fireEvent.change(font, { target: { value: 'mono_precise' } })
    /** @brief Strict Font 仍需修正 sidebar zone / Strict Font still requires repairing the sidebar zone. */
    fireEvent.change(screen.getByRole('combobox', { name: 'sec_mock_skills 的区域' }), {
      target: { value: 'main' }
    })
    expect(screen.getByRole('button', { name: '应用模板与样式' })).toBeEnabled()
  })

  it('统一领域策略把无效 palette 定位到控件并阻止 gateway 写入', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 无效领域值绝不能触达的原子 gateway / Atomic gateway that an invalid domain value must never reach. */
    const apply = vi.spyOn(resume, 'updateResumeTemplateAndStyle')
    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })

    fireEvent.change(screen.getByRole('combobox', { name: '主色颜色空间' }), {
      target: { value: 'rgba' }
    })
    /** @brief rgba 模式下可无损编辑的结构化颜色值 / Losslessly editable structured color value in rgba mode. */
    const primary = screen.getByRole('textbox', { name: '主色' })
    fireEvent.change(primary, { target: { value: '' } })

    expect(primary).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('当前样式无法安全应用')
    expect(screen.getByRole('button', { name: '应用模板与样式' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))
    expect(apply).not.toHaveBeenCalled()

    fireEvent.change(primary, { target: { value: 'rgba(12, 34, 56, 0.8)' } })
    expect(screen.getByRole('button', { name: '应用模板与样式' })).toBeEnabled()
  })

  it('任一 style leaf 改回最新 authority 时清理空补丁且不生成 no-op command', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 不应收到 no-op 的原子 gateway / Atomic gateway that must not receive a no-op. */
    const apply = vi.spyOn(resume, 'updateResumeTemplateAndStyle')
    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })

    const pageSize = screen.getByRole('combobox', { name: '页面规格' })
    fireEvent.change(pageSize, { target: { value: 'LETTER' } })
    fireEvent.change(pageSize, { target: { value: 'A4' } })
    const skillsZone = screen.getByRole('combobox', { name: 'sec_mock_skills 的区域' })
    fireEvent.change(skillsZone, { target: { value: 'main' } })
    fireEvent.change(skillsZone, { target: { value: 'sidebar' } })
    const density = screen.getByRole('slider', { name: '内容密度' })
    fireEvent.change(density, { target: { value: '0.5' } })
    fireEvent.change(density, { target: { value: '0.67' } })
    const primarySpace = screen.getByRole('combobox', { name: '主色颜色空间' })
    fireEvent.change(primarySpace, { target: { value: 'rgba' } })
    fireEvent.change(primarySpace, { target: { value: 'srgb_hex' } })

    expect(screen.getByText('模板与样式已与服务器一致')).toBeVisible()
    expect(screen.getByRole('button', { name: '应用模板与样式' })).toBeDisabled()
    expect(apply).not.toHaveBeenCalled()
  })

  it('按 id+version 保留 dormant setting 草稿，隐藏值不提交，恢复默认会删除显式 key', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 带条件可见设置的目标 manifest / Target manifest with conditional settings. */
    const conditionalTemplate: UiTemplateManifest = {
      ...MOCK_EDITORIAL_TEMPLATE,
      id: asUiOpaqueId<'template'>('tpl_conditional'),
      name: 'Conditional',
      settings: [
        {
          choices: [],
          control: 'switch',
          defaultValue: false,
          descriptionKey: null,
          groupKey: null,
          key: 'show_advanced',
          labelKey: 'template.settings.showContactIcons.label',
          maximum: null,
          minimum: null,
          valueType: 'boolean',
          visibleWhen: null
        },
        {
          choices: [],
          control: 'text',
          defaultValue: 'Default',
          descriptionKey: null,
          groupKey: null,
          key: 'header_text',
          labelKey: 'template.settings.headerText.label',
          maximum: null,
          minimum: null,
          valueType: 'string',
          visibleWhen: { equals: true, key: 'show_advanced' }
        }
      ],
      version: '3.0.0'
    }
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    vi.spyOn(resume, 'listTemplatePage').mockResolvedValue({
      hasMore: false,
      items: [conditionalTemplate],
      nextCursor: null
    })
    /** @brief 捕获最终完整样式命令 / Capture the final complete-style command. */
    const apply = vi
      .spyOn(resume, 'updateResumeTemplateAndStyle')
      .mockImplementation(async (command) => {
        /** @brief 保留无损 Resume 内容的新权威 / New authority preserving lossless Resume content. */
        const current = await resume.getResumeEditor(
          MOCK_RESUME_WORKSPACE_ID,
          MOCK_RESUME_ID,
          new AbortController().signal
        )
        return {
          concurrencyToken: '"conditional-etag"' as typeof current.concurrencyToken,
          resume: {
            ...current.resume,
            revision: current.resume.revision + 1,
            styleIntent: command.styleIntent,
            template: command.targetTemplate
          }
        }
      })
    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.click(await screen.findByRole('radio', { name: 'Conditional v3.0.0' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'sec_mock_skills 的区域' }), {
      target: { value: 'main' }
    })
    /** @brief 控制高级字段可见性的 switch / Switch controlling advanced-field visibility. */
    const advanced = screen.getByRole('switch', { name: '显示联系方式图标' })
    fireEvent.click(advanced)
    fireEvent.change(screen.getByRole('textbox', { name: 'template.settings.headerText.label' }), {
      target: { value: 'Retained draft' }
    })
    fireEvent.click(advanced)
    expect(screen.queryByRole('textbox', { name: 'template.settings.headerText.label' })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Dawn v1.0.0' }))
    expect(screen.getByText('其他模板版本仍有尚未应用的本地草稿')).toBeVisible()
    expect(screen.getByRole('button', { name: '应用模板与样式' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'Conditional v3.0.0' }))
    fireEvent.click(screen.getByRole('switch', { name: '显示联系方式图标' }))
    expect(screen.getByRole('textbox', { name: 'template.settings.headerText.label' })).toHaveValue(
      'Retained draft'
    )
    fireEvent.click(screen.getByRole('switch', { name: '显示联系方式图标' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复 显示联系方式图标 的默认值' }))
    expect(screen.queryByRole('button', { name: '恢复 显示联系方式图标 的默认值' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))

    await vi.waitFor((): void => expect(apply).toHaveBeenCalledOnce())
    expect(apply.mock.calls[0]?.[0].styleIntent.templateSettings).toEqual({})
    expect(await screen.findByText('模板与样式已应用。')).toBeVisible()
    fireEvent.click(screen.getByRole('switch', { name: '显示联系方式图标' }))
    expect(screen.getByRole('textbox', { name: 'template.settings.headerText.label' })).toHaveValue(
      'Retained draft'
    )
    expect(screen.getByText('有尚未应用的模板或样式修改')).toBeVisible()
  })

  it('可见 setting 的 restore-default remove 被完整 command 确认后收敛为 clean', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 捕获 restore-default 完整命令 / Capture the complete restore-default command. */
    const apply = vi.spyOn(resume, 'updateResumeTemplateAndStyle')
    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.click(screen.getByRole('button', { name: '恢复 显示联系方式图标 的默认值' }))
    fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))

    await vi.waitFor((): void => expect(apply).toHaveBeenCalledOnce())
    expect(apply.mock.calls[0]?.[0].styleIntent.templateSettings).not.toHaveProperty(
      'show_contact_icons'
    )
    expect(await screen.findByText('模板与样式已与服务器一致')).toBeVisible()
  })

  it('预览 URL 为 null 或图片加载失败时都呈现明确回退', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief null preview 场景的 adapter / Adapter for the null-preview scenario. */
    const nullPreviewResume = new InMemoryResumeGateway()
    vi.spyOn(nullPreviewResume, 'getTemplate').mockResolvedValue({
      ...MOCK_DAWN_TEMPLATE,
      previewUrl: null
    })
    const nullPreviewView = renderTemplatePage(nullPreviewResume)
    expect(await screen.findByRole('img', { name: '此模板未提供预览' })).toBeVisible()
    nullPreviewView.unmount()

    /** @brief 图片 error 场景的 adapter / Adapter for the image-error scenario. */
    const failedPreviewResume = new InMemoryResumeGateway()
    renderTemplatePage(failedPreviewResume)
    /** @brief 可访问的主预览图片 / Accessible primary preview image. */
    const image = await screen.findByRole('img', { name: 'Dawn v1.0.0 模板预览' })
    fireEvent.error(image)
    expect(screen.getByRole('img', { name: '此模板未提供预览' })).toBeVisible()
  })

  it('只自动读取目录首页，后续每次显式加载一页并按复合身份去重', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 第三份不可变模板版本 / Third immutable Template version. */
    const thirdTemplate: UiTemplateManifest = {
      ...MOCK_EDITORIAL_TEMPLATE,
      id: asUiOpaqueId<'template'>('tpl_third_page'),
      name: 'Third Page',
      version: '4.0.0'
    }
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 第二页 opaque cursor / Opaque cursor for the second page. */
    const nextCursor = asUiResumeTemplateCursor('cursor_second_page')
    /** @brief 可观察且逐页返回的目录 / Observable catalog returning one page at a time. */
    const list = vi
      .spyOn(resume, 'listTemplatePage')
      .mockResolvedValueOnce({
        hasMore: true,
        items: [MOCK_DAWN_TEMPLATE, MOCK_EDITORIAL_TEMPLATE],
        nextCursor
      })
      .mockResolvedValueOnce({ hasMore: false, items: [thirdTemplate], nextCursor: null })

    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })
    await vi.waitFor((): void => expect(list).toHaveBeenCalledOnce())
    expect(await screen.findByRole('radio', { name: 'Editorial v1.0.0' })).toBeVisible()
    expect(screen.queryByRole('radio', { name: 'Third Page v4.0.0' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '加载更多模板' }))
    await vi.waitFor((): void => expect(list).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('radio', { name: 'Third Page v4.0.0' })).toBeVisible()
    expect(screen.getAllByRole('radio', { name: 'Dawn v1.0.0' })).toHaveLength(1)
  })

  it('未知结果只原样确认冻结 command，signal 可替换且不会进入信封', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 未被 spy 包装的真实 API v2 内存命令 / Original API v2 memory command outside the spy. */
    const applyOriginal = resume.updateResumeTemplateAndStyle.bind(resume)
    /** @brief 首次未知、第二次幂等确认成功的命令 / Command failing unknown first and succeeding idempotently on confirmation. */
    const apply = vi
      .spyOn(resume, 'updateResumeTemplateAndStyle')
      .mockRejectedValueOnce(new ApiV2WriteOutcomeUnknownError('network'))
      .mockImplementation(applyOriginal)

    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.change(screen.getByRole('combobox', { name: '页面规格' }), {
      target: { value: 'LETTER' }
    })
    fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('应用结果待确认')
    fireEvent.click(screen.getByRole('button', { name: '确认上次应用结果' }))

    await vi.waitFor((): void => expect(apply).toHaveBeenCalledTimes(2))
    expect(apply.mock.calls[1]?.[0]).toBe(apply.mock.calls[0]?.[0])
    expect(apply.mock.calls[1]?.[1]).not.toBe(apply.mock.calls[0]?.[1])
    expect(await screen.findByText('模板与样式已应用。')).toBeVisible()
  })

  it('idempotency.in_progress 遵守 Retry-After，冷却后才允许原样确认', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 未被 spy 包装的真实 API v2 内存命令 / Original API v2 memory command outside the spy. */
    const applyOriginal = resume.updateResumeTemplateAndStyle.bind(resume)
    /** @brief 首次 in-progress，冷却后原样确认成功 / First in-progress response followed by exact confirmation after cooldown. */
    const apply = vi
      .spyOn(resume, 'updateResumeTemplateAndStyle')
      .mockRejectedValueOnce(new ApiV2ProblemError(createProblem('idempotency.in_progress'), 40))
      .mockImplementation(applyOriginal)

    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.change(screen.getByRole('combobox', { name: '页面规格' }), {
      target: { value: 'LETTER' }
    })
    fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))

    expect(await screen.findByRole('button', { name: '等待服务端允许确认…' })).toBeDisabled()
    expect(apply).toHaveBeenCalledOnce()
    /** @brief 冷却到期后的 exact-confirm 按钮 / Exact-confirm button after the cooldown expires. */
    const confirm = await screen.findByRole(
      'button',
      { name: '确认上次应用结果' },
      { timeout: 3_000 }
    )
    fireEvent.click(confirm)

    await vi.waitFor((): void => expect(apply).toHaveBeenCalledTimes(2))
    expect(apply.mock.calls[1]?.[0]).toBe(apply.mock.calls[0]?.[0])
    expect(apply.mock.calls[1]?.[1]).not.toBe(apply.mock.calls[0]?.[1])
    expect(await screen.findByText('模板与样式已应用。')).toBeVisible()
  })

  it('200 batch conflict 携带未命中缓存的 pinned 版本时只 exact GET 该 manifest', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 构造 conflict 权威的初始 Resume / Initial Resume used to construct conflict authority. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      new AbortController().signal
    )
    /** @brief 目录首页未包含的历史 pinned manifest / Historical pinned manifest absent from the public first page. */
    const historicalTemplate: UiTemplateManifest = {
      ...MOCK_DAWN_TEMPLATE,
      name: 'Conflict Legacy',
      version: '0.9.0'
    }
    /** @brief 可观察的 exact manifest 读取 / Observable exact-manifest reads. */
    const getTemplate = vi.spyOn(resume, 'getTemplate').mockImplementation((reference) => {
      if (
        reference.templateId === historicalTemplate.id &&
        reference.templateVersion === historicalTemplate.version
      ) {
        return Promise.resolve(structuredClone(historicalTemplate))
      }
      return Promise.resolve(structuredClone(MOCK_DAWN_TEMPLATE))
    })
    /** @brief 页面初始加载以外不应再 GET Resume / Resume GET that must not repeat after initial page loading. */
    const getEditor = vi.spyOn(resume, 'getResumeEditor')
    /** @brief 原子拒绝并携带最新权威的命令 / Command atomically rejected with latest authority. */
    const apply = vi.spyOn(resume, 'updateResumeTemplateAndStyle').mockRejectedValueOnce(
      new ResumeBatchConflictError(
        {
          concurrencyToken: '"conflict-template-etag"' as typeof initial.concurrencyToken,
          resume: {
            ...initial.resume,
            revision: initial.resume.revision + 1,
            template: {
              templateId: historicalTemplate.id,
              templateVersion: historicalTemplate.version
            }
          }
        },
        [
          {
            code: 'resume.template_conflict',
            entityId: initial.resume.id,
            fieldPath: ['template'],
            operationId: 'set_template'
          }
        ]
      )
    )

    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.change(screen.getByRole('combobox', { name: '页面规格' }), {
      target: { value: 'LETTER' }
    })
    fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))

    expect(await screen.findByText('服务端未应用这次修改')).toBeVisible()
    expect(apply).toHaveBeenCalledOnce()
    expect(getEditor).toHaveBeenCalledOnce()
    expect(getTemplate).toHaveBeenCalledWith(
      {
        templateId: historicalTemplate.id,
        templateVersion: historicalTemplate.version
      },
      expect.any(AbortSignal)
    )
    expect(screen.getByRole('radio', { name: 'Conflict Legacy v0.9.0' })).toBeVisible()
  })

  it('batch conflict 后只重放用户编辑的 section leaf，保留同 section 与其他 section 并发更新', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 adapter / Adapter owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 初始完整 Resume 权威 / Initial complete Resume authority. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      new AbortController().signal
    )
    /** @brief 同时修改目标 section 其他 leaves 与另一 section 的冲突权威 / Conflict authority changing other leaves on both the target and another section. */
    const conflicted = {
      concurrencyToken: '"leaf-conflict-etag"' as typeof initial.concurrencyToken,
      resume: {
        ...initial.resume,
        revision: initial.resume.revision + 1,
        styleIntent: {
          ...initial.resume.styleIntent,
          sectionLayout: initial.resume.styleIntent.sectionLayout.map((layout) =>
            layout.sectionId === 'sec_mock_skills'
              ? { ...layout, compactness: 0.91, keepTogether: false }
              : layout.sectionId === 'sec_mock_summary'
                ? { ...layout, pageBreakBefore: true }
                : layout
          )
        }
      }
    }
    /** @brief 首次原子拒绝、第二次接收重建 command 的 gateway / Gateway atomically rejecting first and accepting the rebuilt second command. */
    const apply = vi
      .spyOn(resume, 'updateResumeTemplateAndStyle')
      .mockRejectedValueOnce(
        new ResumeBatchConflictError(conflicted, [
          {
            code: 'resume.concurrent_update',
            entityId: initial.resume.id,
            fieldPath: ['style'],
            operationId: 'set_style'
          }
        ])
      )
      .mockImplementationOnce((command) =>
        Promise.resolve({
          concurrencyToken: '"leaf-merged-etag"' as typeof initial.concurrencyToken,
          resume: {
            ...conflicted.resume,
            revision: conflicted.resume.revision + 1,
            styleIntent: command.styleIntent,
            template: command.targetTemplate
          }
        })
      )

    renderTemplatePage(resume)
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.change(screen.getByRole('combobox', { name: 'sec_mock_skills 的区域' }), {
      target: { value: 'main' }
    })
    fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))
    fireEvent.click(await screen.findByRole('button', { name: '检查保留的草稿' }))
    fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))

    await vi.waitFor((): void => expect(apply).toHaveBeenCalledTimes(2))
    /** @brief 基于冲突权威重建的第二个 command / Second command rebuilt on conflict authority. */
    const retried = apply.mock.calls[1]?.[0]
    expect(
      retried?.styleIntent.sectionLayout.find((layout) => layout.sectionId === 'sec_mock_skills')
    ).toMatchObject({ compactness: 0.91, keepTogether: false, zone: 'main' })
    expect(
      retried?.styleIntent.sectionLayout.find((layout) => layout.sectionId === 'sec_mock_summary')
    ).toMatchObject({ pageBreakBefore: true })
  })

  it('key_reused 与坏 2xx 都丢弃旧 key、先 GET 权威且不重放终态命令', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    for (const failure of [
      new ApiV2ProblemError(createProblem('idempotency.key_reused'), null),
      new ApiV2WriteOutcomeUnknownError('contract', 200)
    ]) {
      /** @brief 当前 failure 独享 adapter / Adapter owned by the current failure. */
      const resume = new InMemoryResumeGateway()
      /** @brief 应只调用一次的终态命令 / Terminal command that must be called once. */
      const apply = vi.spyOn(resume, 'updateResumeTemplateAndStyle').mockRejectedValueOnce(failure)
      /** @brief 初始与恢复权威 GET / Initial and recovery authority GETs. */
      const getEditor = vi.spyOn(resume, 'getResumeEditor')
      const view = renderTemplatePage(resume)
      await screen.findByRole('heading', { name: '模板与版式' })
      fireEvent.change(screen.getByRole('combobox', { name: '页面规格' }), {
        target: { value: 'LETTER' }
      })
      fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))
      fireEvent.click(await screen.findByRole('button', { name: '重新加载服务器版本' }))
      await vi.waitFor((): void => expect(getEditor).toHaveBeenCalledTimes(2))
      expect(apply).toHaveBeenCalledOnce()
      view.unmount()
    }
  })

  it('bad 2xx 与放弃 transport replay 后都用键序无关 GET 对账已落地 command 并精确清稿', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    for (const failure of [
      new ApiV2WriteOutcomeUnknownError('contract', 200),
      new ApiV2WriteOutcomeUnknownError('network')
    ]) {
      /** @brief 当前 reconciliation 场景独享 adapter / Adapter owned by the current reconciliation scenario. */
      const resume = new InMemoryResumeGateway()
      /** @brief 未包装的真实 GET / Unwrapped real GET. */
      const getOriginal = resume.getResumeEditor.bind(resume)
      /** @brief 未包装且会真实落地的原子命令 / Unwrapped atomic command that really commits. */
      const applyOriginal = resume.updateResumeTemplateAndStyle.bind(resume)
      /** @brief command 是否已在 transport 报错前落地 / Whether the command landed before transport reported failure. */
      let landed = false
      vi.spyOn(resume, 'getResumeEditor').mockImplementation(async (...parameters) => {
        /** @brief adapter 的真实权威 / Real authority from the adapter. */
        const editor = await getOriginal(...parameters)
        if (!landed) return editor
        /** @brief 与 command 语义相同但 key 顺序相反的 settings / Settings semantically equal to the command but with reversed key order. */
        const reorderedSettings = Object.fromEntries(
          Object.entries(editor.resume.styleIntent.templateSettings).reverse()
        )
        return {
          ...editor,
          resume: {
            ...editor.resume,
            styleIntent: {
              ...editor.resume.styleIntent,
              templateSettings: reorderedSettings
            }
          }
        }
      })
      /** @brief 真实落地后模拟坏 success 或网络未知结果 / Simulate invalid success or network uncertainty after a real commit. */
      const apply = vi
        .spyOn(resume, 'updateResumeTemplateAndStyle')
        .mockImplementationOnce(async (command, signal) => {
          await applyOriginal(command, signal)
          landed = true
          throw failure
        })

      const view = renderTemplatePage(resume)
      await screen.findByRole('heading', { name: '模板与版式' })
      fireEvent.change(screen.getByRole('combobox', { name: '页面规格' }), {
        target: { value: 'LETTER' }
      })
      fireEvent.click(screen.getByRole('button', { name: '应用模板与样式' }))
      if (failure.kind === 'contract') {
        fireEvent.click(await screen.findByRole('button', { name: '重新加载服务器版本' }))
      } else {
        fireEvent.click(await screen.findByRole('button', { name: '放弃确认并读取服务器版本' }))
      }

      expect(await screen.findByText('模板与样式已与服务器一致')).toBeVisible()
      expect(apply).toHaveBeenCalledOnce()
      view.unmount()
    }
  })
})
