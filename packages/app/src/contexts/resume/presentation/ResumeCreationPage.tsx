/** @file API v2 Resume 创建路由外壳 / API v2 Resume-creation route shell. */

import { FilePlus2 } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAsyncResource, useWorkspaceSession } from '../../../app/AppData'
import { ResourceErrorState } from '../../../app/ResourceErrorState'
import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import { EmptyState, LoadingState } from '../../../ui'
import { ResumeCreationForm } from './resume-creation/ResumeCreationForm'

/** @brief 创建页的当前 Workspace 权威 / Current Workspace authority for the creation page. */
type ResumeCreationWorkspaceAuthority =
  | {
      /** @brief 当前会话没有选中的 Workspace / The current session has no selected Workspace. */
      readonly kind: 'no-workspace'
    }
  | {
      /** @brief 当前会话具有可写入路径所属的 Workspace / The session has the Workspace owning the write path. */
      readonly kind: 'workspace'
      /** @brief 显示用 Workspace 名称 / Workspace name used for display. */
      readonly workspaceName: string
      /** @brief 显式写入路径使用的 Workspace ID / Workspace ID used in the explicit write path. */
      readonly workspaceId: UiWorkspaceId
    }

/**
 * @brief API v2 Resume 创建路由页 / API v2 Resume-creation route page.
 * @return 从公开 Template 目录创建 Workspace Resume 的完整产品流程 / Complete product flow creating a Workspace Resume from the public Template catalog.
 * @note Workspace 切换会立即 abort 旧读取与写入并重新建立表单身份 / A Workspace switch immediately aborts stale reads and writes and establishes a new form identity.
 */
export function ResumeCreationPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 当前 Workspace 会话 / Current Workspace session. */
  const workspaceSession = useWorkspaceSession()
  /** @brief Workspace 选择变化的同步修订 / Synchronous revision of Workspace-selection changes. */
  const selectionRevision = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )

  /** @brief 读取创建路径所属的当前 Workspace / Read the current Workspace owning the creation path. */
  const loadWorkspaceAuthority = useCallback(
    async (signal: AbortSignal): Promise<ResumeCreationWorkspaceAuthority> => {
      /** @brief 本次读取观察到的 Workspace / Workspace observed by this read. */
      const workspace = await workspaceSession.getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      return workspace === undefined
        ? { kind: 'no-workspace' }
        : { kind: 'workspace', workspaceId: workspace.id, workspaceName: workspace.name }
    },
    [selectionRevision, workspaceSession]
  )
  /** @brief 具有 stale-result 防护的 Workspace 权威 / Workspace authority guarded against stale results. */
  const workspaceAuthority = useAsyncResource(
    'workspace.session',
    loadWorkspaceAuthority,
    selectionRevision
  )

  if (workspaceAuthority.status === 'loading') {
    return (
      <div className="aw-page aw-resume-create-page">
        <LoadingState
          className="aw-resume-create-page-loading"
          label={t('resume.creation.loading', { defaultValue: '正在准备新简历…' })}
        />
      </div>
    )
  }

  if (workspaceAuthority.status === 'error') {
    return (
      <div className="aw-page aw-resume-create-page">
        <ResourceErrorState
          error={workspaceAuthority.error}
          onRetry={workspaceAuthority.retry}
          title={t('resume.creation.loadError', { defaultValue: '无法准备新简历' })}
        />
      </div>
    )
  }

  if (workspaceAuthority.data.kind === 'no-workspace') {
    return (
      <div className="aw-page aw-resume-create-page">
        <EmptyState
          action={
            <Link className="aw-quiet-button" to="/">
              {t('common.backHome', { defaultValue: '返回工作台' })}
            </Link>
          }
          className="aw-resume-create-no-workspace"
          description={t('resume.creation.noWorkspaceDescription', {
            defaultValue: '选择一个可访问的工作区后，才能在其资源边界内创建简历。'
          })}
          title={t('resume.creation.noWorkspaceTitle', { defaultValue: '尚未选择工作区' })}
          visual={<FilePlus2 aria-hidden="true" size={22} />}
        />
      </div>
    )
  }

  return (
    <div className="aw-page aw-resume-create-page">
      <header className="aw-page-header aw-resume-create-header">
        <div>
          <p className="aw-eyebrow">{workspaceAuthority.data.workspaceName}</p>
          <h1 className="aw-page-title">
            {t('resume.creation.title', { defaultValue: '新建简历' })}
          </h1>
          <p className="aw-page-description">
            {t('resume.creation.description', {
              defaultValue: '选择已发布模板并设置内容语言，创建后直接进入编辑器。'
            })}
          </p>
        </div>
        <Link className="aw-quiet-button" to="/resumes">
          {t('resume.creation.backToLibrary', { defaultValue: '返回简历库' })}
        </Link>
      </header>

      <ResumeCreationForm
        key={`${selectionRevision}:${workspaceAuthority.data.workspaceId}`}
        selectionRevision={selectionRevision}
        workspaceId={workspaceAuthority.data.workspaceId}
        workspaceName={workspaceAuthority.data.workspaceName}
      />
    </div>
  )
}
