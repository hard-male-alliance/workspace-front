import { describe, expect, it } from 'vitest'

import { sanitizePdfFileName } from './artifact-save'

describe('sanitizePdfFileName', () => {
  it.each([
    ['Klee Resume', 'Klee Resume.pdf'],
    ['Klee Resume.PDF', 'Klee Resume.pdf'],
    ['../secret\\resume?.pdf', 'secret resume.pdf'],
    ['  .  ', 'resume.pdf'],
    ['CON.pdf', '_CON.pdf'],
    ['CON.txt', '_CON.txt.pdf'],
    ['lpt9', '_lpt9.pdf'],
    ['简历：平台工程师', '简历 平台工程师.pdf']
  ])('将 %j 净化为安全 PDF 名称 %j', (input, expected) => {
    expect(sanitizePdfFileName(input)).toBe(expected)
  })

  it('限制文件名长度并保留 PDF 扩展名', () => {
    expect(sanitizePdfFileName('a'.repeat(200))).toHaveLength(120)
    expect(sanitizePdfFileName('a'.repeat(200))).toMatch(/\.pdf$/u)
  })
})
