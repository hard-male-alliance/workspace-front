import { describe, expect, it } from 'vitest'

import { asUiConcurrencyToken } from '../../../shared-kernel/concurrency'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { ConfirmedCommandConflictError } from '../../../shared-kernel/application-error'
import type { UiResumeEditorModel } from '../domain/document'
import {
  getResumeBatchConflict,
  getResumeCommandRetryAfterMilliseconds,
  getResumeConflictStatus,
  getResumeIdempotencyConflict,
  isResumeCommandDefinitivelyRejected,
  isResumeContractWriteOutcomeUnknown,
  ResumeBatchConflictError
} from './errors'

/** @brief 不跨越 application 边界的最小 Resume 权威 fixture / Minimal Resume authority fixture that does not cross the application boundary. */
const TEST_RESUME_AUTHORITY: UiResumeEditorModel = {
  concurrencyToken: asUiConcurrencyToken('"resume-conflict-etag-18"'),
  resume: {
    createdAt: '2026-07-18T00:00:00.000Z',
    id: asUiOpaqueId<'resume'>('res_conflict_test'),
    knowledgeSourceId: null,
    locale: 'zh-SG',
    profile: {
      contacts: [],
      fullName: 'Klee Chen',
      headline: null,
      summary: null
    },
    revision: 18,
    sections: [
      {
        content: { marks: [], text: '权威内容' },
        id: asUiOpaqueId<'resume-section'>('sec_conflict_test'),
        items: [],
        kind: 'custom',
        title: '摘要',
        visible: true
      }
    ],
    styleIntent: {
      bulletStyleToken: 'disc',
      dateFormatToken: 'yyyy_mm',
      density: 0.7,
      extensions: {},
      page: {
        customHeight: null,
        customWidth: null,
        margins: {
          bottom: { unit: 'mm', value: 16 },
          left: { unit: 'mm', value: 16 },
          right: { unit: 'mm', value: 16 },
          top: { unit: 'mm', value: 16 }
        },
        maxPages: 2,
        orientation: 'portrait',
        showPageNumbers: false,
        size: 'A4'
      },
      palette: {
        background: { space: 'srgb_hex', value: '#FFFFFF' },
        mutedText: { space: 'srgb_hex', value: '#666666' },
        primary: { space: 'srgb_hex', value: '#111111' },
        secondary: { space: 'srgb_hex', value: '#333333' },
        text: { space: 'srgb_hex', value: '#111111' }
      },
      sectionLayout: [],
      styleContractVersion: '1.0',
      templateSettings: {},
      typography: {
        baseSizePt: 10,
        fontFamilyToken: 'sans_clean',
        headingScale: 1.4,
        letterSpacingEm: 0,
        lineHeight: 1.3
      }
    },
    template: {
      templateId: asUiOpaqueId<'template'>('tpl_conflict_test'),
      templateVersion: '1.0.0'
    },
    title: '冲突恢复测试',
    updatedAt: '2026-07-18T00:01:00.000Z',
    workspaceId: asUiOpaqueId<'workspace'>('ws_conflict_test')
  }
}

describe('getResumeBatchConflict', (): void => {
  it('extracts an independently cloned authority only from a trusted conflict instance', (): void => {
    /** @brief 与冲突结果原子配对的测试权威 / Test authority atomically paired with the conflict result. */
    const authority = {
      ...structuredClone(TEST_RESUME_AUTHORITY),
      concurrencyToken: asUiConcurrencyToken('"resume-conflict-etag-19"')
    }
    /** @brief 已由应用 ACL 创建的可信冲突 / Trusted conflict created by the application ACL. */
    const error = new ResumeBatchConflictError(authority, [
      {
        code: 'resume.field_conflict',
        entityId: authority.resume.sections[0]?.id ?? null,
        fieldPath: ['content'],
        operationId: 'operation_conflict_content_0001'
      }
    ])

    /** @brief UI 可直接吸收的恢复事实 / Recovery facts directly adoptable by the UI. */
    const recovery = getResumeBatchConflict(error)

    expect(error).toBeInstanceOf(ConfirmedCommandConflictError)
    expect(recovery).toEqual({
      authoritativeEditor: authority,
      conflicts: error.conflicts
    })
    expect(recovery?.authoritativeEditor).not.toBe(error.authoritativeEditor)
    expect(recovery?.authoritativeEditor.resume).not.toBe(error.authoritativeEditor.resume)
    expect(recovery?.conflicts).not.toBe(error.conflicts)
  })

  it('rejects an object that only spoofs the public error name', (): void => {
    expect(
      getResumeBatchConflict({
        authoritativeEditor: TEST_RESUME_AUTHORITY,
        conflicts: [],
        name: 'ResumeBatchConflictError'
      })
    ).toBeNull()
  })
})

describe('Resume API v2 Problem classification', (): void => {
  it.each([409, 412] as const)(
    'reads a production ApiV2ProblemError problem.status=%i as an authority conflict',
    (status): void => {
      expect(
        getResumeConflictStatus({
          name: 'ApiV2ProblemError',
          problem: { code: 'resume.revision_conflict', status }
        })
      ).toBe(status)
    }
  )

  it.each([
    ['idempotency.in_progress', 'in-progress'],
    ['idempotency.key_reused', 'key-reused']
  ] as const)('keeps %s separate from Resume revision recovery', (code, expected): void => {
    /** @brief API v2 transport 已验证的幂等 Problem 投影 / Idempotency Problem projection validated by the API v2 transport. */
    const error = { name: 'ApiV2ProblemError', problem: { code, status: 409 } }

    expect(getResumeConflictStatus(error)).toBeNull()
    expect(getResumeIdempotencyConflict(error)).toBe(expected)
  })

  it('distinguishes a terminal 2xx contract failure from retryable unknown transports', (): void => {
    expect(
      isResumeContractWriteOutcomeUnknown({
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        status: 200
      })
    ).toBe(true)
    expect(
      isResumeContractWriteOutcomeUnknown({
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        status: 409
      })
    ).toBe(false)
    expect(
      isResumeContractWriteOutcomeUnknown({
        kind: 'network',
        name: 'ApiV2WriteOutcomeUnknownError',
        status: null
      })
    ).toBe(false)
  })

  it('separates definitive 4xx command rejection from in-progress and 5xx responses', (): void => {
    expect(
      isResumeCommandDefinitivelyRejected({
        name: 'ApiV2ProblemError',
        problem: { code: 'resume.invalid_operation', retryable: false, status: 422 }
      })
    ).toBe(true)
    expect(
      isResumeCommandDefinitivelyRejected({
        name: 'ApiV2ProblemError',
        problem: { code: 'idempotency.key_reused', retryable: false, status: 409 }
      })
    ).toBe(true)
    expect(
      isResumeCommandDefinitivelyRejected({
        name: 'ApiV2ProblemError',
        problem: { code: 'idempotency.in_progress', retryable: false, status: 409 }
      })
    ).toBe(false)
    expect(
      isResumeCommandDefinitivelyRejected({
        name: 'ApiV2ProblemError',
        problem: { code: 'rate_limit.exceeded', retryable: true, status: 429 }
      })
    ).toBe(true)
    expect(
      isResumeCommandDefinitivelyRejected({
        name: 'ApiV2ProblemError',
        problem: { code: 'service.unavailable', retryable: false, status: 503 }
      })
    ).toBe(false)
  })

  it('reads only a validated non-negative finite Retry-After projection', (): void => {
    expect(
      getResumeCommandRetryAfterMilliseconds({
        name: 'ApiV2ProblemError',
        retryAfterMilliseconds: 750
      })
    ).toBe(750)
    expect(
      getResumeCommandRetryAfterMilliseconds({
        name: 'ApiV2ProblemError',
        retryAfterMilliseconds: null
      })
    ).toBeNull()
    expect(
      getResumeCommandRetryAfterMilliseconds({
        name: 'ApiV2ProblemError',
        retryAfterMilliseconds: -1
      })
    ).toBeNull()
    expect(
      getResumeCommandRetryAfterMilliseconds({
        name: 'ApiV2ProblemError',
        retryAfterMilliseconds: Number.POSITIVE_INFINITY
      })
    ).toBeNull()
    expect(getResumeCommandRetryAfterMilliseconds({ retryAfterMilliseconds: 10 })).toBeNull()
  })

  it('never mistakes an unknown malformed 409 response for a definitive authority conflict', (): void => {
    expect(
      getResumeConflictStatus({
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        status: 409
      })
    ).toBeNull()
  })
})
