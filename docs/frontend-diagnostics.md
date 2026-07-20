# 前端诊断数据协议

本文定义前端运行时（Web renderer 与 Electron renderer）向独立诊断接收器发送的最小协议。它不属于 `contract/` 中的业务 API，也不携带业务资源、用户内容或认证信息。

## 启用规则

诊断上传是显式选择加入（opt-in）：

- Web 仅当 `VITE_DIAGNOSTICS_HOSTNAME` 与 `VITE_DIAGNOSTICS_PORT` 均有效时启用；`VITE_DIAGNOSTICS_PROTOCOL` 可选，默认 `https`。
- Electron 仅当 `AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME` 与 `AI_JOB_WORKSPACE_DIAGNOSTICS_PORT` 均有效时启用；`AI_JOB_WORKSPACE_DIAGNOSTICS_PROTOCOL` 可选，默认 `https`。
- 缺失、部分配置或非法配置均关闭远程上传，产品业务功能继续运行，并保留本地结构化日志。

两个宿主都固定投递到：

```text
POST {origin}/api/v1/frontend-diagnostics/batches
Content-Type: application/json
```

`origin` 必须是无凭据、无路径、无 query/hash 的 CSP-safe HTTP(S) origin；端口范围为 `1..65535`。默认和公网配置只能使用 HTTPS；HTTP 只允许明确的本机开发目标 `localhost` 或 `127.0.0.1`。为避免 CSP 无法匹配或产生歧义，不接受 IPv6、非 loopback IPv4、通配符、URL/CSP 分隔符；国际化域名（IDN, Internationalized Domain Name）会先规范化为 punycode。

接收器必须处理 `Content-Type: application/json` 触发的 CORS 预检（preflight）：

- 对 Web：以实际发布页面的 origin 精确设置 `Access-Control-Allow-Origin`；不得依赖宽泛的 CSP/CORS 来源。
- 对 Electron：精确允许 `ai-job-workspace://renderer`；主进程只为该受 CSP 约束的自定义 scheme 开启 CORS。
- 两者均应返回 `Access-Control-Allow-Methods: POST` 和 `Access-Control-Allow-Headers: Content-Type`。客户端固定 `credentials: 'omit'`，因此无需也不得开启 `Access-Control-Allow-Credentials`。

发布构建的 CSP 只放行上述已验证 origin，且不会包含路径或通配符。

## Wire payload

```json
{
  "schema_version": 1,
  "sent_at": "2026-07-21T00:00:00.000Z",
  "resource": {
    "service_name": "ai-job-workspace-frontend",
    "service_version": "0.1.0",
    "platform": "web",
    "session_id": "a random in-memory session identifier"
  },
  "events": [
    {
      "event_id": "a stable per-event identifier",
      "name": "http.request_failed",
      "level": "error",
      "occurred_at": "2026-07-21T00:00:00.000Z",
      "attributes": {
        "operation": "knowledge.search.create",
        "request_id": "a local random request identifier",
        "status": 503,
        "duration_ms": 247
      }
    }
  ]
}
```

传输是非持久化的 best-effort：在当前 renderer 存活期间，未获 `2xx` 确认的 batch 会按有上限的指数退避（exponential backoff）重试；刷新、崩溃或进程退出可丢弃内存队列。接收器应以 `event_id` 去重、限制 body 大小和速率，并把客户端提供的全部字段视为不可信输入。非 `2xx`、网络错误、跨域失败或重定向绝不能影响业务请求或触发递归上传。

## 数据边界

事件名是低基数、预先注册的稳定值；属性由类型化 allowlist 限制。允许的信息包括：操作名、HTTP 方法/状态、时长、稳定错误类别、请求关联 ID、平台和应用版本。

绝不写入或上传：简历/提案/转录文本、知识搜索词和正文、文件名/文件内容、URL query/路径参数、请求与响应 body、认证头、Cookie、token、用户身份、错误原文或 stack。字符串属性须通过运行时枚举/格式 allowlist；字符串会去除控制字符并截断。上传请求固定为 `credentials: 'omit'`、`referrerPolicy: 'no-referrer'`、`redirect: 'error'`、`cache: 'no-store'`，故不会携带 Cookie/Referer，也不会将 payload 跟随重定向。前端只保留有界内存队列，不使用 localStorage、IndexedDB 或数据库，因此本次没有既有业务数据 migration。

## 运行语义

- 日志和诊断事件在业务操作之外同步入队，不等待网络。
- 上传器单飞（single-flight）、有界批量和有界队列；导出中的 batch 从待发送队列原子移出，容量淘汰绝不触及它；上传失败不会递归产生新事件。
- Web 在 `visibilitychange` 进入 hidden 时尝试 flush，不注册 `unload`/`beforeunload`。
- 重点覆盖应用启动、未捕获异常、HTTP 结果、异步资源加载、关键写操作与任务终态；不记录键盘输入、普通 render、逐次轮询 tick 或点击流。

该模型与 OpenTelemetry Logs 的事件名、时间、严重级别、资源和属性分层对齐，但当前不引入完整 SDK；未来可在不影响 feature 层的前提下替换 exporter。

## 设计依据

- [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) 将时间、严重级别、事件名、资源和属性分层；因此本协议把稳定资源字段放到 batch，把变化字段限制在事件的类型化属性中。
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) 要求日志数据最小化并避免敏感数据；因此这里采用闭集事件名与 allowlist 属性，而不是通用对象透传。
- [MDN RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit) 与 [CSP Level 3](https://www.w3.org/TR/CSP3/) 是传输选项和 `connect-src` 限制的实现依据。
