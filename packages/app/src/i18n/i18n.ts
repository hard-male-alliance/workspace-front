/** @file 应用 i18n 实例 / Application i18n instance. */

import i18next, { type i18n } from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'

import { APP_LOCALES, DEFAULT_APP_LOCALE, type AppLocale } from '../domain/models'
import { appTranslationResources } from './resources'

/** @brief 应用共享 i18n 实例 / Shared application i18n instance. */
export const appI18n: i18n = i18next.createInstance()

/**
 * @brief 应用 i18n 初始化完成 Promise / Application i18n initialization completion promise.
 * @note Web 与 Electron renderer 共用此实例；Electron main/preload 不应导入 React i18n。
 */
export const appI18nReady: Promise<void> = appI18n
  .use(initReactI18next)
  .init({
    resources: appTranslationResources,
    lng: DEFAULT_APP_LOCALE,
    fallbackLng: DEFAULT_APP_LOCALE,
    supportedLngs: APP_LOCALES,
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    returnNull: false
  })
  .then(() => undefined)

/**
 * @brief 切换应用界面语言 / Switch the application UI locale.
 * @param locale 目标界面语言 / Target UI locale.
 * @return 语言切换完成 Promise / Locale-switch completion promise.
 */
export const setAppLocale = async (locale: AppLocale): Promise<void> => {
  await appI18nReady
  await appI18n.changeLanguage(locale)
}

/**
 * @brief 判断字符串是否为支持的 UI 语言 / Check whether a string is a supported UI locale.
 * @param value 待判断字符串 / Candidate string.
 * @return 是否为支持的语言 / Whether it is a supported locale.
 */
export const isAppLocale = (value: string): value is AppLocale =>
  value === 'zh-SG' || value === 'en-US'

/**
 * @brief 获取 React 翻译 Hook / Get the React translation hook.
 * @return react-i18next 的翻译结果 / Translation result from react-i18next.
 * @note 只能在 React 函数组件或自定义 Hook 中调用。
 */
export const useAppTranslation = () => useTranslation()
