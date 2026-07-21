import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWebDiagnostics } from './create-web-observability'
import { resolveDiagnosticsUploadConfiguration } from './diagnostics-config'

/** @brief 测试用的无输出 Diagnostics 控制台 / No-output Diagnostics console for tests. */
const testConsole = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}

/**
 * @brief 生成一项可安全上传的启动事件 / Emit one safely uploadable startup event.
 * @param diagnostics 被测诊断端口 / Diagnostics port under test.
 * @return 无返回值 / No return value.
 */
function emitStartupEvent(diagnostics: ReturnType<typeof createWebDiagnostics>): void {
  diagnostics.emit('app.started', {
    app_version: 'test-version',
    platform: 'web',
    upload_enabled: true
  })
}

beforeEach((): void => {
  vi.stubGlobal('crypto', { randomUUID: (): string => 'test-session-id' })
})

afterEach((): void => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('createWebDiagnostics', (): void => {
  it('does not call fetch when diagnostics upload is disabled', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>()
    const configuration = resolveDiagnosticsUploadConfiguration({})
    const diagnostics = createWebDiagnostics({ configuration, console: testConsole, fetchImpl })

    emitStartupEvent(diagnostics)
    await diagnostics.flush()

    expect(fetchImpl).not.toHaveBeenCalled()
    diagnostics.dispose()
  })

  it('uploads enabled diagnostics to the fixed configured endpoint', async (): Promise<void> => {
    const endpoint = 'https://diagnostics.example.test:8443/api/v1/frontend-diagnostics/batches'
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }))
    const configuration = resolveDiagnosticsUploadConfiguration({
      VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
      VITE_DIAGNOSTICS_PORT: '8443'
    })
    if (configuration.kind !== 'enabled') {
      throw new Error('Expected a valid diagnostics configuration to enable upload.')
    }
    expect(configuration.endpoint).toBe(endpoint)
    const diagnostics = createWebDiagnostics({ configuration, console: testConsole, fetchImpl })

    emitStartupEvent(diagnostics)
    await diagnostics.flush()

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        method: 'POST'
      })
    )
    diagnostics.dispose()
  })
})
