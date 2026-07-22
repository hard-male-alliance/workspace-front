import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HttpCommandOutcomeUnknownError, HttpProblemError } from '@ai-job-workspace/app/http'
import { ResumeBatchConflictError } from '@ai-job-workspace/app/application'
import {
  MOCK_DAWN_TEMPLATE,
  MOCK_HISTORICAL_DAWN_TEMPLATE,
  MOCK_RESUME_ID,
  MOCK_RESUME_WORKSPACE_ID,
  InMemoryResumeGateway
} from '@ai-job-workspace/app/testing'
import { loadResumeTemplateSettings } from '../../src/contexts/resume/application/template-catalog'
import type { UiTemplateSettingsModel } from '../../src/contexts/resume/domain/models'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 测试用模板设置页模型 / Template-settings page model used by tests. */
type TestTemplateSettingsModel = UiTemplateSettingsModel

/** @brief 测试用 Resume 编辑权威 / Resume editor authority used by tests. */
type TestResumeEditor = Awaited<ReturnType<InMemoryResumeGateway['getResumeEditor']>>

/**
 * @brief 通过正式 Resume + Template 端口读取测试设置页 / Read a test settings page through the formal Resume and Template ports.
 * @param resume 同时实现两个端口的内存 adapter / In-memory adapter implementing both ports.
 * @return 组合后的模板设置模型 / Composed template-settings model.
 */
function readTemplateSettings(resume: InMemoryResumeGateway): Promise<UiTemplateSettingsModel> {
  return loadResumeTemplateSettings(
    resume,
    resume,
    MOCK_RESUME_WORKSPACE_ID,
    MOCK_RESUME_ID,
    new AbortController().signal
  )
}

/**
 * @brief 在测试端口上安装 Resume 权威与公开 Template 目录 / Install Resume authority and the public Template catalog on test ports.
 * @param resume 同时实现 Resume 与 Template 端口的测试 adapter / Test adapter implementing both Resume and Template ports.
 * @param model 要投影的模板设置模型 / Template-settings model to project.
 * @return 为写命令构造新 Resume 权威的函数 / Function constructing new Resume authority for write commands.
 */
async function installTemplateSettingsModel(
  resume: InMemoryResumeGateway,
  model: TestTemplateSettingsModel
): Promise<(styleIntent: TestTemplateSettingsModel['styleIntent']) => TestResumeEditor> {
  /** @brief 保留其他无损 SIR 字段的基础权威 / Base authority preserving every other lossless SIR field. */
  const baseEditor = await resume.getResumeEditor(
    MOCK_RESUME_WORKSPACE_ID,
    MOCK_RESUME_ID,
    new AbortController().signal
  )
  /**
   * @brief 从页面模型构造带强 ETag 的 Resume 权威 / Build Resume authority carrying a strong ETag from the page model.
   * @param styleIntent 权威样式意图 / Authoritative style intent.
   * @return 可由应用服务重新投影的编辑权威 / Editor authority that the application service can project again.
   */
  const createEditor = (
    styleIntent: TestTemplateSettingsModel['styleIntent']
  ): TestResumeEditor => ({
    concurrencyToken: model.concurrencyToken,
    resume: {
      ...baseEditor.resume,
      id: model.resumeId,
      revision: model.resumeRevision,
      styleIntent,
      template: {
        templateId: model.selectedTemplate.id,
        templateVersion: model.selectedTemplate.version
      },
      workspaceId: model.workspaceId
    }
  })
  vi.spyOn(resume, 'getResumeEditor').mockImplementation(
    (_workspaceId, _resumeId, signal): Promise<TestResumeEditor> => {
      signal.throwIfAborted()
      return Promise.resolve(structuredClone(createEditor(model.styleIntent)))
    }
  )
  vi.spyOn(resume, 'listTemplatePage').mockImplementation((input) => {
    input.signal.throwIfAborted()
    return Promise.resolve({
      hasMore: false,
      items: structuredClone(model.availableTemplates),
      nextCursor: null
    })
  })
  vi.spyOn(resume, 'getTemplate').mockImplementation((reference, signal) => {
    signal.throwIfAborted()
    /** @brief 与精确引用匹配的测试模板 / Test Template matching the exact reference. */
    const template = model.availableTemplates.find(
      (candidate) =>
        candidate.id === reference.templateId && candidate.version === reference.templateVersion
    )
    if (template === undefined) throw new Error('Missing exact test Template version.')
    return Promise.resolve(structuredClone(template))
  })
  return createEditor
}

/** @brief 简历模板与版式用户行为 / Resume-template and layout behaviours. */
describe('WorkspaceApp Resume template', (): void => {
  it('presents an immutable template catalog and saves settings only for the pinned template', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 可观察模板保存命令的测试 Resume gateway / Test Resume gateway exposing the template-save command. */
    const resume = new InMemoryResumeGateway()
    /** @brief 模板设置保存调用 / Template-settings persistence call. */
    const updateTemplateSettings = vi.spyOn(resume, 'updateTemplateSettings')
    /** @brief 模板页面根容器 / Template-page root container. */
    const { container } = render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )

    expect(await screen.findByRole('heading', { name: '模板与版式' })).toBeInTheDocument()
    expect(container.querySelector('.aw-template-list')).toBeInTheDocument()
    expect(container.querySelector('.aw-template-preview')).toBeInTheDocument()

    /** @brief 当前固定的 Dawn 模板目录项 / Currently pinned Dawn catalog item. */
    const dawnTemplate = screen.getByRole('article', {
      name: `Dawn v${MOCK_DAWN_TEMPLATE.version}`
    })
    /** @brief 仅供查看的 Editorial 模板卡片 / Read-only Editorial template card. */
    const editorialTemplate = screen.getByRole('article', { name: /Editorial/u })
    expect(dawnTemplate).toHaveAttribute('aria-current', 'true')
    expect(editorialTemplate).not.toHaveAttribute('aria-current')
    expect(screen.getByText('模板目录目前仅供查看；你可以保存现用模板的版式设置。')).toBeVisible()

    fireEvent.change(screen.getByRole('combobox', { name: '页面规格' }), {
      target: { value: 'LETTER' }
    })

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await vi.waitFor((): void => expect(updateTemplateSettings).toHaveBeenCalledOnce())
    expect(updateTemplateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeId: MOCK_RESUME_ID,
        templateId: MOCK_DAWN_TEMPLATE.id,
        templateVersion: MOCK_DAWN_TEMPLATE.version
      })
    )
    expect(await screen.findByText('模板与样式设置已保存。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    expect(updateTemplateSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('演示数据')).not.toBeInTheDocument()
  })

  it('保存其他样式字段时不把 manifest default 倒灌为权威设置', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 提供 omission 语义的 Resume gateway / Resume gateway exposing omission semantics. */
    const resume = new InMemoryResumeGateway()
    /** @brief 原始权威设置模型 / Original authoritative settings model. */
    const baseModel = await readTemplateSettings(resume)
    /** @brief 省略了已声明 default key 的权威 map / Authoritative map omitting a declared default key. */
    const omittedSettings = Object.fromEntries(
      Object.entries(baseModel.styleIntent.templateSettings).filter(
        ([key]) => key !== 'show_contact_icons'
      )
    )
    /** @brief 保留 omission 的页面模型 / Page model preserving the omission. */
    const omissionModel = {
      ...baseModel,
      styleIntent: { ...baseModel.styleIntent, templateSettings: omittedSettings }
    }
    /** @brief omission 权威的编辑器工厂 / Editor-authority factory for the omission model. */
    const createEditor = await installTemplateSettingsModel(resume, omissionModel)
    /** @brief 可观察的保存命令 / Observable save command. */
    const update = vi
      .spyOn(resume, 'updateTemplateSettings')
      .mockImplementation((input) => Promise.resolve(createEditor(input.styleIntent)))

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    expect(screen.getByRole('switch', { name: '显示联系方式图标' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    fireEvent.change(screen.getByRole('combobox', { name: '页面规格' }), {
      target: { value: 'LETTER' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0]?.[0].styleIntent.templateSettings).toEqual(omittedSettings)
    expect(update.mock.calls[0]?.[0].styleIntent.templateSettings).not.toHaveProperty(
      'show_contact_icons'
    )
  })

  it('按 manifest 分组、条件与控件语义编辑结构化设置', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 提供完整设置控件矩阵的 Resume gateway / Resume gateway providing the complete setting-control matrix. */
    const resume = new InMemoryResumeGateway()
    /** @brief 基础模板设置模型 / Base template-settings model. */
    const baseModel = await readTemplateSettings(resume)
    /** @brief 覆盖全部公开控件和条件可见性的模板 / Template covering every public control and conditional visibility. */
    const controlsTemplate = {
      ...baseModel.selectedTemplate,
      settings: [
        {
          choices: [],
          control: 'switch' as const,
          defaultValue: false,
          descriptionKey: null,
          groupKey: 'template.groups.header',
          key: 'show_advanced',
          labelKey: 'template.settings.showContactIcons.label',
          maximum: null,
          minimum: null,
          valueType: 'boolean' as const,
          visibleWhen: null
        },
        {
          choices: [],
          control: 'number' as const,
          defaultValue: 2,
          descriptionKey: null,
          groupKey: 'template.groups.appearance',
          key: 'column_count',
          labelKey: 'template.settings.number.label',
          maximum: 4,
          minimum: 1,
          valueType: 'integer' as const,
          visibleWhen: null
        },
        {
          choices: [
            {
              descriptionKey: null,
              labelKey: 'template.settings.accentStyle.warm',
              value: 'warm'
            },
            {
              descriptionKey: null,
              labelKey: 'template.settings.accentStyle.ink',
              value: 'ink'
            }
          ],
          control: 'radio' as const,
          defaultValue: 'warm',
          descriptionKey: null,
          groupKey: 'template.groups.appearance',
          key: 'accent_style',
          labelKey: 'template.settings.accentStyle.label',
          maximum: null,
          minimum: null,
          valueType: 'choice' as const,
          visibleWhen: null
        },
        {
          choices: [],
          control: 'color' as const,
          defaultValue: { space: 'srgb_hex' as const, value: '#112233' },
          descriptionKey: null,
          groupKey: 'template.groups.appearance',
          key: 'accent_color',
          labelKey: 'template.settings.color.label',
          maximum: null,
          minimum: null,
          valueType: 'color' as const,
          visibleWhen: null
        },
        {
          choices: [],
          control: 'measurement' as const,
          defaultValue: { unit: 'mm' as const, value: 8 },
          descriptionKey: null,
          groupKey: 'template.groups.appearance',
          key: 'gutter',
          labelKey: 'template.settings.measurement.label',
          maximum: 20,
          minimum: 0,
          valueType: 'measurement' as const,
          visibleWhen: null
        },
        {
          choices: [],
          control: 'text' as const,
          defaultValue: 'Draft',
          descriptionKey: null,
          groupKey: 'template.groups.header',
          key: 'header_text',
          labelKey: 'template.settings.text.label',
          maximum: null,
          minimum: null,
          valueType: 'string' as const,
          visibleWhen: { equals: true, key: 'show_advanced' }
        },
        {
          choices: [
            { descriptionKey: null, labelKey: 'template.layout.compact', value: 'compact' },
            { descriptionKey: null, labelKey: 'template.layout.roomy', value: 'roomy' }
          ],
          control: 'select' as const,
          defaultValue: 'compact',
          descriptionKey: null,
          groupKey: 'template.groups.appearance',
          key: 'layout',
          labelKey: 'template.settings.select.label',
          maximum: null,
          minimum: null,
          valueType: 'choice' as const,
          visibleWhen: null
        },
        {
          choices: [],
          control: 'slider' as const,
          defaultValue: 0.5,
          descriptionKey: null,
          groupKey: 'template.groups.appearance',
          key: 'scale',
          labelKey: 'template.settings.slider.label',
          maximum: 1,
          minimum: 0,
          valueType: 'number' as const,
          visibleWhen: null
        }
      ]
    }
    /** @brief 当前模板全部初始值 / All initial values for the current template. */
    const initialSettings = Object.fromEntries(
      controlsTemplate.settings.map((definition) => [definition.key, definition.defaultValue])
    )
    /** @brief 完整控件测试所使用的权威模型 / Authoritative model used by the complete-control test. */
    const controlsModel = {
      ...baseModel,
      availableTemplates: [controlsTemplate],
      selectedTemplate: controlsTemplate,
      styleIntent: {
        ...baseModel.styleIntent,
        templateSettings: { ...initialSettings, future_server_state: { enabled: true } }
      }
    }
    /** @brief 控件矩阵权威的编辑器工厂 / Editor-authority factory for the control matrix. */
    const createEditor = await installTemplateSettingsModel(resume, controlsModel)
    /** @brief 捕获最终结构化 payload 的保存命令 / Save command capturing the final structured payload. */
    const update = vi
      .spyOn(resume, 'updateTemplateSettings')
      .mockImplementation((input) => Promise.resolve(createEditor(input.styleIntent)))

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })

    expect(screen.getByRole('group', { name: '页首' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '外观' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'template.settings.text.label' })).toBeNull()

    fireEvent.click(screen.getByRole('switch', { name: '显示联系方式图标' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'template.settings.number.label' }), {
      target: { value: '3' }
    })
    fireEvent.click(screen.getByRole('radio', { name: '墨黑' }))
    fireEvent.change(screen.getByLabelText('template.settings.color.label'), {
      target: { value: '#445566' }
    })
    /** @brief 提交时才解析的 Measurement 原始数值输入 / Raw Measurement magnitude parsed only on commit. */
    const measurementMagnitude = screen.getByRole('textbox', {
      name: 'template.settings.measurement.label · 数值'
    })
    fireEvent.change(measurementMagnitude, { target: { value: '12' } })
    fireEvent.blur(measurementMagnitude)
    fireEvent.change(
      screen.getByRole('combobox', { name: 'template.settings.measurement.label · 单位' }),
      { target: { value: 'pt' } }
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'template.settings.text.label' }), {
      target: { value: 'Published' }
    })
    fireEvent.click(screen.getByRole('switch', { name: '显示联系方式图标' }))
    expect(screen.queryByRole('textbox', { name: 'template.settings.text.label' })).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: '显示联系方式图标' }))
    expect(screen.getByRole('textbox', { name: 'template.settings.text.label' })).toHaveValue(
      'Published'
    )
    fireEvent.click(screen.getByRole('switch', { name: '显示联系方式图标' }))
    /** @brief 由用户可见标签解析的 roomy 选项值 / Roomy option value resolved from its user-visible label. */
    const roomyOptionValue = screen
      .getByRole('option', { name: 'template.layout.roomy' })
      .getAttribute('value')
    if (roomyOptionValue === null) throw new Error('Missing roomy template option value.')
    fireEvent.change(screen.getByRole('combobox', { name: 'template.settings.select.label' }), {
      target: { value: roomyOptionValue }
    })
    fireEvent.change(screen.getByRole('slider', { name: 'template.settings.slider.label' }), {
      target: { value: '0.8' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0]?.[0].styleIntent.templateSettings).toEqual({
      accent_color: { space: 'srgb_hex', value: '#445566' },
      accent_style: 'ink',
      column_count: 3,
      future_server_state: { enabled: true },
      gutter: { unit: 'pt', value: 12 },
      layout: 'roomy',
      scale: 0.8,
      show_advanced: false
    })
  })

  it('在原始草稿中保留负数 Measurement 的输入中间态', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 提供允许负数 Measurement 的 Resume gateway / Resume gateway allowing a negative Measurement. */
    const resume = new InMemoryResumeGateway()
    /** @brief 基础模板设置权威 / Base template-settings authority. */
    const baseModel = await readTemplateSettings(resume)
    /** @brief 仅声明一个无下界 Measurement 的模板 / Template declaring one unbounded Measurement. */
    const measurementTemplate = {
      ...baseModel.selectedTemplate,
      settings: [
        {
          choices: [],
          control: 'measurement' as const,
          defaultValue: { unit: 'pt' as const, value: 2 },
          descriptionKey: null,
          groupKey: null,
          key: 'offset',
          labelKey: 'template.settings.measurement.label',
          maximum: null,
          minimum: null,
          valueType: 'measurement' as const,
          visibleWhen: null
        }
      ]
    }
    /** @brief 负数编辑测试的权威模型 / Authority model for negative-number editing. */
    const measurementModel = {
      ...baseModel,
      availableTemplates: [measurementTemplate],
      selectedTemplate: measurementTemplate,
      styleIntent: {
        ...baseModel.styleIntent,
        templateSettings: { offset: { unit: 'pt' as const, value: 2 } }
      }
    }
    /** @brief Measurement 权威的编辑器工厂 / Editor-authority factory for the Measurement model. */
    const createEditor = await installTemplateSettingsModel(resume, measurementModel)
    /** @brief 可观察的保存命令 / Observable save command. */
    const update = vi
      .spyOn(resume, 'updateTemplateSettings')
      .mockImplementation((input) => Promise.resolve(createEditor(input.styleIntent)))

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    /** @brief 保留不完整数字字符串的 Measurement 输入 / Measurement input preserving incomplete numeric strings. */
    const magnitude = screen.getByRole('textbox', {
      name: 'template.settings.measurement.label · 数值'
    })
    fireEvent.change(magnitude, { target: { value: '-' } })
    expect(magnitude).toHaveValue('-')
    fireEvent.change(magnitude, { target: { value: '-3.5' } })
    fireEvent.blur(magnitude)
    expect(magnitude).toHaveValue('-3.5')
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0]?.[0].styleIntent.templateSettings).toEqual({
      offset: { unit: 'pt', value: -3.5 }
    })
  })

  it('无损保留控件无法编辑及 manifest 未声明的权威 JSON 设置值', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 提供未来设置值的 Resume gateway / Resume gateway providing a future setting value. */
    const resume = new InMemoryResumeGateway()
    /** @brief 基础权威模板设置 / Base authoritative template settings. */
    const baseModel = await readTemplateSettings(resume)
    /** @brief 冻结 Schema 允许但 switch 控件无法表达的 JSON 值 / JSON value allowed by the frozen schema but not expressible by a switch. */
    const futureValue = {
      fallback: null,
      layout: ['wide', { columns: 3, enabled: true }]
    } as const
    /** @brief manifest 未声明但 Schema 合法的嵌套权威值 / Nested authoritative value absent from the manifest but valid under the schema. */
    const undeclaredServerValue = {
      fallback: null,
      layout: {
        columns: [1, 2, 1],
        metadata: { experimental: true, name: 'future-grid' }
      }
    } as const
    /** @brief 同时包含只读未来值与可编辑布尔值的模板 / Template containing a read-only future value and an editable boolean. */
    const futureTemplate = {
      ...baseModel.selectedTemplate,
      settings: [
        {
          choices: [],
          control: 'switch' as const,
          defaultValue: false,
          descriptionKey: null,
          groupKey: null,
          key: 'future_layout',
          labelKey: 'template.futureLayout.label',
          maximum: null,
          minimum: null,
          valueType: 'boolean' as const,
          visibleWhen: null
        },
        {
          choices: [],
          control: 'switch' as const,
          defaultValue: false,
          descriptionKey: null,
          groupKey: null,
          key: 'editable_flag',
          labelKey: 'template.editableFlag.label',
          maximum: null,
          minimum: null,
          valueType: 'boolean' as const,
          visibleWhen: null
        }
      ]
    }
    /** @brief 未来值是服务端权威事实的页面模型 / Page model whose future value is an authoritative server fact. */
    const futureModel = {
      ...baseModel,
      availableTemplates: [futureTemplate],
      selectedTemplate: futureTemplate,
      styleIntent: {
        ...baseModel.styleIntent,
        templateSettings: {
          editable_flag: false,
          future_layout: futureValue,
          undeclared_server_state: undeclaredServerValue
        }
      }
    }
    /** @brief 未来值权威的编辑器工厂 / Editor-authority factory for future values. */
    const createEditor = await installTemplateSettingsModel(resume, futureModel)
    /** @brief 可观察的保存命令 / Observable save command. */
    const update = vi
      .spyOn(resume, 'updateTemplateSettings')
      .mockImplementation((input) => Promise.resolve(createEditor(input.styleIntent)))

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })

    /** @brief 不支持编辑的值的只读输出 / Read-only output for the unsupported editable value. */
    const futureOutput = screen.getByLabelText('template.futureLayout.label')
    expect(futureOutput.tagName).toBe('OUTPUT')
    fireEvent.click(screen.getByRole('switch', { name: 'template.editableFlag.label' }))
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0]?.[0].styleIntent.templateSettings).toEqual({
      editable_flag: true,
      future_layout: futureValue,
      undeclared_server_state: undeclaredServerValue
    })
  })

  it('模板并发冲突时重新加载权威版本而不重放陈旧写入', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 返回并发冲突的模板 Gateway / Template gateway returning a concurrency conflict. */
    const resume = new InMemoryResumeGateway()
    /** @brief 被拒绝的陈旧模板 mutation / Rejected stale template mutation. */
    const update = vi.spyOn(resume, 'updateTemplateSettings').mockRejectedValue(
      new HttpProblemError({
        code: 'resume.precondition_failed',
        detail: 'private stale revision detail',
        requestId: 'req_template_1234',
        retryable: true,
        retryAfterMs: null,
        status: 412,
        title: 'private conflict title'
      })
    )
    /** @brief 权威模板设置重载调用 / Authoritative template-settings reload call. */
    const reload = vi.spyOn(resume, 'getResumeEditor')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    /** @brief 当前固定模板上的本地草稿设置 / Local draft setting on the currently pinned template. */
    const showContactIcons = screen.getByRole('switch', { name: '显示联系方式图标' })
    fireEvent.click(showContactIcons)
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('内容已在其他位置更新')
    expect(screen.queryByText(/private conflict|private stale/u)).not.toBeInTheDocument()
    expect(showContactIcons).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '重新加载服务器版本' }))

    await vi.waitFor((): void => expect(reload).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('article', { name: /^Dawn v/u })).toHaveAttribute(
      'aria-current',
      'true'
    )
    await vi.waitFor((): void => {
      expect(screen.getByRole('button', { name: '保存设置' })).toBeEnabled()
    })
    expect(screen.getByRole('switch', { name: '显示联系方式图标' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('直接吸收模板 batch conflict 的权威并保留可表达草稿，不额外 GET', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的模板 Gateway / Template gateway owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 初始 Resume 权威 / Initial Resume authority. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      new AbortController().signal
    )
    /** @brief 合法 200 conflict 携带的新权威 / New authority carried by a valid 200 conflict. */
    const conflictAuthority = {
      ...initial,
      concurrencyToken: '"template-conflict-etag-19"' as typeof initial.concurrencyToken,
      resume: { ...initial.resume, revision: 19 }
    }
    /** @brief 页面只允许进行初始 Resume GET / Page permitting only its initial Resume GET. */
    const getEditor = vi.spyOn(resume, 'getResumeEditor').mockResolvedValue(initial)
    vi.spyOn(resume, 'updateTemplateSettings').mockRejectedValueOnce(
      new ResumeBatchConflictError(conflictAuthority, [
        {
          code: 'resume.style_conflict',
          entityId: initial.resume.id,
          fieldPath: ['style', 'template_settings'],
          operationId: 'operation_template_settings_conflict_0001'
        }
      ])
    )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    /** @brief conflict 后仍可表达的本地设置草稿 / Local settings draft still expressible after the conflict. */
    const showContactIcons = screen.getByRole('switch', { name: '显示联系方式图标' })
    fireEvent.click(showContactIcons)
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByText('服务端未应用这次模板设置。')).toBeInTheDocument()
    expect(getEditor).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('switch', { name: '显示联系方式图标' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    expect(screen.getByRole('switch', { name: '显示联系方式图标' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '检查后重新保存' })).toBeEnabled()
  })

  it('模板写入结果未知时先重载权威版本并保留本地草稿', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 返回未知写结果的模板 Gateway / Template gateway returning an unknown write outcome. */
    const resume = new InMemoryResumeGateway()
    /** @brief 只发送一次的模板写命令 / Template command sent exactly once. */
    const update = vi
      .spyOn(resume, 'updateTemplateSettings')
      .mockRejectedValue(new HttpCommandOutcomeUnknownError('network'))
    /** @brief 初始与恢复阶段的权威读取 / Authoritative reads during initial load and recovery. */
    const reload = vi.spyOn(resume, 'getResumeEditor')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    /** @brief 当前固定模板上未确认的本地草稿 / Unconfirmed local draft on the currently pinned template. */
    const showContactIcons = screen.getByRole('switch', { name: '显示联系方式图标' })
    fireEvent.click(showContactIcons)
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('请先重新加载权威数据')
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()
    expect(showContactIcons).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '页面规格' })).toBeDisabled()
    expect(screen.getByRole('article', { name: /^Dawn v/u })).toHaveAttribute(
      'aria-current',
      'true'
    )
    fireEvent.click(screen.getByRole('button', { name: '重新加载服务器版本' }))

    await vi.waitFor((): void => expect(reload).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('switch', { name: '显示联系方式图标' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await vi.waitFor((): void => {
      expect(screen.getByRole('button', { name: '保存设置' })).toBeEnabled()
    })
  })

  it('未知结果的命令已由服务端应用时吸收权威值且不重复提交', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 模拟服务端先提交成功、响应后丢失的 Resume Gateway / Resume gateway simulating commit-before-response-loss. */
    const resume = new InMemoryResumeGateway()
    /** @brief 未被 spy 包装的真实内存更新 / Original in-memory update outside the spy wrapper. */
    const applyUpdate = resume.updateTemplateSettings.bind(resume)
    /** @brief 允许测试观察保存中冻结状态的响应闸门 / Response gate allowing the test to observe the saving lock. */
    let releaseResponse = (): void => {
      throw new Error('The response gate was released before initialization.')
    }
    /** @brief 写响应保持待定的 Promise / Promise keeping the write response pending. */
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    /** @brief 已应用但最终报告未知结果的模板更新 / Template update applied before reporting an unknown outcome. */
    const update = vi
      .spyOn(resume, 'updateTemplateSettings')
      .mockImplementationOnce(async (input) => {
        await applyUpdate(input)
        await responseGate
        throw new HttpCommandOutcomeUnknownError('network')
      })
    /** @brief 初始与恢复阶段的权威读取 / Authoritative reads during initial load and recovery. */
    const reload = vi.spyOn(resume, 'getResumeEditor')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    /** @brief 待提交的当前模板页面规格 / Current-template page size being submitted. */
    const pageSize = screen.getByRole('combobox', { name: '页面规格' })
    fireEvent.change(pageSize, { target: { value: 'LETTER' } })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledOnce())
    expect(pageSize).toBeDisabled()
    expect(screen.getByRole('button', { name: '正在保存…' })).toBeDisabled()
    expect(screen.getByRole('article', { name: /^Dawn v/u })).toHaveAttribute(
      'aria-current',
      'true'
    )

    releaseResponse()
    expect(await screen.findByRole('alert')).toHaveTextContent('请先重新加载权威数据')
    fireEvent.click(screen.getByRole('button', { name: '重新加载服务器版本' }))

    await vi.waitFor((): void => expect(reload).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('模板与样式设置已保存。')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '页面规格' })).toHaveValue('LETTER')
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('不把模板目录信息假装成已验证的兼容迁移', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 可观察模板保存命令的测试 Gateway / Test gateway exposing template-save commands. */
    const resume = new InMemoryResumeGateway()
    /** @brief 不应因查看目录而触发的保存命令 / Save command that must not be triggered by viewing the catalog. */
    const update = vi.spyOn(resume, 'updateTemplateSettings')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })

    /** @brief 没有迁移契约时只能查看的目标模板 / Target template that remains view-only without a migration contract. */
    const editorial = screen.getByRole('article', { name: /Editorial/u })
    expect(editorial).not.toHaveAttribute('aria-current')
    expect(editorial).toHaveTextContent('版式示意（非最终模板预览）')
    expect(screen.queryByRole('button', { name: /Editorial/u })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()
    expect(screen.queryByText('模板与样式设置已保存。')).not.toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it('区分同一模板 ID 的历史版本并仅保存当前固定身份', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前简历固定历史模板版本的测试 Gateway / Test gateway whose Resume is pinned to a historical template version. */
    const resume = new InMemoryResumeGateway()
    /** @brief 默认模板设置投影 / Default template-settings projection. */
    const current = await readTemplateSettings(resume)
    /** @brief 将权威当前模板固定为历史版本的投影 / Projection pinning the authoritative current template to a historical version. */
    const historicalModel = {
      ...current,
      availableTemplates: [...current.availableTemplates, MOCK_HISTORICAL_DAWN_TEMPLATE],
      selectedTemplate: MOCK_HISTORICAL_DAWN_TEMPLATE
    }
    /** @brief 历史固定版本权威的编辑器工厂 / Editor-authority factory for the historical pinned version. */
    const createEditor = await installTemplateSettingsModel(resume, historicalModel)
    /** @brief 可观察的模板设置写命令 / Observable template-settings write command. */
    const updateTemplateSettings = vi
      .spyOn(resume, 'updateTemplateSettings')
      .mockImplementation((input) => Promise.resolve(createEditor(input.styleIntent)))

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })

    /** @brief 历史版本目录项 / Historical-version catalog item. */
    const historicalCard = screen.getByRole('article', {
      name: `${MOCK_HISTORICAL_DAWN_TEMPLATE.name} v${MOCK_HISTORICAL_DAWN_TEMPLATE.version}`
    })
    /** @brief 同 ID 最新版本目录项 / Latest-version catalog item sharing the same ID. */
    const latestCard = screen.getByRole('article', {
      name: `Dawn v${MOCK_DAWN_TEMPLATE.version}`
    })
    expect(historicalCard).toHaveAttribute('aria-current', 'true')
    expect(latestCard).not.toHaveAttribute('aria-current')

    fireEvent.change(screen.getByRole('combobox', { name: '页面规格' }), {
      target: { value: 'LETTER' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await vi.waitFor((): void => expect(updateTemplateSettings).toHaveBeenCalledOnce())
    expect(updateTemplateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: MOCK_HISTORICAL_DAWN_TEMPLATE.id,
        templateVersion: MOCK_HISTORICAL_DAWN_TEMPLATE.version
      })
    )
  })
})
