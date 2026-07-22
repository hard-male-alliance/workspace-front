# Web 单页应用部署

`apps/web` 使用 React Router 的 `BrowserRouter`。生产 Web 宿主必须把不匹配静态资源的应用路径重写到 `/index.html`，再由客户端路由渲染对应页面。

## 必须保留的区别

- 已存在的静态资源（例如 `/assets/*.js`、`/assets/*.css`）按文件本身响应，并可使用带内容哈希的长期缓存策略。
- 不存在的带扩展名资源保留 `404`，避免入口回退掩盖资源发布问题。
- 无扩展名的产品路由回退到 `/index.html`；具体 rewrite 语法由 CDN、对象存储或 Web 服务器决定。

## 后端公开地址

Web 通过 Gateway 和 HTTP adapter 调用当前项目后端，业务路径统一位于公开 origin 的 `/api/v1` 下。部署时使用以下两种互斥配置之一：

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

或：

```dotenv
VITE_API_PROTOCOL=https
VITE_API_HOSTNAME=api.hmalliances.org
VITE_API_PORT=443
```

完整 URL 与拆分配置不能同时出现。四项均未设置时，构建使用 PR #2 确认的默认部署入口 `https://api.hmalliances.org`。配置不能包含凭证、路径、query 或 fragment；公网产品 API 必须使用 HTTPS，明文 HTTP 只允许 `localhost` 或 `127.0.0.1` 本地开发 origin。

所有 `VITE_*` 值都会暴露给浏览器，只能保存公开地址。数据库 DSN、模型 API Key、HMAC/JWT 私钥、Dashboard token 和可信代理身份断言不得进入前端配置。

## 当前联调边界

Web 与 Electron 的 Workspace、Resume、Interview、Knowledge 使用同一组正式 HTTP Gateway。不得为未冻结的上传会话、Agent SSE、WebSocket 或 WebRTC 协议虚构代理规则；对应界面应保持诚实的不可用状态。两种宿主共享业务装配语义，但分别拥有环境配置与安全启动边界。

当前 HTTP 边界已统一发送经校验的 `Accept-Language` 与每请求唯一 `X-Request-Id`，但公开配置只确定 API origin，并不提供身份。正式契约要求除公开模板预览外携带 `Authorization: Bearer …`，但授权端点、client ID、scope 与 token 生命周期尚未冻结，所以当前 adapter 不会伪造认证头，受保护的 Resume/Knowledge 请求也不能据此宣称生产联调完成。生产启用条件记录在[契约待确认项](contract-open-questions.md)；任何 `VITE_*` token 方案都不被接受。

Resume PDF 保存通过独立宿主端口表达，共享应用只传递 artifact ID 与已净化的建议文件名，Web 边界会再次校验其规范形式。Web adapter 在每次用户动作中以 `credentials: 'omit'` 重新读取权威 artifact metadata，拒绝 30 秒安全窗口内即将过期的 URL，并以统一 60 秒总时限限制 metadata、PDF 响应流与完整性校验。只有最终响应的状态、媒体类型、内容编码、25 MiB 上限、实际字节数与 SHA-256 全部通过后，才创建一次性 Blob URL 并触发受控 `anchor`。这避免依赖跨源 `download` 属性的不稳定语义；共享应用包不直接操作 `fetch`、Blob 或 `download`。页面仍无法观察浏览器之后的文件写入结果，因此 Web 只播报“下载已开始”，不误报“文件已保存”。该路径仍依赖上游冻结正式 Bearer 传播与 Web CORS；当前不携带 Cookie，也不会用任意 HTTPS URL 替代缺失的信任清单。

现有 PDF 预览继续使用 sandboxed iframe 保持界面语义，但 iframe 导航不能像 Fetch adapter 一样显式设置 `credentials: 'omit'`；sandbox 是内容隔离边界，不是身份协议。正式身份冻结时必须同时确定预览采用 Bearer-aware proxy、经完整性校验的 Blob URL 或其他可审计方案，在此之前不能把预览 smoke 解释为认证完成。
