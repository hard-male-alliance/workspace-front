import http from 'node:http'

/**
 * @param {http.IncomingMessage} request
 * @param {number} upstreamPort
 * @return {http.OutgoingHttpHeaders}
 */
function createUpstreamHeaders(request, upstreamPort) {
  return {
    ...request.headers,
    host: `127.0.0.1:${String(upstreamPort)}`
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
    headers: createUpstreamHeaders(request, upstreamPort),
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
 *   upstreamHost: string,
 *   upstreamPort: number
 * }} options
 * @return {void}
 */
function proxyHttpRequest({ request, response, upstreamHost, upstreamPort }) {
  const upstream = http.request(
    {
      headers: createUpstreamHeaders(request, upstreamPort),
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
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    }
    response.end('Local backend is unavailable.')
  })
  request.once('error', () => upstream.destroy())
  request.pipe(upstream)
}

/**
 * Create the local development entry point shared by product HTTP and interview WebSocket traffic.
 *
 * @param {{ upstreamHost?: string, upstreamPort?: number }} [options]
 * @return {http.Server}
 */
export function createLocalApiProxy({
  upstreamHost = '127.0.0.1',
  upstreamPort = 8000
} = {}) {
  const server = http.createServer((request, response) => {
    proxyHttpRequest({ request, response, upstreamHost, upstreamPort })
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
