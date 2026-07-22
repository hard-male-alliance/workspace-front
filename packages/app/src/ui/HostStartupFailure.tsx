import '../styles/shared-ui/host-startup-failure.css'

/** @brief 宿主启动失败视图属性 / Host startup-failure view properties. */
export interface HostStartupFailureProps {
  /** @brief 宿主提供的 BCP 47 locale 候选 / BCP 47 locale candidate supplied by the host. */
  readonly locale: string
  /** @brief 用户确认后重新加载宿主应用 / Reload the host application after explicit user confirmation. */
  readonly onRetry: () => void
}

/** @brief 不依赖应用 i18n 初始化的启动错误文案 / Startup-error copy independent of application i18n initialization. */
interface HostStartupFailureCopy {
  /** @brief 操作按钮 / Action label. */
  readonly action: string
  /** @brief 页面语言 / Page language. */
  readonly language: 'en' | 'zh'
  /** @brief 可行动说明 / Actionable explanation. */
  readonly message: string
  /** @brief 错误标题 / Error title. */
  readonly title: string
}

/** @brief 启动错误的中英文封闭集合 / Closed Chinese/English set of startup-error copy. */
const HOST_STARTUP_FAILURE_COPY: Readonly<
  Record<HostStartupFailureCopy['language'], HostStartupFailureCopy>
> = {
  en: {
    action: 'Reload application',
    language: 'en',
    message:
      'The application configuration is invalid or a core service could not be initialized. Ask your administrator to check the deployment configuration, then reload this application.',
    title: 'The application cannot start'
  },
  zh: {
    action: '重新加载应用',
    language: 'zh',
    message: '应用配置无效或核心服务无法初始化。请联系管理员检查部署配置，然后重新加载应用。',
    title: '应用暂时无法启动'
  }
}

/**
 * @brief 不依赖 i18n 容器地选择启动错误文案 / Select startup-error copy without depending on an i18n container.
 * @param locale 宿主 locale 候选 / Host locale candidate.
 * @return zh 前缀使用中文，其余严格回退英文 / Chinese for a zh prefix, otherwise a strict English fallback.
 */
function selectHostStartupFailureCopy(locale: string): HostStartupFailureCopy {
  return locale.trim().toLowerCase().startsWith('zh')
    ? HOST_STARTUP_FAILURE_COPY.zh
    : HOST_STARTUP_FAILURE_COPY.en
}

/**
 * @brief 在宿主组合失败时显示可行动且不泄漏配置的错误 / Show an actionable, configuration-safe error when host composition fails.
 * @param props 宿主 locale 与重试动作 / Host locale and retry action.
 * @return 可访问的启动失败页 / Accessible startup-failure page.
 */
export function HostStartupFailure({
  locale,
  onRetry
}: HostStartupFailureProps): React.JSX.Element {
  /** @brief 仅基于宿主 locale 选出的启动文案 / Startup copy selected only from the host locale. */
  const copy = selectHostStartupFailureCopy(locale)
  return (
    <main className="aw-host-startup-screen" lang={copy.language}>
      <section
        aria-labelledby="host-startup-error-title"
        className="aw-host-startup-card"
        role="alert"
      >
        <p className="aw-host-startup-eyebrow">Inkwell · Job Workspace</p>
        <h1 id="host-startup-error-title">{copy.title}</h1>
        <p>{copy.message}</p>
        <button className="aw-host-startup-action" onClick={onRetry} type="button">
          {copy.action}
        </button>
      </section>
    </main>
  )
}
