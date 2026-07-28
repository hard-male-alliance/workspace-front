/** @brief 稳定 Agent 错误码对应的简历助手提示 / Resume-assistant messages for stable Agent error codes. */
const RESUME_ASSISTANT_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  'agent.execution_timeout':
    '简历助手在 5 分钟内未完成本次处理，后端已达到执行安全上限并终止任务。可能是模型响应或工具执行耗时较长，请稍后重试。当前简历没有被修改。',
  'agent.provider_timeout': '模型服务响应超时，请稍后重试。当前简历没有被修改。',
  'agent.turn_budget_exhausted':
    '简历助手在多轮处理后仍未完成本次请求。请重试；如果问题持续发生，系统将通过运行记录定位具体环节。当前简历没有被修改。',
  'agent.tool_call_budget_exhausted':
    '简历助手调用简历读取或编辑工具的次数超过了后端安全上限，任务已终止。请重试；如果问题持续发生，系统将通过运行记录定位具体环节。当前简历没有被修改。',
  'agent.total_tool_call_budget_exhausted':
    '简历助手的知识检索和简历处理总调用次数超过了后端安全上限，任务已终止。请重试；如果问题持续发生，系统将通过运行记录定位具体环节。当前简历没有被修改。',
  'agent.tool_recovery_exhausted':
    '简历助手连续生成了无法执行的编辑操作，后端已停止无效重试。该问题不表示你的要求不安全，请重试或联系管理员检查本次运行记录。当前简历没有被修改。',
  'agent.provider_rate_limited': '模型服务当前请求较多，请稍后重试。当前简历没有被修改。',
  'agent.provider_unavailable': '模型服务暂时无法连接，请稍后重试。当前简历没有被修改。',
  'agent.knowledge_retrieval_failed':
    '知识库检索服务暂时不可用，简历助手未能读取已授权资料。请稍后重试；若问题持续，请联系管理员检查知识库索引和模型服务。当前简历没有被修改。',
  'agent.provider_protocol_error':
    '模型返回的工具调用内容不符合执行协议，请重试；如果问题持续，请联系管理员检查模型服务。当前简历没有被修改。',
  'agent.provider_refused': '模型无法处理本次请求，请调整描述后重试。当前简历没有被修改。',
  'agent.tool_timeout': '简历工具执行超时，请稍后重试。当前简历没有被修改。'
}

/**
 * @brief 将稳定错误码转换成可操作的用户提示 / Convert stable error codes into actionable user messages.
 * @param error 网关或运行时错误 / Gateway or runtime error.
 * @return 不泄露内部敏感细节的中文提示 / A Chinese message without sensitive internals.
 */
export function resumeAssistantFailureMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return (
    RESUME_ASSISTANT_FAILURE_MESSAGES[code] ?? '简历助手请求失败，请稍后重试。当前简历没有被修改。'
  )
}
