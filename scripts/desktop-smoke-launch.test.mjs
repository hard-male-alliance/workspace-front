import { describe, expect, it } from 'vitest'

import { createDesktopSmokeLaunch } from './desktop-smoke-launch.mjs'

describe('createDesktopSmokeLaunch', () => {
  it('在 POSIX 平台直接执行 Electron 二进制', () => {
    expect(
      createDesktopSmokeLaunch('linux', undefined, '/repo/electron', '/repo/out/main/index.js')
    ).toEqual({
      command: '/repo/electron',
      args: ['/repo/out/main/index.js']
    })
  })

  it('在 Windows 经命令解释器调用 electron.cmd', () => {
    expect(
      createDesktopSmokeLaunch(
        'win32',
        'C:\\Windows\\System32\\cmd.exe',
        'C:\\repo with space\\electron.cmd',
        'C:\\repo with space\\out\\main\\index.js'
      )
    ).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        '"C:\\repo with space\\electron.cmd" "C:\\repo with space\\out\\main\\index.js"'
      ]
    })
  })
})
