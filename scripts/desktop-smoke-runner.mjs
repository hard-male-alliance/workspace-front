import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

/** @brief smoke 必须触发的产品 API 路径 / Product API path that the smoke must exercise. */
export const desktopSmokeApiPath = '/api/v1/knowledge-sources/ks_mock_git'
/** @brief smoke 必须允许嵌入的产品 artifact 路径 / Product artifact path the smoke must permit in a frame. */
export const desktopSmokeFramePath = '/api/v1/render-artifacts/artifact_smoke/content'

/** @brief 本地探针返回的最小合法 KnowledgeSource / Minimal valid KnowledgeSource returned by the local probe. */
const smokeKnowledgeSource = Object.freeze({
  config: { filename: 'artifact-smoke.pdf', source_type: 'file' },
  created_at: '2026-01-01T00:00:00Z',
  enabled: true,
  id: 'ks_mock_git',
  ingestion: {
    chunk_count: 1,
    document_count: 1,
    last_success_at: '2026-01-01T00:00:00Z',
    status: 'ready'
  },
  name: 'Packaged smoke knowledge',
  revision: 1,
  source_type: 'file',
  updated_at: '2026-01-01T00:00:00Z',
  visibility: {
    agent_grants: [
      {
        agent_scope: 'general_chat',
        allowed_operations: ['retrieve'],
        effect: 'allow'
      }
    ],
    allow_external_model_processing: false,
    allowed_model_regions: [],
    default_effect: 'deny',
    policy_version: 1,
    retention_days: null,
    sensitivity: 'normal',
    session_override_allowed: false
  },
  workspace_id: 'workspace_smoke'
})

/**
 * @brief 启动只监听回环地址的产品 API 探针 / Start a product API probe bound only to loopback.
 * @return API origin、观察 Promise 与关闭函数 / API origin, observation promise, and close function.
 * @note 探针响应正常业务端点，不向 renderer 注入任何测试 API。 / The probe serves a normal product endpoint and injects no test API into the renderer.
 */
export async function startDesktopSmokeApiProbe() {
  /** @brief 已观察到目标请求时的兑现函数 / Resolver called after the target request is observed. */
  let resolveObservedRequest
  /** @brief 已观察到目标 frame 请求时的兑现函数 / Resolver called after the target frame request is observed. */
  let resolveObservedFrameRequest
  /** @brief 目标业务请求观察结果 / Observation of the target product request. */
  const observedRequest = new Promise((resolve) => {
    resolveObservedRequest = resolve
  })
  /** @brief 目标 artifact frame 请求观察结果 / Observation of the target artifact frame request. */
  const observedFrameRequest = new Promise((resolve) => {
    resolveObservedFrameRequest = resolve
  })
  /** @brief smoke 期间收到的请求路径 / Request paths received during the smoke. */
  const requestPaths = []
  /** @brief 仅供当前 smoke 使用的本地 HTTP 服务 / Local HTTP server used only by this smoke. */
  const server = createServer((request, response) => {
    /** @brief 当前请求的解析 URL / Parsed URL for the current request. */
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')

    requestPaths.push(requestUrl.pathname)
    /** @brief Chromium 序列化后的自定义协议 Origin / Custom-protocol Origin serialized by Chromium. */
    const requestOrigin = request.headers.origin
    response.setHeader('Access-Control-Allow-Origin', requestOrigin ?? '*')
    response.setHeader('Vary', 'Origin')
    response.setHeader('Cache-Control', 'no-store')

    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key, If-Match')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      response.writeHead(204)
      response.end()
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === desktopSmokeApiPath) {
      resolveObservedRequest(requestUrl.pathname)
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.writeHead(200)
      response.end(JSON.stringify(smokeKnowledgeSource))
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === desktopSmokeFramePath) {
      resolveObservedFrameRequest(requestUrl.pathname)
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.writeHead(200)
      response.end('<!doctype html><title>Artifact smoke</title><p>Artifact frame loaded.</p>')
      return
    }

    response.setHeader('Content-Type', 'application/problem+json; charset=utf-8')
    response.writeHead(404)
    response.end(
      JSON.stringify({
        code: 'smoke.not_found',
        detail: null,
        status: 404,
        title: 'Smoke endpoint not found',
        type: 'about:blank'
      })
    )
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  /** @brief 操作系统分配的监听地址 / Listening address allocated by the operating system. */
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('Desktop smoke API probe did not receive a TCP port.')
  }

  return {
    observedFrameRequest,
    origin: `http://127.0.0.1:${String(address.port)}`,
    requestPaths,
    observedRequest,
    /**
     * @brief 关闭本地 API 探针 / Close the local API probe.
     * @return 服务关闭时兑现的 Promise / Promise fulfilled when the server closes.
     */
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    }
  }
}

/**
 * @brief 等待指定 Promise，超时则抛错 / Await a promise and throw when the deadline expires.
 * @param promise 需要等待的工作 / Work to await.
 * @param timeoutMilliseconds 最大等待毫秒数 / Maximum wait in milliseconds.
 * @param message 超时错误信息 / Timeout error message.
 * @return 原 Promise 的兑现值 / Fulfilled value of the original promise.
 */
async function withTimeout(promise, timeoutMilliseconds, message) {
  /** @brief 超时计时器标识 / Timeout timer identifier. */
  let timeout

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMilliseconds)
      })
    ])
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * @brief 通过本地 API 运行一次真实 Electron smoke / Run one real Electron smoke against a local API.
 * @param launch Electron 启动命令、参数和工作目录 / Electron launch command, arguments, and working directory.
 * @return 已观察业务请求与进程输出 / Observed product request and process output.
 */
export async function runDesktopSmokeProcess(launch) {
  /** @brief 受控产品 API 探针 / Controlled product API probe. */
  const apiProbe = await startDesktopSmokeApiProbe()
  /** @brief Electron 子进程环境 / Electron child-process environment. */
  const smokeEnvironment = {
    ...process.env,
    AI_JOB_WORKSPACE_API_BASE_URL: apiProbe.origin,
    AI_JOB_WORKSPACE_SMOKE: '1'
  }

  delete smokeEnvironment.AI_JOB_WORKSPACE_API_HOSTNAME
  delete smokeEnvironment.AI_JOB_WORKSPACE_API_PORT
  delete smokeEnvironment.AI_JOB_WORKSPACE_API_PROTOCOL
  delete smokeEnvironment.ELECTRON_RUN_AS_NODE

  /** @brief Electron stdout 文本 / Electron stdout text. */
  let stdout = ''
  /** @brief Electron stderr 文本 / Electron stderr text. */
  let stderr = ''
  /** @brief 正在运行的 Electron 子进程 / Running Electron child process. */
  const child = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    env: smokeEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
    process.stdout.write(chunk)
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
    process.stderr.write(chunk)
  })

  try {
    /** @brief Electron 的退出码与退出信号 / Electron exit code and exit signal. */
    const [exitCode, exitSignal] = await withTimeout(
      new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => resolve([code, signal]))
      }),
      20_000,
      'Desktop smoke process did not exit before the timeout.'
    )

    if (exitCode !== 0) {
      throw new Error(
        `Desktop smoke failed with exit code ${String(exitCode)} and signal ${String(exitSignal)}.`
      )
    }
    if (!stdout.includes('Desktop smoke passed:')) {
      throw new Error('Desktop smoke process exited without reporting renderer verification.')
    }

    return { stderr, stdout }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill()
    await apiProbe.close()
  }
}
