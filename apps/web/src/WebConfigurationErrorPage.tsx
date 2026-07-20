import { ErrorState } from '@ai-job-workspace/app'

/** @brief Web 公开 API 配置错误页 / Public Web API configuration error page. */
export function WebConfigurationErrorPage(): React.JSX.Element {
  return (
    <main className="aw-page">
      <ErrorState
        description={
          <>
            请检查 <code>apps/web/.env.local</code>：只设置完整的 <code>VITE_API_BASE_URL</code>
            ，或使用 <code>VITE_API_PROTOCOL</code>、<code>VITE_API_HOSTNAME</code> 与
            <code>VITE_API_PORT</code>。两种配置不能混用，修正后请重新启动 Web 开发服务器。
          </>
        }
        title="无法启动 Web 联调"
      />
    </main>
  )
}
