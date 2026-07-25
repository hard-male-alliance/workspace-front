/** @file Resume 文档纯展示选择器测试 / Pure Resume-document presentation-selector tests. */

import { describe, expect, it } from 'vitest'

import { asUiResumePartialDate } from '../domain/document'
import { selectResumeDateLabel, selectResumePlainText } from './resume-document-selectors'

describe('Resume document presentation selectors', (): void => {
  it('仅选择富文本正文且不发明缺失内容', (): void => {
    expect(
      selectResumePlainText({
        marks: [{ end: 5, kind: 'strong', start: 0 }],
        text: 'Klee works'
      })
    ).toBe('Klee works')
    expect(selectResumePlainText(null)).toBe('')
  })

  it('在展示边界本地化 present 并保留 partial-date 精度', (): void => {
    expect(
      selectResumeDateLabel({ end: 'present', start: asUiResumePartialDate('2024-02') }, '至今')
    ).toBe('2024-02 — 至今')
    expect(selectResumeDateLabel({ end: asUiResumePartialDate('2026'), start: null }, '至今')).toBe(
      '2026'
    )
    expect(selectResumeDateLabel({ end: null, start: null }, '至今')).toBeNull()
  })
})
