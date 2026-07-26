/** @file API v2 产品 Origin 常量 / API v2 product-origin constants. */

/** @brief API v2 固定生产 Origin / Frozen API v2 production origin. */
export const API_V2_PRODUCTION_ORIGIN = 'https://api.hmalliances.org' as const

/** @brief API v2 受控测试直连 Origin / Controlled API v2 direct-test origin. */
export const API_V2_CONTROLLED_TEST_ORIGIN = 'http://dev.hmalliances.org:9000' as const

/** @brief Interview realtime 固定生产 Origin / Frozen Interview realtime production origin. */
export const INTERVIEW_REALTIME_PRODUCTION_ORIGIN = 'wss://api.hmalliances.org' as const

/** @brief Interview realtime 受控测试 Origin / Controlled Interview realtime test origin. */
export const INTERVIEW_REALTIME_CONTROLLED_TEST_ORIGIN = 'ws://dev.hmalliances.org:9000' as const
