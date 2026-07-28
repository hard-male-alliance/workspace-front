# Resume Assistant Recovery State Machine Design

## Goal

Make accepted Resume proposals, follow-up Agent runs, conversation hydration, and authoritative PDF recovery converge to truthful UI states across network failures and refreshes.

## Constraints

- Preserve the phase-one authoritative real-PDF policy.
- Keep real XeLaTeX; do not introduce Mock success paths.
- Keep React Context/Hook and existing Gateway boundaries; add no state-management dependency.
- Never weaken ETag, revision, proposal, operation, or Workspace validation.
- Do not infer a PDF from Resume revision alone.
- Do not expose prompts, user text, tokens, credentials, or raw provider payloads in diagnostics.

## Architecture

The frontend uses two orthogonal state machines:

1. `thread`: `loading | ready | error`, responsible only for Conversation messages.
2. `command`: `idle | creating-run | running | awaiting-proposal | committing-decision |
   continuation-running | succeeded | retryable-error | terminal-error`, responsible for one exact
   Run and its Proposal continuation.

An accepted Proposal is an irreversible authority transition. Once the decision response returns a
new authoritative Resume, later continuation failure may not restore the Proposal or claim the
Resume was unchanged.

Refresh hydrates messages independently from command recovery. An exact recovery envelope binds
`workspaceId`, `resumeId`, `runId`, and phase. PDF recovery similarly requires an exact render Job
identifier; revision-only matches remain explicit user-selectable candidates.

The backend classifies worker failures before outbox retry. Transient infrastructure/provider
failures remain retryable. Deterministic domain, binding, and persistence-invariant failures close
the Run/Job once with a stable public Problem and safe diagnostic stage.

## Data Flow

```text
page load
  -> load Conversation messages
  -> independently recover exact Agent command
  -> independently recover exact PDF render command

accept Proposal
  -> commit decision
  -> publish authoritative Resume revision
  -> persist continuation-running recovery envelope
  -> wait for terminal Run
  -> show succeeded or "Resume updated; follow-up failed"
```

## Error Semantics

- A failed new Run says that exact request did not modify the Resume.
- A failed continuation after a committed decision says the Resume was updated but the follow-up
  response failed.
- A deterministic worker invariant is non-retryable and terminal.
- The local proxy returns a CORS-readable `application/problem+json` 502 with a request identifier
  and logs only a safe upstream error code.

## Verification

- Backend persistence test: Proposal wait -> accept -> continuation -> reload Run -> execute next Run.
- Backend retry test: deterministic preflight invariant attempts once and closes Run/Job.
- Frontend reducer tests cover every accepted-decision and refresh transition.
- Frontend integration tests prove messages remain visible when Run recovery fails.
- PDF tests prove exact Job recovery and preserve revision-only ambiguity.

