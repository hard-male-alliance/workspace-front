import { describe, expect, it } from 'vitest'

import { IncrementalSha256 } from './incremental-sha256'

/** @brief NIST SHA-256 短消息向量 / NIST SHA-256 short-message vectors. */
const NIST_VECTORS = [
  {
    digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    message: ''
  },
  {
    digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    message: 'abc'
  },
  {
    digest: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    message: 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
  }
] as const

describe('incremental SHA-256', (): void => {
  it.each(NIST_VECTORS)('matches the NIST vector for "$message"', ({ digest, message }): void => {
    /** @brief UTF-8 消息字节 / UTF-8 message bytes. */
    const bytes = new TextEncoder().encode(message)
    expect(new IncrementalSha256().update(bytes).digestHex()).toBe(digest)
  })

  it('is invariant across every chunk boundary around a compression block', (): void => {
    /** @brief 跨越多个 64 字节压缩块的确定消息 / Deterministic message spanning multiple 64-byte blocks. */
    const bytes = Uint8Array.from({ length: 257 }, (_value, index): number => index % 251)
    /** @brief 一次性计算的参考摘要 / Reference digest computed in one update. */
    const expected = new IncrementalSha256().update(bytes).digestHex()

    for (let split = 0; split <= bytes.byteLength; split += 1) {
      /** @brief 在当前边界分块的摘要器 / Digest split at the current boundary. */
      const digest = new IncrementalSha256()
      digest.update(bytes.subarray(0, split))
      digest.update(bytes.subarray(split))
      expect(digest.digestHex()).toBe(expected)
    }
  })

  it('matches the NIST million-a vector without retaining the full stream', (): void => {
    /** @brief 重复喂入的一千个 ASCII a / One thousand ASCII a bytes fed repeatedly. */
    const thousandAs = new TextEncoder().encode('a'.repeat(1000))
    /** @brief 常量内存摘要器 / Constant-memory digest instance. */
    const digest = new IncrementalSha256()
    for (let iteration = 0; iteration < 1000; iteration += 1) digest.update(thousandAs)
    expect(digest.digestHex()).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
    )
  })
})
