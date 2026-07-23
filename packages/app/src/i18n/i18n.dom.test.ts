/** @file 应用 i18n 测试 / Application i18n tests. */

import { afterEach, describe, expect, it } from 'vitest'

import { appI18n, appI18nReady, DEFAULT_APP_LOCALE, isAppLocale, setAppLocale } from './i18n'

afterEach(async () => {
  await setAppLocale(DEFAULT_APP_LOCALE)
})

describe('application i18n', () => {
  it('initializes with zh-SG and returns simplified Chinese resources', async () => {
    await appI18nReady

    expect(appI18n.language).toBe('zh-SG')
    expect(appI18n.t('nav.workspace')).toBe('工作台')
    expect(appI18n.t('template.settings.accentStyle.warm')).toBe('暖棕')
    expect(appI18n.t('knowledge.status.fetching')).toBe('正在获取')
    expect(appI18n.t('knowledge.v2SourceLibraryTitle')).toBe('知识来源')
    expect(appI18n.t('knowledge.create.title')).toBe('新建手工笔记来源')
    expect(appI18n.t('knowledge.edit.recoveryTitle')).toBe('必须先读取最新权威来源')
    expect(appI18n.t('visibility.regions.private_deployment')).toBe('私有部署')
    expect(appI18n.t('visibility.operations.write_back')).toBe('写回来源')
    expect(appI18n.t('knowledge.create.validation.content-required')).toBe('请输入笔记正文。')
    expect(appI18n.t('common.backHome')).toBe('返回工作台')
    expect(appI18n.t('resume.workspace.pdfFrameTitle')).toBe('简历 PDF 预览')
    expect(appI18n.t('resume.semanticPreviewAria')).toBe('简历语义内容预览')
    expect(appI18n.t('resume.workspace.previewWindow')).toBe('预览')
    expect(appI18n.t('resume.workspace.semanticPreviewRegion')).toBe('语义内容预览')
    expect(appI18n.t('resume.output.title')).toBe('生成与导出')
    expect(appI18n.t('resume.output.abandonWarning')).toContain('不会取消服务端')
    expect(appI18n.t('errors.authenticationRequired')).toBe(
      '此内容需要登录，但当前应用尚未接通身份认证。请联系管理员完成配置。'
    )
    expect(appI18n.t('errors.capabilityUnavailable')).toBe('这项功能当前尚不可用。')
    expect(appI18n.t('errors.invalidRequest')).toBe(
      '服务未接受提交的内容。请检查输入；如问题持续，请联系支持。'
    )
    expect(appI18n.t('errors.outcomeUnknown')).toBe(
      '请求可能已被服务处理。请先重新加载权威数据，或使用页面提供的确认操作核对结果；不要立即重复提交。'
    )
    expect(appI18n.t('errors.unknown')).toBe(
      '应用遇到未预期的问题。请保留当前内容并稍后重试；如问题持续，请联系支持。'
    )
    expect(document.documentElement.lang).toBe('zh-SG')
    expect(document.title).toBe('求职工作台')
  })

  it('switches to en-US without changing translation keys', async () => {
    await setAppLocale('en-US')

    expect(appI18n.language).toBe('en-US')
    expect(appI18n.t('nav.workspace')).toBe('Workspace')
    expect(appI18n.t('template.settings.accentStyle.warm')).toBe('Warm')
    expect(appI18n.t('knowledge.status.fetching')).toBe('Fetching')
    expect(appI18n.t('knowledge.v2SourceLibraryTitle')).toBe('Knowledge sources')
    expect(appI18n.t('knowledge.create.title')).toBe('Create a manual-note source')
    expect(appI18n.t('knowledge.edit.recoveryTitle')).toBe(
      'Read the latest authoritative source first'
    )
    expect(appI18n.t('visibility.regions.private_deployment')).toBe('Private deployment')
    expect(appI18n.t('visibility.operations.write_back')).toBe('Write back to source')
    expect(appI18n.t('knowledge.create.validation.content-required')).toBe('Enter the note body.')
    expect(appI18n.t('common.backHome')).toBe('Back to workspace')
    expect(appI18n.t('resume.workspace.pdfFrameTitle')).toBe('Resume PDF preview')
    expect(appI18n.t('resume.semanticPreviewAria')).toBe('Resume semantic-content preview')
    expect(appI18n.t('resume.workspace.previewWindow')).toBe('Preview')
    expect(appI18n.t('resume.workspace.semanticPreviewRegion')).toBe('Semantic-content preview')
    expect(appI18n.t('resume.output.title')).toBe('Generate and export')
    expect(appI18n.t('resume.output.abandonWarning')).toContain('does not cancel')
    expect(appI18n.t('errors.authenticationRequired')).toBe(
      'This content requires sign-in, but authentication is not connected in this app. Contact an administrator to finish setup.'
    )
    expect(appI18n.t('errors.capabilityUnavailable')).toBe(
      'This capability is currently unavailable.'
    )
    expect(appI18n.t('errors.invalidRequest')).toBe(
      'The service did not accept the submitted content. Check the input, or contact support if the problem continues.'
    )
    expect(appI18n.t('errors.outcomeUnknown')).toBe(
      'The request may already have been processed. Reload authoritative data or use the confirmation action on this page to verify the result; do not submit it again immediately.'
    )
    expect(appI18n.t('errors.unknown')).toBe(
      'The app encountered an unexpected problem. Keep your current work and try again later; contact support if it continues.'
    )
    expect(document.documentElement.lang).toBe('en-US')
    expect(document.title).toBe('Career Workspace')
  })

  it('accepts only the two deliberately supported UI locales', () => {
    expect(isAppLocale('zh-SG')).toBe(true)
    expect(isAppLocale('en-US')).toBe(true)
    expect(isAppLocale('zh-CN')).toBe(false)
  })
})
