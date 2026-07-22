import { createServer } from 'node:http'

/** @brief smoke 必须触发的产品 API 路径 / Product API path that the smoke must exercise. */
export const desktopSmokeApiPath = '/api/v1/knowledge-sources/ks_smoke_git'
/** @brief smoke 必须允许嵌入的产品 artifact 路径 / Product artifact path the smoke must permit in a frame. */
export const desktopSmokeFramePath = '/api/v1/render-artifacts/artifact_smoke/content'

/** @brief 本地探针返回的最小合法 KnowledgeSource / Minimal valid KnowledgeSource returned by the local probe. */
const smokeKnowledgeSource = Object.freeze({
  config: {
    content_type: 'application/pdf',
    file_id: 'file_smoke',
    filename: 'artifact-smoke.pdf',
    sha256: '0'.repeat(64),
    source_type: 'file'
  },
  created_at: '2026-01-01T00:00:00Z',
  enabled: true,
  id: 'ks_smoke_git',
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

/** @brief 本地探针返回的最小合法当前用户 / Minimal valid current user returned by the local probe. */
const smokeCurrentUser = Object.freeze({
  created_at: '2026-01-01T00:00:00Z',
  default_workspace_id: 'workspace_smoke',
  display_name: 'Packaged Smoke User',
  email: 'packaged-smoke@example.invalid',
  id: 'user_smoke',
  locale: 'en-US',
  timezone: 'UTC'
})

/** @brief 本地探针返回的最小合法 Workspace / Minimal valid Workspace returned by the local probe. */
const smokeWorkspace = Object.freeze({
  created_at: '2026-01-01T00:00:00Z',
  default_locale: 'en-US',
  extensions: {},
  id: 'workspace_smoke',
  name: 'Packaged Smoke Workspace',
  plan: 'team',
  revision: 1,
  slug: 'packaged-smoke',
  timezone: 'UTC',
  updated_at: '2026-01-01T00:00:00Z'
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
    response.setHeader('Access-Control-Expose-Headers', 'ETag')
    response.setHeader('Vary', 'Origin')
    response.setHeader('Cache-Control', 'no-store')

    if (request.method === 'OPTIONS') {
      response.setHeader(
        'Access-Control-Allow-Headers',
        'Accept-Language, Content-Type, Idempotency-Key, If-Match, X-Request-Id'
      )
      response.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS')
      response.writeHead(204)
      response.end()
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/v1/me') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.writeHead(200)
      response.end(JSON.stringify(smokeCurrentUser))
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/v1/workspaces') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.writeHead(200)
      response.end(
        JSON.stringify({
          items: [smokeWorkspace],
          page: { has_more: false, next_cursor: null, total_estimate: 1 }
        })
      )
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === desktopSmokeApiPath) {
      resolveObservedRequest(requestUrl.pathname)
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('ETag', '"knowledge-source-smoke-1"')
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
