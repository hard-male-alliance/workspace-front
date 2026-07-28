import { describe, expect, it } from 'vitest'

import { resumeAssistantFailureMessage } from './resume-assistant-failure'

/** @brief 简历助手稳定错误提示映射 / Stable Resume-assistant failure-message mapping. */
describe('resumeAssistantFailureMessage', (): void => {
  it('explains that the backend five-minute safety deadline ended the run', (): void => {
    const message = resumeAssistantFailureMessage(new Error('agent.execution_timeout'))

    expect(message).toContain('5 分钟')
    expect(message).toContain('后端已达到执行安全上限')
    expect(message).not.toContain('缩小修改范围')
  })

  it('keeps turn exhaustion separate from execution timeout', (): void => {
    const message = resumeAssistantFailureMessage(new Error('agent.turn_budget_exhausted'))

    expect(message).toContain('多轮处理')
    expect(message).not.toContain('步骤过多')
    expect(message).not.toContain('拆分要求')
  })

  it('explains repeated invalid tool recovery without blaming user input', (): void => {
    const message = resumeAssistantFailureMessage(new Error('agent.tool_recovery_exhausted'))

    expect(message).toContain('无法执行的编辑操作')
    expect(message).toContain('不表示你的要求不安全')
  })

  it('separates the tool-call safety cap from model-turn exhaustion', (): void => {
    const message = resumeAssistantFailureMessage(new Error('agent.tool_call_budget_exhausted'))

    expect(message).toContain('编辑工具的次数')
    expect(message).toContain('后端安全上限')
  })

  it('describes protocol failures without claiming the user content is unsafe', (): void => {
    const message = resumeAssistantFailureMessage(new Error('agent.provider_protocol_error'))

    expect(message).toContain('工具调用内容不符合执行协议')
    expect(message).not.toContain('无法安全执行')
    expect(message).not.toContain('调整描述')
  })
})
