/** @file HTTP DTO 最小结构 / Minimal HTTP DTO structures. */

/** @brief 游标分页信息 / Cursor-page metadata. */
export interface CursorPageDto {
  readonly next_cursor: string | null
  readonly has_more: boolean
}

/** @brief 游标分页响应 / Cursor-paginated response. */
export interface CursorPageResponseDto<TItem> {
  readonly items: readonly TItem[]
  readonly page: CursorPageDto
}

/** @brief 后端简历文档 DTO / Backend Resume document DTO. */
export interface ResumeDocumentDto {
  readonly id: string
  readonly workspace_id: string
  readonly revision: number
  readonly title: string
  readonly locale: string
  readonly template: { readonly template_id: string; readonly template_version: string }
  readonly profile: Readonly<Record<string, unknown>>
  readonly sections: readonly Readonly<Record<string, unknown>>[]
  readonly style_intent: Readonly<Record<string, unknown>>
  readonly knowledge_source_id?: string | null
  readonly updated_at: string
}

/** @brief 后端模板 Manifest DTO / Backend template Manifest DTO. */
export type TemplateManifestDto = Readonly<Record<string, unknown>> & {
  readonly id: string
  readonly template_version: string
  readonly name: string
}

/** @brief 后端知识来源 DTO / Backend knowledge-source DTO. */
export type KnowledgeSourceDto = Readonly<Record<string, unknown>> & {
  readonly id: string
  readonly workspace_id: string
  readonly name: string
  readonly source_type: string
  readonly updated_at: string
}
