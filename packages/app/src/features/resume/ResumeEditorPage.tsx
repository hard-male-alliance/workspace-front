import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useAppGateways, useAsyncResource } from '../../app/AppData'
import { asUiOpaqueId } from '../../domain'
import type { UiResumeEditorModel, UiTemplateManifest } from '../../domain'
import { ErrorState, LoadingState } from '../../ui'
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
  const { resume } = useAppGateways()
  const requestedResumeId = useMemo(() => asUiOpaqueId<'resume'>(resumeId ?? ''), [resumeId])

  const loadWorkspace = useCallback(async (): Promise<ResumeWorkspaceResources> => {
    if (resumeId === undefined) {
      throw new Error('A resume identifier is required to open the editor.')
    }

    const editor = await resume.getResumeEditor(requestedResumeId)
    const templates = await resume.listTemplateManifests(editor.resume.locale)
    return { editor, templates }
  }, [requestedResumeId, resume, resumeId])
  const workspace = useAsyncResource(loadWorkspace)

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
        <ErrorState
          description={t('status.errorDescription', {
            defaultValue: '演示数据暂时不可用，请重试或返回工作台。'
          })}
          title={t('status.errorResume', { defaultValue: '无法加载简历编辑器' })}
        />
      </div>
    )
  }

  return (
    <ResumeWorkspace
      gateway={resume}
      initialEditor={workspace.data.editor}
      templates={workspace.data.templates}
    />
  )
}
