/** @file 跨限界上下文的乐观并发令牌 / Optimistic-concurrency tokens shared across bounded contexts. */

/** @brief 强 HTTP entity-tag 的名义类型品牌 / Nominal type brand for strong HTTP entity-tags. */
declare const concurrencyTokenBrand: unique symbol

/**
 * @brief 与一个权威资源表示配对的强并发令牌 / Strong concurrency token paired with one authoritative resource representation.
 * @note 该值只能原样用于 `If-Match`；它不能由领域 revision 推导 / This value may only be replayed verbatim in `If-Match`; it cannot be derived from a domain revision.
 */
export type UiConcurrencyToken = string & {
  readonly [concurrencyTokenBrand]: 'strong-entity-tag'
}

/**
 * @brief 将已验证的强 entity-tag 提升为并发令牌 / Refine a validated strong entity-tag into a concurrency token.
 * @param value 未经信任的 HTTP entity-tag / Untrusted HTTP entity-tag.
 * @return 可原样用于 `If-Match` 的名义令牌 / Nominal token safe to replay verbatim in `If-Match`.
 * @throws {TypeError} 当值是弱标签、通配符、列表或非法标签时抛出 / Thrown for weak tags, wildcards, lists, or malformed tags.
 */
export function asUiConcurrencyToken(value: string): UiConcurrencyToken {
  if (value.startsWith('W/') || value.length < 2 || value[0] !== '"' || value.at(-1) !== '"') {
    throw new TypeError('A concurrency token must be one strong HTTP entity-tag.')
  }
  for (let index = 1; index < value.length - 1; index += 1) {
    /** @brief 当前 entity-tag 字符码 / Current entity-tag character code. */
    const code = value.charCodeAt(index)
    if (code < 0x21 || code === 0x22 || code > 0xff) {
      throw new TypeError('A concurrency token must be one strong HTTP entity-tag.')
    }
  }
  return value as UiConcurrencyToken
}
