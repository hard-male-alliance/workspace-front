/** @file Knowledge 文件上传和摄取页 / Knowledge file-upload and ingestion page. */

import { ArrowLeft, FileUp, LoaderCircle, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useKnowledgeGateway, useWorkspaceSession } from '../../../app/AppData'
import { ResourceFailureMessage } from '../../../app/ResourceErrorState'
import type { UiKnowledgeFileIngestionPhase } from '../application/commands'

const SUPPORTED_MEDIA_TYPES = new Set([
  'application/json',
  'application/pdf',
  'text/markdown',
  'text/plain'
])
const MAXIMUM_FILE_BYTES = 10 * 1024 * 1024

const PHASE_LABELS: Readonly<Record<UiKnowledgeFileIngestionPhase, string>> = {
  hashing: '正在计算文件指纹…',
  'creating-upload': '正在创建安全上传会话…',
  uploading: '正在上传文件…',
  verifying: '正在校验文件类型、大小和完整性…',
  'creating-source': '正在创建知识来源和版本…',
  queued: '已进入摄取队列…',
  processing: '正在解析、切分并生成向量…',
  completed: '摄取完成'
}

function normalizedMediaType(file: File): string {
  if (SUPPORTED_MEDIA_TYPES.has(file.type)) return file.type
  const suffix = file.name.toLocaleLowerCase().split('.').at(-1)
  if (suffix === 'md' || suffix === 'markdown') return 'text/markdown'
  if (suffix === 'txt') return 'text/plain'
  if (suffix === 'json') return 'application/json'
  if (suffix === 'pdf') return 'application/pdf'
  return file.type
}

/** @brief 上传本地文件并等待真实摄取完成 / Upload a local file and await real ingestion completion. */
export function KnowledgeUploadPage(): React.JSX.Element {
  const gateway = useKnowledgeGateway()
  const workspaceSession = useWorkspaceSession()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<UiKnowledgeFileIngestionPhase | null>(null)
  const [error, setError] = useState<unknown>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const isBusy = phase !== null && phase !== 'completed'

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (file === null || isBusy) return
    const mediaType = normalizedMediaType(file)
    if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
      setError(new Error('仅支持 TXT、Markdown、JSON 和 PDF 文件。'))
      return
    }
    if (file.size < 1 || file.size > MAXIMUM_FILE_BYTES) {
      setError(new Error('文件大小必须在 1 字节到 10 MiB 之间。'))
      return
    }
    const workspace = await workspaceSession.getCurrentWorkspace()
    if (workspace === undefined) {
      setError(new Error('当前没有可用工作区。'))
      return
    }
    const controller = new AbortController()
    controllerRef.current = controller
    setError(null)
    try {
      setPhase('hashing')
      const bytes = await file.arrayBuffer()
      controller.signal.throwIfAborted()
      const authority = await gateway.ingestKnowledgeFile({
        bytes,
        filename: file.name,
        mediaType,
        name: name.trim() || file.name,
        onProgress: setPhase,
        signal: controller.signal,
        workspaceId: workspace.id
      })
      await navigate(`/knowledge/${authority.source.id}`)
    } catch (uploadError: unknown) {
      if (!controller.signal.aborted) setError(uploadError)
      setPhase(null)
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  return (
    <div className="aw-page">
      <header className="aw-page-header">
        <div>
          <p className="aw-eyebrow">KNOWLEDGE · FILE INGESTION</p>
          <h1 className="aw-page-title">上传知识文件</h1>
          <p className="aw-page-description">
            文件会经过完整性校验、解析和切分，并由外部 Embedding 模型生成检索向量。
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
          <span>来源名称</span>
          <input
            disabled={isBusy}
            maxLength={300}
            onChange={(event): void => setName(event.target.value)}
            placeholder={file?.name ?? '例如：产品需求说明'}
            value={name}
          />
        </label>
        <label className="aw-field">
          <span>选择文件</span>
          <input
            accept=".txt,.md,.markdown,.json,.pdf,application/pdf,application/json,text/plain,text/markdown"
            disabled={isBusy}
            onChange={(event): void => setFile(event.target.files?.[0] ?? null)}
            required
            type="file"
          />
        </label>
        <p className="aw-card-description">
          支持 TXT、Markdown、JSON、PDF，最大 10
          MiB。上传内容不会被执行；摄取失败不会产生可搜索的有效版本。
        </p>
        {phase === null ? null : (
          <p aria-live="polite" className="aw-status" role="status">
            <LoaderCircle aria-hidden="true" size={14} />
            {PHASE_LABELS[phase]}
          </p>
        )}
        {error === null ? null : (
          <div className="aw-inline-error" role="alert">
            <ResourceFailureMessage error={error} />
          </div>
        )}
        <div className="aw-inline-actions">
          <button className="aw-primary-button" disabled={file === null || isBusy} type="submit">
            <FileUp aria-hidden="true" size={15} />
            {isBusy ? '正在处理…' : '上传并摄取'}
          </button>
          {isBusy ? (
            <button
              className="aw-quiet-button"
              onClick={(): void =>
                controllerRef.current?.abort(
                  new DOMException('User cancelled Knowledge ingestion.', 'AbortError')
                )
              }
              type="button"
            >
              <X aria-hidden="true" size={14} />
              取消
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
