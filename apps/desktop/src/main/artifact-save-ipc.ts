/** @file Electron PDF 保存 IPC 注册 / Electron PDF-save IPC registration. */

import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { SAVE_ARTIFACT_CHANNEL } from '@ai-job-workspace/platform'
import type { SaveArtifactResult } from '@ai-job-workspace/platform'

import { maskArtifactSaveFailure, savePdfArtifact } from './artifact-save-service'
import { writePdfAtomically } from './artifact-file-store'
import { isTrustedMainFrameRequest } from './ipc-sender'
import type { TrustedRendererResolver } from './ipc-sender'

/**
 * @brief 注册只允许可信主 frame 调用的 PDF 保存 handler / Register the PDF-save handler restricted to the trusted main frame.
 * @param apiOrigin 主进程已验证的产品 API origin / Product API origin validated by the main process.
 * @param resolveTrustedRenderer 当前可信窗口身份解析器 / Current trusted-window identity resolver.
 * @return 无返回值 / No return value.
 */
export function registerArtifactSaveHandler(
  apiOrigin: string,
  resolveTrustedRenderer: TrustedRendererResolver
): void {
  ipcMain.removeHandler(SAVE_ARTIFACT_CHANNEL)
  ipcMain.handle(
    SAVE_ARTIFACT_CHANNEL,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<SaveArtifactResult> => {
      if (!isTrustedMainFrameRequest(event, resolveTrustedRenderer)) {
        throw new Error('Rejected artifact-save request from an untrusted renderer.')
      }

      /** @brief 当前可信 renderer 所属的原生窗口 / Native window owning the trusted renderer. */
      const ownerWindow = BrowserWindow.fromWebContents(event.sender)
      if (ownerWindow === null)
        throw new Error('Trusted artifact-save request has no owner window.')

      return maskArtifactSaveFailure(() =>
        savePdfArtifact(payload, apiOrigin, {
          fetch: (url, init) => event.sender.session.fetch(url, init),
          showSaveDialog: async (suggestedFileName) => {
            /** @brief 用户的原生保存选择 / User selection from the native save dialog. */
            const result = await dialog.showSaveDialog(ownerWindow, {
              defaultPath: suggestedFileName,
              filters: [{ extensions: ['pdf'], name: 'PDF' }],
              properties: ['createDirectory', 'showOverwriteConfirmation']
            })
            return result.filePath === undefined
              ? { canceled: result.canceled }
              : { canceled: result.canceled, filePath: result.filePath }
          },
          writePdf: writePdfAtomically
        })
      )
    }
  )
}
