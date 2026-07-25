# Web 单页应用部署

`apps/web` 使用 React Router 的 `BrowserRouter`。生产 Web 宿主必须把不匹配静态资源的应用路径重写到 `/index.html`，再由客户端路由渲染对应页面。

## 必须保留的区别

- 已存在的静态资源（例如 `/assets/*.js`、`/assets/*.css`）按文件本身响应，并可使用带内容哈希的长期缓存策略。
- 不存在的带扩展名资源保留 `404`，避免入口回退掩盖资源发布问题。
- 无扩展名的产品路由回退到 `/index.html`；具体 rewrite 语法由 CDN、对象存储或 Web 服务器决定。

## 后端公开地址

Web 通过正式 Gateway 和 HTTP adapter 调用 API v2。生产 transport 的公开 Origin 固定为：

```text
https://api.hmalliances.org
```

业务路径位于该 Origin 的 `/api/v2` 下；OIDC discovery、OAuth issuer、JWT audience、绝对
`Location`、artifact URL 和 WebSocket URL 也必须使用同一个标准 HTTPS 主机并省略默认
443 端口。浏览器构建不接受 `VITE_API_BASE_URL`、`VITE_API_PROTOCOL`、
`VITE_API_HOSTNAME` 或 `VITE_API_PORT` 覆盖生产目标，避免运行时配置把 issuer、audience
和资源服务器拆成不一致的地址。

本地后端应用固定监听 `http://127.0.0.1:8000`，它是反向代理上游而不是公开
Origin。无需生产服务器即可对该上游执行健康检查、metadata、CORS 和 API v2
契约烟测；浏览器应用仍保持 production transport，不会因 `.env` 静默改成 loopback。
需要让真实浏览器 OAuth 流量进入本地进程时，应在本机提供受信任的
`https://api.hmalliances.org` TLS/反向代理映射，再转发至 `127.0.0.1:8000`，不能通过
修改 issuer 或关闭校验来绕过身份边界。

所有 `VITE_*` 值都会暴露给浏览器，只能保存公开地址。数据库 DSN、模型 API Key、HMAC/JWT 私钥、Dashboard token 和可信代理身份断言不得进入前端配置。

## 当前联调边界

Web 与 Electron 的 Workspace、Resume、Interview、Knowledge 使用同一组正式 API v2
Gateway。Web OAuth public client ID 通过 `VITE_OAUTH_CLIENT_ID` 配置；它不是密钥，但必须
与 Authorization Server 为当前精确 redirect URI 注册的 client ID 一致。前端不会把
access token 写入 `VITE_*`、URL query 或持久化存储，也不会回退到 v1 或内存 Mock。

当前 HTTP 边界统一发送经校验的 `Accept-Language`、每请求唯一 `X-Request-Id` 和会话
提供的 Bearer token。上传会话、Agent SSE、WebSocket 或 WebRTC 仍只按已冻结的契约能力
启用；未实现的实时帧协议不会由前端虚构。

Resume PDF 保存通过独立宿主端口表达，共享应用只传递 artifact ID 与已净化的建议文件名，Web 边界会再次校验其规范形式。Web adapter 在每次用户动作中以 `credentials: 'omit'` 重新读取权威 artifact metadata，拒绝 30 秒安全窗口内即将过期的 URL，并以统一 60 秒总时限限制 metadata、PDF 响应流与完整性校验。只有最终响应的状态、媒体类型、实际字节数与 SHA-256 全部通过后，才创建一次性 Blob URL 并触发受控 `anchor`。Fetch 会先解码支持的 `Content-Encoding`，因此压缩响应的传输 `Content-Length` 不用于校验解码字节；如果 CORS 没有暴露编码 header，也会跳过这个有歧义的提前检查，但 25 MiB 上限、最终 size 与 SHA-256 仍全部执行。这避免依赖跨源 `download` 属性的不稳定语义；共享应用包不直接操作 `fetch`、Blob 或 `download`。页面仍无法观察浏览器之后的文件写入结果，因此 Web 只播报“下载已开始”，不误报“文件已保存”。该路径仍依赖上游冻结正式 Bearer 传播与 Web CORS；当前不携带 Cookie，也不会用任意 HTTPS URL 替代缺失的信任清单。

现有 PDF 预览继续使用 sandboxed iframe 保持界面语义，但 iframe 导航不能像 Fetch adapter 一样显式设置 `credentials: 'omit'`；sandbox 是内容隔离边界，不是身份协议。正式身份冻结时必须同时确定预览采用 Bearer-aware proxy、经完整性校验的 Blob URL 或其他可审计方案，在此之前不能把预览 smoke 解释为认证完成。
