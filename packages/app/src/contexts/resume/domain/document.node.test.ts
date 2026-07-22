/** @file Resume 文档值对象测试 / Resume document value-object tests. */

import { describe, expect, it } from 'vitest'

import {
  asUiResumePartialDate,
  getUiResumeSectionTextViolation,
  replaceUiResumeRichTextText
} from './document'

describe('asUiResumePartialDate', (): void => {
  it('保留合法 partial date 的原始精度', (): void => {
    expect(asUiResumePartialDate('2026')).toBe('2026')
    expect(asUiResumePartialDate('2026-07')).toBe('2026-07')
    expect(asUiResumePartialDate('2024-02-29')).toBe('2024-02-29')
  })

  it.each(['0000', '2026-00', '2026-13', '2025-02-29', '2026-04-31', 'present'])(
    '拒绝非真实起止日期 %s',
    (value): void => {
      expect(() => asUiResumePartialDate(value)).toThrow(TypeError)
    }
  )
})

describe('replaceUiResumeRichTextText', (): void => {
  it('使用 Unicode code-point offset 跨越 emoji 平移未变 mark', (): void => {
    expect(
      replaceUiResumeRichTextText(
        {
          marks: [{ end: 7, href: 'https://example.com', kind: 'link', start: 6 }],
          text: 'Hello 🌍'
        },
        'Bright Hello 🌍'
      )
    ).toEqual({
      marks: [{ end: 14, href: 'https://example.com', kind: 'link', start: 13 }],
      text: 'Bright Hello 🌍'
    })
  })

  it('替换文本时移除被触及格式并仅平移确定未受影响的 mark', (): void => {
    expect(
      replaceUiResumeRichTextText(
        {
          marks: [
            { end: 6, kind: 'strong', start: 0 },
            { end: 15, kind: 'emphasis', start: 7 }
          ],
          text: 'Senior Engineer'
        },
        'Lead Engineer'
      )
    ).toEqual({
      marks: [{ end: 13, kind: 'emphasis', start: 5 }],
      text: 'Lead Engineer'
    })
  })

  it('整段替换不会把旧 link 关联发明给无关新文本', (): void => {
    expect(
      replaceUiResumeRichTextText(
        {
          marks: [{ end: 5, href: 'https://example.com/old', kind: 'link', start: 0 }],
          text: 'Klee!'
        },
        'Alice'
      )
    ).toEqual({ marks: [], text: 'Alice' })
  })

  it('不会把合法上限的嵌套 marks 拆分到 Schema 上限之外', (): void => {
    /** @brief 契约允许的 1000 个同范围嵌套 marks / One thousand same-range nested marks allowed by the contract. */
    const marks = Array.from({ length: 1_000 }, () => ({
      end: 2,
      kind: 'strong' as const,
      start: 0
    }))

    expect(replaceUiResumeRichTextText({ marks, text: 'ab' }, 'aXb')).toEqual({
      marks: [],
      text: 'aXb'
    })
  })

  it('对重复字符的歧义删除采用所有最小替换的保守并集', (): void => {
    expect(
      replaceUiResumeRichTextText(
        {
          marks: [
            { end: 1, kind: 'strong', start: 0 },
            { end: 3, kind: 'emphasis', start: 2 }
          ],
          text: 'aaa'
        },
        'aa'
      )
    ).toEqual({ marks: [], text: 'aa' })
  })

  it('只移除删除文本后收缩为空区间的 mark', (): void => {
    expect(
      replaceUiResumeRichTextText(
        {
          marks: [
            { end: 1, kind: 'strong', start: 0 },
            { end: 2, kind: 'emphasis', start: 1 }
          ],
          text: 'AB'
        },
        'B'
      )
    ).toEqual({ marks: [{ end: 1, kind: 'emphasis', start: 0 }], text: 'B' })
  })

  it('从缺失正文创建明确的无 mark 富文本', (): void => {
    expect(replaceUiResumeRichTextText(null, '新正文')).toEqual({ marks: [], text: '新正文' })
  })
})

describe('getUiResumeSectionTextViolation', (): void => {
  it('使用 Unicode code points 而不是 UTF-16 code units 检查边界', (): void => {
    expect(getUiResumeSectionTextViolation('title', '😀'.repeat(120))).toBeNull()
    expect(getUiResumeSectionTextViolation('title', '😀'.repeat(121))).toBe('title-too-long')
    expect(getUiResumeSectionTextViolation('content', '😀'.repeat(20_000))).toBeNull()
    expect(getUiResumeSectionTextViolation('content', '😀'.repeat(20_001))).toBe('content-too-long')
  })

  it('拒绝空 section title 但允许空 RichText.text', (): void => {
    expect(getUiResumeSectionTextViolation('title', '')).toBe('title-required')
    expect(getUiResumeSectionTextViolation('content', '')).toBeNull()
  })
})
