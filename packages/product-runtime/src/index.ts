/** @file 产品运行时的共享依赖装配 / Shared dependency composition for product runtimes. */

import type { AppGateways } from '@ai-job-workspace/app/application'
import type { Diagnostics } from '@ai-job-workspace/app/diagnostics'
import {
  createHttpClient,
  HttpInterviewGateway,
  type HttpInterviewGatewayOptions,
  HttpKnowledgeGateway,
  HttpResumeGateway,
  HttpWorkspaceGateway
} from '@ai-job-workspace/app/http'

/** @brief 产品宿主向共享组合根声明的真实能力 / Actual capabilities declared by a product host to the shared composition root. */
export interface ProductGatewayOptions {
  /** @brief 契约使用的 BCP 47 界面语言 / BCP 47 UI locale sent through the contract. */
  readonly locale: string
  /** @brief 当前正式产品宿主 / Current production product host. */
  readonly platform: 'web' | 'electron'
}

/**
 * @brief 构造当前已实现的 Interview 客户端策略 / Build the currently implemented Interview client policy.
 * @param options 产品宿主声明 / Product-host declaration.
 * @return 与真实前端能力一致的会话创建策略 / Session-creation policy matching actual frontend capabilities.
 * @note 当前客户端尚未实现媒体采集与实时传输，因此不得把浏览器引擎理论上支持的能力报告为产品能力。 / Media capture and realtime transport are not implemented yet, so browser-engine capabilities must not be reported as product capabilities.
 */
function createInterviewOptions(options: ProductGatewayOptions): HttpInterviewGatewayOptions {
  return {
    clientCapabilities: {
      platform: options.platform,
      supportedAudioCodecs: [],
      supportedVideoCodecs: [],
      webrtc: false,
      websocketBinary: false
    },
    inference: {
      allowExternalModelProcessing: false,
      allowProviderFallback: true,
      costTier: 'standard',
      dataRegion: 'cn',
      latencyBudgetMs: null,
      qualityTier: 'balanced'
    },
    locale: options.locale,
    media: {
      avatar: {
        avatarId: null,
        includeExpressionCues: false,
        includeVisemes: false,
        outputMode: 'audio_only',
        preferredAudioCodecs: ['opus'],
        preferredVideoCodecs: [],
        voiceId: null
      },
      fallbackTransport: 'none',
      maxVideoFps: 30,
      maxVideoHeight: 720,
      maxVideoWidth: 1280,
      screenShare: false,
      userAudio: false,
      userVideo: false
    },
    recording: {
      consentVersion: null,
      recordAudio: false,
      recordVideo: false,
      retentionDays: 0,
      storeTranscript: true,
      userConsentAt: null
    }
  }
}

/**
 * @brief 创建正式产品宿主共用的 Gateway 集合 / Create the gateway set shared by production product hosts.
 * @param apiBaseUrl 已由宿主验证的产品 API origin / Product API origin already validated by the host.
 * @param diagnostics 统一 HTTP 边界使用的诊断端口 / Diagnostics port used by the unified HTTP boundary.
 * @param options 产品宿主的显式运行时能力 / Explicit runtime capabilities of the product host.
 * @return Web 与 Electron 共用的业务依赖集合 / Business dependencies shared by Web and Electron.
 * @note 所有上下文只使用共享契约支持的正式 HTTP 能力；未冻结能力必须显式失败，禁止退回演示数据。 / Every context uses only formal HTTP capabilities supported by the shared contract; unfrozen capabilities must fail explicitly and never fall back to demo data.
 */
export function createProductGateways(
  apiBaseUrl: string,
  diagnostics: Diagnostics,
  options: ProductGatewayOptions
): AppGateways {
  /** @brief 共享 HTTP 客户端 / Shared HTTP client. */
  const client = createHttpClient({
    acceptLanguage: options.locale,
    baseUrl: apiBaseUrl,
    diagnostics
  })

  return {
    interview: new HttpInterviewGateway(client, createInterviewOptions(options)),
    knowledge: new HttpKnowledgeGateway(client),
    resume: new HttpResumeGateway(client),
    workspace: new HttpWorkspaceGateway(client)
  }
}
