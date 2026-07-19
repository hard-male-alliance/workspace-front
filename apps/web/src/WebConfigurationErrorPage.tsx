import { ErrorState } from '@ai-job-workspace/app'

/**
 * @brief Web 联调启动配置错误页 / Web integration bootstrap configuration error page.
 * @return 可访问且包含恢复路径的错误状态 / Accessible error state with a recovery path.
 */
export function WebConfigurationErrorPage(): React.JSX.Element {
  return (
    <main className="aw-page">
      <ErrorState
        description={
          <>
            请在 <code>apps/web/.env.local</code> 中设置公开的 <code>VITE_API_BASE_URL</code>
            ，例如 <code>http://127.0.0.1:8000</code>，然后重新启动 Web 开发服务器。
          </>
        }
        title="无法启动 Web 联调"
      />
    </main>
  )
}
