/** @file 不可信 HTTP JSON 的统一有界读取器 / Unified bounded reader for untrusted HTTP JSON. */

import { ApiV2ContractError } from './errors'

/** @brief 有界 JSON 读取选项 / Bounded JSON read options. */
export interface BoundedJsonReadOptions {
  /** @brief 诊断中的响应名称 / Response name used in diagnostics. */
  readonly context: string
  /** @brief 反序列化前最大字节数 / Maximum bytes before deserialization. */
  readonly maximumBytes: number
}

/**
 * @brief 在反序列化前按声明值与实际流量双重限制 JSON / Bound JSON by both declared and streamed bytes before deserialization.
 * @param response 尚未消费的 Fetch 响应 / Unconsumed Fetch response.
 * @param options 诊断上下文与字节上限 / Diagnostic context and byte limit.
 * @return 语法有效但语义未验证的 JSON / Syntactically valid but semantically untrusted JSON.
 */
export async function readBoundedJson(
  response: Response,
  options: BoundedJsonReadOptions
): Promise<unknown> {
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes <= 0) {
    throw new ApiV2ContractError('JSON response byte limit must be a positive safe integer.')
  }
  /** @brief 服务端声明的表示长度 / Representation length declared by the server. */
  const contentLength = response.headers.get('Content-Length')
  if (contentLength !== null) {
    /** @brief 十进制 Content-Length / Decimal Content-Length. */
    const declaredBytes = /^\d+$/u.test(contentLength) ? Number(contentLength) : Number.NaN
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > options.maximumBytes) {
      throw new ApiV2ContractError(
        `${options.context} exceeds its pre-deserialization byte limit.`,
        response.status
      )
    }
  }
  if (response.body === null) {
    throw new ApiV2ContractError(`${options.context} contains malformed JSON.`, response.status)
  }
  /** @brief 响应流 reader / Response-stream reader. */
  const reader = response.body.getReader()
  /** @brief 未合并的受限字节块 / Bounded byte chunks before joining. */
  const chunks: Uint8Array[] = []
  /** @brief 已读取实际字节数 / Actual byte count read so far. */
  let receivedBytes = 0
  while (true) {
    /** @brief 下一响应流读取结果 / Next response-stream read result. */
    const result = await reader.read()
    if (result.done) break
    receivedBytes += result.value.byteLength
    if (receivedBytes > options.maximumBytes) {
      await reader.cancel().catch(() => undefined)
      throw new ApiV2ContractError(
        `${options.context} exceeds its pre-deserialization byte limit.`,
        response.status
      )
    }
    chunks.push(result.value)
  }
  /** @brief 合并后的完整受限表示 / Complete bounded representation after joining chunks. */
  const bytes = new Uint8Array(receivedBytes)
  /** @brief 当前写入 offset / Current write offset. */
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  /** @brief 严格 UTF-8 JSON 文本 / Strict UTF-8 JSON text. */
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ApiV2ContractError(`${options.context} is not valid UTF-8.`, response.status)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ApiV2ContractError(`${options.context} contains malformed JSON.`, response.status)
  }
}
