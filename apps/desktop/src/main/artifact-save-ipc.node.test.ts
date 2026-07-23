/** @file Electron Artifact 保存 IPC 安全测试 / Security tests for Electron Artifact-save IPC. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_ARTIFACT_SAVE_CHANNEL,
  type ArtifactSavePort,
  type SaveArtifactRequest
} from '@ai-job-workspace/platform'

import type { IpcSenderEvent } from './ipc-sender'

/** @brief 测试 IPC handler 形状 / Test IPC-handler shape. */
type TestIpcHandler = (event: IpcSenderEvent, ...arguments_: unknown[]) => unknown

/** @brief Electron ipcMain mock / Electron ipcMain mock. */
const electron = vi.hoisted(() => {
  /** @brief 已注册 handlers / Registered handlers. */
  const handlers = new Map<string, TestIpcHandler>()
  return {
    handle: vi.fn((channel: string, handler: TestIpcHandler): void => {
      handlers.set(channel, handler)
    }),
    handlers,
    removeHandler: vi.fn((channel: string): void => {
      handlers.delete(channel)
    })
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: electron.handle, removeHandler: electron.removeHandler }
}))

import {
  parseNativeArtifactSaveRequest,
  registerNativeArtifactSaveHandler
} from './artifact-save-ipc'

/** @brief 当前可信 renderer / Current trusted renderer. */
const trustedRenderer = {
  rendererUrl: 'ai-job-workspace://renderer/index.html',
  webContentsId: 42
}

/** @brief 可信主 frame event / Trusted main-frame event. */
const trustedEvent: IpcSenderEvent = {
  sender: { id: 42, mainFrame: { frameTreeNodeId: 7 } },
  senderFrame: { frameTreeNodeId: 7, url: 'ai-job-workspace://renderer/resumes/edit' }
}

/** @brief 不可信子 frame event / Untrusted child-frame event. */
const childFrameEvent: IpcSenderEvent = {
  sender: { id: 42, mainFrame: { frameTreeNodeId: 7 } },
  senderFrame: { frameTreeNodeId: 8, url: 'ai-job-workspace://renderer/resumes/edit' }
}

/** @brief 合法封闭请求 / Valid closed request. */
const validRequest = {
  artifactId: 'artifact_01JEXAMPLE',
  suggestedFileName: 'Klee Resume.pdf',
  workspaceId: 'workspace_01JEXAMPLE'
}

describe('parseNativeArtifactSaveRequest', (): void => {
  it.each(['Klee Resume.pdf', 'Klee Resume.json', 'Klee Resume.docx'])(
    '复制并冻结使用受支持扩展名 %s 的恰好三个允许字段',
    (suggestedFileName): void => {
      /** @brief 当前格式的合法请求 / Valid request for the current format. */
      const request = { ...validRequest, suggestedFileName }
      /** @brief 解析结果 / Parsed result. */
      const parsed = parseNativeArtifactSaveRequest(request)
      expect(parsed).toEqual(request)
      expect(parsed).not.toBe(request)
      expect(Object.isFrozen(parsed)).toBe(true)
    }
  )

  it.each([
    null,
    [],
    { ...validRequest, targetPath: '/tmp/stolen.pdf' },
    { ...validRequest, accessToken: 'secret' },
    { ...validRequest, workspaceId: '../escape' },
    { ...validRequest, artifactId: 'short' },
    { ...validRequest, suggestedFileName: '../escape.pdf' },
    { ...validRequest, suggestedFileName: '../escape.docx' },
    { ...validRequest, suggestedFileName: 'resume.exe' },
    { ...validRequest, suggestedFileName: 'resume.pdf ' }
  ])('拒绝非封闭请求 %#', (candidate): void => {
    expect(() => parseNativeArtifactSaveRequest(candidate)).toThrow(/Rejected invalid Artifact/u)
  })
})

describe('registerNativeArtifactSaveHandler', (): void => {
  /** @brief 保存端口 spy / Save-port spy. */
  let saveArtifact: ReturnType<
    typeof vi.fn<(request: SaveArtifactRequest) => Promise<{ status: 'saved' }>>
  >

  beforeEach((): void => {
    electron.handlers.clear()
    saveArtifact = vi.fn(() => Promise.resolve({ status: 'saved' as const }))
    /** @brief main-only 保存端口 / Main-only save port. */
    const artifactSave: ArtifactSavePort = { maximumArtifactBytes: null, saveArtifact }
    registerNativeArtifactSaveHandler(artifactSave, () => trustedRenderer)
  })

  it('只接受当前可信主 frame 的单一封闭请求', async (): Promise<void> => {
    /** @brief 已注册 handler / Registered handler. */
    const handler = electron.handlers.get(DESKTOP_ARTIFACT_SAVE_CHANNEL)
    if (handler === undefined) throw new Error('Artifact-save handler was not registered.')

    await expect(handler(trustedEvent, validRequest)).resolves.toEqual({ status: 'saved' })
    expect(saveArtifact).toHaveBeenCalledWith(validRequest)
    await expect(handler(childFrameEvent, validRequest)).rejects.toThrow(
      'Rejected Artifact save request from an untrusted renderer.'
    )
    await expect(handler(trustedEvent)).rejects.toThrow(
      'Rejected Artifact save request from an untrusted renderer.'
    )
    await expect(handler(trustedEvent, validRequest, 'extra')).rejects.toThrow(
      'Rejected Artifact save request from an untrusted renderer.'
    )
  })

  it('每次注册先移除旧 handler', (): void => {
    expect(electron.removeHandler).toHaveBeenCalledWith(DESKTOP_ARTIFACT_SAVE_CHANNEL)
    expect(electron.handlers.size).toBe(1)
  })

  it('不把 API、token 或文件路径错误透传给 renderer', async (): Promise<void> => {
    saveArtifact.mockRejectedValueOnce(
      new Error('token secret-token; https://api.example/private; /Users/klee/Documents/resume.pdf')
    )
    /** @brief 已注册 handler / Registered handler. */
    const handler = electron.handlers.get(DESKTOP_ARTIFACT_SAVE_CHANNEL)
    if (handler === undefined) throw new Error('Artifact-save handler was not registered.')

    await expect(handler(trustedEvent, validRequest)).rejects.toThrow(
      'The native Artifact could not be saved.'
    )
  })
})
