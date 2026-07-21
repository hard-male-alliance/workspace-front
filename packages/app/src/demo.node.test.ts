/** @file 本地演示 adapter 公开入口测试 / Local-demo adapter public-entry tests. */

import { describe, expect, it } from 'vitest'

import * as demoAdapters from './demo'

describe('@ai-job-workspace/app/demo', () => {
  it('只公开正式本地演示 adapter，不泄漏测试 fixture', () => {
    /** @brief facade 的运行时导出名称 / Runtime export names from the facade. */
    const exportNames = Object.keys(demoAdapters).sort()

    expect(exportNames).toEqual(['DemoInterviewGateway', 'DemoWorkspaceGateway'])
  })
})
