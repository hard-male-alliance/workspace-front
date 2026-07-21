/** @file 正式产品的本地演示 adapter 公开入口 / Public local-demo adapter entry for production products. */

export { DemoInterviewGateway } from './contexts/interview/infrastructure/memory/gateway'
export { DemoWorkspaceGateway } from './contexts/workspace/infrastructure/memory/gateway'
export type { DemoGatewayMode, DemoGatewayOptions } from './infrastructure/memory/options'
