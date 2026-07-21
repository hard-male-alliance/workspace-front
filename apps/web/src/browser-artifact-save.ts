import type {
  ArtifactSavePort,
  SaveArtifactRequest,
  SaveArtifactResult
} from '@ai-job-workspace/platform'

/** @brief 浏览器下载元素所需的最小形状 / Minimal shape required from a browser download element. */
export interface BrowserDownloadAnchor {
  /** @brief 下载 URL / Download URL. */
  href: string
  /** @brief 建议下载文件名 / Suggested download filename. */
  download: string
  /** @brief 触发浏览器下载 / Trigger the browser download. */
  readonly click: () => void
  /** @brief 从临时父节点移除 / Remove from the temporary parent. */
  readonly remove: () => void
}

/** @brief 浏览器保存适配器依赖 / Browser save-adapter dependencies. */
export interface BrowserArtifactSaveDependencies {
  /**
   * @brief 创建临时下载元素 / Create a temporary download element.
   * @return 尚未附加的下载元素 / A detached download element.
   */
  readonly createAnchor: () => BrowserDownloadAnchor
  /**
   * @brief 将临时元素附加到文档 / Attach a temporary element to the document.
   * @param anchor 待附加的下载元素 / Download element to attach.
   * @return 无返回值 / No return value.
   */
  readonly appendAnchor: (anchor: BrowserDownloadAnchor) => void
}

/**
 * @brief 创建浏览器产物保存适配器 / Create the browser artifact-save adapter.
 * @param dependencies 可测试的 DOM 能力 / Testable DOM capabilities.
 * @return 维持浏览器下载语义的宿主端口 / Host port preserving browser download semantics.
 */
export function createBrowserArtifactSavePort(
  dependencies: BrowserArtifactSaveDependencies = {
    createAnchor: (): HTMLAnchorElement => document.createElement('a'),
    appendAnchor: (anchor): void => {
      document.body.append(anchor as HTMLAnchorElement)
    }
  }
): ArtifactSavePort {
  /**
   * @brief 通过一次性受控 anchor 保存产物 / Save an artifact through a controlled one-shot anchor.
   * @param request 产物保存请求 / Artifact-save request.
   * @return 已触发但最终结果不可观察的下载状态 / Started download status whose final outcome is not observable.
   */
  function saveArtifact(request: SaveArtifactRequest): Promise<SaveArtifactResult> {
    return new Promise((resolve): void => {
      /** @brief 仅为本次用户动作创建的下载元素 / Download element created only for this user action. */
      const anchor = dependencies.createAnchor()

      anchor.href = request.contentUrl
      anchor.download = request.suggestedFileName
      dependencies.appendAnchor(anchor)
      try {
        anchor.click()
      } finally {
        anchor.remove()
      }

      resolve({ status: 'started' })
    })
  }

  return { saveArtifact }
}
