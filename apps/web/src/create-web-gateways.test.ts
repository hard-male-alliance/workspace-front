import { describe, expect, it } from 'vitest'
import {
  createDiagnostics,
  HttpKnowledgeGateway,
  HttpResumeGateway,
  MockInterviewGateway,
  MockWorkspaceGateway
} from '@ai-job-workspace/app'

import { createWebGateways } from './create-web-gateways'

describe('createWebGateways', (): void => {
  it('composes HTTP Resume and Knowledge with Mock Workspace and Interview', (): void => {
    const gateways = createWebGateways('http://127.0.0.1:8000', createDiagnostics({ sinks: [] }))

    expect(gateways.workspace).toBeInstanceOf(MockWorkspaceGateway)
    expect(gateways.resume).toBeInstanceOf(HttpResumeGateway)
    expect(gateways.interview).toBeInstanceOf(MockInterviewGateway)
    expect(gateways.knowledge).toBeInstanceOf(HttpKnowledgeGateway)
  })
})
