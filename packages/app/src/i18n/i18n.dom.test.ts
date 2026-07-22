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
    expect(appI18n.t('errors.authenticationRequired')).toBe(
      '此内容需要登录，但当前应用尚未接通身份认证。请联系管理员完成配置。'
    )
    expect(appI18n.t('errors.capabilityUnavailable')).toBe('这项功能当前尚不可用。')
    expect(appI18n.t('errors.invalidRequest')).toBe(
      '服务未接受提交的内容。请检查输入；如问题持续，请联系支持。'
    )
    expect(appI18n.t('errors.outcomeUnknown')).toBe(
      '请求可能已被服务处理。请先重新加载权威数据确认结果，不要立即重复提交。'
    )
    expect(appI18n.t('errors.unknown')).toBe(
      '应用无法确认本次请求结果。继续操作前，请重新加载最新数据。'
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
      'The request may already have been processed. Reload authoritative data to confirm the result; do not submit it again immediately.'
    )
    expect(appI18n.t('errors.unknown')).toBe(
      'The app could not confirm the result of this request. Reload the latest data before continuing.'
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
