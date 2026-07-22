/** @file Electron 主进程启动失败报告策略 / Electron main-process startup-failure reporting policy. */

/** @brief 不依赖 renderer i18n 的原生启动错误文案 / Native startup-error copy independent of renderer i18n. */
export interface DesktopStartupFailureCopy {
  /** @brief 可行动且脱敏的错误内容 / Actionable, configuration-safe error content. */
  readonly content: string
  /** @brief 原生错误标题 / Native error title. */
  readonly title: string
}

/** @brief 启动错误的中英文封闭集合 / Closed Chinese/English set of startup-error copy. */
const DESKTOP_STARTUP_FAILURE_COPY: Readonly<Record<'en' | 'zh', DesktopStartupFailureCopy>> = {
  en: {
    content:
      'The application configuration is invalid or a core service could not be initialized. Check the product API endpoint and deployment configuration, then restart the application. If the problem continues, contact your administrator.',
    title: 'AI Job Workspace could not start'
  },
  zh: {
    content:
      '应用配置无效或核心服务无法初始化。请检查产品 API 地址与部署配置，然后重新启动应用；若问题持续，请联系管理员。',
    title: 'AI Job Workspace 无法启动'
  }
}

/** @brief Electron 启动失败报告所需的最小宿主能力 / Minimal host capabilities required to report an Electron startup failure. */
export interface DesktopStartupFailureDependencies {
  /** @brief 将详细原因写入本地诊断 / Write the detailed cause to local diagnostics. */
  readonly logError: (message: string, error: unknown) => void
  /** @brief 显示不泄漏敏感值的原生错误框 / Show a native error box without sensitive values. */
  readonly showErrorBox: (title: string, content: string) => void
  /** @brief 以确定性状态码终止应用 / Terminate the application with a deterministic status code. */
  readonly exit: (exitCode: number) => void
}

/**
 * @brief 不依赖 renderer i18n 地选择原生启动错误文案 / Select native startup-error copy without renderer i18n.
 * @param locale Electron 宿主 locale 候选 / Electron host locale candidate.
 * @return zh 前缀使用中文，其余严格回退英文 / Chinese for a zh prefix, otherwise a strict English fallback.
 */
export function selectDesktopStartupFailureCopy(locale: string): DesktopStartupFailureCopy {
  return locale.trim().toLowerCase().startsWith('zh')
    ? DESKTOP_STARTUP_FAILURE_COPY.zh
    : DESKTOP_STARTUP_FAILURE_COPY.en
}

/**
 * @brief 先向用户显示可行动的原生错误，再终止不完整应用 / Show an actionable native error before terminating an incomplete application.
 * @param error 启动失败原因 / Startup-failure cause.
 * @param locale 主进程可用的宿主 locale / Host locale available to the main process.
 * @param dependencies 本地日志、原生对话框与退出能力 / Local logging, native dialog, and exit capabilities.
 * @return 无返回值 / No return value.
 * @note 原始 error 只进入本地诊断，不得进入对话框 / The raw error is sent only to local diagnostics and never to the dialog.
 */
export function reportDesktopStartupFailure(
  error: unknown,
  locale: string,
  dependencies: DesktopStartupFailureDependencies
): void {
  dependencies.logError('Desktop application failed to start.', error)
  /** @brief 仅基于宿主 locale 选出的原生错误文案 / Native error copy selected only from the host locale. */
  const copy = selectDesktopStartupFailureCopy(locale)
  try {
    dependencies.showErrorBox(copy.title, copy.content)
  } finally {
    dependencies.exit(1)
  }
}
