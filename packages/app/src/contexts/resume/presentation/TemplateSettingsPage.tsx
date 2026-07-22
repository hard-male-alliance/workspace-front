import {
  ArrowLeft,
  Check,
  Columns2,
  Info,
  LayoutTemplate,
  Palette,
  SlidersHorizontal
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useAsyncResource, useResumeGateway } from '../../../app/AppData'
import { ResourceErrorState } from '../../../app/ResourceErrorState'
import { classifyResourceFailure } from '../../../app/resource-errors'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { LoadingState } from '../../../ui'
import type {
  UiTemplateManifest,
  UiResumePageSize,
  UiTemplateSettingDefinition,
  UiTemplateSettingValue,
  UiTemplateSettingsModel
} from '../domain/models'
import type { ResumeGateway } from '../application/gateway'

/**
 * @brief 选择模板缩略图的样式 / Select a template-thumbnail style.
 * @param template 模板展示模型 / Template display model.
 * @return 对应视觉预览的 CSS 类名 / CSS class for its visual preview.
 */
function getTemplateThumbnailClass(template: UiTemplateManifest): string {
  if (template.capabilities.supportsSidebar) {
    return 'aw-template-thumbnail aw-template-thumbnail--sidebar'
  }

  return 'aw-template-thumbnail aw-template-thumbnail--compact'
}

/**
 * @brief 将语义模板值转换为稳定的输入键 / Convert a semantic template value into a stable input key.
 * @param value 模板设置值 / Template setting value.
 * @return 不丢失结构类型的用户界面键 / UI key without erasing structural type.
 * @note 该函数只服务本地控件匹配，不是传输序列化，也不会生成 CSS。
 */
function getTemplateSettingValueKey(value: UiTemplateSettingValue): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${typeof value}:${String(value)}`
  }

  if ('space' in value) {
    return `color:${value.space}:${value.value}`
  }

  return `measurement:${value.value}:${value.unit}`
}

/**
 * @brief 生成语义模板值的只读展示文本 / Produce read-only display text for a semantic template value.
 * @param value 模板设置值 / Template setting value.
 * @return 面向用户的展示文本 / User-facing display text.
 */
function getTemplateSettingValueText(value: UiTemplateSettingValue): string {
  if (value === null) {
    return ''
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if ('space' in value) {
    return value.value
  }

  return `${value.value} ${value.unit}`
}

/**
 * @brief 根据设置类型渲染受约束的输入 / Render a constrained input based on a setting definition.
 * @param props 设置定义与当前值 / Setting definition and current value.
 * @return 只表达语义意图的输入控件 / Input control that expresses semantic intent only.
 */
function TemplateSettingControl({
  definition,
  value,
  onChange
}: {
  readonly definition: UiTemplateSettingDefinition
  readonly value: UiTemplateSettingValue
  readonly onChange: (value: UiTemplateSettingValue) => void
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()

  if (definition.control === 'switch') {
    return (
      <button
        aria-checked={value === true}
        aria-label={t(definition.labelKey, { defaultValue: definition.labelKey })}
        className="aw-switch"
        onClick={(): void => onChange(value !== true)}
        role="switch"
        type="button"
      />
    )
  }

  if (definition.control === 'slider') {
    /** @brief 当前滑块数值 / Current slider value. */
    const numericValue = typeof value === 'number' ? value : (definition.minimum ?? 0)
    return (
      <input
        aria-label={t(definition.labelKey, { defaultValue: definition.labelKey })}
        max={definition.maximum ?? 1}
        min={definition.minimum ?? 0}
        onChange={(event): void => onChange(Number(event.target.value))}
        step={0.05}
        type="range"
        value={numericValue}
      />
    )
  }

  if (definition.choices.length > 0) {
    return (
      <select
        aria-label={t(definition.labelKey, { defaultValue: definition.labelKey })}
        className="aw-select"
        onChange={(event): void => {
          /** @brief 被选择的完整语义选项 / Selected full semantic choice. */
          const selectedChoice = definition.choices.find(
            (choice) => getTemplateSettingValueKey(choice.value) === event.target.value
          )

          if (selectedChoice !== undefined) {
            onChange(selectedChoice.value)
          }
        }}
        value={getTemplateSettingValueKey(value)}
      >
        {definition.choices.map((choice) => (
          <option
            key={getTemplateSettingValueKey(choice.value)}
            value={getTemplateSettingValueKey(choice.value)}
          >
            {t(choice.labelKey, { defaultValue: choice.labelKey })}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      aria-label={t(definition.labelKey, { defaultValue: definition.labelKey })}
      className="aw-text-input"
      onChange={
        typeof value === 'string' ? (event): void => onChange(event.target.value) : undefined
      }
      readOnly={typeof value !== 'string'}
      value={getTemplateSettingValueText(value)}
    />
  )
}

/**
 * @brief 已就绪的模板设置页面 / Ready template-settings page.
 * @param props 模板设置数据 / Template-settings data.
 * @return 模板选择与语义意图设置页面 / Template selection and semantic-intent settings page.
 */
function TemplateSettingsContent({
  gateway,
  model,
  onReload
}: {
  readonly gateway: ResumeGateway
  readonly model: UiTemplateSettingsModel
  readonly onReload: () => void
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 选择中的模板 ID / Selected template ID. */
  const [authoritativeModel, setAuthoritativeModel] = useState(model)
  /** @brief 选择中的模板 ID / Selected template ID. */
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(model.selectedTemplate.id)
  /** @brief 页面内尚待保存的设置值 / In-page setting values pending persistence. */
  const [settings, setSettings] = useState<Readonly<Record<string, UiTemplateSettingValue>>>(
    model.styleIntent.templateSettings
  )
  /** @brief 页面规格的本地语义意图 / Local semantic intent for page size. */
  const [pageSize, setPageSize] = useState<UiResumePageSize>(model.styleIntent.page.size)
  /** @brief 字体令牌的本地语义意图 / Local semantic intent for font token. */
  const [fontFamilyToken, setFontFamilyToken] = useState(
    model.styleIntent.typography.fontFamilyToken
  )
  /** @brief 内容密度的本地语义意图 / Local semantic intent for content density. */
  const [density, setDensity] = useState(model.styleIntent.density)
  /** @brief 日期格式令牌的本地语义意图 / Local semantic intent for the date-format token. */
  const [dateFormatToken, setDateFormatToken] = useState(model.styleIntent.dateFormatToken)
  /** @brief 项目符号令牌的本地语义意图 / Local semantic intent for the bullet-style token. */
  const [bulletStyleToken, setBulletStyleToken] = useState(model.styleIntent.bulletStyleToken)
  /** @brief 保存状态 / Persistence state. */
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  /** @brief 最近一次安全呈现的保存错误 / Latest save error to present safely. */
  const [saveError, setSaveError] = useState<unknown>(null)
  /** @brief 当前展示的模板 / Currently displayed template. */
  const selectedTemplate =
    authoritativeModel.availableTemplates.find((template) => template.id === selectedTemplateId) ??
    authoritativeModel.selectedTemplate
  /** @brief 准备提交的完整语义样式意图 / Complete semantic-style intent prepared for submission. */
  const draftStyleIntent = useMemo(
    () => ({
      ...authoritativeModel.styleIntent,
      bulletStyleToken,
      dateFormatToken,
      density,
      page: { ...authoritativeModel.styleIntent.page, size: pageSize },
      templateSettings: settings,
      typography: { ...authoritativeModel.styleIntent.typography, fontFamilyToken }
    }),
    [
      authoritativeModel.styleIntent,
      bulletStyleToken,
      dateFormatToken,
      density,
      fontFamilyToken,
      pageSize,
      settings
    ]
  )

  /**
   * @brief 更新单个待保存模板设置 / Update one pending template setting.
   * @param key 模板设置 key / Template setting key.
   * @param value 新的受约束值 / New constrained value.
   * @return 无返回值 / No return value.
   */
  const updateSetting = (key: string, value: UiTemplateSettingValue): void => {
    setSaveStatus('idle')
    setSettings((currentSettings) => ({ ...currentSettings, [key]: value }))
  }

  /**
   * @brief 选择模板并保持仍被该模板支持的语义值 / Select a template while retaining still-supported semantic values.
   * @param template 用户选择的模板清单 / Template manifest selected by the user.
   * @return 无返回值 / No return value.
   * @note 控件只保留目标模板声明的 setting key；最终兼容性仍由后端 operation 验证。
   */
  const selectTemplate = (template: UiTemplateManifest): void => {
    setSaveStatus('idle')
    setSelectedTemplateId(template.id)
    setPageSize((currentPageSize) =>
      template.supportedPageSizes.includes(currentPageSize)
        ? currentPageSize
        : (template.supportedPageSizes.at(0) ?? currentPageSize)
    )
    setFontFamilyToken((currentFontFamilyToken) =>
      template.fontFamilyTokens.includes(currentFontFamilyToken)
        ? currentFontFamilyToken
        : (template.fontFamilyTokens.at(0) ?? currentFontFamilyToken)
    )
    setDateFormatToken((currentToken) =>
      template.dateFormatTokens.includes(currentToken)
        ? currentToken
        : (template.dateFormatTokens.at(0) ?? currentToken)
    )
    setBulletStyleToken((currentToken) =>
      template.bulletStyleTokens.includes(currentToken)
        ? currentToken
        : (template.bulletStyleTokens.at(0) ?? currentToken)
    )
    setSettings((currentSettings) =>
      Object.fromEntries(
        template.settings.map((definition) => [
          definition.key,
          currentSettings[definition.key] ?? definition.defaultValue
        ])
      )
    )
  }

  /**
   * @brief 通过正式 Resume operation 保存模板与样式 / Save template and style through a formal Resume operation.
   * @return 保存完成的 Promise / Promise completed after persistence.
   */
  const saveSettings = async (): Promise<void> => {
    setSaveStatus('saving')
    setSaveError(null)
    try {
      /** @brief 后端返回的权威模板设置投影 / Authoritative template-settings projection returned by the backend. */
      const saved = await gateway.updateTemplateSettings({
        resumeId: authoritativeModel.resumeId,
        styleIntent: draftStyleIntent,
        templateId: selectedTemplate.id
      })
      setAuthoritativeModel(saved)
      setSelectedTemplateId(saved.selectedTemplate.id)
      setSettings(saved.styleIntent.templateSettings)
      setPageSize(saved.styleIntent.page.size)
      setFontFamilyToken(saved.styleIntent.typography.fontFamilyToken)
      setDateFormatToken(saved.styleIntent.dateFormatToken)
      setBulletStyleToken(saved.styleIntent.bulletStyleToken)
      setDensity(saved.styleIntent.density)
      setSaveStatus('saved')
    } catch (error: unknown) {
      setSaveError(error)
      setSaveStatus('error')
    }
  }

  /**
   * @brief 根据失败类别选择安全恢复动作 / Choose a safe recovery action for the failure category.
   * @return 无返回值 / No return value.
   * @note 并发冲突必须重新读取权威版本，不能盲目重放陈旧 mutation。 / Concurrency conflicts must reload authority instead of blindly replaying a stale mutation.
   */
  const recoverFromSaveFailure = (): void => {
    if (classifyResourceFailure(saveError).kind === 'conflict') {
      onReload()
      return
    }
    void saveSettings()
  }

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">
            {t('template.semanticIntent', { defaultValue: '后端无关的样式意图' })}
          </p>
          <h1 className="aw-page-title">{t('template.title', { defaultValue: '模板与版式' })}</h1>
          <p className="aw-page-description">
            {t('template.migrationHint', {
              defaultValue: '此页只表达模板能力和语义设置，绝不提交 CSS、HTML 或 LaTeX。'
            })}
          </p>
        </div>
        <Link className="aw-quiet-button" to={`/resumes/${model.resumeId}/edit`}>
          <ArrowLeft aria-hidden="true" size={15} />
          {t('common.back', { defaultValue: '返回编辑器' })}
        </Link>
      </div>

      <div className="aw-template-layout">
        <section aria-labelledby="template-choice-title">
          <div
            className="aw-inline-actions"
            style={{ justifyContent: 'space-between', marginBottom: 12 }}
          >
            <div>
              <h2 className="aw-card-title" id="template-choice-title">
                {t('template.otherTemplates', { defaultValue: '选择模板' })}
              </h2>
              <p className="aw-card-description">
                {t('template.choiceDescription', {
                  defaultValue: '切换会在真实环境中创建显式兼容性检查与迁移 Job。'
                })}
              </p>
            </div>
            <span className="aw-status aw-status--active">
              {t('template.backendCatalog', { defaultValue: '后端模板目录' })}
            </span>
          </div>
          <div className="aw-template-list">
            {authoritativeModel.availableTemplates.length === 0 ? (
              <div className="aw-template-empty">
                <LayoutTemplate aria-hidden="true" size={20} />
                <p>{t('template.empty', { defaultValue: '当前没有其他可用模板。' })}</p>
              </div>
            ) : null}
            {authoritativeModel.availableTemplates.map((template) => {
              /** @brief 当前模板是否被选择 / Whether this template is selected. */
              const isSelected = template.id === selectedTemplate.id
              return (
                <button
                  aria-pressed={isSelected}
                  className={`aw-template-card ${isSelected ? 'aw-template-card--selected' : ''}`}
                  key={template.id}
                  onClick={(): void => selectTemplate(template)}
                  type="button"
                >
                  <span aria-hidden="true" className={getTemplateThumbnailClass(template)} />
                  <span>
                    <strong>{template.name}</strong>
                    <span
                      className="aw-card-description"
                      style={{ display: 'block', marginTop: 4 }}
                    >
                      {template.description ??
                        t('template.noDescription', { defaultValue: '暂无说明' })}
                    </span>
                    <span className="aw-template-fit">
                      {template.capabilities.supportsSidebar
                        ? t('template.fitStructured', {
                            defaultValue: '适合技能与经历并重的结构化简历'
                          })
                        : t('template.fitNarrative', {
                            defaultValue: '适合项目叙事与长内容阅读'
                          })}
                    </span>
                  </span>
                  <span className="aw-chip-row">
                    <span className="aw-chip">v{template.version}</span>
                    <span className="aw-chip">
                      {t('template.columns', {
                        count: template.capabilities.maxColumns,
                        defaultValue: `${template.capabilities.maxColumns} columns`
                      })}
                    </span>
                  </span>
                  {isSelected ? (
                    <span className="aw-status aw-status--ready">
                      <Check aria-hidden="true" size={11} />
                      {t('template.selected', { defaultValue: '当前选择' })}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>

        <aside className="aw-card aw-settings-card">
          <span
            aria-hidden="true"
            className={`${getTemplateThumbnailClass(selectedTemplate)} aw-template-preview`}
          />
          <div className="aw-inline-actions">
            <LayoutTemplate aria-hidden="true" className="aw-accent-icon" size={17} />
            <div>
              <h2 className="aw-card-title">
                {t('template.currentTemplate', { defaultValue: '当前模板' })}
              </h2>
              <p className="aw-card-description">{selectedTemplate.name}</p>
            </div>
          </div>
          <div className="aw-list-row" style={{ padding: '10px 0' }}>
            <span className="aw-muted">
              {t('template.capabilities', { defaultValue: '公开能力' })}
            </span>
            <div className="aw-chip-row">
              <span className="aw-chip">
                <Columns2 aria-hidden="true" size={12} style={{ marginRight: 4 }} />
                {t('template.columns', {
                  count: selectedTemplate.capabilities.maxColumns,
                  defaultValue: `${selectedTemplate.capabilities.maxColumns} columns`
                })}
              </span>
              {selectedTemplate.capabilities.supportsSourceMap ? (
                <span className="aw-chip">
                  {t('template.sourceMap', { defaultValue: 'Source map' })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="aw-list-row" style={{ padding: '10px 0' }}>
            <span className="aw-muted">{t('template.zones', { defaultValue: '语义区域' })}</span>
            <div className="aw-chip-row">
              {selectedTemplate.zones.map((zone) => (
                <span className="aw-chip" key={zone.id}>
                  {t(zone.labelKey, { defaultValue: zone.id })}
                </span>
              ))}
            </div>
          </div>
          <p className="aw-setting-help" style={{ margin: 0 }}>
            <Info
              aria-hidden="true"
              size={13}
              style={{ marginRight: 5, verticalAlign: 'text-bottom' }}
            />
            {t('template.intentNotice', {
              defaultValue: '模板版本固定；迁移不会静默改变现有简历。'
            })}
          </p>
        </aside>
      </div>

      <section className="aw-card aw-settings-card" style={{ marginTop: 18 }}>
        <div className="aw-inline-actions">
          <SlidersHorizontal aria-hidden="true" className="aw-accent-icon" size={18} />
          <div>
            <h2 className="aw-card-title">
              {t('template.semanticIntent', { defaultValue: '语义样式意图' })}
            </h2>
            <p className="aw-card-description">
              {t('template.settingsDescription', {
                defaultValue: '控件由 TemplateManifest.settings 驱动，值受模板约束。'
              })}
            </p>
          </div>
        </div>
        <div className="aw-setting-row">
          <div>
            <p className="aw-setting-label">
              {t('template.pageSize', { defaultValue: '页面规格' })}
            </p>
            <p className="aw-setting-help">
              {pageSize} · {authoritativeModel.styleIntent.page.orientation}
            </p>
          </div>
          <select
            aria-label={t('template.pageSize', { defaultValue: '页面规格' })}
            className="aw-select"
            onChange={(event): void => {
              setSaveStatus('idle')
              setPageSize(event.target.value as UiResumePageSize)
            }}
            style={{ width: 130 }}
            value={pageSize}
          >
            {selectedTemplate.supportedPageSizes.map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </div>
        <div className="aw-setting-row">
          <div>
            <p className="aw-setting-label">
              {t('template.fontToken', { defaultValue: '字体令牌' })}
            </p>
            <p className="aw-setting-help">
              {t('template.fontTokenHelp', { defaultValue: '令牌由模板解释，不暴露字体路径。' })}
            </p>
          </div>
          <select
            aria-label={t('template.fontToken', { defaultValue: '字体令牌' })}
            className="aw-select"
            onChange={(event): void => {
              setSaveStatus('idle')
              setFontFamilyToken(event.target.value)
            }}
            style={{ width: 150 }}
            value={fontFamilyToken}
          >
            {selectedTemplate.fontFamilyTokens.map((token) => (
              <option key={token}>{token}</option>
            ))}
          </select>
        </div>
        {selectedTemplate.settings.map((definition) => {
          /** @brief 当前设置值 / Current setting value. */
          const currentValue = settings[definition.key] ?? definition.defaultValue
          return (
            <div className="aw-setting-row" key={definition.key}>
              <div>
                <p className="aw-setting-label">
                  {t(definition.labelKey, { defaultValue: definition.labelKey })}
                </p>
                {definition.descriptionKey !== null ? (
                  <p className="aw-setting-help">
                    {t(definition.descriptionKey, { defaultValue: definition.descriptionKey })}
                  </p>
                ) : null}
              </div>
              <TemplateSettingControl
                definition={definition}
                onChange={(value): void => updateSetting(definition.key, value)}
                value={currentValue}
              />
            </div>
          )
        })}
        <div className="aw-setting-row">
          <div>
            <p className="aw-setting-label">
              {t('template.density', { defaultValue: '内容密度' })}
            </p>
            <p className="aw-setting-help">
              {t('template.densityHelp', { defaultValue: '0 到 1 的语义紧凑度。' })}
            </p>
          </div>
          <input
            aria-label={t('template.density', { defaultValue: '内容密度' })}
            max="1"
            min="0"
            step="0.05"
            type="range"
            onChange={(event): void => {
              setSaveStatus('idle')
              setDensity(Number(event.target.value))
            }}
            value={density}
          />
        </div>
      </section>

      <section className="aw-card aw-card-pad" style={{ marginTop: 18 }}>
        <div className="aw-inline-actions" style={{ justifyContent: 'space-between' }}>
          <Palette aria-hidden="true" className="aw-accent-icon" size={18} />
          <div>
            <h2 className="aw-card-title">
              {t('template.intentPayload', { defaultValue: '将要表达的意图' })}
            </h2>
            <p className="aw-card-description">
              {t('template.intentPayloadDescription', {
                defaultValue: '保存时仅提交与 ResumeStyleIntent 对齐的语义字段。'
              })}
            </p>
          </div>
          <button
            className="aw-primary-button"
            disabled={saveStatus === 'saving'}
            onClick={(): void => void saveSettings()}
            type="button"
          >
            {saveStatus === 'saving'
              ? t('template.saving', { defaultValue: '正在保存…' })
              : t('template.save', { defaultValue: '保存设置' })}
          </button>
        </div>
        <pre
          aria-label={t('template.intentPayloadAria', {
            defaultValue: 'ResumeStyleIntent 语义预览'
          })}
          className="aw-intent-preview"
        >
          {JSON.stringify(
            {
              style_contract_version: draftStyleIntent.styleContractVersion,
              template_id: selectedTemplate.id,
              template_version: selectedTemplate.version,
              page_size: draftStyleIntent.page.size,
              font_family_token: draftStyleIntent.typography.fontFamilyToken,
              density: draftStyleIntent.density,
              template_settings: draftStyleIntent.templateSettings
            },
            null,
            2
          )}
        </pre>
        {saveStatus === 'saved' ? (
          <p aria-live="polite" className="aw-setting-help" role="status">
            {t('template.saved', { defaultValue: '模板与样式设置已保存。' })}
          </p>
        ) : null}
        {saveStatus === 'error' ? (
          <ResourceErrorState
            {...(classifyResourceFailure(saveError).kind === 'conflict'
              ? {
                  actionLabel: t('resume.workspace.reloadAuthority', {
                    defaultValue: '重新加载服务端版本'
                  })
                }
              : {})}
            error={saveError}
            onRetry={recoverFromSaveFailure}
            title={t('template.saveFailed', { defaultValue: '无法保存模板设置' })}
          />
        ) : null}
      </section>
    </div>
  )
}

/**
 * @brief 模板设置路由页 / Template-settings route page.
 * @return 含 loading、error 与模板设置的路由页 / Route page with loading, error, and template settings.
 */
export function TemplateSettingsPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 路由参数 / Route parameters. */
  const { resumeId } = useParams()
  /** @brief 简历 gateway / Resume gateway. */
  const resume = useResumeGateway()
  /** @brief 路由 ID 的不透明 UI 表达 / Opaque UI representation of route ID. */
  const requestedResumeId = useMemo(() => asUiOpaqueId<'resume'>(resumeId ?? ''), [resumeId])
  /** @brief 稳定的模板设置加载器 / Stable template-settings loader. */
  const loadTemplateSettings = useCallback(async (): Promise<UiTemplateSettingsModel> => {
    if (resumeId === undefined) {
      throw new Error('A resume identifier is required to open template settings.')
    }

    return resume.getTemplateSettings(requestedResumeId)
  }, [requestedResumeId, resume, resumeId])
  /** @brief 模板设置异步资源 / Template-settings async resource. */
  const templateSettings = useAsyncResource('resume.template_settings', loadTemplateSettings)

  if (templateSettings.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState
          label={t('status.loadingTemplateSettings', { defaultValue: '正在加载模板设置…' })}
        />
      </div>
    )
  }

  if (templateSettings.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={templateSettings.error}
          onRetry={templateSettings.retry}
          title={t('status.errorTemplateSettings', { defaultValue: '无法加载模板设置' })}
        />
      </div>
    )
  }

  return (
    <TemplateSettingsContent
      gateway={resume}
      model={templateSettings.data}
      onReload={templateSettings.retry}
    />
  )
}
