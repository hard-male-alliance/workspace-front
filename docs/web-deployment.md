# Web 单页应用部署

`apps/web` 使用 React Router 的 `BrowserRouter`。因此生产 Web 宿主必须把不匹配静态资源的应用路径重写到 `/index.html`；刷新产品路由时，宿主应返回入口文档，再由客户端路由渲染对应页面。

## 必须保留的区分

- 已存在的静态资源（例如 `/assets/*.js`、`/assets/*.css`）应按文件本身响应，并可使用带内容哈希的长期缓存策略。
- 不存在的带扩展名资源不应错误地回退到入口文档，应保留 `404`，以避免掩盖资源发布问题。
- 无扩展名的产品路由应回退到 `/index.html`；具体 rewrite 语法由选用的 CDN、对象存储或 Web 服务器决定，故本仓库不伪造平台配置。

## 后端 API 配置

Web 构建通过三个公开的 Vite 环境变量配置后端：

- `VITE_API_PROTOCOL`：默认 `https`，只接受 `http` 或 `https`；
- `VITE_API_HOSTNAME`：默认 `api.hmalliances.org`；
- `VITE_API_PORT`：可选；留空时 HTTP 使用 80，HTTPS 使用 443。

客户端只接受 origin 配置，并统一在内部追加 `/api/v1`。生产环境需要允许 Web Origin，并开放 `If-Match`、`Idempotency-Key` 请求头和 `ETag` 响应头；这些变量会进入浏览器构建物，不能存放密钥。
