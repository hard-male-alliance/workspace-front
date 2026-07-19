import { describe, expect, it } from 'vitest'
import {
  HttpKnowledgeGateway,
  HttpResumeGateway,
  MockInterviewGateway,
  MockWorkspaceGateway
} from '@ai-job-workspace/app'

import { WebConfigurationError, createWebGateways } from './create-web-gateways'

describe('createWebGateways', (): void => {
  it('fails fast when VITE_API_BASE_URL is missing', (): void => {
    expect(() => createWebGateways(undefined)).toThrowError(WebConfigurationError)
  })

  it('composes HTTP Resume and Knowledge with Mock Workspace and Interview', (): void => {
    const gateways = createWebGateways('http://127.0.0.1:8000')

    expect(gateways.workspace).toBeInstanceOf(MockWorkspaceGateway)
    expect(gateways.resume).toBeInstanceOf(HttpResumeGateway)
    expect(gateways.interview).toBeInstanceOf(MockInterviewGateway)
    expect(gateways.knowledge).toBeInstanceOf(HttpKnowledgeGateway)
  })

  it('rejects a base URL containing a path or credentials', (): void => {
    expect(() => createWebGateways('https://user:secret@example.test/backend')).toThrowError(
      WebConfigurationError
    )
  })
})
