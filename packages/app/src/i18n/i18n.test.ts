/** @file 应用 i18n 测试 / Application i18n tests. */

import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_APP_LOCALE } from '../domain/models'
import { appI18n, appI18nReady, isAppLocale, setAppLocale } from './i18n'

afterEach(async () => {
  await setAppLocale(DEFAULT_APP_LOCALE)
})

describe('application i18n', () => {
  it('initializes with zh-SG and returns simplified Chinese resources', async () => {
    await appI18nReady

    expect(appI18n.language).toBe('zh-SG')
    expect(appI18n.t('nav.workspace')).toBe('工作台')
    expect(appI18n.t('template.settings.accentStyle.warm')).toBe('暖棕')
  })

  it('switches to en-US without changing translation keys', async () => {
    await setAppLocale('en-US')

    expect(appI18n.language).toBe('en-US')
    expect(appI18n.t('nav.workspace')).toBe('Workspace')
    expect(appI18n.t('template.settings.accentStyle.warm')).toBe('Warm')
  })

  it('accepts only the two deliberately supported UI locales', () => {
    expect(isAppLocale('zh-SG')).toBe(true)
    expect(isAppLocale('en-US')).toBe(true)
    expect(isAppLocale('zh-CN')).toBe(false)
  })
})
