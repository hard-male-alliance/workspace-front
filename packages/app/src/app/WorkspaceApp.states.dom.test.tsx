import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 页面状态视觉验收测试 / Page-state visual acceptance tests. */
describe('WorkspaceApp visual states', (): void => {
  it('makes empty, loading and error states available for visual acceptance', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/states" />)

    expect(await screen.findByText('仅供开发与验收')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '从一个小动作开始' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
