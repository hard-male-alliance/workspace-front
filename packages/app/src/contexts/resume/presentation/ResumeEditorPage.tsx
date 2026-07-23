import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import {
  useAsyncResource,
  useResumeGateway,
  useResumeTemplateCatalog,
  useWorkspaceSession
} from '../../../app/AppData'
import { ResourceErrorState } from '../../../app/ResourceErrorState'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { LoadingState } from '../../../ui'
import type { UiResumeEditorModel } from '../domain/document'
import type { UiTemplateManifest } from '../domain/models'
import { loadPinnedResumeTemplate } from '../application/template-catalog'
import { ResumeWorkspace } from './ResumeWorkspace'

/** @brief 简历工作台加载结果 / Loaded resume-workspace resources. */
interface ResumeWorkspaceResources {
  /** @brief 编辑器投影 / Editor projection. */
  readonly editor: UiResumeEditorModel
  /** @brief 可用模板 / Available templates. */
  readonly templates: readonly UiTemplateManifest[]
}

/**
 * @brief 三窗口简历编辑器路由页 / Three-window resume-editor route page.
 * @return 含加载、错误与三窗口工作台的路由页 / Route page with loading, error, and workspace states.
 */
export function ResumeEditorPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { resumeId } = useParams()
  const resume = useResumeGateway()
  const templateCatalog = useResumeTemplateCatalog()
  const { getCurrentWorkspace } = useWorkspaceSession()
  const requestedResumeId = useMemo(() => asUiOpaqueId<'resume'>(resumeId ?? ''), [resumeId])

  const loadWorkspace = useCallback(
    async (signal: AbortSignal): Promise<ResumeWorkspaceResources> => {
      signal.throwIfAborted()
      if (resumeId === undefined) {
        throw new Error('A resume identifier is required to open the editor.')
      }

      const workspace = await getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspace === undefined) {
        throw new Error('A Workspace selection is required to open a Resume.')
      }
      const editor = await resume.getResumeEditor(workspace.id, requestedResumeId, signal)
      signal.throwIfAborted()
      const pinnedTemplate = await loadPinnedResumeTemplate(
        templateCatalog,
        editor.resume.template,
        signal
      )
      signal.throwIfAborted()
      return { editor, templates: [pinnedTemplate] }
    },
    [getCurrentWorkspace, requestedResumeId, resume, resumeId, templateCatalog]
  )
  const workspace = useAsyncResource('resume.editor', loadWorkspace, requestedResumeId)

  if (workspace.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState label={t('status.loadingResume', { defaultValue: '正在加载简历编辑器…' })} />
      </div>
    )
  }

  if (workspace.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={workspace.error}
          onRetry={workspace.retry}
          title={t('status.errorResume', { defaultValue: '无法加载简历编辑器' })}
        />
      </div>
    )
  }

  return (
    <ResumeWorkspace
      gateway={resume}
      initialEditor={workspace.data.editor}
      key={requestedResumeId}
      templateCatalog={templateCatalog}
      templates={workspace.data.templates}
    />
  )
}
