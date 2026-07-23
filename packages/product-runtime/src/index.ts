/** @file 产品运行时的 API v2 依赖装配 / API v2 dependency composition for product runtimes. */

import type { AppGateways } from '@ai-job-workspace/app/application'
import { HttpKnowledgeGateway } from '@ai-job-workspace/app/http'
import {
  createApiV2Client,
  createApiV2PublicClient,
  type ApiV2AuthenticationPort,
  type ApiV2TransportProfile
} from '@ai-job-workspace/product-api-v2'

import {
  createApiV2IdentityGateway,
  createApiV2ResumeCreationGateway,
  createApiV2ResumeGateway,
  createApiV2ResumeTemplateCatalog,
  createApiV2WorkspaceOperationsGateway,
  createApiV2WorkspaceGateway,
  createUnavailableInterviewGateway
} from './api-v2-gateways'
import { createApiV2ResumeReviewGateway } from './resume-review-gateway'

export { ApiV2CapabilityUnavailableError } from './api-v2-gateways'

/** @brief 产品宿主向 v2-only 组合根声明的能力 / Capabilities declared by a product host to the v2-only composition root. */
export interface ProductGatewayOptions {
  /** @brief 当前界面的 BCP 47 语言 / BCP 47 language of the current UI. */
  readonly locale: string
  /** @brief 当前内存会话的 Access Token 生命周期端口 / Access-token lifecycle port for the current in-memory session. */
  readonly authentication: ApiV2AuthenticationPort
  /** @brief 默认固定生产；受控测试直连必须显式选择 / Production is fixed by default; controlled direct testing must be selected explicitly. */
  readonly transportProfile?: ApiV2TransportProfile
}

/**
 * @brief 创建正式产品宿主共用的 API v2 Gateway 集合 / Create the API v2 gateway set shared by production product hosts.
 * @param options 内存认证生命周期、界面语言与显式 transport profile / In-memory authentication lifecycle, UI language, and explicit transport profile.
 * @return Web 与 Electron 共用的 v2-only 业务依赖 / v2-only business dependencies shared by Web and Electron.
 * @note 未接入的 v2 能力显式失败；该组合根没有 v1 或内存数据回退 / Unconnected v2 capabilities fail explicitly; this composition root has no v1 or in-memory-data fallback.
 */
export function createProductGateways(options: ProductGatewayOptions): AppGateways {
  /** @brief 固定 origin 且逐请求读取 Bearer token 的 API v2 客户端 / API v2 client with a fixed origin and per-request Bearer-token reads. */
  const client = createApiV2Client({
    acceptLanguage: options.locale,
    authentication: options.authentication,
    ...(options.transportProfile === undefined
      ? {}
      : { transportProfile: options.transportProfile })
  })
  /** @brief 不读取或发送 Bearer 的全局公开 API v2 客户端 / Global public API v2 client that neither reads nor sends a Bearer token. */
  const publicClient = createApiV2PublicClient({
    acceptLanguage: options.locale,
    ...(options.transportProfile === undefined
      ? {}
      : { transportProfile: options.transportProfile })
  })

  return {
    identity: createApiV2IdentityGateway(client),
    interview: createUnavailableInterviewGateway(),
    knowledge: new HttpKnowledgeGateway(client),
    resume: createApiV2ResumeGateway(client, client, client),
    resumeReview: createApiV2ResumeReviewGateway(client, client, client),
    resumeCreation: createApiV2ResumeCreationGateway(client),
    resumeTemplates: createApiV2ResumeTemplateCatalog(publicClient),
    workspace: createApiV2WorkspaceGateway(client),
    workspaceOperations: createApiV2WorkspaceOperationsGateway(client)
  }
}
