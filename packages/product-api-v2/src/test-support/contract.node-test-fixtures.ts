/** @file 从唯一事实来源读取 API v2 官方样例 / Read official API v2 examples from the single source of truth. */

import { readFile } from 'node:fs/promises'

import ts from 'typescript'

/** @brief 官方 examples.jsonc 的模块相对地址 / Module-relative URL of the official examples.jsonc. */
const EXAMPLES_URL = new URL(
  '../../../../workspace-shared-docs/contracts/v2/examples.jsonc',
  import.meta.url
)

/**
 * @brief 判断未知值是否为普通对象 / Determine whether an unknown value is a plain object.
 * @param value 未知输入 / Unknown input.
 * @return 普通对象时为 true / True for a plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @brief 按名称读取 canonical example payload / Read a canonical example payload by name.
 * @param name examples.jsonc 中的稳定 case name / Stable case name in examples.jsonc.
 * @return 未经被测 decoder 处理的官方 payload / Official payload before the decoder under test.
 */
export async function readCanonicalExample(name: string): Promise<unknown> {
  /** @brief canonical JSONC 原文 / Canonical JSONC source text. */
  const source = await readFile(EXAMPLES_URL, 'utf8')
  /** @brief TypeScript 官方 JSONC parser 结果 / Result from TypeScript's JSONC parser. */
  const parsed = ts.parseConfigFileTextToJson(EXAMPLES_URL.pathname, source)
  /** @brief 从 TypeScript API 的历史 any 边界立即收窄的配置 / Config immediately narrowed from the TypeScript API's historical any boundary. */
  const config = parsed.config as unknown
  if (parsed.error !== undefined || !isRecord(config) || !Array.isArray(config.cases)) {
    throw new Error('The canonical API v2 example catalog cannot be parsed.')
  }
  /** @brief 已收窄为 unknown 条目的 case 数组 / Case array narrowed to unknown items. */
  const cases = config.cases as readonly unknown[]
  /** @brief 匹配名称的 canonical case / Canonical case matching the requested name. */
  const example = cases.find((candidate): boolean => isRecord(candidate) && candidate.name === name)
  if (!isRecord(example) || !Object.hasOwn(example, 'payload')) {
    throw new Error(`Canonical API v2 example ${name} is missing.`)
  }
  return example.payload
}
