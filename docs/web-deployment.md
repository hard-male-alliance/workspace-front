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

完整 URL 与拆分配置不能同时出现。四项均未设置时，构建使用 PR #2 确认的默认部署入口 `https://api.hmalliances.org`。配置只允许 HTTP(S) origin，不能包含凭证、路径、query 或 fragment。

所有 `VITE_*` 值都会暴露给浏览器，只能保存公开地址。数据库 DSN、模型 API Key、HMAC/JWT 私钥、Dashboard token 和可信代理身份断言不得进入前端配置。

## 当前联调边界

Web 的 Resume 与 Knowledge 使用真实 HTTP Gateway；Workspace 与 Interview 继续使用 Mock Gateway。不得为未冻结的 SSE、WebSocket、WebRTC 或上传会话协议虚构代理规则。Electron renderer 继续使用现有 Mock 装配和窄平台桥接。
