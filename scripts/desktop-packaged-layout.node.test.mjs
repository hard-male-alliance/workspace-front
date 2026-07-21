import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackagedLayoutCandidates } from './desktop-packaged-layout.mjs'

describe('createPackagedLayoutCandidates', () => {
  it('构造 Linux unpacked 布局', () => {
    expect(createPackagedLayoutCandidates('/release', 'linux', 'x64')).toEqual([
      {
        applicationPath: path.join('/release', 'linux-unpacked'),
        asarPath: path.join('/release', 'linux-unpacked', 'resources', 'app.asar'),
        executablePath: path.join('/release', 'linux-unpacked', 'ai-job-workspace'),
        resourcesPath: path.join('/release', 'linux-unpacked', 'resources')
      }
    ])
  })

  it('构造 Windows unpacked 布局', () => {
    expect(createPackagedLayoutCandidates('C:\\release', 'win32', 'x64')[0]).toEqual({
      applicationPath: path.join('C:\\release', 'win-unpacked'),
      asarPath: path.join('C:\\release', 'win-unpacked', 'resources', 'app.asar'),
      executablePath: path.join('C:\\release', 'win-unpacked', 'ai-job-workspace.exe'),
      resourcesPath: path.join('C:\\release', 'win-unpacked', 'resources')
    })
  })

  it('优先使用架构明确的 macOS bundle 布局', () => {
    const [candidate] = createPackagedLayoutCandidates('/release', 'darwin', 'arm64')

    expect(candidate).toEqual({
      applicationPath: path.join('/release', 'mac-arm64', 'AI Job Workspace.app'),
      asarPath: path.join(
        '/release',
        'mac-arm64',
        'AI Job Workspace.app',
        'Contents',
        'Resources',
        'app.asar'
      ),
      executablePath: path.join(
        '/release',
        'mac-arm64',
        'AI Job Workspace.app',
        'Contents',
        'MacOS',
        'AI Job Workspace'
      ),
      resourcesPath: path.join(
        '/release',
        'mac-arm64',
        'AI Job Workspace.app',
        'Contents',
        'Resources'
      )
    })
  })

  it('拒绝无法分发 Electron 的平台', () => {
    expect(() => createPackagedLayoutCandidates('/release', 'aix', 'ppc64')).toThrowError(
      /does not support platform aix/u
    )
  })
})
