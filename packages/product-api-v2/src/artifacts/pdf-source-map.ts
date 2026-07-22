/** @file API v2 PDF Artifact source-map 投影与读取 / API v2 PDF Artifact source-map projection and read. */

import type { ApiV2Client } from '../http/client'
import { boundedInteger, boundedString, exactRecord, opaqueId } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'

/** @brief PdfSourceMap 响应的解码前字节上限 / Pre-decoding byte ceiling for a PdfSourceMap response. */
const PDF_SOURCE_MAP_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief PdfSourceMap 最多包含的 source nodes / Maximum source nodes in one PdfSourceMap. */
const PDF_SOURCE_MAP_MAXIMUM_NODES = 10_000

/** @brief PDF page 上以 point 为单位的矩形 / Rectangle on a PDF page measured in points. */
export interface PdfRect {
  /** @brief 水平坐标 / Horizontal coordinate. */
  readonly x: number
  /** @brief 垂直坐标 / Vertical coordinate. */
  readonly y: number
  /** @brief 非负宽度 / Non-negative width. */
  readonly width: number
  /** @brief 非负高度 / Non-negative height. */
  readonly height: number
  /** @brief 固定 PDF point 单位 / Fixed PDF-point unit. */
  readonly unit: 'pt'
}

/** @brief Resume entity 在一页 PDF 中的 source-map node / Source-map node for a Resume entity on one PDF page. */
export interface PdfSourceNode {
  /** @brief Resume entity 不透明 ID / Opaque Resume-entity ID. */
  readonly entity_id: string
  /** @brief 定位 entity 字段的 schema path / Schema path locating a field within the entity. */
  readonly field_path: readonly string[]
  /** @brief 从 1 开始的 PDF page / One-based PDF page. */
  readonly page: number
  /** @brief 该字段在本页占据的一个或多个矩形 / One or more rectangles occupied by the field on this page. */
  readonly rects: readonly PdfRect[]
}

/** @brief 与固定 Resume revision 配对的 PDF source map / PDF source map paired with a pinned Resume revision. */
export interface PdfSourceMap {
  /** @brief source map 所属 Artifact ID / Artifact ID owning the source map. */
  readonly artifact_id: string
  /** @brief 生成 PDF 的 Resume ID / Resume ID from which the PDF was produced. */
  readonly resume_id: string
  /** @brief 生成 PDF 时的 Resume revision / Resume revision used to produce the PDF. */
  readonly resume_revision: number
  /** @brief 按 entity/field/page 定位的映射节点 / Mapping nodes located by entity, field, and page. */
  readonly nodes: readonly PdfSourceNode[]
}

/** @brief 读取一个 Artifact source map 的输入 / Input for reading one Artifact source map. */
export interface PdfSourceMapReadRequest {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 路径中的 Artifact identity / Artifact identity in the path. */
  readonly artifactId: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 校验 Schema array 的长度与稠密性 / Validate a Schema array's length and density.
 * @param value 未知数组 / Unknown array.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumItems 最小条目数 / Minimum item count.
 * @param maximumItems 最大条目数 / Maximum item count.
 * @return 已验证稠密数组 / Validated dense array.
 */
function schemaArray(
  value: unknown,
  path: string,
  minimumItems: number,
  maximumItems: number
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimumItems || value.length > maximumItems) {
    throw new ApiV2ContractError(
      `API v2 field ${path} must contain between ${minimumItems} and ${maximumItems} items.`
    )
  }
  /** @brief 可枚举数组 keys / Enumerable array keys. */
  const keys = Object.keys(value)
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a dense JSON array.`)
  }
  return value
}

/**
 * @brief 校验有限 JSON number 与可选下界 / Validate a finite JSON number and optional lower bound.
 * @param value 未知 number / Unknown number.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimum 最小允许值 / Minimum permitted value.
 * @return 已验证有限 number / Validated finite number.
 */
function finiteNumber(value: unknown, path: string, minimum = -Number.MAX_VALUE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new ApiV2ContractError(
      `API v2 field ${path} must be a finite number no smaller than ${minimum}.`
    )
  }
  return value
}

/**
 * @brief 严格解码 PdfRect / Strictly decode a PdfRect.
 * @param value 未知矩形 / Unknown rectangle.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 point 矩形 / Validated point rectangle.
 */
function parsePdfRect(value: unknown, path: string): PdfRect {
  /** @brief 精确 PdfRect 对象 / Exact PdfRect object. */
  const input = exactRecord(value, path, ['x', 'y', 'width', 'height', 'unit'])
  if (input.unit !== 'pt') {
    throw new ApiV2ContractError(`API v2 field ${path}.unit must equal pt.`)
  }
  return {
    height: finiteNumber(input.height, `${path}.height`, 0),
    unit: 'pt',
    width: finiteNumber(input.width, `${path}.width`, 0),
    x: finiteNumber(input.x, `${path}.x`),
    y: finiteNumber(input.y, `${path}.y`)
  }
}

/**
 * @brief 严格解码 PdfSourceNode / Strictly decode a PdfSourceNode.
 * @param value 未知 source node / Unknown source node.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证节点 / Validated node.
 */
function parsePdfSourceNode(value: unknown, path: string): PdfSourceNode {
  /** @brief 精确 PdfSourceNode 对象 / Exact PdfSourceNode object. */
  const input = exactRecord(value, path, ['entity_id', 'field_path', 'page', 'rects'])
  /** @brief 未映射 field path segments / Unmapped field-path segments. */
  const fieldPath = schemaArray(input.field_path, `${path}.field_path`, 0, 20)
  /** @brief 未映射 PDF rectangles / Unmapped PDF rectangles. */
  const rects = schemaArray(input.rects, `${path}.rects`, 1, Number.MAX_SAFE_INTEGER)
  return {
    entity_id: opaqueId(input.entity_id, `${path}.entity_id`),
    field_path: fieldPath.map((segment, index) =>
      boundedString(segment, `${path}.field_path[${index}]`, 0, 100)
    ),
    page: boundedInteger(input.page, `${path}.page`, 1, Number.MAX_SAFE_INTEGER),
    rects: rects.map((rect, index) => parsePdfRect(rect, `${path}.rects[${index}]`))
  }
}

/**
 * @brief 严格解码 PdfSourceMap / Strictly decode a PdfSourceMap.
 * @param value 未知 source map / Unknown source map.
 * @return 已验证且无损的 source map / Validated lossless source map.
 */
export function parsePdfSourceMap(value: unknown): PdfSourceMap {
  /** @brief 精确 PdfSourceMap 对象 / Exact PdfSourceMap object. */
  const input = exactRecord(value, 'pdf_source_map', [
    'artifact_id',
    'resume_id',
    'resume_revision',
    'nodes'
  ])
  /** @brief 未映射 source nodes / Unmapped source nodes. */
  const nodes = schemaArray(input.nodes, 'pdf_source_map.nodes', 0, PDF_SOURCE_MAP_MAXIMUM_NODES)
  return {
    artifact_id: opaqueId(input.artifact_id, 'pdf_source_map.artifact_id'),
    nodes: nodes.map((node, index) => parsePdfSourceNode(node, `pdf_source_map.nodes[${index}]`)),
    resume_id: opaqueId(input.resume_id, 'pdf_source_map.resume_id'),
    resume_revision: boundedInteger(
      input.resume_revision,
      'pdf_source_map.resume_revision',
      1,
      Number.MAX_SAFE_INTEGER
    )
  }
}

/**
 * @brief 读取一个 Workspace Artifact 的权威 PDF source map / Read the authoritative PDF source map of a Workspace Artifact.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param request 显式 Workspace、Artifact identity 与取消信号 / Explicit Workspace and Artifact identities plus cancellation signal.
 * @return artifact_id 与路径一致的权威 source map / Authoritative source map whose artifact_id matches the path.
 */
export async function getWorkspaceArtifactSourceMap(
  client: ApiV2Client,
  request: PdfSourceMapReadRequest
): Promise<PdfSourceMap> {
  /** @brief 只读取一次的 Workspace ID / Workspace ID read exactly once. */
  const workspaceIdCandidate = request.workspaceId
  /** @brief 只读取一次的 Artifact ID / Artifact ID read exactly once. */
  const artifactIdCandidate = request.artifactId
  /** @brief 只读取一次的取消信号 / Abort signal read exactly once. */
  const signal = request.signal
  /** @brief 已验证 Workspace ID / Validated Workspace ID. */
  const workspaceId = opaqueId(workspaceIdCandidate, 'request.workspace_id')
  /** @brief 已验证 Artifact ID / Validated Artifact ID. */
  const artifactId = opaqueId(artifactIdCandidate, 'request.artifact_id')
  /** @brief Workspace-scoped Artifact source-map path / Workspace-scoped Artifact source-map path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/artifacts/${encodeURIComponent(artifactId)}/source-map`
  /** @brief transport 严格返回的 200 JSON source map / 200 JSON source map strictly returned by the transport. */
  const response = await client.getJson(path, {
    expectedStatus: 200,
    maxResponseBytes: PDF_SOURCE_MAP_MAX_RESPONSE_BYTES,
    ...(signal === undefined ? {} : { signal })
  })
  /** @brief 已验证权威 source map / Validated authoritative source map. */
  const sourceMap = parsePdfSourceMap(response.data)
  if (sourceMap.artifact_id !== artifactId) {
    throw new ApiV2ContractError(
      'API v2 returned a PdfSourceMap whose Artifact identity differs from the request path.'
    )
  }
  return sourceMap
}
