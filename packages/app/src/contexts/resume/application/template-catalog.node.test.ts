/** @file Resume Template 渐进目录应用服务测试 / Resume Template progressive-catalog application-service tests. */

import { describe, expect, it, vi } from 'vitest'

import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { asUiResumeTemplateCursor } from '../domain/creation'
import type { UiTemplateReference } from '../domain/document'
import type { UiTemplateManifest } from '../domain/models'
import type { ResumeTemplateCatalogPort } from './resume-creation'
import {
  createResumeTemplateCatalogProgress,
  loadNextResumeTemplateCatalogPage,
  loadPinnedResumeTemplate,
  ResumeTemplateCatalogCursorLoopError
} from './template-catalog'

/**
 * @brief 构造目录测试使用的完整不可变模板 / Build a complete immutable Template for catalog tests.
 * @param id Template identity / Template identity.
 * @param version 不可变版本 / Immutable version.
 * @param name 展示名 / Display name.
 * @return 最小但完整的 TemplateManifest / Minimal but complete TemplateManifest.
 */
function template(id: string, version: string, name: string): UiTemplateManifest {
  return {
    bulletStyleTokens: ['disc'],
    capabilities: {
      maxColumns: 1,
      supportsCustomSections: true,
      supportsPhoto: false,
      supportsSidebar: false,
      supportsSourceMap: true
    },
    dateFormatTokens: ['yyyy_mm'],
    description: null,
    fontFamilyTokens: ['sans_clean'],
    id: asUiOpaqueId<'template'>(id),
    name,
    previewUrl: null,
    publishedAt: '2026-07-23T00:00:00.000Z',
    settings: [],
    supportedLocales: ['zh-SG'],
    supportedOutputFormats: ['pdf'],
    supportedPageSizes: ['A4'],
    supportedSectionKinds: ['custom'],
    version,
    zones: [
      {
        acceptedSectionKinds: ['custom'],
        id: 'main',
        labelKey: 'template.zone.main',
        maxSections: null
      }
    ]
  }
}

/** @brief Resume 固定的历史模板 / Historical Template pinned by the Resume. */
const PINNED_TEMPLATE = template('tpl_catalog_pinned', '0.9.0', 'Pinned Historical')
/** @brief Resume 固定模板引用 / Template reference pinned by the Resume. */
const PINNED_REFERENCE: UiTemplateReference = {
  templateId: PINNED_TEMPLATE.id,
  templateVersion: PINNED_TEMPLATE.version
}
/** @brief 公开目录中的最新模板 / Latest Template in the public catalog. */
const LATEST_TEMPLATE = template('tpl_catalog_latest', '1.0.0', 'Latest')

describe('Resume Template progressive catalog', (): void => {
  it('reads the exact pinned manifest before any optional catalog page', async (): Promise<void> => {
    /** @brief 观察端口调用顺序 / Observed port-call order. */
    const calls: string[] = []
    /** @brief 固定返回精确模板的目录端口 / Catalog port returning the exact Template. */
    const catalog: ResumeTemplateCatalogPort = {
      getTemplate(reference): Promise<UiTemplateManifest> {
        calls.push(`exact:${reference.templateVersion}`)
        return Promise.resolve(PINNED_TEMPLATE)
      },
      listTemplatePage(): Promise<never> {
        calls.push('page')
        return Promise.reject(new Error('The initial pinned read must not fetch a directory page.'))
      }
    }

    /** @brief 精确优先读取的 manifest / Manifest loaded exact-first. */
    const pinned = await loadPinnedResumeTemplate(
      catalog,
      PINNED_REFERENCE,
      new AbortController().signal
    )

    expect(pinned).toEqual(PINNED_TEMPLATE)
    expect(calls).toEqual(['exact:0.9.0'])
    expect(createResumeTemplateCatalogProgress(pinned)).toEqual({
      hasMore: true,
      nextCursor: null,
      requestedCursors: [],
      templates: [PINNED_TEMPLATE]
    })
  })

  it('loads one page per call and deduplicates by Template ID plus version', async (): Promise<void> => {
    /** @brief 首次目录页调用 / First catalog-page invocation. */
    const listTemplatePage = vi.fn<ResumeTemplateCatalogPort['listTemplatePage']>(() =>
      Promise.resolve({
        hasMore: true,
        items: [
          { ...PINNED_TEMPLATE, name: 'Duplicate must not replace exact pinned' },
          LATEST_TEMPLATE
        ],
        nextCursor: asUiResumeTemplateCursor('cursor_catalog_second')
      })
    )
    /** @brief 只测试分页的目录端口 / Catalog port used only for pagination. */
    const catalog: ResumeTemplateCatalogPort = {
      getTemplate: (): Promise<never> => Promise.reject(new Error('Unexpected exact read.')),
      listTemplatePage
    }

    /** @brief 合并一页后的渐进状态 / Progressive state after merging one page. */
    const progress = await loadNextResumeTemplateCatalogPage(
      catalog,
      createResumeTemplateCatalogProgress(PINNED_TEMPLATE),
      new AbortController().signal
    )

    expect(listTemplatePage).toHaveBeenCalledTimes(1)
    expect(listTemplatePage).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: null, limit: 50 })
    )
    expect(progress).toMatchObject({
      hasMore: true,
      nextCursor: 'cursor_catalog_second',
      requestedCursors: [null]
    })
    expect(progress.templates).toEqual([PINNED_TEMPLATE, LATEST_TEMPLATE])
  })

  it('fails closed when the service repeats a consumed opaque cursor', async (): Promise<void> => {
    /** @brief 重复上一请求 cursor 的坏目录端口 / Broken catalog port repeating the previous request cursor. */
    const repeatedCursor = asUiResumeTemplateCursor('cursor_catalog_repeat')
    /** @brief 已读取首页后的进度 / Progress after the first page has been read. */
    const progress = {
      hasMore: true as const,
      nextCursor: repeatedCursor,
      requestedCursors: [null] as const,
      templates: [PINNED_TEMPLATE]
    }
    /** @brief 返回 cursor loop 的目录端口 / Catalog port returning a cursor loop. */
    const catalog: ResumeTemplateCatalogPort = {
      getTemplate: (): Promise<never> => Promise.reject(new Error('Unexpected exact read.')),
      listTemplatePage: () =>
        Promise.resolve({ hasMore: true, items: [], nextCursor: repeatedCursor })
    }

    await expect(
      loadNextResumeTemplateCatalogPage(catalog, progress, new AbortController().signal)
    ).rejects.toBeInstanceOf(ResumeTemplateCatalogCursorLoopError)
  })
})
