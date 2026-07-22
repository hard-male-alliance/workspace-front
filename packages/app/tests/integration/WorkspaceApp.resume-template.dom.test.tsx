import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HttpCommandOutcomeUnknownError, HttpProblemError } from '@ai-job-workspace/app/http'
import {
  MOCK_DAWN_TEMPLATE,
  MOCK_HISTORICAL_DAWN_TEMPLATE,
  MOCK_RESUME_ID,
  InMemoryResumeGateway
} from '@ai-job-workspace/app/testing'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 简历模板与版式用户行为 / Resume-template and layout behaviours. */
describe('WorkspaceApp Resume template', (): void => {
  it('presents templates as a focused list with one selected preview', async (): Promise<void> => {
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

    /** @brief Editorial 模板选择按钮 / Editorial template selection button. */
    const editorialTemplate = screen.getByRole('button', { name: /Editorial/ })
    expect(editorialTemplate).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(editorialTemplate)
    expect(editorialTemplate).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Editorial')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await vi.waitFor((): void => expect(updateTemplateSettings).toHaveBeenCalledOnce())
    expect(updateTemplateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeId: MOCK_RESUME_ID,
        templateId: 'tpl_mock_editorial',
        templateVersion: '1.0.0'
      })
    )
    expect(await screen.findByText('模板与样式设置已保存。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    expect(updateTemplateSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('演示数据')).not.toBeInTheDocument()
  })

  it('按 manifest 分组、条件与控件语义编辑结构化设置', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 提供完整设置控件矩阵的 Resume gateway / Resume gateway providing the complete setting-control matrix. */
    const resume = new InMemoryResumeGateway()
    /** @brief 基础模板设置模型 / Base template-settings model. */
    const baseModel = await resume.getTemplateSettings(MOCK_RESUME_ID)
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
      styleIntent: { ...baseModel.styleIntent, templateSettings: initialSettings }
    }
    vi.spyOn(resume, 'getTemplateSettings').mockResolvedValue(controlsModel)
    /** @brief 捕获最终结构化 payload 的保存命令 / Save command capturing the final structured payload. */
    const update = vi
      .spyOn(resume, 'updateTemplateSettings')
      .mockImplementation((input) =>
        Promise.resolve({ ...controlsModel, styleIntent: input.styleIntent })
      )

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
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'template.settings.measurement.label · 数值' }),
      { target: { value: '12' } }
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: 'template.settings.measurement.label · 单位' }),
      { target: { value: 'pt' } }
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'template.settings.text.label' }), {
      target: { value: 'Published' }
    })
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
      gutter: { unit: 'pt', value: 12 },
      header_text: 'Published',
      layout: 'roomy',
      scale: 0.8,
      show_advanced: true
    })
  })

  it('无损保留当前控件无法编辑的权威 JSON 设置值', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 提供未来设置值的 Resume gateway / Resume gateway providing a future setting value. */
    const resume = new InMemoryResumeGateway()
    /** @brief 基础权威模板设置 / Base authoritative template settings. */
    const baseModel = await resume.getTemplateSettings(MOCK_RESUME_ID)
    /** @brief 冻结 Schema 允许但 switch 控件无法表达的 JSON 值 / JSON value allowed by the frozen schema but not expressible by a switch. */
    const futureValue = {
      fallback: null,
      layout: ['wide', { columns: 3, enabled: true }]
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
        templateSettings: { editable_flag: false, future_layout: futureValue }
      }
    }
    vi.spyOn(resume, 'getTemplateSettings').mockResolvedValue(futureModel)
    /** @brief 可观察的保存命令 / Observable save command. */
    const update = vi
      .spyOn(resume, 'updateTemplateSettings')
      .mockImplementation((input) =>
        Promise.resolve({ ...futureModel, styleIntent: input.styleIntent })
      )

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
      future_layout: futureValue
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
    const reload = vi.spyOn(resume, 'getTemplateSettings')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.click(screen.getByRole('button', { name: /Editorial/u }))
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('内容已在其他位置更新')
    expect(screen.queryByText(/private conflict|private stale/u)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Editorial/u })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '重新加载服务器版本' }))

    await vi.waitFor((): void => expect(reload).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Editorial/u })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await vi.waitFor((): void => {
      expect(screen.getByRole('button', { name: '保存设置' })).toBeEnabled()
    })
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
    const reload = vi.spyOn(resume, 'getTemplateSettings')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    /** @brief 未确认的 Editorial 本地选择 / Unconfirmed local Editorial selection. */
    const editorial = screen.getByRole('button', { name: /Editorial/ })
    fireEvent.click(editorial)
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('请先重新加载权威数据')
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()
    expect(editorial).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '页面规格' })).toBeDisabled()
    expect(editorial).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '重新加载服务器版本' }))

    await vi.waitFor((): void => expect(reload).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenCalledTimes(1)
    expect(editorial).toHaveAttribute('aria-pressed', 'true')
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
    const reload = vi.spyOn(resume, 'getTemplateSettings')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    /** @brief 待提交的 Editorial 模板选择 / Editorial template selection being submitted. */
    const editorial = screen.getByRole('button', { name: /Editorial/ })
    fireEvent.click(editorial)
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledOnce())
    expect(editorial).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '页面规格' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '正在保存…' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^Dawn/u }))
    expect(editorial).toHaveAttribute('aria-pressed', 'true')

    releaseResponse()
    expect(await screen.findByRole('alert')).toHaveTextContent('请先重新加载权威数据')
    fireEvent.click(screen.getByRole('button', { name: '重新加载服务器版本' }))

    await vi.waitFor((): void => expect(reload).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('模板与样式设置已保存。')).toBeInTheDocument()
    expect(editorial).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('切换模板时按新定义淘汰同名但类型、选项、范围或控件不兼容的值', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 提供定义变更目录的 Resume Gateway / Resume gateway providing a catalog with changed definitions. */
    const resume = new InMemoryResumeGateway()
    /** @brief 原始模板设置读取 / Original template-settings read. */
    const readSettings = resume.getTemplateSettings.bind(resume)
    vi.spyOn(resume, 'getTemplateSettings').mockImplementation(async (resumeId) => {
      /** @brief 基础模板设置模型 / Base template-settings model. */
      const current = await readSettings(resumeId)
      /** @brief 原始 Dawn 模板 / Original Dawn template. */
      const dawn = current.availableTemplates.find((template) => template.name === 'Dawn')
      /** @brief 原始 Editorial 模板 / Original Editorial template. */
      const editorial = current.availableTemplates.find((template) => template.name === 'Editorial')
      if (dawn === undefined || editorial === undefined)
        throw new Error('Missing template fixture.')

      /** @brief 三个可复用的 Dawn 设置定义 / Three reusable Dawn setting definitions. */
      const [showContactIcons, accentStyle, sectionSpacing] = dawn.settings
      if (
        showContactIcons === undefined ||
        accentStyle === undefined ||
        sectionSpacing === undefined
      ) {
        throw new Error('Missing setting fixture.')
      }
      /** @brief 用于验证 maximum 的额外旧模板设置 / Additional old-template setting used to verify maximum. */
      const upperBoundSpacing = {
        ...sectionSpacing,
        defaultValue: 1.2,
        key: 'upper_bound_spacing'
      }
      /** @brief 含完整旧值集合的 Dawn 模板 / Dawn template containing the complete previous-value set. */
      const sourceTemplate = { ...dawn, settings: [...dawn.settings, upperBoundSpacing] }
      /** @brief 对同名 key 施加新约束的 Editorial 模板 / Editorial template imposing new constraints on same-name keys. */
      const targetTemplate = {
        ...editorial,
        settings: [
          {
            ...showContactIcons,
            choices: [],
            control: 'text' as const,
            defaultValue: 'fallback-text',
            maximum: null,
            minimum: null,
            valueType: 'string' as const
          },
          {
            ...accentStyle,
            choices: [accentStyle.choices[1]!],
            control: 'select' as const,
            defaultValue: 'ink',
            valueType: 'choice' as const
          },
          {
            ...sectionSpacing,
            defaultValue: 0.85,
            maximum: 0.9,
            minimum: 0.8
          },
          {
            ...upperBoundSpacing,
            defaultValue: 0.9,
            maximum: 1,
            minimum: 0.4
          }
        ]
      }

      return {
        ...current,
        availableTemplates: [sourceTemplate, targetTemplate],
        selectedTemplate: sourceTemplate,
        styleIntent: {
          ...current.styleIntent,
          templateSettings: {
            ...current.styleIntent.templateSettings,
            upper_bound_spacing: 1.2
          }
        }
      }
    })
    /** @brief 迁移后发送给 Gateway 的模板更新 / Template update sent to the gateway after migration. */
    const update = vi.spyOn(resume, 'updateTemplateSettings')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.click(screen.getByRole('button', { name: /Editorial/ }))
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0]?.[0].styleIntent.templateSettings).toEqual({
      accent_style: 'ink',
      section_spacing: 0.85,
      show_contact_icons: 'fallback-text',
      upper_bound_spacing: 0.9
    })
  })

  it('将同一模板 ID 的历史与最新版本作为两个独立选项', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前简历固定历史模板版本的测试 Gateway / Test gateway whose Resume is pinned to a historical template version. */
    const resume = new InMemoryResumeGateway()
    /** @brief 模板切换绑定的当前权威 revision / Current authoritative revision bound to the template change. */
    const current = await resume.getResumeEditor(MOCK_RESUME_ID)
    await resume.selectResumeTemplate({
      baseRevision: current.resume.revision,
      resumeId: MOCK_RESUME_ID,
      templateId: MOCK_HISTORICAL_DAWN_TEMPLATE.id,
      templateVersion: MOCK_HISTORICAL_DAWN_TEMPLATE.version
    })
    /** @brief 可观察的精确版本读取 / Observable exact-version read. */
    const getTemplate = vi.spyOn(resume, 'getTemplateManifest')
    /** @brief 可观察的模板设置写命令 / Observable template-settings write command. */
    const updateTemplateSettings = vi.spyOn(resume, 'updateTemplateSettings')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })

    /** @brief 历史版本卡片 / Historical-version card. */
    const historicalCard = screen.getByRole('button', {
      name: new RegExp(MOCK_HISTORICAL_DAWN_TEMPLATE.name, 'u')
    })
    /** @brief 同 ID 最新版本卡片 / Latest-version card sharing the same ID. */
    const latestCard = screen.getByRole('button', {
      name: /^Dawn(?! Legacy)/u
    })
    expect(historicalCard).toHaveAttribute('aria-pressed', 'true')
    expect(latestCard).toHaveAttribute('aria-pressed', 'false')
    expect(getTemplate).toHaveBeenCalledWith(
      MOCK_HISTORICAL_DAWN_TEMPLATE.id,
      MOCK_HISTORICAL_DAWN_TEMPLATE.version
    )

    fireEvent.click(latestCard)
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await vi.waitFor((): void => expect(updateTemplateSettings).toHaveBeenCalledOnce())
    expect(updateTemplateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: MOCK_DAWN_TEMPLATE.id,
        templateVersion: MOCK_DAWN_TEMPLATE.version
      })
    )
  })
})
