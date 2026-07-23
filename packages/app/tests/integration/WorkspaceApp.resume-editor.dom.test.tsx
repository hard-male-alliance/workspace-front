import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResumeBatchConflictError } from '@ai-job-workspace/app/application'
import { ApiV2ProblemError, ApiV2WriteOutcomeUnknownError } from '@ai-job-workspace/product-api-v2'
import {
  MOCK_HISTORICAL_DAWN_TEMPLATE,
  MOCK_RESUME_ID,
  MOCK_RESUME_WORKSPACE_ID,
  InMemoryResumeGateway
} from '@ai-job-workspace/app/testing'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  navigateWorkspaceApp,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 必须进入权威恢复屏障的简历写操作 / Resume mutations that must enter the authoritative-recovery barrier. */
const RESUME_OUTCOME_UNKNOWN_MUTATIONS = [
  ['section update', 'section-update'],
  ['section reorder', 'section-reorder'],
  ['section delete', 'section-delete']
] as const

/** @brief 不会取消的测试读取信号 / Test read signal that remains active. */
const ACTIVE_RESUME_READ_SIGNAL = new AbortController().signal

/**
 * @brief 在桌面窗口栏内选择模板设置入口 / Select the Template-settings entry inside the desktop window bar.
 * @param accessibleName 当前语言下的入口名称 / Entry name in the current locale.
 * @return 桌面布局使用的设置链接 / Settings link used by the desktop layout.
 */
function desktopTemplateSettingsLink(accessibleName: string): HTMLElement {
  return within(screen.getByRole('toolbar')).getByRole('link', { name: accessibleName })
}

/** @brief 简历编辑器用户行为测试 / Resume-editor user-behaviour tests. */
describe('WorkspaceApp Resume editor', (): void => {
  it('rebuilds editor aggregate state when the authoritative Resume ID changes', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief A 简历权威投影 / Authoritative projection for Resume A. */
    const editorA = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief B 简历领域 ID / Domain ID for Resume B. */
    const resumeBId = 'res_authoritative_b' as typeof MOCK_RESUME_ID
    /** @brief B 简历权威投影 / Authoritative projection for Resume B. */
    const editorB = {
      ...editorA,
      resume: {
        ...editorA.resume,
        id: resumeBId,
        revision: 3,
        title: 'B 端权威简历'
      }
    }
    /** @brief 兑现 B 简历读取的函数 / Resolver for the Resume B read. */
    let resolveEditorB: ((editor: typeof editorB) => void) | undefined
    /** @brief 保持 B 读取待定的 Promise / Promise keeping the Resume B read pending. */
    const pendingEditorB = new Promise<typeof editorB>((resolve): void => {
      resolveEditorB = resolve
    })
    vi.spyOn(resume, 'getResumeEditor').mockImplementation((workspaceId, requestedId) => {
      if (workspaceId !== editorA.resume.workspaceId) {
        return Promise.reject(new Error('Unexpected Workspace ID.'))
      }
      if (requestedId === MOCK_RESUME_ID) return Promise.resolve(editorA)
      if (requestedId === resumeBId) return pendingEditorB
      return Promise.reject(new Error('Unexpected Resume ID.'))
    })
    window.history.replaceState(null, '', `/resumes/${MOCK_RESUME_ID}/edit`)

    render(<WorkspaceApp gateways={createTestGateways({ resume })} />)
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.change(screen.getByRole('textbox', { name: '区段标题' }), {
      target: { value: '只属于 A 的本地草稿' }
    })

    navigateWorkspaceApp(`/resumes/${resumeBId}/edit`)

    expect(screen.getByText('正在加载简历编辑器…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Klee Chen' })).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('只属于 A 的本地草稿')).not.toBeInTheDocument()

    await act(async (): Promise<void> => {
      resolveEditorB?.(editorB)
      await pendingEditorB
    })

    expect(await screen.findByText('B 端权威简历')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('只属于 A 的本地草稿')).not.toBeInTheDocument()
  })

  it('aborts the old Resume read and never lets its late response replace the new identity', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 构造测试投影使用的初始权威 / Initial authority used to build test projections. */
    const baseline = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 第二份 Resume 的稳定 ID / Stable ID of the second Resume. */
    const resumeBId = 'res_authoritative_latest_b' as typeof MOCK_RESUME_ID
    /** @brief 延迟到新身份完成后才返回的旧 Resume / Old Resume returned only after the new identity has completed. */
    const lateEditorA = {
      ...baseline,
      resume: { ...baseline.resume, title: 'A 的迟到权威响应' }
    }
    /** @brief 应当保持在页面上的新 Resume / New Resume that must remain on the page. */
    const editorB = {
      ...baseline,
      resume: { ...baseline.resume, id: resumeBId, revision: 41, title: 'B 的最新权威响应' }
    }
    /** @brief 兑现旧 Resume 读取的函数 / Resolver for the old Resume read. */
    let resolveLateEditorA: ((editor: typeof lateEditorA) => void) | undefined
    /** @brief 故意忽略取消、模拟底层迟到返回的旧请求 / Old request deliberately ignoring cancellation and resolving late. */
    const pendingLateEditorA = new Promise<typeof lateEditorA>((resolve): void => {
      resolveLateEditorA = resolve
    })
    /** @brief 旧 Resume 请求收到的取消信号 / Cancellation signal received by the old Resume request. */
    let oldSignal: AbortSignal | undefined
    /** @brief 新 Resume 请求收到的取消信号 / Cancellation signal received by the new Resume request. */
    let newSignal: AbortSignal | undefined
    const getEditor = vi
      .spyOn(resume, 'getResumeEditor')
      .mockImplementation((_workspaceId, requestedId, signal) => {
        if (requestedId === MOCK_RESUME_ID) {
          oldSignal = signal
          return pendingLateEditorA
        }
        if (requestedId === resumeBId) {
          newSignal = signal
          return Promise.resolve(editorB)
        }
        return Promise.reject(new Error('Unexpected Resume ID.'))
      })

    window.history.replaceState(null, '', `/resumes/${MOCK_RESUME_ID}/edit`)
    const view = render(<WorkspaceApp gateways={createTestGateways({ resume })} />)
    await waitFor((): void => expect(getEditor).toHaveBeenCalledTimes(1))

    navigateWorkspaceApp(`/resumes/${resumeBId}/edit`)

    expect(await screen.findByText('B 的最新权威响应')).toBeInTheDocument()
    expect(oldSignal?.aborted).toBe(true)
    expect(newSignal?.aborted).toBe(false)

    await act(async (): Promise<void> => {
      resolveLateEditorA?.(lateEditorA)
      await pendingLateEditorA
    })

    expect(screen.getByText('B 的最新权威响应')).toBeInTheDocument()
    expect(screen.queryByText('A 的迟到权威响应')).not.toBeInTheDocument()

    view.unmount()
    expect(newSignal?.aborted).toBe(true)
  })

  it('renders three persistent resume window headers with equal desktop panels and separators', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)

    await screen.findByRole('heading', { name: 'Klee Chen' })

    expect(screen.getByRole('toolbar', { name: '简历窗口控制' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AI 对话' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '内容编辑' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '预览' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'AI 对话' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '内容编辑' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '语义内容预览' })).toBeInTheDocument()
    expect(screen.getAllByRole('separator')).toHaveLength(2)
  })

  it('按 Unicode code-point 边界在本地拒绝已知无效 section 文本', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 可观察写命令的 Resume gateway / Resume gateway exposing write commands. */
    const resume = new InMemoryResumeGateway()
    /** @brief 不应收到无效草稿的更新命令 / Update command that must not receive invalid drafts. */
    const update = vi.spyOn(resume, 'updateResumeSection')
    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })

    /** @brief 当前聚焦 section 的标题输入 / Title input of the currently focused section. */
    const title = screen.getByRole('textbox', { name: '区段标题' })
    fireEvent.change(title, { target: { value: '' } })
    fireEvent.blur(title)
    expect(await screen.findByRole('alert')).toHaveTextContent('区段标题不能为空')
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(update).not.toHaveBeenCalled()

    /** @brief 当前聚焦 section 的语义正文输入 / Semantic-content input of the currently focused section. */
    const content = screen.getByRole('textbox', { name: '语义内容' })
    fireEvent.change(content, { target: { value: '😀'.repeat(20_001) } })
    fireEvent.blur(content)
    expect(await screen.findByRole('alert')).toHaveTextContent('20,000')
    expect(content).toHaveAttribute('aria-invalid', 'true')
    expect(update).not.toHaveBeenCalled()
  })

  it('allows every resume window to collapse while preserving all three title bars', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })

    fireEvent.click(screen.getByRole('button', { name: '收起“AI 对话”窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '收起“内容编辑”窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '收起“预览”窗口' }))

    expect(screen.queryByRole('complementary', { name: 'AI 对话' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '内容编辑' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '语义内容预览' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开“AI 对话”窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开“内容编辑”窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开“预览”窗口' })).toBeInTheDocument()
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
  })

  it('preserves local section title and body drafts while the editor pane is collapsed', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 验证折叠期间没有把本地草稿提交给服务端 / Verify that collapsing does not submit browser-local drafts. */
    const update = vi.spyOn(resume, 'updateResumeSection')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 尚未保存的板块标题 / Unsaved section-title draft. */
    const title = screen.getByRole('textbox', { name: '区段标题' })
    /** @brief 尚未保存的板块正文 / Unsaved section-body draft. */
    const content = screen.getByRole('textbox', { name: '语义内容' })
    fireEvent.change(title, { target: { value: '尚未保存的标题' } })
    fireEvent.change(content, { target: { value: '尚未保存的正文' } })

    fireEvent.click(screen.getByRole('button', { name: '收起“内容编辑”窗口' }))
    expect(screen.queryByRole('region', { name: '内容编辑' })).not.toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '展开“内容编辑”窗口' }))
    expect(screen.getByRole('textbox', { name: '区段标题' })).toHaveValue('尚未保存的标题')
    expect(screen.getByRole('textbox', { name: '语义内容' })).toHaveValue('尚未保存的正文')
    expect(update).not.toHaveBeenCalled()
  })

  it('treats every valid opaque section ID as data instead of an object prototype key', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前用例独享的 Resume gateway / Resume gateway owned by this case. */
    const resume = new InMemoryResumeGateway()
    /** @brief 用合法 prototype-name ID 替换首个 section 的权威 / Authority whose first section uses a valid prototype-name ID. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 满足 OpaqueId 语法但会命中普通对象原型的 section ID / Section ID satisfying OpaqueId syntax while colliding with an ordinary object prototype. */
    const prototypeNameId = 'constructor' as (typeof initial.resume.sections)[number]['id']
    /** @brief 带 prototype-name section 的完整编辑权威 / Complete editor authority carrying the prototype-name section. */
    const editor = {
      ...initial,
      resume: {
        ...initial.resume,
        sections: initial.resume.sections.map((section, index) =>
          index === 0 ? { ...section, id: prototypeNameId } : section
        ),
        styleIntent: {
          ...initial.resume.styleIntent,
          sectionLayout: initial.resume.styleIntent.sectionLayout.map((layout, index) =>
            index === 0 ? { ...layout, sectionId: prototypeNameId } : layout
          )
        }
      }
    }
    vi.spyOn(resume, 'getResumeEditor').mockResolvedValue(editor)

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 同一 prototype-name section 的两个独立本地字段 / Two independent local fields of the same prototype-name section. */
    const title = screen.getByRole('textbox', { name: '区段标题' })
    const content = screen.getByRole('textbox', { name: '语义内容' })
    fireEvent.change(title, { target: { value: '安全标题草稿' } })
    fireEvent.change(content, { target: { value: '安全正文草稿' } })

    expect(title).toHaveValue('安全标题草稿')
    expect(content).toHaveValue('安全正文草稿')
  })

  it('keeps the assistant composer unavailable until the Agent message contract is connected', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })

    expect(screen.getByRole('textbox', { name: '询问简历助手' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()
  })

  it.each([412, 409] as const)(
    'locks stale resume writes after HTTP %i, reloads authority, and preserves the local draft',
    async (status) => {
      await setWorkspaceAppTestLocale('en-US')
      /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
      const resume = new InMemoryResumeGateway()
      /** @brief 用户首次载入的简历投影 / Resume projection initially loaded by the user. */
      const initial = await resume.getResumeEditor(
        MOCK_RESUME_WORKSPACE_ID,
        MOCK_RESUME_ID,
        ACTIVE_RESUME_READ_SIGNAL
      )
      /** @brief 服务端权威简历投影 / Authoritative server Resume projection. */
      const authoritative = {
        ...initial,
        resume: { ...initial.resume, revision: status === 412 ? 99 : 77 }
      }
      vi.spyOn(resume, 'getResumeEditor')
        .mockResolvedValueOnce(initial)
        .mockResolvedValue(authoritative)
      /** @brief 被拒绝的陈旧写入 / Rejected stale write. */
      const update = vi.spyOn(resume, 'updateResumeSection').mockRejectedValue(
        new ApiV2ProblemError(
          {
            code: status === 412 ? 'resume.precondition_failed' : 'resume.conflict',
            detail: 'The Resume ETag is stale.',
            errors: [],
            extensions: null,
            instance: null,
            request_id: 'req_resume_conflict_12345678',
            retryable: true,
            status,
            title: 'Resume changed elsewhere',
            type: 'https://api.hmalliances.org/problems/resume-conflict'
          },
          null
        )
      )

      render(
        <WorkspaceApp
          gateways={createTestGateways({ resume })}
          initialPath="/resumes/res_mock_ai_platform/edit"
        />
      )
      await screen.findByRole('heading', { name: 'Klee Chen' })
      /** @brief 语义内容编辑框 / Semantic-content editor. */
      const content = screen.getByRole('textbox', { name: 'Semantic content' })
      fireEvent.change(content, { target: { value: 'A stale local edit' } })
      fireEvent.blur(content)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This resume changed on the server. Reload the authoritative version before editing.'
      )
      expect(content).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
      expect(desktopTemplateSettingsLink('Open Template and style settings')).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      expect(screen.getByText('Revision 18')).toBeInTheDocument()
      expect(update).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByRole('button', { name: 'Reload server version' }))
      expect(await screen.findByText(`Revision ${status === 412 ? 99 : 77}`)).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Semantic content' })).toHaveValue(
        'A stale local edit'
      )
    }
  )

  it.each(RESUME_OUTCOME_UNKNOWN_MUTATIONS)(
    'confirms an outcome-unknown %s by replaying the exact command envelope without reads',
    async (_label, mutation): Promise<void> => {
      await setWorkspaceAppTestLocale('en-US')
      /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
      const resume = new InMemoryResumeGateway()
      /** @brief 用户首次载入的简历投影 / Resume projection initially loaded by the user. */
      const initial = await resume.getResumeEditor(
        MOCK_RESUME_WORKSPACE_ID,
        MOCK_RESUME_ID,
        ACTIVE_RESUME_READ_SIGNAL
      )
      /** @brief 若错误发生 GET 就会暴露的不同权威 / Different authority that would expose an erroneous GET. */
      const forbiddenReload = {
        ...initial,
        concurrencyToken: '"resume-forbidden-reload-etag-777"' as typeof initial.concurrencyToken,
        resume: {
          ...initial.resume,
          revision: 777,
          title: 'Forbidden authority reload'
        }
      }
      /** @brief 只允许初始加载的一次 Resume GET / Resume GET allowing only the initial load. */
      const getEditor = vi
        .spyOn(resume, 'getResumeEditor')
        .mockResolvedValueOnce(initial)
        .mockResolvedValue(forbiddenReload)
      /** @brief 可观察的 exact pinned Template 读取 / Observable exact pinned-Template reads. */
      const getTemplate = vi.spyOn(resume, 'getTemplate')
      /** @brief 编辑器不应读取的公开目录 / Public catalog that the editor must not read. */
      const listTemplates = vi.spyOn(resume, 'listTemplatePage')
      /** @brief 可观察的板块更新命令 / Observable section-update command. */
      const update = vi.spyOn(resume, 'updateResumeSection')
      /** @brief 可观察的板块排序命令 / Observable section-reorder command. */
      const reorder = vi.spyOn(resume, 'reorderResumeSections')
      /** @brief 可观察的板块删除命令 / Observable section-delete command. */
      const remove = vi.spyOn(resume, 'deleteResumeSection')
      /** @brief 三类命令共享的首次未知结果 / First unknown outcome shared by all three commands. */
      const unknownOutcome = new ApiV2WriteOutcomeUnknownError('network')
      /** @brief 成功确认后必须被页面采用的 Resume 标题 / Resume title the page must adopt after successful confirmation. */
      const confirmedTitle = `Confirmed ${mutation} projection`
      /** @brief 成功确认的公共权威投影 / Shared authoritative projection for a successful confirmation. */
      const confirmed = {
        ...initial,
        concurrencyToken: '"resume-confirmed-etag-91"' as typeof initial.concurrencyToken,
        resume: {
          ...initial.resume,
          revision: 91,
          title: confirmedTitle
        }
      }

      switch (mutation) {
        case 'section-update':
          update.mockRejectedValueOnce(unknownOutcome).mockImplementationOnce((input) =>
            Promise.resolve({
              ...confirmed,
              resume: {
                ...confirmed.resume,
                sections: confirmed.resume.sections.map((section) =>
                  section.id === input.sectionId
                    ? {
                        ...section,
                        ...(input.content === undefined ? {} : { content: input.content }),
                        ...(input.title === undefined ? {} : { title: input.title })
                      }
                    : section
                )
              }
            })
          )
          break
        case 'section-reorder':
          reorder.mockRejectedValueOnce(unknownOutcome).mockImplementationOnce((input) => {
            /** @brief 按确认命令排序的 sections / Sections ordered by the confirmed command. */
            const sections = input.orderedSectionIds.map((sectionId) => {
              /** @brief 当前目标 section / Current target section. */
              const section = confirmed.resume.sections.find(
                (candidate) => candidate.id === sectionId
              )
              if (section === undefined) {
                throw new Error('The reorder fixture must contain every requested section.')
              }
              return section
            })
            return Promise.resolve({
              ...confirmed,
              resume: { ...confirmed.resume, sections }
            })
          })
          break
        case 'section-delete':
          remove.mockRejectedValueOnce(unknownOutcome).mockImplementationOnce((input) =>
            Promise.resolve({
              ...confirmed,
              resume: {
                ...confirmed.resume,
                sections: confirmed.resume.sections.filter(
                  (section) => section.id !== input.sectionId
                ),
                styleIntent: {
                  ...confirmed.resume.styleIntent,
                  sectionLayout: confirmed.resume.styleIntent.sectionLayout.filter(
                    (layout) => layout.sectionId !== input.sectionId
                  )
                }
              }
            })
          )
          break
      }

      render(
        <WorkspaceApp
          gateways={createTestGateways({ resume })}
          initialPath="/resumes/res_mock_ai_platform/edit"
        />
      )
      await screen.findByRole('heading', { name: 'Klee Chen' })

      /** @brief 触发当前参数指定的用户写操作 / Trigger the user mutation selected by the current parameter. */
      const triggerMutation = (): void => {
        switch (mutation) {
          case 'section-update': {
            /** @brief 语义内容编辑框 / Semantic-content editor. */
            const content = screen.getByRole('textbox', { name: 'Semantic content' })
            fireEvent.change(content, { target: { value: 'Confirm this exact command' } })
            fireEvent.blur(content)
            return
          }
          case 'section-reorder':
            fireEvent.click(screen.getByRole('button', { name: 'Move 职业摘要 down' }))
            return
          case 'section-delete': {
            /** @brief 需要二次确认的删除按钮 / Delete button requiring a second confirmation. */
            const deleteButton = screen.getByRole('button', { name: 'Delete 职业摘要' })
            fireEvent.click(deleteButton)
            fireEvent.click(deleteButton)
            return
          }
        }
      }

      /** @brief 返回当前参数选中的完整命令调用 / Return complete command calls for the selected mutation. */
      const selectedCalls = (): readonly (readonly [unknown])[] => {
        switch (mutation) {
          case 'section-update':
            return update.mock.calls
          case 'section-reorder':
            return reorder.mock.calls
          case 'section-delete':
            return remove.mock.calls
        }
      }

      triggerMutation()

      expect(await screen.findByText('Resume operation result is unknown')).toBeInTheDocument()
      /** @brief 原样确认冻结命令的根恢复按钮 / Root recovery button confirming the frozen command verbatim. */
      const confirm = screen.getByRole('button', { name: 'Confirm previous operation' })
      expect(screen.getByRole('textbox', { name: 'Semantic content' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Generate PDF preview' })).toBeDisabled()
      expect(selectedCalls()).toHaveLength(1)
      expect(getEditor).toHaveBeenCalledTimes(1)
      expect(getTemplate).toHaveBeenCalledTimes(1)
      expect(listTemplates).not.toHaveBeenCalled()

      fireEvent.click(confirm)

      await vi.waitFor((): void => expect(selectedCalls()).toHaveLength(2))
      /** @brief 首次发送的完整命令输入 / Complete command input sent first. */
      const firstInput = selectedCalls()[0]?.[0]
      /** @brief 确认时发送的完整命令输入 / Complete command input sent during confirmation. */
      const confirmedInput = selectedCalls()[1]?.[0]
      expect(firstInput).toBeDefined()
      expect(confirmedInput).toStrictEqual(firstInput)
      expect(getEditor).toHaveBeenCalledTimes(1)
      expect(getTemplate).toHaveBeenCalledTimes(1)
      expect(listTemplates).not.toHaveBeenCalled()
      expect(screen.queryByText('Forbidden authority reload')).not.toBeInTheDocument()
      expect(await screen.findByText(confirmedTitle)).toBeInTheDocument()
      expect(screen.getByText('Revision 91')).toBeInTheDocument()
      expect(screen.queryByText('Resume operation result is unknown')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Generate PDF preview' })).toBeEnabled()

      expect(update).toHaveBeenCalledTimes(mutation === 'section-update' ? 2 : 0)
      expect(reorder).toHaveBeenCalledTimes(mutation === 'section-reorder' ? 2 : 0)
      expect(remove).toHaveBeenCalledTimes(mutation === 'section-delete' ? 2 : 0)
      if (mutation === 'section-update') {
        expect(screen.getByRole('textbox', { name: 'Semantic content' })).toHaveValue(
          'Confirm this exact command'
        )
      }
      if (mutation === 'section-delete') {
        expect(screen.queryByRole('button', { name: 'Delete 职业摘要' })).not.toBeInTheDocument()
      }
    }
  )

  it('reuses the exact section command after an unknown outcome without reading authority', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前用例独享的 Resume gateway / Resume gateway owned by this case. */
    const resume = new InMemoryResumeGateway()
    /** @brief 未确认写入前的初始权威 / Initial authority before the unconfirmed write. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 若恢复错误执行 GET 就会返回的不同 revision / Different revision returned only if recovery erroneously performs a GET. */
    const forbiddenReload = {
      ...initial,
      resume: { ...initial.resume, revision: 313, title: 'Forbidden focused-test reload' }
    }
    /** @brief 只允许初始加载的一次 Resume GET / Resume GET allowing only the initial load. */
    const getEditor = vi
      .spyOn(resume, 'getResumeEditor')
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(forbiddenReload)
    /** @brief 只允许初始加载的一次 exact pinned Template 读取 / Exact pinned-Template read allowing only initial loading. */
    const getTemplate = vi.spyOn(resume, 'getTemplate')
    /** @brief 编辑器不应读取的公开目录 / Public catalog that the editor must not read. */
    const listTemplates = vi.spyOn(resume, 'listTemplatePage')
    /** @brief 首次结果未知、确认重放成功的写端口 / Writer whose first outcome is unknown and whose confirming replay succeeds. */
    const update = vi
      .spyOn(resume, 'updateResumeSection')
      .mockRejectedValueOnce(new ApiV2WriteOutcomeUnknownError('network'))
      .mockImplementationOnce((input) =>
        Promise.resolve({
          ...initial,
          concurrencyToken: '"resume-confirmed-etag-19"' as typeof initial.concurrencyToken,
          resume: {
            ...initial.resume,
            revision: 19,
            sections: initial.resume.sections.map((section) =>
              section.id === input.sectionId && input.content !== undefined
                ? { ...section, content: input.content }
                : section
            )
          }
        })
      )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 结果未知后仍保留的字段草稿 / Field draft retained after an unknown outcome. */
    const content = screen.getByRole('textbox', { name: 'Semantic content' })
    fireEvent.change(content, { target: { value: 'Confirm this exact command' } })
    fireEvent.blur(content)
    await screen.findByText('Resume operation result is unknown')
    /** @brief 首次 dispatch 的完整冻结 command envelope / Complete frozen command envelope of the first dispatch. */
    const firstInput = update.mock.calls[0]?.[0]
    expect(firstInput).toBeDefined()
    expect(getEditor).toHaveBeenCalledTimes(1)
    expect(getTemplate).toHaveBeenCalledTimes(1)
    expect(listTemplates).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm previous operation' }))

    await vi.waitFor((): void => {
      expect(update).toHaveBeenCalledTimes(2)
    })
    expect(update.mock.calls[1]?.[0]).toStrictEqual(firstInput)
    expect(getEditor).toHaveBeenCalledTimes(1)
    expect(getTemplate).toHaveBeenCalledTimes(1)
    expect(listTemplates).not.toHaveBeenCalled()
    expect(screen.queryByText('Forbidden focused-test reload')).not.toBeInTheDocument()
    expect(await screen.findByText('Revision 19')).toBeInTheDocument()
    expect(content).toBeEnabled()
    expect(content).toHaveValue('Confirm this exact command')
    expect(screen.queryByText('Resume operation result is unknown')).not.toBeInTheDocument()
  })

  it('treats idempotency.in_progress as an exact-confirmation barrier', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前用例独享的 Resume gateway / Resume gateway owned by this case. */
    const resume = new InMemoryResumeGateway()
    /** @brief 当前页面初始权威 / Initial authority for the current page. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 只允许初始加载的一次 Resume GET / Resume GET allowing only the initial load. */
    const getEditor = vi.spyOn(resume, 'getResumeEditor').mockResolvedValue(initial)
    /** @brief 首次仍在处理、确认时返回成功权威的字段写入 / Field write still in progress first and returning confirmed authority on replay. */
    const update = vi
      .spyOn(resume, 'updateResumeSection')
      .mockRejectedValueOnce(
        new ApiV2ProblemError(
          {
            code: 'idempotency.in_progress',
            detail: null,
            errors: [],
            extensions: null,
            instance: null,
            request_id: 'req_idempotency_progress_12345678',
            retryable: true,
            status: 409,
            title: 'Command in progress',
            type: 'https://api.hmalliances.org/problems/idempotency-in-progress'
          },
          100
        )
      )
      .mockImplementationOnce((input) =>
        Promise.resolve({
          ...initial,
          concurrencyToken:
            '"resume-progress-confirmed-etag-94"' as typeof initial.concurrencyToken,
          resume: {
            ...initial.resume,
            revision: 94,
            sections: initial.resume.sections.map((section) =>
              section.id === input.sectionId && input.content !== undefined
                ? { ...section, content: input.content }
                : section
            )
          }
        })
      )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 处理中命令携带的正文草稿 / Body draft carried by the in-progress command. */
    const content = screen.getByRole('textbox', { name: 'Semantic content' })
    fireEvent.change(content, { target: { value: 'Confirm the in-progress command' } })
    fireEvent.blur(content)

    expect(await screen.findByText('Resume operation result is unknown')).toBeInTheDocument()
    expect(content).toBeDisabled()
    /** @brief 第一次 dispatch 的完整应用命令 / Complete application command of the first dispatch. */
    const firstInput = update.mock.calls[0]?.[0]
    expect(
      screen.getByRole('button', { name: 'Waiting for the server retry window…' })
    ).toBeDisabled()
    /** @brief Retry-After 到期后重新启用的确认动作 / Confirmation action re-enabled after Retry-After expires. */
    const confirm = await screen.findByRole('button', { name: 'Confirm previous operation' })
    fireEvent.click(confirm)

    await vi.waitFor((): void => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls[1]?.[0]).toStrictEqual(firstInput)
    expect(getEditor).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Revision 94')).toBeInTheDocument()
    expect(content).toHaveValue('Confirm the in-progress command')
    expect(content).toBeEnabled()
  })

  it('ends exact confirmation after a definitive 422 and recovers through authority', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前用例独享的 Resume gateway / Resume gateway owned by this case. */
    const resume = new InMemoryResumeGateway()
    /** @brief 首次读取的权威编辑器 / Authoritative editor returned by the initial read. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 终态拒绝后由 GET 返回的新权威 / New authority returned by GET after terminal rejection. */
    const authoritative = {
      ...initial,
      concurrencyToken: '"resume-after-rejection-etag-92"' as typeof initial.concurrencyToken,
      resume: { ...initial.resume, revision: 92 }
    }
    /** @brief 可观察的权威读取 / Observable authoritative reads. */
    const getEditor = vi
      .spyOn(resume, 'getResumeEditor')
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(authoritative)
    /** @brief 首次未知、确认时明确拒绝的字段写入 / Field write unknown first and definitively rejected during confirmation. */
    const update = vi
      .spyOn(resume, 'updateResumeSection')
      .mockRejectedValueOnce(new ApiV2WriteOutcomeUnknownError('network'))
      .mockRejectedValueOnce(
        new ApiV2ProblemError(
          {
            code: 'resume.invalid_operation',
            detail: null,
            errors: [],
            extensions: null,
            instance: null,
            request_id: 'req_terminal_rejection_12345678',
            retryable: false,
            status: 422,
            title: 'Rejected operation',
            type: 'https://api.hmalliances.org/problems/resume-invalid-operation'
          },
          null
        )
      )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 结果未知期间必须保留的本地正文草稿 / Local body draft retained while the outcome is unknown. */
    const content = screen.getByRole('textbox', { name: 'Semantic content' })
    fireEvent.change(content, { target: { value: 'Retain after terminal rejection' } })
    fireEvent.blur(content)

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm previous operation' }))

    expect(
      await screen.findByText(
        'The server definitively rejected the original command. Reload authority, then review the retained local draft.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('Original operation was rejected')).toBeInTheDocument()
    expect(screen.queryByText('The server version could not be reloaded.')).not.toBeInTheDocument()
    expect(update).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByRole('button', { name: 'Confirm previous operation' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload server version' }))

    expect(await screen.findByText('Revision 92')).toBeInTheDocument()
    expect(getEditor).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('textbox', { name: 'Semantic content' })).toHaveValue(
      'Retain after terminal rejection'
    )
    expect(screen.getByRole('textbox', { name: 'Semantic content' })).toBeEnabled()
  })

  it('does not replay a terminal invalid 200 response and reads authority instead', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前用例独享的 Resume gateway / Resume gateway owned by this case. */
    const resume = new InMemoryResumeGateway()
    /** @brief 首次读取的权威编辑器 / Authoritative editor returned by the initial read. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 契约失败后通过 GET 恢复的权威 / Authority recovered by GET after the contract failure. */
    const authoritative = {
      ...initial,
      concurrencyToken: '"resume-after-contract-etag-93"' as typeof initial.concurrencyToken,
      resume: { ...initial.resume, revision: 93 }
    }
    /** @brief 可观察的权威读取 / Observable authoritative reads. */
    const getEditor = vi
      .spyOn(resume, 'getResumeEditor')
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(authoritative)
    /** @brief 已完成 200、但响应违反契约的字段写入 / Field write completed with a 200 response that violated the contract. */
    const update = vi
      .spyOn(resume, 'updateResumeSection')
      .mockRejectedValueOnce(
        new ApiV2WriteOutcomeUnknownError('contract', 200, null, 'req_invalid_success_12345678')
      )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 将触发终态坏响应的正文输入 / Body input triggering the terminal invalid response. */
    const content = screen.getByRole('textbox', { name: 'Semantic content' })
    fireEvent.change(content, { target: { value: 'Retain after invalid success' } })
    fireEvent.blur(content)

    expect(
      await screen.findByText(
        'The HTTP response violated API v2. Reload authority instead of replaying a command that would return the same invalid response.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('Server response could not be confirmed')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Confirm previous operation' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload server version' }))

    expect(await screen.findByText('Revision 93')).toBeInTheDocument()
    expect(getEditor).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox', { name: 'Semantic content' })).toHaveValue(
      'Retain after invalid success'
    )
    expect(screen.getByRole('textbox', { name: 'Semantic content' })).toBeEnabled()
  })

  it('discards a persistently malformed 409 response and creates a new command after GET', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前用例独享的 Resume gateway / Resume gateway owned by this case. */
    const resume = new InMemoryResumeGateway()
    /** @brief GET 前后保持不变的权威 / Authority remaining unchanged across GET. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 可观察的权威读取 / Observable authoritative reads. */
    const getEditor = vi.spyOn(resume, 'getResumeEditor').mockResolvedValue(initial)
    /** @brief 首次响应为不可分类坏 409、放弃后新命令成功的字段写入 / Field write returning an unclassifiable bad 409 first and succeeding with a new command after abandonment. */
    const update = vi
      .spyOn(resume, 'updateResumeSection')
      .mockRejectedValueOnce(
        new ApiV2WriteOutcomeUnknownError('contract', 409, null, 'req_malformed_conflict_12345678')
      )
      .mockImplementationOnce((input) =>
        Promise.resolve({
          ...initial,
          concurrencyToken: '"resume-after-abandon-etag-96"' as typeof initial.concurrencyToken,
          resume: {
            ...initial.resume,
            revision: 96,
            sections: initial.resume.sections.map((section) =>
              section.id === input.sectionId && input.content !== undefined
                ? { ...section, content: input.content }
                : section
            )
          }
        })
      )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 坏 409 期间必须保留的正文草稿 / Body draft retained across the malformed 409. */
    const content = screen.getByRole('textbox', { name: 'Semantic content' })
    fireEvent.change(content, { target: { value: 'Retry only as a new explicit command' } })
    fireEvent.blur(content)

    expect(await screen.findByText('Server response could not be confirmed')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Confirm previous operation' })
    ).not.toBeInTheDocument()
    /** @brief 坏响应使旧命令不可重放后唯一允许的权威读取动作 / Sole authority-read action allowed after the malformed response makes the old command unreplayable. */
    const reload = screen.getByRole('button', { name: 'Reload server version' })
    /** @brief 必须被放弃的旧 command identity / Old command identity that must be abandoned. */
    const oldCommandId = update.mock.calls[0]?.[0].commandId
    fireEvent.click(reload)

    await vi.waitFor((): void => expect(getEditor).toHaveBeenCalledTimes(2))
    await vi.waitFor((): void => {
      expect(content).toBeEnabled()
    })
    expect(content).toHaveValue('Retry only as a new explicit command')
    fireEvent.blur(content)

    await vi.waitFor((): void => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls[1]?.[0].commandId).not.toBe(oldCommandId)
    expect(await screen.findByText('Revision 96')).toBeInTheDocument()
  })

  it('requires authority recovery when the first dispatch reports idempotency.key_reused', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 当前用例独享的 Resume gateway / Resume gateway owned by this case. */
    const resume = new InMemoryResumeGateway()
    /** @brief 页面初始权威 / Initial page authority. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 错误 key 被丢弃后重新读取的权威 / Authority re-read after discarding the faulty key. */
    const authoritative = {
      ...initial,
      concurrencyToken: '"resume-after-key-reused-etag-95"' as typeof initial.concurrencyToken,
      resume: { ...initial.resume, revision: 95 }
    }
    /** @brief 可观察的权威读取 / Observable authoritative reads. */
    const getEditor = vi
      .spyOn(resume, 'getResumeEditor')
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(authoritative)
    /** @brief 首次即返回 key-reused 的字段写入 / Field write returning key-reused on its first dispatch. */
    const update = vi.spyOn(resume, 'updateResumeSection').mockRejectedValueOnce(
      new ApiV2ProblemError(
        {
          code: 'idempotency.key_reused',
          detail: null,
          errors: [],
          extensions: null,
          instance: null,
          request_id: 'req_key_reused_12345678',
          retryable: false,
          status: 409,
          title: 'Idempotency key reused',
          type: 'https://api.hmalliances.org/problems/idempotency-key-reused'
        },
        null
      )
    )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 必须跨权威恢复保留的正文草稿 / Body draft that must survive authority recovery. */
    const content = screen.getByRole('textbox', { name: 'Semantic content' })
    fireEvent.change(content, { target: { value: 'Retain after key reuse' } })
    fireEvent.blur(content)

    expect(await screen.findByText('Command identifier conflict')).toBeInTheDocument()
    expect(content).toBeDisabled()
    expect(update).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole('button', { name: 'Confirm previous operation' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload server version' }))

    expect(await screen.findByText('Revision 95')).toBeInTheDocument()
    expect(getEditor).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(1)
    expect(content).toHaveValue('Retain after key reuse')
    expect(content).toBeEnabled()
  })

  it('adopts a confirmed batch-conflict authority without GET and requires a new explicit save intent', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前用例独享的 Resume gateway / Resume gateway owned by this case. */
    const resume = new InMemoryResumeGateway()
    /** @brief 页面初始权威 / Initial page authority. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 合法 200 conflict 返回的新权威 / New authority returned by a valid 200 conflict. */
    const conflictAuthority = {
      ...initial,
      concurrencyToken: '"resume-conflict-etag-19"' as typeof initial.concurrencyToken,
      resume: { ...initial.resume, revision: 19 }
    }
    /** @brief 只允许初始加载的一次 Resume GET / Resume GET allowing only the initial load. */
    const getEditor = vi.spyOn(resume, 'getResumeEditor').mockResolvedValue(initial)
    /** @brief 首次返回领域 conflict、第二次确认新意图的 section 写端口 / Section writer returning a domain conflict first and confirming the new intent second. */
    const update = vi
      .spyOn(resume, 'updateResumeSection')
      .mockRejectedValueOnce(
        new ResumeBatchConflictError(conflictAuthority, [
          {
            code: 'resume.field_conflict',
            entityId: initial.resume.sections[0]?.id ?? null,
            fieldPath: ['content'],
            operationId: 'operation_conflict_content_0001'
          }
        ])
      )
      .mockImplementationOnce((input) =>
        Promise.resolve({
          ...conflictAuthority,
          concurrencyToken: '"resume-saved-etag-20"' as typeof initial.concurrencyToken,
          resume: {
            ...conflictAuthority.resume,
            revision: 20,
            sections: conflictAuthority.resume.sections.map((section) =>
              section.id === input.sectionId && input.content !== undefined
                ? { ...section, content: input.content }
                : section
            )
          }
        })
      )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 未获服务端应用但必须保留的正文草稿 / Body draft not applied by the service but required to remain local. */
    const content = screen.getByRole('textbox', { name: '语义内容' })
    fireEvent.change(content, { target: { value: '需要基于新版本确认的草稿' } })
    fireEvent.blur(content)

    expect(await screen.findByText('服务端未应用这次修改。')).toBeInTheDocument()
    expect(screen.getByText('版本 19')).toBeInTheDocument()
    expect(content).toHaveValue('需要基于新版本确认的草稿')
    expect(content).toBeDisabled()
    expect(getEditor).toHaveBeenCalledTimes(1)
    /** @brief 首次 conflict command identity / Identity of the first conflicting command. */
    const firstCommandId = update.mock.calls[0]?.[0].commandId

    fireEvent.click(screen.getByRole('button', { name: '基于最新版本继续' }))
    expect(content).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '检查后重新保存' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls[1]?.[0].commandId).not.toBe(firstCommandId)
    expect(getEditor).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('版本 20')).toBeInTheDocument()
    expect(screen.queryByText('服务端未应用这次修改。')).not.toBeInTheDocument()
  })

  it.each([
    ['title', 'content'],
    ['content', 'title']
  ] as const)(
    'preserves only an explicit %s draft when conflict authority changes %s',
    async (editedField, concurrentField): Promise<void> => {
      await setWorkspaceAppTestLocale('zh-SG')
      /** @brief 当前用例独享的 Resume gateway / Resume gateway owned by this case. */
      const resume = new InMemoryResumeGateway()
      /** @brief 用户编辑前的权威 / Authority before the user's edit. */
      const initial = await resume.getResumeEditor(
        MOCK_RESUME_WORKSPACE_ID,
        MOCK_RESUME_ID,
        ACTIVE_RESUME_READ_SIGNAL
      )
      /** @brief 测试使用的首个 section / First section used by this case. */
      const initialSection = initial.resume.sections[0]
      if (initialSection === undefined) throw new Error('The fixture must contain a section.')
      /** @brief 并发写入的新标题 / New title written concurrently. */
      const concurrentTitle = '远端并发标题 T2'
      /** @brief 并发写入的新正文 / New body written concurrently. */
      const concurrentContent = { marks: [], text: '远端并发正文 C2' } as const
      /** @brief 只修改用户未编辑字段的新权威 / New authority changing only the field the user did not edit. */
      const conflictAuthority = {
        ...initial,
        concurrencyToken: '"resume-sparse-conflict-etag-19"' as typeof initial.concurrencyToken,
        resume: {
          ...initial.resume,
          revision: 19,
          sections: initial.resume.sections.map((section, index) =>
            index !== 0
              ? section
              : {
                  ...section,
                  ...(concurrentField === 'title' ? { title: concurrentTitle } : {}),
                  ...(concurrentField === 'content' ? { content: concurrentContent } : {})
                }
          )
        }
      }
      /** @brief 首次冲突、第二次接受显式 sparse intent 的写端口 / Writer conflicting first and then accepting the explicit sparse intent. */
      const update = vi
        .spyOn(resume, 'updateResumeSection')
        .mockRejectedValueOnce(
          new ResumeBatchConflictError(conflictAuthority, [
            {
              code: 'resume.field_conflict',
              entityId: initialSection.id,
              fieldPath: [editedField],
              operationId: `operation_sparse_${editedField}_0001`
            }
          ])
        )
        .mockImplementationOnce((input) =>
          Promise.resolve({
            ...conflictAuthority,
            concurrencyToken: '"resume-sparse-saved-etag-20"' as typeof initial.concurrencyToken,
            resume: {
              ...conflictAuthority.resume,
              revision: 20,
              sections: conflictAuthority.resume.sections.map((section) =>
                section.id !== input.sectionId
                  ? section
                  : {
                      ...section,
                      ...(input.title === undefined ? {} : { title: input.title }),
                      ...(input.content === undefined ? {} : { content: input.content })
                    }
              )
            }
          })
        )

      render(
        <WorkspaceApp
          gateways={createTestGateways({ resume })}
          initialPath="/resumes/res_mock_ai_platform/edit"
        />
      )
      await screen.findByRole('heading', { name: 'Klee Chen' })
      /** @brief section 标题输入 / Section-title input. */
      const title = screen.getByRole('textbox', { name: '区段标题' })
      /** @brief section 正文输入 / Section-body input. */
      const content = screen.getByRole('textbox', { name: '语义内容' })
      if (editedField === 'title') {
        fireEvent.change(title, { target: { value: '只编辑本地标题 T-local' } })
        fireEvent.blur(title)
      } else {
        fireEvent.change(content, { target: { value: '只编辑本地正文 C-local' } })
        fireEvent.blur(content)
      }

      expect(await screen.findByText('服务端未应用这次修改。')).toBeInTheDocument()
      if (concurrentField === 'title') expect(title).toHaveValue(concurrentTitle)
      else expect(content).toHaveValue(concurrentContent.text)
      fireEvent.click(screen.getByRole('button', { name: '基于最新版本继续' }))
      fireEvent.click(screen.getByRole('button', { name: '检查后重新保存' }))

      await vi.waitFor((): void => expect(update).toHaveBeenCalledTimes(2))
      /** @brief 基于新权威创建的第二条显式命令 / Second explicit command created against the new authority. */
      const retried = update.mock.calls[1]?.[0]
      if (editedField === 'title') {
        expect(retried?.title).toBe('只编辑本地标题 T-local')
        expect(retried?.content).toBeUndefined()
        expect(content).toHaveValue(concurrentContent.text)
        fireEvent.blur(content)
      } else {
        expect(retried?.content?.text).toBe('只编辑本地正文 C-local')
        expect(retried?.title).toBeUndefined()
        expect(title).toHaveValue(concurrentTitle)
        fireEvent.blur(title)
      }
      await Promise.resolve()
      expect(update).toHaveBeenCalledTimes(2)
    }
  )

  it('preserves a local draft for explicit recovery when conflict authority removed its section', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前用例独享的 Resume gateway / Resume gateway owned by this case. */
    const resume = new InMemoryResumeGateway()
    /** @brief 页面初始权威 / Initial page authority. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 被并发删除且携带本地草稿的板块 / Concurrently removed section carrying a local draft. */
    const removedSection = initial.resume.sections[0]
    if (removedSection === undefined) throw new Error('The fixture must contain a Resume section.')
    /** @brief 已删除目标板块的新权威 / New authority with the target section removed. */
    const conflictAuthority = {
      ...initial,
      concurrencyToken: '"resume-conflict-etag-removed-19"' as typeof initial.concurrencyToken,
      resume: {
        ...initial.resume,
        revision: 19,
        sections: initial.resume.sections.slice(1)
      }
    }
    /** @brief 只允许初始加载的一次 Resume GET / Resume GET allowing only the initial load. */
    const getEditor = vi.spyOn(resume, 'getResumeEditor').mockResolvedValue(initial)
    vi.spyOn(resume, 'updateResumeSection').mockRejectedValue(
      new ResumeBatchConflictError(conflictAuthority, [
        {
          code: 'resume.entity_missing',
          entityId: removedSection.id,
          fieldPath: ['content'],
          operationId: 'operation_conflict_removed_content_0001'
        }
      ])
    )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 不得因服务端删除而静默丢失的本地正文 / Local body that must not be silently lost after server-side deletion. */
    const content = screen.getByRole('textbox', { name: '语义内容' })
    fireEvent.change(content, { target: { value: '必须允许复制恢复的本地正文' } })
    fireEvent.blur(content)

    expect(await screen.findByText('服务端已删除板块；你的本地草稿仍保留。')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '已删除板块的标题' })).toHaveValue(
      removedSection.title
    )
    expect(screen.getByRole('textbox', { name: '已删除板块的正文' })).toHaveValue(
      '必须允许复制恢复的本地正文'
    )
    expect(getEditor).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '基于最新版本继续' }))
    expect(screen.getByText('服务端已删除板块；你的本地草稿仍保留。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '丢弃这份本地草稿' }))
    expect(screen.queryByText('服务端已删除板块；你的本地草稿仍保留。')).not.toBeInTheDocument()
  })

  it('locks structural and PDF writes while a section save is pending', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 待定写入完成后返回的权威投影 / Authoritative projection returned when the pending write completes. */
    const initial = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 允许测试释放待定板块保存 / Resolver allowing the test to release the pending section save. */
    let resolveUpdate: ((editor: typeof initial) => void) | undefined
    /** @brief 保持板块保存待定的 Promise / Promise keeping the section save pending. */
    const pendingUpdate = new Promise<typeof initial>((resolve): void => {
      resolveUpdate = resolve
    })
    /** @brief 待定的板块保存命令 / Pending section-save command. */
    const update = vi.spyOn(resume, 'updateResumeSection').mockReturnValue(pendingUpdate)
    /** @brief 并发期间不应发出的排序命令 / Reorder command that must not be sent concurrently. */
    const reorder = vi.spyOn(resume, 'reorderResumeSections')
    /** @brief 并发期间不应发出的 PDF 任务 / PDF command that must not be sent concurrently. */
    const renderPdf = vi.spyOn(resume, 'startResumeRender')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 用户正在保存的语义正文 / Semantic body currently being saved. */
    const content = screen.getByRole('textbox', { name: '语义内容' })
    fireEvent.change(content, { target: { value: '正在保存的内容' } })
    fireEvent.blur(content)

    await vi.waitFor((): void => expect(update).toHaveBeenCalledOnce())
    /** @brief 受聚合写通道锁定的结构操作 / Structural action locked by the aggregate write lane. */
    const moveDown = screen.getByRole('button', { name: '下移职业摘要' })
    /** @brief 受同一写通道锁定的 PDF 操作 / PDF action locked by the same write lane. */
    const generatePdf = screen.getByRole('button', { name: '生成 PDF 预览' })
    expect(moveDown).toBeDisabled()
    expect(screen.getByRole('button', { name: '删除职业摘要' })).toBeDisabled()
    expect(generatePdf).toBeDisabled()

    fireEvent.click(moveDown)
    fireEvent.click(generatePdf)
    expect(update).toHaveBeenCalledTimes(1)
    expect(reorder).not.toHaveBeenCalled()
    expect(renderPdf).not.toHaveBeenCalled()

    await act(async (): Promise<void> => {
      resolveUpdate?.(initial)
      await pendingUpdate
    })
    await vi.waitFor((): void => {
      expect(moveDown).toBeEnabled()
    })
    expect(generatePdf).toBeEnabled()
  })

  it('clears an obsolete structural error after the next successful operation', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 首次排序失败、第二次恢复真实实现的测试 Gateway / Test gateway whose first reorder fails and second call uses the real implementation. */
    const resume = new InMemoryResumeGateway()
    /** @brief 可观察的板块排序命令 / Observable section-reorder command. */
    const reorder = vi
      .spyOn(resume, 'reorderResumeSections')
      .mockRejectedValueOnce(new Error('private first-attempt failure'))

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })

    fireEvent.click(screen.getByRole('button', { name: '下移职业摘要' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法调整板块顺序。')
    expect(reorder).toHaveBeenCalledTimes(1)
    /** @brief 首次排序意图的稳定 command identity / Stable command identity of the first reorder intent. */
    const firstCommandId = reorder.mock.calls[0]?.[0].commandId
    expect(firstCommandId).toEqual(expect.any(String))

    fireEvent.click(screen.getByRole('button', { name: '下移职业摘要' }))
    await vi.waitFor((): void => expect(reorder).toHaveBeenCalledTimes(2))
    expect(reorder.mock.calls[1]?.[0].commandId).toBe(firstCommandId)
    await vi.waitFor((): void => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('保留明确可重试 503 失败的板块草稿，并允许用户原地重试', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 首次保存返回可重试 503、重试恢复真实实现的测试 Gateway / Test gateway whose first save returns retryable HTTP 503 and retry uses the real implementation. */
    const resume = new InMemoryResumeGateway()
    /** @brief 可观察的板块保存命令 / Observable section-save command. */
    const update = vi.spyOn(resume, 'updateResumeSection').mockRejectedValueOnce(
      new ApiV2ProblemError(
        {
          code: 'service.temporarily_unavailable',
          detail: 'POST https://private.example/resumes failed',
          errors: [],
          extensions: null,
          instance: null,
          request_id: 'req_resume_unavailable_12345678',
          retryable: true,
          status: 503,
          title: 'Temporary backend overload',
          type: 'https://api.hmalliances.org/problems/service-unavailable'
        },
        500
      )
    )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 用户正在编辑的语义正文 / Semantic body edited by the user. */
    const content = screen.getByRole('textbox', { name: '语义内容' })

    fireEvent.change(content, { target: { value: '尚未由服务端确认的草稿' } })
    fireEvent.blur(content)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '板块修改尚未保存；你的输入仍保留在本页。'
    )
    /** @brief 首次字段保存意图的稳定 command identity / Stable command identity of the first field-save intent. */
    const firstCommandId = update.mock.calls[0]?.[0].commandId
    expect(firstCommandId).toEqual(expect.any(String))
    expect(content).toHaveValue('尚未由服务端确认的草稿')
    expect(screen.queryByText(/private\.example/u)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls[1]?.[0].commandId).toBe(firstCommandId)
    await vi.waitFor((): void => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(content).toHaveValue('尚未由服务端确认的草稿')
  })

  it('offers section mutations and routes the exact current Template to its product settings page', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })

    expect(screen.getByRole('button', { name: '下移职业摘要' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除职业摘要' })).toBeInTheDocument()
    /** @brief 只表达当前 exact pinned 身份的设置入口 / Settings entry expressing only the current exact pinned identity. */
    const templateSettings = desktopTemplateSettingsLink('打开模板与样式设置')
    expect(templateSettings).toHaveTextContent('Dawn · v1.0.0')
    expect(templateSettings).toHaveAttribute('href', '/resumes/res_mock_ai_platform/template')
    expect(templateSettings).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('loads a pinned historical manifest without offering an unsafe version migration', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前简历固定历史模板版本的测试 Gateway / Test gateway whose Resume is pinned to a historical template version. */
    const resume = new InMemoryResumeGateway()
    /** @brief 默认简历权威投影 / Default authoritative Resume projection. */
    const current = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    vi.spyOn(resume, 'getResumeEditor').mockResolvedValue({
      ...current,
      resume: {
        ...current.resume,
        template: {
          templateId: MOCK_HISTORICAL_DAWN_TEMPLATE.id,
          templateVersion: MOCK_HISTORICAL_DAWN_TEMPLATE.version
        }
      }
    })
    /** @brief 可观察的精确版本读取 / Observable exact-version read. */
    const getTemplate = vi.spyOn(resume, 'getTemplate')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })

    /** @brief 历史 exact pinned 身份的设置入口 / Settings entry for the historical exact pinned identity. */
    const templateSettings = desktopTemplateSettingsLink('打开模板与样式设置')
    expect(templateSettings).toHaveTextContent('Dawn Legacy · v0.9.0')
    expect(getTemplate).toHaveBeenCalledWith(
      {
        templateId: MOCK_HISTORICAL_DAWN_TEMPLATE.id,
        templateVersion: MOCK_HISTORICAL_DAWN_TEMPLATE.version
      },
      expect.any(AbortSignal)
    )
    expect(templateSettings).toHaveAttribute('href', '/resumes/res_mock_ai_platform/template')
  })
})
