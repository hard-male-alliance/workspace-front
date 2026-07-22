import { describe, expect, it } from 'vitest'
import { createDiagnostics } from '@ai-job-workspace/app/diagnostics'
import {
  HttpInterviewGateway,
  HttpKnowledgeGateway,
  HttpResumeGateway,
  HttpWorkspaceGateway
} from '@ai-job-workspace/app/http'

import { createProductGateways } from './index'

describe('createProductGateways', (): void => {
  it('为全部限界上下文组合正式 HTTP 边界', (): void => {
    /** @brief 无输出的产品组合诊断端口 / No-output diagnostics port for product composition. */
    const diagnostics = createDiagnostics({ sinks: [] })
    /** @brief 待验证的共享产品组合 / Shared product composition under test. */
    const gateways = createProductGateways('https://api.example.test', diagnostics, {
      locale: 'zh-CN',
      platform: 'web'
    })

    expect(gateways.resume).toBeInstanceOf(HttpResumeGateway)
    expect(gateways.knowledge).toBeInstanceOf(HttpKnowledgeGateway)
    expect(gateways.workspace).toBeInstanceOf(HttpWorkspaceGateway)
    expect(gateways.interview).toBeInstanceOf(HttpInterviewGateway)
  })
})
