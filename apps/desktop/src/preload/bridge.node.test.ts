import { describe, expect, it, vi } from 'vitest'

import {
  RUNTIME_INFO_CHANNEL,
  SAVE_ARTIFACT_CHANNEL,
  sanitizePdfFileName
} from '@ai-job-workspace/platform'

import { createDesktopPlatformBridge } from './bridge'
import { validatePreloadArtifactSaveRequest } from './bridge'

describe('createDesktopPlatformBridge', () => {
  it('只经固定通道请求运行时信息', async () => {
    /** @brief 已记录调用的 IPC mock / IPC mock with recorded calls. */
    const invokeRuntimeInfo = vi.fn().mockResolvedValue({
      apiBaseUrl: 'https://api.example.test',
      platform: 'electron' as const,
      appVersion: '0.1.0-test'
    })
    /** @brief 产物保存 IPC mock / Artifact-save IPC mock. */
    const invokeArtifactSave = vi.fn().mockResolvedValue({ status: 'saved' as const })
    /** @brief 待测的桌面平台桥接 / Desktop platform bridge under test. */
    const bridge = createDesktopPlatformBridge(invokeRuntimeInfo, invokeArtifactSave)

    await expect(bridge.getRuntimeInfo()).resolves.toEqual({
      apiBaseUrl: 'https://api.example.test',
      platform: 'electron',
      appVersion: '0.1.0-test'
    })
    expect(invokeRuntimeInfo).toHaveBeenCalledTimes(1)
    expect(invokeRuntimeInfo).toHaveBeenCalledWith(RUNTIME_INFO_CHANNEL)
    expect(Object.keys(bridge)).toEqual(['getRuntimeInfo', 'saveArtifact'])
  })

  it('透传主进程验证后的诊断 endpoint', async () => {
    /** @brief 仅由主进程提供的已验证 endpoint / Validated endpoint provided only by the main process. */
    const diagnosticsEndpoint =
      'https://diagnostics.example.test:8443/api/v1/frontend-diagnostics/batches'
    /** @brief 返回已验证 runtime 信息的 IPC mock / IPC mock returning validated runtime information. */
    const invokeRuntimeInfo = vi.fn().mockResolvedValue({
      apiBaseUrl: 'https://api.example.test',
      appVersion: '0.1.0-test',
      diagnosticsEndpoint,
      platform: 'electron' as const
    })
    /** @brief 待测的桌面平台桥接 / Desktop platform bridge under test. */
    /** @brief 产物保存 IPC mock / Artifact-save IPC mock. */
    const invokeArtifactSave = vi.fn().mockResolvedValue({ status: 'cancelled' as const })
    const bridge = createDesktopPlatformBridge(invokeRuntimeInfo, invokeArtifactSave)

    await expect(bridge.getRuntimeInfo()).resolves.toEqual({
      apiBaseUrl: 'https://api.example.test',
      appVersion: '0.1.0-test',
      diagnosticsEndpoint,
      platform: 'electron'
    })
    expect(Object.keys(bridge)).toEqual(['getRuntimeInfo', 'saveArtifact'])
  })

  it('只经固定通道透传窄产物保存请求与判别结果', async () => {
    /** @brief 运行时信息 IPC mock / Runtime-info IPC mock. */
    const invokeRuntimeInfo = vi.fn()
    /** @brief 产物保存 IPC mock / Artifact-save IPC mock. */
    const invokeArtifactSave = vi.fn().mockResolvedValue({ status: 'cancelled' as const })
    /** @brief 待测的桌面平台桥接 / Desktop platform bridge under test. */
    const bridge = createDesktopPlatformBridge(invokeRuntimeInfo, invokeArtifactSave)
    /** @brief 经过平台净化的建议文件名 / Suggested filename sanitized by the platform boundary. */
    const suggestedFileName = sanitizePdfFileName('Klee Resume')

    await expect(
      bridge.saveArtifact({
        artifactId: 'artifact_123',
        suggestedFileName
      })
    ).resolves.toEqual({ status: 'cancelled' })
    expect(invokeArtifactSave).toHaveBeenCalledWith(SAVE_ARTIFACT_CHANNEL, {
      artifactId: 'artifact_123',
      suggestedFileName: 'Klee Resume.pdf'
    })
    expect(invokeRuntimeInfo).not.toHaveBeenCalled()
  })

  it.each([
    null,
    {},
    {
      artifactId: 'artifact_123',
      hiddenPath: '/tmp/private.pdf',
      suggestedFileName: 'resume.pdf'
    },
    {
      artifactId: 'short',
      suggestedFileName: 'resume.pdf'
    },
    {
      artifactId: 'artifact_123',
      suggestedFileName: '../unsafe.pdf'
    }
  ])('preload 拒绝扩权或非规范保存载荷：%o', (payload) => {
    expect(() => validatePreloadArtifactSaveRequest(payload)).toThrow()
  })

  it('不把 preload 拒绝的产物 ID 发送到 IPC', () => {
    /** @brief 运行时信息 IPC mock / Runtime-info IPC mock. */
    const invokeRuntimeInfo = vi.fn()
    /** @brief 产物保存 IPC mock / Artifact-save IPC mock. */
    const invokeArtifactSave = vi.fn()
    /** @brief 待测的桌面端平台桥接 / Desktop platform bridge under test. */
    const bridge = createDesktopPlatformBridge(invokeRuntimeInfo, invokeArtifactSave)

    expect(() =>
      bridge.saveArtifact({
        artifactId: 'short',
        suggestedFileName: sanitizePdfFileName('Klee Resume')
      })
    ).toThrow('opaque-ID')
    expect(invokeArtifactSave).not.toHaveBeenCalled()
  })
})
