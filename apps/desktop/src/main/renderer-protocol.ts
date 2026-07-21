import path from 'node:path'

/** @brief 生产 renderer 使用的受限协议名称 / Restricted protocol name used by the production renderer. */
export const rendererProtocolScheme = 'ai-job-workspace'

/** @brief 生产 renderer 使用的受限协议主机名 / Restricted protocol hostname used by the production renderer. */
export const rendererProtocolHost = 'renderer'

/** @brief 开发 renderer 允许使用的回环主机 / Loopback hosts allowed for the development renderer. */
const allowedDevelopmentRendererHosts = new Set(['127.0.0.1', 'localhost'])

/**
 * @brief 校验并规范化开发 renderer origin / Validate and normalize the development renderer origin.
 * @param candidate electron-vite 提供的未受信任 URL / Untrusted URL supplied by electron-vite.
 * @return 仅含协议、主机与端口的回环 origin / Loopback origin containing only scheme, host, and port.
 * @throws URL 不是无凭证、无路径的本机 HTTP(S) origin 时抛出 / Throws unless the URL is a credential-free, path-free local HTTP(S) origin.
 */
export function validateDevelopmentRendererUrl(candidate: string): string {
  /** @brief 已解析的开发 renderer URL / Parsed development renderer URL. */
  let url: URL

  try {
    url = new URL(candidate)
  } catch {
    throw new Error('The development renderer URL must be a valid loopback HTTP(S) origin.')
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !allowedDevelopmentRendererHosts.has(url.hostname) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      'The development renderer URL must be a credential-free localhost or 127.0.0.1 HTTP(S) origin without a path, query, or fragment.'
    )
  }

  return url.origin
}

/**
 * @brief 选择当前进程唯一可信的 renderer URL / Select the only trusted renderer URL for the current process.
 * @param isPackaged 应用是否为已打包构建 / Whether the application is a packaged build.
 * @param developmentRendererUrl 开发服务器 URL / Development-server URL.
 * @param productionRendererUrl 受限生产协议 URL / Restricted production-protocol URL.
 * @return 开发态服务器 URL 或生产协议 URL / Development-server URL or production-protocol URL.
 * @note 已打包应用始终忽略环境变量中的开发服务器 URL / Packaged applications always ignore a development-server URL from the environment.
 */
export function selectTrustedRendererUrl(
  isPackaged: boolean,
  developmentRendererUrl: string | undefined,
  productionRendererUrl: string
): string {
  if (isPackaged || developmentRendererUrl === undefined) return productionRendererUrl
  return validateDevelopmentRendererUrl(developmentRendererUrl)
}

/**
 * @brief 检测 URL 原始路径中的父目录片段 / Detect parent-directory segments in a URL's raw path.
 * @param requestUrl 待检查的请求 URL / Request URL to inspect.
 * @return 包含或无法安全解码父目录片段时为 true / True when a parent segment exists or cannot be decoded safely.
 * @note 在 `URL` 构造器规范化路径之前检查，避免编码后的 `..` 被静默折叠。
 */
function hasParentPathSegment(requestUrl: string): boolean {
  /** @brief 协议分隔符的起始位置 / Start index of the scheme separator. */
  const schemeBoundary = requestUrl.indexOf('://')

  if (schemeBoundary === -1) {
    return true
  }

  /** @brief authority 之后第一个路径分隔符的位置 / Position of the first path separator after authority. */
  const pathStart = requestUrl.indexOf('/', schemeBoundary + 3)
  /** @brief 未规范化的路径与查询部分 / Unnormalized path-and-query portion. */
  const rawPathAndQuery = pathStart === -1 ? '/' : requestUrl.slice(pathStart)
  /** @brief 未规范化的原始路径 / Unnormalized raw pathname. */
  const [rawPathname = ''] = rawPathAndQuery.split(/[?#]/, 1)
  /** @brief 百分号解码后的原始路径 / Percent-decoded raw pathname. */
  let decodedPathname: string

  try {
    decodedPathname = decodeURIComponent(rawPathname)
  } catch {
    return true
  }

  return decodedPathname.split('/').includes('..')
}

/**
 * @brief 解析受限协议请求对应的 renderer 文件 / Resolve a renderer file for a restricted-protocol request.
 * @param requestUrl renderer 协议请求 URL / Renderer-protocol request URL.
 * @param rendererDirectory 已构建 renderer 的根目录 / Root directory of the built renderer.
 * @return 可安全读取的目标文件路径；非法来源或越界路径时为 undefined / Safe target file path, or undefined for an invalid origin or escaping path.
 * @note 无扩展名的路径回退至 `index.html`，使 React Router 的客户端路由可刷新。
 */
export function resolveRendererFilePath(
  requestUrl: string,
  rendererDirectory: string
): string | undefined {
  if (hasParentPathSegment(requestUrl)) {
    return undefined
  }

  /** @brief 已解析的协议请求 URL / Parsed protocol request URL. */
  let request: URL

  try {
    request = new URL(requestUrl)
  } catch {
    return undefined
  }

  if (
    request.protocol !== `${rendererProtocolScheme}:` ||
    request.hostname !== rendererProtocolHost
  ) {
    return undefined
  }

  /** @brief 经解码的请求路径 / Decoded request pathname. */
  let requestPathname: string

  try {
    requestPathname = decodeURIComponent(request.pathname)
  } catch {
    return undefined
  }

  /** @brief 请求资源在 URL 路径语义下的扩展名 / Requested resource extension in URL-path semantics. */
  const extension = path.posix.extname(requestPathname)
  /** @brief 待解析的相对 renderer 路径 / Relative renderer path to resolve. */
  const relativePath =
    requestPathname === '/' || extension.length === 0 ? '/index.html' : requestPathname
  /** @brief 解析后的候选绝对路径 / Resolved candidate absolute path. */
  const candidatePath = path.resolve(rendererDirectory, `.${relativePath}`)
  /** @brief 候选路径相对 renderer 根目录的位置 / Candidate location relative to the renderer root. */
  const relativeCandidatePath = path.relative(rendererDirectory, candidatePath)

  if (
    relativeCandidatePath === '..' ||
    relativeCandidatePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeCandidatePath)
  ) {
    return undefined
  }

  return candidatePath
}
