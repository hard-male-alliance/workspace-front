import { describe, expect, it } from 'vitest'

import type { UiResumeProposalAuthority } from '../domain/review'
import {
  initialResumeAssistantCommandState,
  resumeAssistantTransition
} from './resume-assistant-machine'

/** @brief 只用于验证状态机保持同一 Proposal 权威对象 / Proposal authority identity used only by state-machine tests. */
const AUTHORITY = Object.freeze({}) as UiResumeProposalAuthority

describe('resume assistant command state machine', () => {
  it('moves a submitted command into an explicit proposal wait state', () => {
    const ready = resumeAssistantTransition(initialResumeAssistantCommandState, {
      type: 'hydration-succeeded',
      pendingProposal: null,
      recoveryProblemCode: null
    })
    const creating = resumeAssistantTransition(ready, { type: 'command-submitted' })
    const running = resumeAssistantTransition(creating, { type: 'run-started' })
    const waiting = resumeAssistantTransition(running, {
      type: 'proposal-received',
      authority: AUTHORITY
    })

    expect(creating).toEqual({ status: 'creating-run' })
    expect(running).toEqual({ status: 'running' })
    expect(waiting).toEqual({ status: 'awaiting-proposal', authority: AUTHORITY })
  })

  it('keeps an accepted decision committed through continuation success', () => {
    const waiting = {
      status: 'awaiting-proposal' as const,
      authority: AUTHORITY
    }
    const committing = resumeAssistantTransition(waiting, {
      type: 'decision-started',
      decision: 'accept-all'
    })
    const continuing = resumeAssistantTransition(committing, {
      type: 'decision-committed'
    })
    const succeeded = resumeAssistantTransition(continuing, {
      type: 'continuation-succeeded'
    })

    expect(committing).toEqual({
      status: 'committing-decision',
      authority: AUTHORITY,
      decision: 'accept-all'
    })
    expect(continuing).toEqual({
      status: 'continuation-running',
      decision: 'accept-all'
    })
    expect(succeeded).toEqual({ status: 'succeeded' })
  })

  it('distinguishes request failure from a failed committed continuation', () => {
    const requestFailure = resumeAssistantTransition(
      { status: 'running' },
      {
        type: 'command-failed',
        problemCode: 'agent.provider_failed',
        retryable: true
      }
    )
    const continuationFailure = resumeAssistantTransition(
      { status: 'continuation-running', decision: 'accept-all' },
      {
        type: 'continuation-failed',
        problemCode: 'agent.preflight_state_invalid',
        retryable: false
      }
    )

    expect(requestFailure).toEqual({
      status: 'retryable-error',
      phase: 'request',
      problemCode: 'agent.provider_failed',
      decisionCommitted: false
    })
    expect(continuationFailure).toEqual({
      status: 'terminal-error',
      phase: 'continuation',
      problemCode: 'agent.preflight_state_invalid',
      decisionCommitted: true,
      decision: 'accept-all'
    })
  })

  it('hydrates an existing proposal or terminal recovery independently', () => {
    expect(
      resumeAssistantTransition(initialResumeAssistantCommandState, {
        type: 'hydration-succeeded',
        pendingProposal: AUTHORITY,
        recoveryProblemCode: null
      })
    ).toEqual({ status: 'awaiting-proposal', authority: AUTHORITY })
    expect(
      resumeAssistantTransition(initialResumeAssistantCommandState, {
        type: 'hydration-succeeded',
        pendingProposal: null,
        recoveryProblemCode: 'agent.preflight_state_invalid'
      })
    ).toEqual({
      status: 'terminal-error',
      phase: 'request',
      problemCode: 'agent.preflight_state_invalid',
      decisionCommitted: false
    })
  })
})
