import http from 'node:http'

/**
 * @param {http.IncomingMessage} request
 * @param {string} upstreamHost
 * @param {number} upstreamPort
 * @return {http.OutgoingHttpHeaders}
 */
function createUpstreamHeaders(request, upstreamHost, upstreamPort) {
  return {
    ...request.headers,
    host: `${upstreamHost}:${String(upstreamPort)}`
  }
}

/**
 * @param {net.Socket} socket
 * @param {http.IncomingMessage} response
 * @return {void}
 */
function writeRawResponseHead(socket, response) {
  const statusCode = response.statusCode ?? 502
  const statusMessage = response.statusMessage ?? http.STATUS_CODES[statusCode] ?? 'Bad Gateway'
  const lines = [`HTTP/${response.httpVersion} ${String(statusCode)} ${statusMessage}`]
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    lines.push(`${response.rawHeaders[index]}: ${response.rawHeaders[index + 1]}`)
  }
  socket.write(`${lines.join('\r\n')}\r\n\r\n`)
}

/**
 * @param {net.Socket} clientSocket
 * @param {net.Socket | undefined} upstreamSocket
 * @return {void}
 */
function destroySockets(clientSocket, upstreamSocket) {
  if (!clientSocket.destroyed) clientSocket.destroy()
  if (upstreamSocket !== undefined && !upstreamSocket.destroyed) upstreamSocket.destroy()
}

/**
 * @brief 投影不泄露上游细节的代理错误 / Project a proxy failure without upstream details.
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {ReadonlySet<string>} allowedOrigins
 * @return {void}
 */
function writeHttpProxyFailure(request, response, allowedOrigins) {
  const headers = {
    'cache-control': 'no-store',
    'content-type': 'application/problem+json'
  }
  const origin = request.headers.origin
  if (typeof origin === 'string' && allowedOrigins.has(origin)) {
    headers['access-control-allow-origin'] = origin
    headers.vary = 'Origin'
  }
  response.writeHead(502, headers)
  response.end(
    JSON.stringify({
      detail: 'The local backend is unavailable.',
      status: 502,
      title: 'Bad Gateway',
      type: 'about:blank'
    })
  )
}

/**
 * @param {{
 *   clientHead: Buffer,
 *   clientSocket: net.Socket,
 *   request: http.IncomingMessage,
 *   upstreamHost: string,
 *   upstreamPort: number
 * }} options
 * @return {void}
 */
function proxyWebSocketUpgrade({
  clientHead,
  clientSocket,
  request,
  upstreamHost,
  upstreamPort
}) {
  let upgradedSocket
  const upstream = http.request({
    headers: createUpstreamHeaders(request, upstreamHost, upstreamPort),
    hostname: upstreamHost,
    method: request.method,
    path: request.url,
    port: upstreamPort
  })

  const fail = () => {
    if (!clientSocket.destroyed) {
      clientSocket.write(
        'HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nLocal backend is unavailable.'
      )
    }
    destroySockets(clientSocket, upgradedSocket)
  }

  upstream.once('upgrade', (response, upstreamSocket, upstreamHead) => {
    upgradedSocket = upstreamSocket
    writeRawResponseHead(clientSocket, response)
    if (clientHead.length > 0) upstreamSocket.write(clientHead)
    if (upstreamHead.length > 0) clientSocket.write(upstreamHead)

    const destroyBoth = () => destroySockets(clientSocket, upstreamSocket)
    clientSocket.once('error', destroyBoth)
    upstreamSocket.once('error', destroyBoth)
    clientSocket.once('close', destroyBoth)
    upstreamSocket.once('close', destroyBoth)
    clientSocket.pipe(upstreamSocket)
    upstreamSocket.pipe(clientSocket)
  })

  upstream.once('response', (response) => {
    writeRawResponseHead(clientSocket, response)
    response.pipe(clientSocket)
    response.once('end', () => clientSocket.end())
  })
  upstream.once('error', fail)
  clientSocket.once('error', () => upstream.destroy())
  clientSocket.once('close', () => upstream.destroy())
  upstream.end()
}

/**
 * @param {{
 *   request: http.IncomingMessage,
 *   response: http.ServerResponse,
 *   allowedOrigins: ReadonlySet<string>,
 *   upstreamHost: string,
 *   upstreamPort: number
 * }} options
 * @return {void}
 */
function proxyHttpRequest({ request, response, allowedOrigins, upstreamHost, upstreamPort }) {
  const upstream = http.request(
    {
      headers: createUpstreamHeaders(request, upstreamHost, upstreamPort),
      hostname: upstreamHost,
      method: request.method,
      path: request.url,
      port: upstreamPort
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    }
  )

  upstream.once('error', () => {
    if (!response.headersSent) writeHttpProxyFailure(request, response, allowedOrigins)
    else response.end()
  })
  request.once('error', () => upstream.destroy())
  request.pipe(upstream)
}

/**
 * Create the local development entry point shared by product HTTP and interview WebSocket traffic.
 *
 * @param {{ allowedOrigins?: readonly string[], upstreamHost?: string, upstreamPort?: number }} [options]
 * @return {http.Server}
 */
export function createLocalApiProxy({
  allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://dev.hmalliances.org:5173'
  ],
  upstreamHost = '127.0.0.1',
  upstreamPort = 8000
} = {}) {
  const allowedOriginSet = new Set(allowedOrigins)
  const server = http.createServer((request, response) => {
    proxyHttpRequest({
      request,
      response,
      allowedOrigins: allowedOriginSet,
      upstreamHost,
      upstreamPort
    })
  })
  server.on('upgrade', (request, socket, head) => {
    proxyWebSocketUpgrade({
      clientHead: head,
      clientSocket: socket,
      request,
      upstreamHost,
      upstreamPort
    })
  })
  return server
}
