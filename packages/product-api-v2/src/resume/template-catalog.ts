/** @file API v2 全局不可变 Resume Template 目录消费者 / Consumer for the API v2 global immutable Resume Template catalog. */

import type { ApiV2Client } from '../http/client'
import { boundedInteger, boundedString, opaqueId } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  parseTemplateList,
  parseTemplateManifest,
  type TemplateList,
  type TemplateManifest,
  type TemplateRef
} from './template'

/** @brief Template 目录页响应的字节上限 / Response byte ceiling for one Template-catalog page. */
const TEMPLATE_LIST_MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** @brief 单个完整 TemplateManifest 响应的字节上限 / Response byte ceiling for one complete TemplateManifest. */
const TEMPLATE_MANIFEST_MAX_RESPONSE_BYTES = 2 * 1024 * 1024

/** @brief Template 目录单页读取参数 / Parameters for reading one Template-catalog page. */
export interface ResumeTemplatePageRequest {
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 每页条目数，默认 50 / Items per page, defaulting to 50. */
  readonly limit?: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 精确不可变 TemplateManifest 读取参数 / Parameters for reading one exact immutable TemplateManifest. */
export interface ResumeTemplateReadRequest extends TemplateRef {
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 读取一页全局不可变 Resume Template / Read one page of global immutable Resume Templates.
 * @param client v2-only 产品读取客户端 / v2-only product read client.
 * @param request opaque cursor、limit 与取消信号 / Opaque cursor, limit, and cancellation signal.
 * @return 严格解码且分页关系成立的 TemplateList / Strictly decoded TemplateList with a valid pagination relation.
 */
export async function listResumeTemplatePage(
  client: ApiV2Client,
  request: ResumeTemplatePageRequest = {}
): Promise<TemplateList> {
  /** @brief 仅读取一次的页大小候选值 / Page-size candidate read exactly once. */
  const limitCandidate = request.limit
  /** @brief 仅读取一次的 cursor 候选值 / Cursor candidate read exactly once. */
  const cursorCandidate = request.cursor
  /** @brief 仅读取一次的取消信号 / Cancellation signal read exactly once. */
  const signal = request.signal
  /** @brief 已验证页大小 / Validated page size. */
  const limit =
    limitCandidate === undefined ? 50 : boundedInteger(limitCandidate, 'request.limit', 1, 200)
  /** @brief 已验证 cursor / Validated cursor. */
  const cursor =
    cursorCandidate === undefined || cursorCandidate === null
      ? null
      : boundedString(cursorCandidate, 'request.cursor', 1, 2048)
  /** @brief 当前 TemplateList 响应 / Current TemplateList response. */
  const response = await client.getJson('/resume-templates', {
    maxResponseBytes: TEMPLATE_LIST_MAX_RESPONSE_BYTES,
    query: { cursor, limit },
    ...(signal === undefined ? {} : { signal })
  })
  return parseTemplateList(response.data)
}

/**
 * @brief 读取一个精确版本的不可变 Resume Template / Read one exact immutable Resume Template version.
 * @param client v2-only 产品读取客户端 / v2-only product read client.
 * @param request Template identity 与取消信号 / Template identity and cancellation signal.
 * @return 与请求 identity 精确一致的 TemplateManifest / TemplateManifest whose identity exactly matches the request.
 */
export async function getResumeTemplate(
  client: ApiV2Client,
  request: ResumeTemplateReadRequest
): Promise<TemplateManifest> {
  /** @brief 仅读取一次的 Template ID 候选值 / Template-ID candidate read exactly once. */
  const templateIdCandidate = request.template_id
  /** @brief 仅读取一次的版本候选值 / Version candidate read exactly once. */
  const versionCandidate = request.version
  /** @brief 仅读取一次的取消信号 / Cancellation signal read exactly once. */
  const signal = request.signal
  /** @brief 已验证 Template ID / Validated Template ID. */
  const templateId = opaqueId(templateIdCandidate, 'request.template_id')
  /** @brief 已验证不可变版本 / Validated immutable version. */
  const version = boundedString(versionCandidate, 'request.version', 1, 80)
  /** @brief 精确 Template resource path / Exact Template resource path. */
  const path = `/resume-templates/${encodeURIComponent(templateId)}`
  /** @brief 当前 TemplateManifest 响应 / Current TemplateManifest response. */
  const response = await client.getJson(path, {
    maxResponseBytes: TEMPLATE_MANIFEST_MAX_RESPONSE_BYTES,
    query: { version },
    ...(signal === undefined ? {} : { signal })
  })
  /** @brief 已严格解码的不可变 TemplateManifest / Strictly decoded immutable TemplateManifest. */
  const manifest = parseTemplateManifest(response.data)
  if (manifest.id !== templateId || manifest.version !== version) {
    throw new ApiV2ContractError(
      'API v2 returned a TemplateManifest whose immutable identity differs from the request.'
    )
  }
  return manifest
}
