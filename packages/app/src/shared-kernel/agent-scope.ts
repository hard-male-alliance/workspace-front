/** @file 跨上下文 Agent 作用域 / Cross-context agent scopes. */

/** @brief Agent 作用域标识符 / Agent scope identifier. */
export type UiAgentScope =
  | 'resume_assistant'
  | 'job_fit_analyst'
  | 'interview_agent'
  | 'interview_reporter'
  | 'general_chat'
  | 'portfolio_assistant'
