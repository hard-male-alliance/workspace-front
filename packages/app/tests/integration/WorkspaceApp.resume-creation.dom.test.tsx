/** @file API v2 Resume 创建页 DOM 集成测试 / API v2 Resume-creation page DOM integration tests. */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppGateways } from '../../src/application'
import { AppDataProvider, useWorkspaceSession } from '../../src/app/AppData'
import { DiagnosticsProvider } from '../../src/app/Diagnostics'
import { InMemoryIdentityGateway } from '../../src/contexts/identity/infrastructure/memory/gateway'
import { InMemoryInterviewGateway } from '../../src/contexts/interview/infrastructure/memory/gateway'
import { InMemoryKnowledgeGateway } from '../../src/contexts/knowledge/infrastructure/memory/gateway'
import type {
  ResumeCreationPort,
  ResumeTemplateCatalogPort
} from '../../src/contexts/resume/application/resume-creation'
import {
  asUiResumeTemplateCursor,
  type UiCreatedResume,
  type UiResumeTemplatePage
} from '../../src/contexts/resume/domain/creation'
import type { UiTemplateManifest } from '../../src/contexts/resume/domain/models'
import { MOCK_DAWN_TEMPLATE } from '../../src/contexts/resume/infrastructure/memory/data'
import { InMemoryResumeGateway } from '../../src/contexts/resume/infrastructure/memory/gateway'
import { ResumeCreationPage } from '../../src/contexts/resume/presentation/ResumeCreationPage'
import type { UiWorkspaceAccess } from '../../src/contexts/workspace/domain/models'
import { asUiWorkspaceSlug } from '../../src/contexts/workspace/domain/models'
import { DEMO_WORKSPACE_ACCESSES } from '../../src/contexts/workspace/infrastructure/memory/data'
import { InMemoryWorkspaceGateway } from '../../src/contexts/workspace/infrastructure/memory/gateway'
import { createDiagnostics } from '../../src/infrastructure/observability'
import type { Diagnostics } from '../../src/observability'
import { appI18n, setAppLocale } from '../../src/i18n'
import { asUiOpaqueId } from '../../src/shared-kernel/identity'

/** @brief 第二个测试 Workspace ID / Second test Workspace ID. */
const SECOND_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_resume_creation_second')

/** @brief 可由测试精确兑现的异步值 / Asynchronous value precisely settled by a test. */
interface Deferred<TValue> {
  /** @brief 受控 Promise / Controlled promise. */
  readonly promise: Promise<TValue>
  /** @brief 以成功值兑现 Promise / Fulfil the promise with a successful value. */
  readonly resolve: (value: TValue) => void
}

/**
 * @brief 创建测试控制的 Promise / Create a Promise controlled by a test.
 * @template TValue 成功值类型 / Successful value type.
 * @return Promise 与精确 resolver / Promise and precise resolver.
 */
function createDeferred<TValue>(): Deferred<TValue> {
  /** @brief 底层 Promise resolver / Underlying Promise resolver. */
  let resolvePromise: ((value: TValue) => void) | undefined
  /** @brief 等待测试兑现的 Promise / Promise waiting for test settlement. */
  const promise = new Promise<TValue>((resolve): void => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: (value): void => resolvePromise?.(value)
  }
}

/**
 * @brief 创建一页终止 Template 目录 / Create one terminal Template-catalog page.
 * @param items 当前页 Template / Templates on the current page.
 * @return 不带后续 cursor 的页面 / Page without a continuation cursor.
 */
function terminalTemplatePage(items: readonly UiTemplateManifest[]): UiResumeTemplatePage {
  return { hasMore: false, items, nextCursor: null }
}

/**
 * @brief 创建可辨识的不可变 Template fixture / Create a distinguishable immutable Template fixture.
 * @param id Template ID / Template ID.
 * @param name Template 名称 / Template name.
 * @param supportedLocales 支持的内容语言 / Supported content locales.
 * @return 完整 TemplateManifest / Complete TemplateManifest.
 */
function createTemplate(
  id: string,
  name: string,
  supportedLocales: readonly string[]
): UiTemplateManifest {
  return {
    ...MOCK_DAWN_TEMPLATE,
    id: asUiOpaqueId<'template'>(id),
    name,
    previewUrl: `https://cdn.example.test/templates/${id}.png`,
    supportedLocales
  }
}

/**
 * @brief 组合 Resume 创建页测试端口 / Compose ports for Resume-creation page tests.
 * @param overrides 当前测试替换的目录、创建或 Workspace 端口 / Catalog, creation, or Workspace ports replaced by the current test.
 * @return 完整应用端口集 / Complete application-port set.
 */
function createGateways(
  overrides: {
    readonly catalog?: ResumeTemplateCatalogPort
    readonly creation?: ResumeCreationPort
    readonly workspace?: InMemoryWorkspaceGateway
  } = {}
): AppGateways {
  /** @brief 测试内独享的 Resume adapter / Resume adapter isolated to this test. */
  const resume = new InMemoryResumeGateway()
  return {
    identity: new InMemoryIdentityGateway(),
    interview: new InMemoryInterviewGateway(),
    knowledge: new InMemoryKnowledgeGateway(),
    resume,
    resumeCreation: overrides.creation ?? resume,
    resumeTemplates: overrides.catalog ?? resume,
    workspace: overrides.workspace ?? new InMemoryWorkspaceGateway()
  }
}

/**
 * @brief 为创建页注入路由、i18n、诊断与应用端口 / Inject routing, i18n, diagnostics, and application ports for the creation page.
 * @param props 测试依赖与可选会话控件 / Test dependencies and optional session control.
 * @return 完整创建页测试树 / Complete creation-page test tree.
 */
function ResumeCreationTestRoot({
  children,
  diagnostics = createDiagnostics({ sinks: [] }),
  gateways
}: {
  readonly children?: ReactNode
  readonly diagnostics?: Diagnostics
  readonly gateways: AppGateways
}): React.JSX.Element {
  return (
    <I18nextProvider i18n={appI18n}>
      <MemoryRouter initialEntries={['/resumes/new']}>
        <DiagnosticsProvider diagnostics={diagnostics}>
          <AppDataProvider gateways={gateways}>
            {children}
            <Routes>
              <Route element={<ResumeCreationPage />} path="/resumes/new" />
              <Route element={<h1>已进入新简历编辑器</h1>} path="/resumes/:resumeId/edit" />
            </Routes>
          </AppDataProvider>
        </DiagnosticsProvider>
      </MemoryRouter>
    </I18nextProvider>
  )
}

/**
 * @brief 在测试中切换到第二个 Workspace / Switch to the second Workspace in a test.
 * @return 可观察的 Workspace 切换按钮 / Observable Workspace-switch button.
 */
function WorkspaceSwitchControl(): React.JSX.Element {
  /** @brief 当前应用 Workspace 会话 / Current application Workspace session. */
  const session = useWorkspaceSession()
  return (
    <button onClick={() => void session.selectWorkspace(SECOND_WORKSPACE_ID)} type="button">
      切换创建工作区
    </button>
  )
}

beforeEach(async (): Promise<void> => {
  await setAppLocale('zh-SG')
})

afterEach((): void => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ResumeCreationPage', (): void => {
  it('keeps locale-incompatible Templates visible and preserves safe preview semantics', async (): Promise<void> => {
    /** @brief 仅支持英文的可见 Template / Visible Template supporting only English. */
    const englishOnly = createTemplate('tpl_creation_english_only', 'English Editorial', ['en-US'])
    /** @brief 返回一个兼容项与一个不兼容项的目录 / Catalog returning one compatible and one incompatible item. */
    const catalog: ResumeTemplateCatalogPort = {
      getTemplate: vi.fn(),
      listTemplatePage: vi.fn(() =>
        Promise.resolve(terminalTemplatePage([MOCK_DAWN_TEMPLATE, englishOnly]))
      )
    }

    render(<ResumeCreationTestRoot gateways={createGateways({ catalog })} />)

    expect(await screen.findByRole('heading', { name: '新建简历' })).toBeInTheDocument()
    /** @brief 默认选择的兼容 Template radio / Compatible Template radio selected by default. */
    const compatible = await screen.findByRole('radio', { name: /Dawn/u })
    /** @brief 保持可见但不可选的不兼容 Template radio / Incompatible Template radio kept visible but unavailable. */
    const incompatible = screen.getByRole('radio', { name: /English Editorial/u })

    expect(compatible).toBeChecked()
    expect(incompatible).toBeDisabled()
    expect(screen.getByText(/此模板不支持.*zh-SG/u)).toBeInTheDocument()
    /** @brief 采用无 referrer 策略的真实预览图 / Real preview image using a no-referrer policy. */
    const preview = screen.getByRole('img', { name: 'Dawn 模板预览' })
    expect(preview).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(preview).toHaveAttribute('loading', 'lazy')
    expect(preview).toHaveAttribute('decoding', 'async')

    fireEvent.error(preview)
    expect(screen.getByText('暂无模板预览')).toBeInTheDocument()
  })

  it('aborts a stale Locale request and ignores its late page', async (): Promise<void> => {
    /** @brief 延迟返回的旧 Locale 页面 / Delayed page for the old Locale. */
    const stalePage = createDeferred<UiResumeTemplatePage>()
    /** @brief 每次目录读取收到的 signal / Signal received by each catalog read. */
    const signals: AbortSignal[] = []
    /** @brief 新 Locale 立即返回的 Template / Template returned immediately for the new Locale. */
    const currentTemplate = createTemplate('tpl_creation_current_locale', 'Current Locale', [
      'en-US'
    ])
    /** @brief 故意不响应 abort 的目录，用于验证页面仍丢弃迟到结果 / Catalog intentionally ignoring abort to verify that the page still discards a late result. */
    const listTemplatePage = vi.fn<ResumeTemplateCatalogPort['listTemplatePage']>((input) => {
      signals.push(input.signal)
      return signals.length === 1
        ? stalePage.promise
        : Promise.resolve(terminalTemplatePage([currentTemplate]))
    })
    /** @brief 可观察 Template 目录 / Observable Template catalog. */
    const catalog: ResumeTemplateCatalogPort = { getTemplate: vi.fn(), listTemplatePage }

    render(<ResumeCreationTestRoot gateways={createGateways({ catalog })} />)

    /** @brief 可在目录加载期间编辑的 Locale 字段 / Locale field editable while the catalog is loading. */
    const locale = await screen.findByRole('combobox', { name: '内容语言' })
    fireEvent.change(locale, { target: { value: 'en-US' } })

    expect(await screen.findByRole('radio', { name: /Current Locale/u })).toBeChecked()
    expect(signals[0]?.aborted).toBe(true)

    await act(async (): Promise<void> => {
      stalePage.resolve(terminalTemplatePage([MOCK_DAWN_TEMPLATE]))
      await stalePage.promise
    })

    expect(screen.getByRole('radio', { name: /Current Locale/u })).toBeChecked()
    expect(screen.queryByRole('radio', { name: /Dawn/u })).not.toBeInTheDocument()
  })

  it('stops a repeated cursor without issuing another continuation request', async (): Promise<void> => {
    /** @brief 循环分页使用的 cursor / Cursor used by the pagination loop. */
    const cursor = asUiResumeTemplateCursor('template_creation_loop_cursor')
    /** @brief 第二页 Template / Template on the second page. */
    const secondTemplate = createTemplate('tpl_creation_second_page', 'Second Page', ['zh-SG'])
    /** @brief 返回重复 cursor 的可观察目录 / Observable catalog returning a repeated cursor. */
    const listTemplatePage = vi
      .fn<ResumeTemplateCatalogPort['listTemplatePage']>()
      .mockResolvedValueOnce({ hasMore: true, items: [MOCK_DAWN_TEMPLATE], nextCursor: cursor })
      .mockResolvedValueOnce({ hasMore: true, items: [secondTemplate], nextCursor: cursor })
    /** @brief 循环目录端口 / Looping catalog port. */
    const catalog: ResumeTemplateCatalogPort = { getTemplate: vi.fn(), listTemplatePage }

    render(<ResumeCreationTestRoot gateways={createGateways({ catalog })} />)

    fireEvent.click(await screen.findByRole('button', { name: '加载更多模板' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('模板目录分页未能继续')
    expect(screen.getByRole('radio', { name: /Second Page/u })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '加载更多模板' })).not.toBeInTheDocument()
    expect(listTemplatePage).toHaveBeenCalledTimes(2)
  })

  it('reuses one command ID for unchanged retries and renews it only after a field change', async (): Promise<void> => {
    /** @brief 提供精确 Template 与最终创建结果的内存 adapter / In-memory adapter providing exact Templates and the final creation result. */
    const resume = new InMemoryResumeGateway()
    /** @brief 每次创建收到的命令 / Commands received by each creation attempt. */
    const commands: Parameters<ResumeCreationPort['createResume']>[0][] = []
    /** @brief 可识别为结果未知的首个失败 / First failure recognizable as an unknown outcome. */
    const unknownOutcome = new Error('private write failure')
    unknownOutcome.name = 'ApiV2WriteOutcomeUnknownError'
    /** @brief 可观察的创建函数 / Observable creation function. */
    const createResume = vi.fn<ResumeCreationPort['createResume']>(
      async (command): Promise<UiCreatedResume> => {
        commands.push(command)
        if (commands.length === 1) throw unknownOutcome
        if (commands.length === 2) throw new TypeError('private network failure')
        return resume.createResume(command)
      }
    )
    /** @brief 前两次失败、第三次成功的创建端口 / Creation port failing twice and succeeding on the third attempt. */
    const creation: ResumeCreationPort = {
      createResume
    }

    render(<ResumeCreationTestRoot gateways={createGateways({ catalog: resume, creation })} />)

    /** @brief 用户可编辑的标题字段 / User-editable title field. */
    const title = await screen.findByRole('textbox', { name: '简历标题' })
    expect(await screen.findByRole('radio', { name: /Dawn/u })).toBeChecked()
    fireEvent.change(title, { target: { value: '第一版标题' } })
    fireEvent.click(screen.getByRole('button', { name: '创建并开始编辑' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('创建结果尚未确认')
    fireEvent.click(screen.getByRole('button', { name: '重试创建' }))
    await waitFor((): void => expect(commands).toHaveLength(2))
    expect(commands[1]?.creationAttemptId).toBe(commands[0]?.creationAttemptId)
    await screen.findByRole('button', { name: '重试创建' })

    fireEvent.change(title, { target: { value: '字段变化后的标题' } })
    fireEvent.click(screen.getByRole('button', { name: '创建并开始编辑' }))

    expect(await screen.findByRole('heading', { name: '已进入新简历编辑器' })).toBeInTheDocument()
    expect(commands).toHaveLength(3)
    expect(commands[2]?.creationAttemptId).not.toBe(commands[1]?.creationAttemptId)
    expect(commands[2]?.title).toBe('字段变化后的标题')
  })

  it('aborts an in-flight creation when the Workspace selection changes', async (): Promise<void> => {
    /** @brief 默认 WorkspaceAccess / Default WorkspaceAccess. */
    const defaultAccess = DEMO_WORKSPACE_ACCESSES[0]
    if (defaultAccess === undefined) throw new Error('Expected a default WorkspaceAccess fixture.')
    /** @brief 第二个 WorkspaceAccess / Second WorkspaceAccess. */
    const secondAccess: UiWorkspaceAccess = {
      ...defaultAccess,
      memberId: asUiOpaqueId<'workspace-member'>('member_resume_creation_second'),
      workspace: {
        ...defaultAccess.workspace,
        id: SECOND_WORKSPACE_ID,
        name: '第二创建工作区',
        slug: asUiWorkspaceSlug('resume-creation-second')
      }
    }
    /** @brief 同时返回两个 Workspace 的访问端口 / Access port returning both Workspaces. */
    const workspace = new InMemoryWorkspaceGateway()
    vi.spyOn(workspace, 'listWorkspaceAccessPage').mockResolvedValue({
      hasMore: false,
      items: [defaultAccess, secondAccess],
      nextCursor: null
    })
    /** @brief 创建命令接收的取消信号 / Cancellation signal received by the creation command. */
    let creationSignal: AbortSignal | undefined
    /** @brief 可观察且仅在 abort 时结束的创建函数 / Observable creation function settling only on abort. */
    const createResume = vi.fn<ResumeCreationPort['createResume']>(
      (command): Promise<UiCreatedResume> => {
        creationSignal = command.signal
        return new Promise<UiCreatedResume>((_resolve, reject): void => {
          command.signal.addEventListener(
            'abort',
            (): void => reject(new DOMException('Workspace changed.', 'AbortError')),
            { once: true }
          )
        })
      }
    )
    /** @brief 永不主动结束、只用于观察取消的创建端口 / Creation port that never settles by itself and only exposes cancellation. */
    const creation: ResumeCreationPort = {
      createResume
    }

    render(
      <ResumeCreationTestRoot
        gateways={createGateways({ catalog: new InMemoryResumeGateway(), creation, workspace })}
      >
        <WorkspaceSwitchControl />
      </ResumeCreationTestRoot>
    )

    fireEvent.change(await screen.findByRole('textbox', { name: '简历标题' }), {
      target: { value: '等待中的创建' }
    })
    fireEvent.click(screen.getByRole('button', { name: '创建并开始编辑' }))
    await waitFor((): void => expect(creationSignal).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: '切换创建工作区' }))

    await waitFor((): void => expect(creationSignal?.aborted).toBe(true))
    expect((await screen.findAllByText('第二创建工作区')).length).toBeGreaterThan(0)
    expect(await screen.findByRole('textbox', { name: '简历标题' })).toHaveValue('')
  })
})
