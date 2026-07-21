import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MOCK_KNOWLEDGE_SOURCES, MockKnowledgeGateway } from '../testing'
import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 知识库用户行为测试 / Knowledge-workflow user-behaviour tests. */
describe('WorkspaceApp knowledge workflow', (): void => {
  it('filters knowledge sources locally and keeps source details in the knowledge workflow', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/knowledge" />)

    await screen.findByRole('heading', { name: '个人记忆与知识库' })
    expect(screen.getByRole('heading', { name: '来源详情' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: '筛选知识来源' }), {
      target: { value: 'portfolio-engineering' }
    })

    expect(screen.getAllByText('portfolio-engineering')).toHaveLength(2)
    expect(screen.queryByText('AI 平台工程师 · 中文简历')).not.toBeInTheDocument()
  })

  it('validates knowledge files before upload and prevents duplicate submission', async () => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前测试独享的知识 Gateway / Knowledge Gateway owned by the current test. */
    const knowledge = new MockKnowledgeGateway()
    /** @brief 上传命令监视器 / Upload-command spy. */
    const upload = vi.spyOn(knowledge, 'uploadKnowledgeSource')

    render(<WorkspaceApp gateways={createTestGateways({ knowledge })} initialPath="/knowledge" />)
    await screen.findByRole('heading', { name: 'Personal memory & knowledge' })
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }))

    /** @brief 知识文件选择框 / Knowledge-file input. */
    const fileInput = screen.getByLabelText('Knowledge file')
    fireEvent.change(fileInput, { target: { files: [new File(['unsafe'], 'program.exe')] } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload file' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a TXT, Markdown, PDF, or DOCX file.'
    )
    expect(upload).not.toHaveBeenCalled()

    /** @brief 超过上传上限的 PDF / PDF exceeding the upload limit. */
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf', {
      type: 'application/pdf'
    })
    fireEvent.change(fileInput, { target: { files: [oversized] } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload file' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('File must be 10 MiB or smaller.')
    expect(upload).not.toHaveBeenCalled()

    upload.mockReturnValue(new Promise(() => undefined))
    fireEvent.change(fileInput, {
      target: { files: [new File(['notes'], 'notes.md', { type: 'text/markdown' })] }
    })
    /** @brief 上传提交按钮 / Upload submit button. */
    const submit = screen.getByRole('button', { name: 'Upload file' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(upload).toHaveBeenCalledTimes(1)
    expect(submit).toBeDisabled()
  })

  it('polls an accepted knowledge upload and aborts it on unmount', async () => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前测试独享的知识 Gateway / Knowledge Gateway owned by the current test. */
    const knowledge = new MockKnowledgeGateway()
    /** @brief 已被 Gateway 接受的上传 / Upload accepted by the Gateway. */
    const accepted = await knowledge.uploadKnowledgeSource({
      file: new File(['notes'], 'notes.md', { type: 'text/markdown' })
    })
    vi.spyOn(knowledge, 'uploadKnowledgeSource').mockResolvedValue(accepted)
    /** @brief 轮询调用收到的取消信号 / Cancellation signal received by polling. */
    let pollingSignal: AbortSignal | undefined
    vi.spyOn(knowledge, 'getKnowledgeIngestionJob').mockImplementation((_jobId, signal) => {
      pollingSignal = signal
      return new Promise(() => undefined)
    })

    /** @brief 当前知识库页面渲染结果 / Current knowledge-page render result. */
    const view = render(
      <WorkspaceApp gateways={createTestGateways({ knowledge })} initialPath="/knowledge" />
    )
    await screen.findByRole('heading', { name: 'Personal memory & knowledge' })
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    fireEvent.change(screen.getByLabelText('Knowledge file'), {
      target: { files: [new File(['notes'], 'notes.md', { type: 'text/markdown' })] }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Upload file' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Ingesting file')
    await vi.waitFor(() => expect(pollingSignal).toBeDefined())
    view.unmount()
    expect(pollingSignal?.aborted).toBe(true)
  })

  it('uses the selected real source ID for policy review and version upload', async () => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前测试独享的知识 Gateway / Knowledge Gateway owned by the current test. */
    const knowledge = new MockKnowledgeGateway()
    /** @brief 已上传的真实知识来源 / Uploaded real knowledge source. */
    const uploaded = await knowledge.uploadKnowledgeSource({
      file: new File(['first'], 'project.md', { type: 'text/markdown' }),
      name: 'Project file'
    })
    /** @brief 新版本上传命令监视器 / Version-upload command spy. */
    const versionUpload = vi
      .spyOn(knowledge, 'uploadKnowledgeSourceVersion')
      .mockReturnValue(new Promise(() => undefined))

    render(<WorkspaceApp gateways={createTestGateways({ knowledge })} initialPath="/knowledge" />)
    await screen.findByRole('heading', { name: 'Personal memory & knowledge' })
    fireEvent.click(screen.getByRole('button', { name: 'View details for Project file' }))

    expect(
      screen.getByRole('link', { name: 'Review this source authorization matrix' })
    ).toHaveAttribute('href', `/knowledge/${uploaded.source.id}/visibility`)
    /** @brief 替换知识文件 / Replacement knowledge file. */
    const replacement = new File(['second'], 'project-v2.md', { type: 'text/markdown' })
    fireEvent.change(screen.getByLabelText('Replacement file'), {
      target: { files: [replacement] }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Upload new version' }))

    expect(versionUpload).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: uploaded.source.id, file: replacement })
    )
  })

  it('searches knowledge through the gateway and displays safe result fields', async () => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前测试独享的知识 Gateway / Knowledge Gateway owned by the current test. */
    const knowledge = new MockKnowledgeGateway()
    vi.spyOn(knowledge, 'searchKnowledge').mockResolvedValue([
      {
        id: 'result-1',
        sourceId: MOCK_KNOWLEDGE_SOURCES[0]!.id,
        title: 'Platform notes',
        locatorLabel: 'Page 3',
        quote: 'Use a bounded queue for ingestion.',
        score: 0.92
      }
    ])

    render(<WorkspaceApp gateways={createTestGateways({ knowledge })} initialPath="/knowledge" />)
    await screen.findByRole('heading', { name: 'Personal memory & knowledge' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search indexed knowledge' }), {
      target: { value: 'bounded queue' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search knowledge' }))

    expect(await screen.findByText('Platform notes')).toBeInTheDocument()
    expect(screen.getByText('Page 3')).toBeInTheDocument()
    expect(screen.getByText('Use a bounded queue for ingestion.')).toBeInTheDocument()
  })

  it('shows knowledge search loading, empty, and safe error states', async () => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前测试独享的知识 Gateway / Knowledge Gateway owned by the current test. */
    const knowledge = new MockKnowledgeGateway()
    /** @brief 完成受控搜索 Promise 的函数 / Function completing the controlled search Promise. */
    let finishSearch!: (value: readonly never[]) => void
    /** @brief 受测试控制的待完成搜索 / Pending search controlled by the test. */
    const pendingSearch = new Promise<readonly never[]>((resolve) => {
      finishSearch = resolve
    })
    vi.spyOn(knowledge, 'searchKnowledge')
      .mockReturnValueOnce(pendingSearch)
      .mockRejectedValueOnce(new Error('private backend URL'))

    render(<WorkspaceApp gateways={createTestGateways({ knowledge })} initialPath="/knowledge" />)
    await screen.findByRole('heading', { name: 'Personal memory & knowledge' })
    /** @brief 索引知识搜索框 / Indexed-knowledge search input. */
    const search = screen.getByRole('searchbox', { name: 'Search indexed knowledge' })
    fireEvent.change(search, { target: { value: 'missing topic' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search knowledge' }))

    expect(screen.getByRole('button', { name: 'Searching…' })).toBeDisabled()
    finishSearch([])
    expect(
      await screen.findByText('No relevant knowledge passages were found.')
    ).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'retry topic' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search knowledge' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server could not be reached. Check your connection and try again.'
    )
    expect(screen.queryByText('private backend URL')).not.toBeInTheDocument()
  })

  it('localizes visibility policy enums instead of rendering transport values', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/knowledge/ks_mock_git/visibility" />)

    await screen.findByRole('heading', { name: 'Agent 可见性' })
    expect(screen.getByText('权限概览')).toBeInTheDocument()
    expect(screen.getByText('机密')).toBeInTheDocument()
    expect(screen.getByText('中国大陆')).toBeInTheDocument()
    expect(screen.getByText('私有部署')).toBeInTheDocument()
    expect(screen.queryByText('confidential')).not.toBeInTheDocument()
    expect(screen.queryByText('private_deployment')).not.toBeInTheDocument()
  })
})
