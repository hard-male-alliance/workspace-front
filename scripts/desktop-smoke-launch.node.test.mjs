import { describe, expect, it } from 'vitest'

import { createDesktopSmokeLaunch } from './desktop-smoke-launch.mjs'

describe('createDesktopSmokeLaunch', () => {
  it('通过 Node 执行 Electron CLI 脚本', () => {
    expect(
      createDesktopSmokeLaunch(
        '/usr/bin/node',
        '/repo/node_modules/electron/cli.js',
        '/repo/out/main/index.js'
      )
    ).toEqual({
      command: '/usr/bin/node',
      args: ['/repo/node_modules/electron/cli.js', '/repo/out/main/index.js']
    })
  })

  it('将 Windows 空格路径作为独立参数传给 Node', () => {
    expect(
      createDesktopSmokeLaunch(
        'C:\\Program Files\\nodejs\\node.exe',
        'C:\\repo with space\\electron\\cli.js',
        'C:\\repo with space\\out\\main\\index.js'
      )
    ).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\repo with space\\electron\\cli.js', 'C:\\repo with space\\out\\main\\index.js']
    })
  })
})
