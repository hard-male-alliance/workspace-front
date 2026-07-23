/** @file 面向大 Artifact 的常量内存增量 SHA-256 / Constant-memory incremental SHA-256 for large Artifacts. */

/** @brief SHA-256 每个压缩块的字节数 / Bytes in one SHA-256 compression block. */
const BLOCK_BYTES = 64

/** @brief SHA-256 摘要的字节数 / Bytes in a SHA-256 digest. */
const DIGEST_BYTES = 32

/** @brief SHA-256 压缩函数的轮常量 / Round constants for the SHA-256 compression function. */
const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

/** @brief SHA-256 初始链值 / Initial chaining values for SHA-256. */
const INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
])

/**
 * @brief 循环右移一个 32 位无符号整数 / Rotate a 32-bit unsigned integer to the right.
 * @param value 待旋转整数 / Integer to rotate.
 * @param amount 旋转位数 / Number of bits to rotate.
 * @return 旋转后的无符号整数 / Rotated unsigned integer.
 */
function rotateRight(value: number, amount: number): number {
  return ((value >>> amount) | (value << (32 - amount))) >>> 0
}

/**
 * @brief 以大端顺序写入一个 32 位整数 / Write one 32-bit integer in big-endian order.
 * @param target 目标字节数组 / Destination byte array.
 * @param offset 写入偏移 / Write offset.
 * @param value 待写入无符号整数 / Unsigned integer to write.
 * @return 无返回值 / No return value.
 */
function writeUint32BigEndian(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value >>> 24
  target[offset + 1] = value >>> 16
  target[offset + 2] = value >>> 8
  target[offset + 3] = value
}

/** @brief 可在任意 chunk 边界增量计算的 SHA-256 / SHA-256 computed incrementally across arbitrary chunk boundaries. */
export class IncrementalSha256 {
  /** @brief 尚未组成完整压缩块的尾部字节 / Trailing bytes not yet forming a full compression block. */
  readonly #buffer = new Uint8Array(BLOCK_BYTES)

  /** @brief 当前尾部字节数 / Current number of trailing bytes. */
  #bufferLength = 0

  /** @brief 是否已经输出最终摘要 / Whether the final digest has been produced. */
  #finalized = false

  /** @brief 八个 SHA-256 链值 / Eight SHA-256 chaining values. */
  readonly #state = Uint32Array.from(INITIAL_STATE)

  /** @brief 已接收消息的总字节数 / Total number of message bytes received. */
  #totalBytes = 0

  /** @brief 单个压缩块的消息调度表 / Message schedule for one compression block. */
  readonly #words = new Uint32Array(64)

  /**
   * @brief 接收下一段消息字节 / Consume the next message bytes.
   * @param input 不会被持有或改写的字节块 / Byte chunk that is neither retained nor mutated.
   * @return 当前增量摘要器 / This incremental digest instance.
   */
  update(input: Uint8Array): IncrementalSha256 {
    if (this.#finalized) throw new Error('Cannot update a finalized SHA-256 digest.')
    if (!(input instanceof Uint8Array)) throw new TypeError('SHA-256 input must be a Uint8Array.')
    this.#totalBytes += input.byteLength
    if (!Number.isSafeInteger(this.#totalBytes)) {
      throw new RangeError('SHA-256 input exceeds the supported safe-integer byte length.')
    }

    /** @brief 当前输入读取偏移 / Current read offset in the input. */
    let offset = 0
    if (this.#bufferLength > 0) {
      /** @brief 补满尾部块所需的字节数 / Bytes needed to complete the trailing block. */
      const needed = BLOCK_BYTES - this.#bufferLength
      /** @brief 本次复制到尾部块的字节数 / Bytes copied into the trailing block. */
      const copied = Math.min(needed, input.byteLength)
      this.#buffer.set(input.subarray(0, copied), this.#bufferLength)
      this.#bufferLength += copied
      offset = copied
      if (this.#bufferLength === BLOCK_BYTES) {
        this.#compress(this.#buffer, 0)
        this.#bufferLength = 0
      }
    }

    while (offset + BLOCK_BYTES <= input.byteLength) {
      this.#compress(input, offset)
      offset += BLOCK_BYTES
    }
    if (offset < input.byteLength) {
      this.#buffer.set(input.subarray(offset), 0)
      this.#bufferLength = input.byteLength - offset
    }
    return this
  }

  /**
   * @brief 结束消息并返回小写十六进制摘要 / Finalize the message and return a lowercase hexadecimal digest.
   * @return 64 字符 SHA-256 摘要 / 64-character SHA-256 digest.
   */
  digestHex(): string {
    if (this.#finalized) throw new Error('SHA-256 digest has already been finalized.')
    this.#finalized = true

    /** @brief 包含 0x80、零填充和 64 位长度的最终块 / Final blocks containing 0x80, zero padding, and the 64-bit length. */
    const finalBlocks = new Uint8Array(this.#bufferLength < 56 ? BLOCK_BYTES : BLOCK_BYTES * 2)
    finalBlocks.set(this.#buffer.subarray(0, this.#bufferLength), 0)
    finalBlocks[this.#bufferLength] = 0x80
    /** @brief 消息位长度的高 32 位 / High 32 bits of the message length in bits. */
    const bitLengthHigh = Math.floor(this.#totalBytes / 0x20000000)
    /** @brief 消息位长度的低 32 位 / Low 32 bits of the message length in bits. */
    const bitLengthLow = (this.#totalBytes << 3) >>> 0
    writeUint32BigEndian(finalBlocks, finalBlocks.byteLength - 8, bitLengthHigh)
    writeUint32BigEndian(finalBlocks, finalBlocks.byteLength - 4, bitLengthLow)
    for (let offset = 0; offset < finalBlocks.byteLength; offset += BLOCK_BYTES) {
      this.#compress(finalBlocks, offset)
    }

    /** @brief 二进制摘要 / Binary digest. */
    const digest = new Uint8Array(DIGEST_BYTES)
    for (let index = 0; index < this.#state.length; index += 1) {
      writeUint32BigEndian(digest, index * 4, this.#state[index] ?? 0)
    }
    return Array.from(digest, (byte): string => byte.toString(16).padStart(2, '0')).join('')
  }

  /**
   * @brief 压缩一个 512 位消息块 / Compress one 512-bit message block.
   * @param input 包含消息块的字节数组 / Byte array containing the message block.
   * @param offset 消息块起始偏移 / Starting offset of the message block.
   * @return 无返回值 / No return value.
   */
  #compress(input: Uint8Array, offset: number): void {
    for (let index = 0; index < 16; index += 1) {
      /** @brief 当前消息字的输入偏移 / Input offset of the current message word. */
      const wordOffset = offset + index * 4
      this.#words[index] =
        (((input[wordOffset] ?? 0) << 24) |
          ((input[wordOffset + 1] ?? 0) << 16) |
          ((input[wordOffset + 2] ?? 0) << 8) |
          (input[wordOffset + 3] ?? 0)) >>>
        0
    }
    for (let index = 16; index < 64; index += 1) {
      /** @brief 两位历史消息字的小 sigma0 / Small sigma0 of the word two positions back. */
      const previous2 = this.#words[index - 2] ?? 0
      /** @brief 十五位历史消息字的小 sigma1 / Small sigma1 of the word fifteen positions back. */
      const previous15 = this.#words[index - 15] ?? 0
      /** @brief 当前调度字的 sigma1 / sigma1 contribution to the current schedule word. */
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10)
      /** @brief 当前调度字的 sigma0 / sigma0 contribution to the current schedule word. */
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3)
      this.#words[index] =
        ((this.#words[index - 16] ?? 0) + sigma0 + (this.#words[index - 7] ?? 0) + sigma1) >>> 0
    }

    /** @brief 工作变量 a / Working variable a. */
    let a = this.#state[0] ?? 0
    /** @brief 工作变量 b / Working variable b. */
    let b = this.#state[1] ?? 0
    /** @brief 工作变量 c / Working variable c. */
    let c = this.#state[2] ?? 0
    /** @brief 工作变量 d / Working variable d. */
    let d = this.#state[3] ?? 0
    /** @brief 工作变量 e / Working variable e. */
    let e = this.#state[4] ?? 0
    /** @brief 工作变量 f / Working variable f. */
    let f = this.#state[5] ?? 0
    /** @brief 工作变量 g / Working variable g. */
    let g = this.#state[6] ?? 0
    /** @brief 工作变量 h / Working variable h. */
    let h = this.#state[7] ?? 0

    for (let index = 0; index < 64; index += 1) {
      /** @brief e 的大 Sigma1 / Big Sigma1 of e. */
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      /** @brief e、f、g 的选择函数 / Choice function of e, f, and g. */
      const choice = (e & f) ^ (~e & g)
      /** @brief 当前轮第一个临时字 / First temporary word for this round. */
      const temporary1 =
        (h + sigma1 + choice + (ROUND_CONSTANTS[index] ?? 0) + (this.#words[index] ?? 0)) >>> 0
      /** @brief a 的大 Sigma0 / Big Sigma0 of a. */
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      /** @brief a、b、c 的多数函数 / Majority function of a, b, and c. */
      const majority = (a & b) ^ (a & c) ^ (b & c)
      /** @brief 当前轮第二个临时字 / Second temporary word for this round. */
      const temporary2 = (sigma0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }

    this.#state[0] = ((this.#state[0] ?? 0) + a) >>> 0
    this.#state[1] = ((this.#state[1] ?? 0) + b) >>> 0
    this.#state[2] = ((this.#state[2] ?? 0) + c) >>> 0
    this.#state[3] = ((this.#state[3] ?? 0) + d) >>> 0
    this.#state[4] = ((this.#state[4] ?? 0) + e) >>> 0
    this.#state[5] = ((this.#state[5] ?? 0) + f) >>> 0
    this.#state[6] = ((this.#state[6] ?? 0) + g) >>> 0
    this.#state[7] = ((this.#state[7] ?? 0) + h) >>> 0
  }
}
