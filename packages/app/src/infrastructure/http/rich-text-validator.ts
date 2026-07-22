/** @file 冻结 RichText JSON 的共享运行时校验 / Shared runtime validation for frozen RichText JSON. */

import {
  absoluteUri,
  array,
  boolean,
  boundedArray,
  boundedString,
  exactRecord,
  opaqueId,
  string
} from './decoder'
import { HttpContractError } from './http-client'

/** @brief RichText 文本标记类型 / RichText text-mark types. */
const TEXT_MARK_TYPES = ['bold', 'italic', 'underline', 'strike', 'code', 'link'] as const

/** @brief RichText 段落对齐方式 / RichText paragraph alignments. */
const PARAGRAPH_ALIGNMENTS = ['start', 'center', 'end', 'justify'] as const

/**
 * @brief 断言字符串属于封闭枚举 / Assert that a string belongs to a closed enum.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param allowed 冻结枚举值 / Frozen enum values.
 * @return 已验证字符串 / Validated string.
 */
function closedEnum(value: unknown, path: string, allowed: readonly string[]): string {
  /** @brief 已解码字符串 / Decoded string. */
  const decoded = string(value, path)
  if (!allowed.includes(decoded)) {
    throw new HttpContractError(`Backend field ${path} contains an unsupported value.`, 200)
  }
  return decoded
}

/**
 * @brief 校验非空数组 / Validate a non-empty array.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 至少含一个元素的数组 / Array containing at least one item.
 */
function nonEmptyArray(value: unknown, path: string): readonly unknown[] {
  /** @brief 已解码数组 / Decoded array. */
  const decoded = array(value, path)
  if (decoded.length === 0) {
    throw new HttpContractError(`Backend field ${path} must contain at least 1 item.`, 200)
  }
  return decoded
}

/**
 * @brief 校验文本 spans 并提取纯文本 / Validate text spans and extract plain text.
 * @param value 未知 spans / Unknown spans.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return spans 的纯文本拼接 / Concatenated span text.
 */
function validateSpans(value: unknown, path: string): string {
  return nonEmptyArray(value, path)
    .map((item, index): string => {
      /** @brief 当前 span 路径 / Current span path. */
      const spanPath = `${path}[${index}]`
      /** @brief 精确 span 对象 / Exact span object. */
      const span = exactRecord(item, spanPath, ['text', 'marks'])
      boundedArray(span.marks === undefined ? [] : span.marks, `${spanPath}.marks`, 0, 8).forEach(
        (markValue, markIndex): void => {
          /** @brief 当前 mark 路径 / Current mark path. */
          const markPath = `${spanPath}.marks[${markIndex}]`
          /** @brief 精确 mark 对象 / Exact mark object. */
          const mark = exactRecord(markValue, markPath, ['type', 'href'])
          closedEnum(mark.type, `${markPath}.type`, TEXT_MARK_TYPES)
          if (mark.href !== undefined && mark.href !== null) {
            absoluteUri(mark.href, `${markPath}.href`)
          }
        }
      )
      return boundedString(span.text, `${spanPath}.text`, 0, 20_000)
    })
    .join('')
}

/**
 * @brief 校验递归列表项并提取纯文本 / Validate a recursive list item and extract plain text.
 * @param value 未知列表项 / Unknown list item.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 当前项及子项的纯文本 / Plain text for the item and its children.
 */
function validateListItem(value: unknown, path: string): string {
  /** @brief 精确列表项 / Exact list item. */
  const input = exactRecord(value, path, ['item_id', 'spans', 'children'])
  opaqueId(input.item_id, `${path}.item_id`)
  /** @brief 当前列表项文本 / Current list-item text. */
  const ownText = validateSpans(input.spans, `${path}.spans`)
  /** @brief 子列表项文本 / Child list-item text. */
  const children = boundedArray(
    input.children === undefined ? [] : input.children,
    `${path}.children`,
    0,
    20
  ).map((child, index): string => validateListItem(child, `${path}.children[${index}]`))
  return [ownText, ...children].filter((textValue) => textValue.length > 0).join('\n')
}

/**
 * @brief 严格校验冻结 RichText 并生成纯文本投影 / Strictly validate frozen RichText and create a plain-text projection.
 * @param value 未知 RichText JSON / Unknown RichText JSON.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 服务端投影存在时使用该投影，否则从 blocks 提取 / Server projection when present, otherwise text extracted from blocks.
 */
export function validateRichText(value: unknown, path: string): string {
  /** @brief 精确 RichText 对象 / Exact RichText object. */
  const input = exactRecord(value, path, ['schema_version', 'blocks', 'plain_text'])
  if (string(input.schema_version, `${path}.schema_version`) !== '1.0') {
    throw new HttpContractError(
      `Backend field ${path}.schema_version uses an unsupported version.`,
      200
    )
  }
  /** @brief 从结构块提取的文本 / Text extracted from semantic blocks. */
  const blockText = boundedArray(input.blocks, `${path}.blocks`, 0, 1_000).map(
    (blockValue, index): string => {
      /** @brief 当前 block 路径 / Current block path. */
      const blockPath = `${path}.blocks[${index}]`
      /** @brief 用于判别联合类型的 block 对象 / Block object used as a union discriminator. */
      const block = exactRecord(blockValue, blockPath, [
        'block_id',
        'type',
        'align',
        'spans',
        'ordered',
        'items'
      ])
      /** @brief block 类型 / Block type. */
      const type = string(block.type, `${blockPath}.type`)
      if (type === 'paragraph') {
        /** @brief 精确段落 block / Exact paragraph block. */
        const paragraph = exactRecord(blockValue, blockPath, ['block_id', 'type', 'align', 'spans'])
        opaqueId(paragraph.block_id, `${blockPath}.block_id`)
        if (paragraph.align !== undefined) {
          closedEnum(paragraph.align, `${blockPath}.align`, PARAGRAPH_ALIGNMENTS)
        }
        return validateSpans(paragraph.spans, `${blockPath}.spans`)
      }
      if (type === 'list') {
        /** @brief 精确列表 block / Exact list block. */
        const list = exactRecord(blockValue, blockPath, ['block_id', 'type', 'ordered', 'items'])
        opaqueId(list.block_id, `${blockPath}.block_id`)
        boolean(list.ordered, `${blockPath}.ordered`)
        return nonEmptyArray(list.items, `${blockPath}.items`)
          .map((item, itemIndex): string =>
            validateListItem(item, `${blockPath}.items[${itemIndex}]`)
          )
          .join('\n')
      }
      throw new HttpContractError(`Backend field ${blockPath}.type is unsupported.`, 200)
    }
  )
  if (input.plain_text === null || input.plain_text === undefined) return blockText.join('\n')
  return boundedString(input.plain_text, `${path}.plain_text`, 0, 200_000)
}
