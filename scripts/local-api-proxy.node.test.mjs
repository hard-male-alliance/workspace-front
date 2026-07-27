import { once } from 'node:events'
import http from 'node:http'
import net from 'node:net'

import { describe, expect, it } from 'vitest'

/**
 * @param {http.Server} server
 * @return {Promise<number>}
 */
async function listenOnLoopback(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Expected a loopback TCP address.')
  }
  return address.port
}

/**
 * @param {http.Server} server
 * @return {Promise<void>}
 */
async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
}

/**
 * @param {net.Socket} socket
 */
function observeSocket(socket) {
  let received = ''
  /** @type {Array<{ expected: string, reject: (reason?: unknown) => void, resolve: (value: string) => void, timeout: NodeJS.Timeout }>} */
  const waiters = []

  socket.on('data', (chunk) => {
    received += chunk.toString('utf8')
    for (const waiter of [...waiters]) {
      if (!received.includes(waiter.expected)) continue
      clearTimeout(waiter.timeout)
      waiters.splice(waiters.indexOf(waiter), 1)
      waiter.resolve(received)
    }
  })

  return {
    received: () => received,
    waitFor(expected) {
      if (received.includes(expected)) return Promise.resolve(received)
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const waiter = waiters.find((candidate) => candidate.resolve === resolve)
          if (waiter !== undefined) waiters.splice(waiters.indexOf(waiter), 1)
          reject(new Error(`Timed out waiting for socket data: ${expected}`))
        }, 2_000)
        waiters.push({ expected, reject, resolve, timeout })
      })
    }
  }
}

describe('local API proxy', () => {
  it('forwards a WebSocket upgrade and bidirectional bytes through the local entry point', async () => {
    const proxyModule = await import('./local-api-proxy.mjs').catch((error) => error)

    expect(proxyModule).toHaveProperty('createLocalApiProxy')
    if (
      proxyModule === null ||
      typeof proxyModule !== 'object' ||
      !('createLocalApiProxy' in proxyModule) ||
      typeof proxyModule.createLocalApiProxy !== 'function'
    ) {
      return
    }

    /** @type {{ origin: string | undefined, path: string | undefined, protocol: string | undefined } | undefined} */
    let upstreamRequest
    /** @type {net.Socket | undefined} */
    let upstreamSocket
    /** @type {(value: void) => void} */
    let resolveUpgrade
    const upstreamUpgrade = new Promise((resolve) => {
      resolveUpgrade = resolve
    })
    const upstream = http.createServer()
    upstream.on('upgrade', (request, socket) => {
      upstreamRequest = {
        origin: request.headers.origin,
        path: request.url,
        protocol: request.headers['sec-websocket-protocol']
      }
      upstreamSocket = socket
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Connection: Upgrade\r\n' +
          'Upgrade: websocket\r\n' +
          'Sec-WebSocket-Protocol: aiws.interview.realtime.v2\r\n\r\n'
      )
      socket.write('server-ready')
      socket.on('data', (chunk) => socket.write(Buffer.concat([Buffer.from('echo:'), chunk])))
      resolveUpgrade()
    })

    /** @type {http.Server | undefined} */
    let proxy
    /** @type {net.Socket | undefined} */
    let client
    try {
      const upstreamPort = await listenOnLoopback(upstream)
      proxy = proxyModule.createLocalApiProxy({
        upstreamHost: '127.0.0.1',
        upstreamPort
      })
      const proxyPort = await listenOnLoopback(proxy)

      client = net.createConnection({ host: '127.0.0.1', port: proxyPort })
      await once(client, 'connect')
      const observedClient = observeSocket(client)
      client.write(
        'GET /realtime/v2/interview?token=test HTTP/1.1\r\n' +
          'Host: dev.hmalliances.org:9000\r\n' +
          'Connection: Upgrade\r\n' +
          'Upgrade: websocket\r\n' +
          'Origin: http://dev.hmalliances.org:5173\r\n' +
          'Sec-WebSocket-Version: 13\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
          'Sec-WebSocket-Protocol: aiws.interview.realtime.v2\r\n\r\n'
      )

      await upstreamUpgrade
      const handshake = await observedClient.waitFor('server-ready')
      expect(handshake).toContain('HTTP/1.1 101 Switching Protocols')
      expect(handshake).toContain('Sec-WebSocket-Protocol: aiws.interview.realtime.v2')
      expect(upstreamRequest).toEqual({
        origin: 'http://dev.hmalliances.org:5173',
        path: '/realtime/v2/interview?token=test',
        protocol: 'aiws.interview.realtime.v2'
      })

      client.write('client-payload')
      expect(await observedClient.waitFor('echo:client-payload')).toContain('echo:client-payload')
    } finally {
      client?.destroy()
      upstreamSocket?.destroy()
      if (proxy !== undefined) await closeServer(proxy)
      await closeServer(upstream)
    }
  })
})
