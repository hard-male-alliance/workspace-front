import { describe, expect, it } from 'vitest'

import {
  isAbsoluteUri,
  isRfc3339Timestamp,
  parseRfc3339TimestampMilliseconds
} from './contract-formats'

describe('isRfc3339Timestamp', (): void => {
  it.each([
    '2026-07-22T08:00:00Z',
    '2026-07-22t08:00:00z',
    '2024-02-29T23:59:59.123456+08:00',
    '2016-12-31T23:59:60Z',
    '2017-01-01T05:29:60+05:30'
  ])('接受 RFC 3339 date-time：%s', (value): void => {
    expect(isRfc3339Timestamp(value)).toBe(true)
  })

  it.each([
    '2026-02-29T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-07-22T24:00:00Z',
    '2026-07-22T08:60:00Z',
    '2026-07-22T08:00:61Z',
    '2026-07-22T08:00:00+24:00',
    '2026-07-22T08:00:00+08:60',
    '2026-07-22 08:00:00Z',
    '2026-07-22T08:00:00'
  ])('拒绝非 RFC 3339 date-time：%s', (value): void => {
    expect(isRfc3339Timestamp(value)).toBe(false)
  })

  it('将闰秒映射到紧随其后的 epoch 毫秒', (): void => {
    expect(parseRfc3339TimestampMilliseconds('2016-12-31T23:59:60Z')).toBe(
      Date.parse('2017-01-01T00:00:00Z')
    )
    expect(parseRfc3339TimestampMilliseconds('not-a-time')).toBeNull()
  })
})

describe('isAbsoluteUri', (): void => {
  it.each([
    'https://api.example.test/api/v1/render-artifacts/artifact_123/content?signature=abc%20def',
    'urn:isbn:9780131103627',
    'mailto:user@example.test',
    'file:///tmp/resume.pdf',
    'custom://[2001:db8::1]:443/path',
    'custom://[v1.fe.example]/path',
    'data:application/pdf;base64,AA=='
  ])('接受 RFC 3986 绝对 URI：%s', (value): void => {
    expect(isAbsoluteUri(value)).toBe(true)
  })

  it.each([
    '/relative/path',
    'https://api.example.test/a b',
    'https://api.example.test/简历',
    'https://api.example.test/path[0]',
    'https://api.example.test/path#one#two',
    'https://api.example.test/path?signature=%zz',
    'https://api.example.test:port/path',
    'custom://[not-an-ip]/path',
    'custom://[v1.]/path',
    'https://api.example.test/{artifact}'
  ])('拒绝非 RFC 3986 绝对 URI：%s', (value): void => {
    expect(isAbsoluteUri(value)).toBe(false)
  })
})
