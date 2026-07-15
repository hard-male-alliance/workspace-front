/** @file 应用 i18n 实例 / Application i18n instance. */

import i18next, { type i18n } from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'

import { APP_LOCALES, DEFAULT_APP_LOCALE, type AppLocale } from '../domain/models'
import { appTranslationResources } from './resources'

/** @brief 应用共享 i18n 实例 / Shared application i18n instance. */
export const appI18n: i18n = i18next.createInstance()

/**
 * @brief 同步浏览器文档的语言与标题 / Synchronize the browser document language and title.
 * @param locale 当前受支持的界面语言 / Current supported UI locale.
 * @return 无返回值 / No return value.
 * @note Electron renderer 也运行在 DOM 中，因此与 Web 共用此同步逻辑。
 */
function synchronizeDocumentMetadata(locale: AppLocale): void {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.lang = locale
  document.title = appI18n.t('app.name')
}

/**
 * @brief 响应 i18n 已确认的语言变化 / React to a confirmed i18n language change.
 * @param locale i18next 报告的目标语言 / Target language reported by i18next.
 * @return 无返回值 / No return value.
 */
function synchronizeSupportedLanguageChange(locale: string): void {
  if (isAppLocale(locale)) {
    synchronizeDocumentMetadata(locale)
  }
}

appI18n.on('languageChanged', synchronizeSupportedLanguageChange)

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
  .then((): void => {
    synchronizeDocumentMetadata(
      isAppLocale(appI18n.language) ? appI18n.language : DEFAULT_APP_LOCALE
    )
  })

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
export function isAppLocale(value: string): value is AppLocale {
  return value === 'zh-SG' || value === 'en-US'
}

/**
 * @brief 获取 React 翻译 Hook / Get the React translation hook.
 * @return react-i18next 的翻译结果 / Translation result from react-i18next.
 * @note 只能在 React 函数组件或自定义 Hook 中调用。
 */
export const useAppTranslation = () => useTranslation()
