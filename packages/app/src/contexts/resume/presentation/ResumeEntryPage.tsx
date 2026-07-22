import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'

import { useAsyncResource, useResumeGateway, useWorkspaceSession } from '../../../app/AppData'
import { ResourceErrorState } from '../../../app/ResourceErrorState'
import { LoadingState } from '../../../ui'
import type { UiResumeCard } from '../domain/models'

/** @brief 将稳定 Resume 入口解析为最近编辑的真实 Resume / Resolve the stable Resume entry to the latest real Resume. */
export function ResumeEntryPage(): React.JSX.Element {
  const { t } = useTranslation()
  const resume = useResumeGateway()
  const { getCurrentWorkspace } = useWorkspaceSession()
  const loadLatestResume = useCallback(async (): Promise<UiResumeCard | null> => {
    const firstWorkspace = await getCurrentWorkspace()
    if (firstWorkspace === undefined) return null
    const cards = await resume.listResumeCards(firstWorkspace.id)
    return (
      [...cards].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
    )
  }, [getCurrentWorkspace, resume])
  const latestResume = useAsyncResource('resume.entry', loadLatestResume)

  if (latestResume.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState label={t('status.loadingResume', { defaultValue: '正在加载简历…' })} />
      </div>
    )
  }

  if (latestResume.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={latestResume.error}
          onRetry={latestResume.retry}
          title={t('status.errorResume', { defaultValue: '无法加载简历' })}
        />
      </div>
    )
  }

  if (latestResume.data === null) {
    return (
      <div className="aw-page aw-empty-page">
        <h1 className="aw-page-title">
          {t('workspace.home.emptyResumeTitle', { defaultValue: '还没有可编辑的简历' })}
        </h1>
        <p className="aw-page-description">
          {t('workspace.home.emptyResumeDescription', {
            defaultValue: '当前工作区还没有简历。创建功能开放前，你可以先查看其他内容。'
          })}
        </p>
        <Link className="aw-quiet-button" to="/">
          {t('common.backHome', { defaultValue: '返回工作台' })}
        </Link>
      </div>
    )
  }

  return <Navigate replace to={`/resumes/${latestResume.data.id}/edit`} />
}
