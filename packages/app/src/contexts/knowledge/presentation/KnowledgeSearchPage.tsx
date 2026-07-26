/** @file Knowledge 真实混合搜索页 / Real Knowledge hybrid-search page. */

import { ArrowLeft, Search } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'

import { useAsyncResource, useKnowledgeGateway, useWorkspaceSession } from '../../../app/AppData'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { LoadingState } from '../../../ui'
import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import {
  asUiKnowledgeSourcePageLimit,
  type UiKnowledgeSearchResult,
  type UiKnowledgeSource
} from '../domain/models'

interface SearchAuthority {
  readonly workspaceId: UiWorkspaceId
  readonly sources: readonly UiKnowledgeSource[]
}

/** @brief 在当前有效 Source version 上执行关键词+向量混合搜索 / Search current active Source versions with lexical and vector ranking. */
export function KnowledgeSearchPage(): React.JSX.Element {
  const gateway = useKnowledgeGateway()
  const workspaceSession = useWorkspaceSession()
  const generation = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )
  const load = useCallback(
    async (signal: AbortSignal): Promise<SearchAuthority> => {
      const workspace = await workspaceSession.getCurrentWorkspace()
      if (workspace === undefined) throw new Error('当前没有可用工作区。')
      const page = await gateway.listKnowledgeSourcePage({
        cursor: null,
        limit: asUiKnowledgeSourcePageLimit(200),
        signal,
        workspaceId: workspace.id
      })
      return {
        sources: page.items.filter(
          (source) =>
            source.enabled &&
            source.ingestion.status === 'ready' &&
            source.currentVersionId !== null
        ),
        workspaceId: workspace.id
      }
    },
    [gateway, workspaceSession]
  )
  const authority = useAsyncResource('knowledge.sources', load, generation)
  if (authority.status === 'loading') {
    return <LoadingState label="正在加载可搜索来源…" />
  }
  if (authority.status === 'error') {
    return (
      <ResourceErrorState
        error={authority.error}
        onRetry={authority.retry}
        title="无法加载可搜索来源"
      />
    )
  }
  return (
    <KnowledgeSearchContent
      authority={authority.data}
      gateway={gateway}
      key={authority.data.workspaceId}
    />
  )
}

function KnowledgeSearchContent({
  authority,
  gateway
}: {
  readonly authority: SearchAuthority
  readonly gateway: ReturnType<typeof useKnowledgeGateway>
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(authority.sources.map((source) => source.id))
  )
  const [result, setResult] = useState<UiKnowledgeSearchResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [isSearching, setSearching] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const selectedSources = useMemo(
    () => authority.sources.filter((source) => selected.has(source.id)),
    [authority.sources, selected]
  )

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (query.trim().length === 0 || selectedSources.length === 0 || isSearching) return
    const controller = new AbortController()
    controllerRef.current = controller
    setSearching(true)
    setError(null)
    try {
      setResult(
        await gateway.searchKnowledge({
          query: query.trim(),
          signal: controller.signal,
          sourceIds: selectedSources.map((source) => source.id),
          workspaceId: authority.workspaceId
        })
      )
    } catch (searchError: unknown) {
      if (!controller.signal.aborted) setError(searchError)
    } finally {
      if (!controller.signal.aborted) setSearching(false)
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  return (
    <div className="aw-page">
      <header className="aw-page-header">
        <div>
          <p className="aw-eyebrow">KNOWLEDGE · HYBRID SEARCH</p>
          <h1 className="aw-page-title">搜索知识库</h1>
          <p className="aw-page-description">
            仅搜索所选来源当前已生效的版本，不会重复使用旧版本 Chunk。
          </p>
        </div>
        <Link className="aw-quiet-button" to="/knowledge">
          <ArrowLeft aria-hidden="true" size={15} />
          返回知识库
        </Link>
      </header>

      <form
        className="aw-card aw-card-pad aw-form-grid"
        onSubmit={(event): void => void submit(event)}
      >
        <label className="aw-field">
          <span>搜索内容</span>
          <input
            disabled={isSearching}
            maxLength={8000}
            onChange={(event): void => setQuery(event.target.value)}
            placeholder="输入要查找的关键词或问题"
            type="search"
            value={query}
          />
        </label>
        <fieldset className="aw-field">
          <legend>搜索范围</legend>
          {authority.sources.length === 0 ? (
            <p className="aw-card-description">目前没有摄取完成的知识来源，请先上传文件。</p>
          ) : (
            authority.sources.map((source) => (
              <label className="aw-checkbox-row" key={source.id}>
                <input
                  checked={selected.has(source.id)}
                  disabled={isSearching}
                  onChange={(event): void =>
                    setSelected((current) => {
                      const next = new Set(current)
                      if (event.target.checked) next.add(source.id)
                      else next.delete(source.id)
                      return next
                    })
                  }
                  type="checkbox"
                />
                <span>{source.name}</span>
              </label>
            ))
          )}
        </fieldset>
        <button
          className="aw-primary-button"
          disabled={query.trim().length === 0 || selectedSources.length === 0 || isSearching}
          type="submit"
        >
          <Search aria-hidden="true" size={15} />
          {isSearching ? '正在搜索…' : '搜索'}
        </button>
        {error === null ? null : (
          <div className="aw-inline-error" role="alert">
            <ResourceFailureMessage error={error} />
          </div>
        )}
      </form>

      {result === null ? null : (
        <section aria-label="搜索结果" className="aw-card aw-card-pad">
          <h2 className="aw-card-title">搜索结果</h2>
          {result.hits.length === 0 ? (
            <p className="aw-card-description">当前所选来源中没有找到匹配内容。</p>
          ) : (
            <div className="aw-list-stack">
              {result.hits.map((hit, index) => (
                <article
                  className="aw-source-card"
                  key={`${hit.versionId}:${hit.locator}:${index}`}
                >
                  <div>
                    <p>{hit.quote}</p>
                    <p className="aw-list-row-meta">
                      {hit.locator} · 相似度 {(hit.score * 100).toFixed(1)}%
                    </p>
                  </div>
                  <Link className="aw-quiet-button" to={`/knowledge/${hit.sourceId}`}>
                    查看来源
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
