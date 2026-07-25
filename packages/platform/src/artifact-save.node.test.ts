import { describe, expect, it } from 'vitest'

import {
  resolveResumeArtifactSaveFormat,
  resumeArtifactSaveFormatForFileName,
  sanitizeArtifactFileName,
  sanitizePdfFileName
} from './artifact-save'

describe('sanitizePdfFileName', () => {
  it.each([
    ['Klee Resume', 'Klee Resume.pdf'],
    ['Klee Resume.PDF', 'Klee Resume.pdf'],
    ['../secret\\resume?.pdf', 'secret resume.pdf'],
    ['  .  ', 'resume.pdf'],
    ['CON.pdf', '_CON.pdf'],
    ['CON.txt', '_CON.txt.pdf'],
    ['lpt9', '_lpt9.pdf'],
    ['offer\u202Efdp.exe', 'offerfdp.exe.pdf'],
    ['简历：平台工程师', '简历 平台工程师.pdf']
  ])('将 %j 净化为安全 PDF 名称 %j', (input, expected) => {
    expect(sanitizePdfFileName(input)).toBe(expected)
  })

  it('限制文件名长度并保留 PDF 扩展名', () => {
    expect(sanitizePdfFileName('a'.repeat(200))).toHaveLength(120)
    expect(sanitizePdfFileName('a'.repeat(200))).toMatch(/\.pdf$/u)
  })
})

describe('Resume Artifact save formats', (): void => {
  it.each([
    [
      'resume_pdf',
      'application/pdf',
      '.pdf',
      sanitizeArtifactFileName('Klee Resume.json', 'resume_pdf')
    ],
    [
      'resume_json',
      'application/json',
      '.json',
      sanitizeArtifactFileName('Klee Resume.PDF', 'resume_json')
    ],
    [
      'resume_docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.docx',
      sanitizeArtifactFileName('Klee Resume.json', 'resume_docx')
    ]
  ] as const)(
    'keeps the closed %s / %s / %s mapping',
    (kind, mediaType, extension, fileName): void => {
      /** @brief kind 与 MIME 联合解析结果 / Result jointly resolved from kind and MIME. */
      const format = resolveResumeArtifactSaveFormat(kind, mediaType)
      expect(format).toMatchObject({ extension, kind, mediaType })
      expect(fileName).toBe(`Klee Resume${extension}`)
      expect(resumeArtifactSaveFormatForFileName(fileName)).toBe(format)
    }
  )

  it.each([
    ['resume_pdf', 'application/json'],
    ['resume_json', 'application/pdf'],
    ['resume_docx', 'application/vnd.openxmlformats'],
    ['generic', 'application/pdf'],
    ['resume_pdf', 'application/pdf; charset=binary']
  ])('fails closed for the cross-format pair %s / %s', (kind, mediaType): void => {
    expect(resolveResumeArtifactSaveFormat(kind, mediaType)).toBeNull()
  })

  it.each([
    '../escape.pdf',
    'resume.exe',
    'resume.txt',
    'resume.pdf ',
    'resume',
    'resume\u202Efdp.exe.pdf'
  ])('rejects an unsafe or unsupported runtime filename %j', (fileName): void => {
    expect(resumeArtifactSaveFormatForFileName(fileName)).toBeNull()
  })
})
