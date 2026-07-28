/** @file 简历助手命令状态机 / Resume-assistant command state machine. */

import type { UiResumeProposalAuthority } from '../domain/review'

/** @brief Proposal 决策种类 / Proposal decision kind. */
export type ResumeAssistantDecision = 'accept-all' | 'reject'

/** @brief 一次助手命令的互斥状态 / Mutually exclusive state of one assistant command. */
export type ResumeAssistantCommandState =
  | { readonly status: 'loading' }
  | { readonly status: 'idle' }
  | { readonly status: 'creating-run' }
  | { readonly status: 'running' }
  | {
      readonly status: 'awaiting-proposal'
      readonly authority: UiResumeProposalAuthority
    }
  | {
      readonly status: 'committing-decision'
      readonly authority: UiResumeProposalAuthority
      readonly decision: ResumeAssistantDecision
    }
  | {
      readonly status: 'continuation-running'
      readonly decision: ResumeAssistantDecision
    }
  | { readonly status: 'succeeded' }
  | {
      readonly status: 'retryable-error' | 'terminal-error'
      readonly phase: 'request' | 'continuation'
      readonly problemCode: string
      readonly decisionCommitted: boolean
      /** @brief 续答失败前已经提交的决策；请求阶段错误没有该字段 / Decision committed before a continuation failure; absent for request failures. */
      readonly decision?: ResumeAssistantDecision
    }

/** @brief 驱动简历助手命令状态变化的事实事件 / Fact events driving Resume-assistant command transitions. */
export type ResumeAssistantCommandEvent =
  | {
      readonly type: 'hydration-succeeded'
      readonly pendingProposal: UiResumeProposalAuthority | null
      readonly recoveryProblemCode: string | null
    }
  | { readonly type: 'command-submitted' }
  | { readonly type: 'run-started' }
  | {
      readonly type: 'proposal-received'
      readonly authority: UiResumeProposalAuthority
    }
  | {
      readonly type: 'command-succeeded'
    }
  | {
      readonly type: 'command-failed'
      readonly problemCode: string
      readonly retryable: boolean
    }
  | {
      readonly type: 'decision-started'
      readonly decision: ResumeAssistantDecision
    }
  | { readonly type: 'decision-committed' }
  | { readonly type: 'continuation-succeeded' }
  | {
      readonly type: 'continuation-failed'
      readonly problemCode: string
      readonly retryable: boolean
    }

/** @brief 首次会话恢复前的命令状态 / Command state before initial conversation recovery. */
export const initialResumeAssistantCommandState: ResumeAssistantCommandState = {
  status: 'loading'
}

/**
 * @brief 以服务端事实推进简历助手命令 / Advance a Resume-assistant command from server facts.
 * @param state 当前互斥状态 / Current mutually exclusive state.
 * @param event 已确认发生的事实 / Confirmed fact event.
 * @return 新状态；非法的过期事件保持原状态 / New state; stale invalid events preserve the current state.
 */
export function resumeAssistantTransition(
  state: ResumeAssistantCommandState,
  event: ResumeAssistantCommandEvent
): ResumeAssistantCommandState {
  switch (event.type) {
    case 'hydration-succeeded':
      if (event.pendingProposal !== null) {
        return { status: 'awaiting-proposal', authority: event.pendingProposal }
      }
      if (event.recoveryProblemCode !== null) {
        return {
          status: 'terminal-error',
          phase: 'request',
          problemCode: event.recoveryProblemCode,
          decisionCommitted: false
        }
      }
      return { status: 'idle' }
    case 'command-submitted':
      return { status: 'creating-run' }
    case 'run-started':
      return state.status === 'creating-run' ? { status: 'running' } : state
    case 'proposal-received':
      return { status: 'awaiting-proposal', authority: event.authority }
    case 'command-succeeded':
      return { status: 'succeeded' }
    case 'command-failed':
      return {
        status: event.retryable ? 'retryable-error' : 'terminal-error',
        phase: 'request',
        problemCode: event.problemCode,
        decisionCommitted: false
      }
    case 'decision-started':
      return state.status === 'awaiting-proposal'
        ? {
            status: 'committing-decision',
            authority: state.authority,
            decision: event.decision
          }
        : state
    case 'decision-committed':
      return state.status === 'committing-decision'
        ? {
            status: 'continuation-running',
            decision: state.decision
          }
        : state
    case 'continuation-succeeded':
      return state.status === 'continuation-running' ? { status: 'succeeded' } : state
    case 'continuation-failed':
      return state.status === 'continuation-running'
        ? {
            status: event.retryable ? 'retryable-error' : 'terminal-error',
            phase: 'continuation',
            problemCode: event.problemCode,
            decisionCommitted: true,
            decision: state.decision
          }
        : state
  }
}
