# Web 单页应用部署

`apps/web` 使用 React Router 的 `BrowserRouter`。因此生产 Web 宿主必须把不匹配静态资源的应用路径重写到 `/index.html`；例如刷新 `/knowledge/ks_mock_git/visibility` 时，宿主应返回入口文档，再由客户端路由渲染对应页面。

## 必须保留的区分

- 已存在的静态资源（例如 `/assets/*.js`、`/assets/*.css`）应按文件本身响应，并可使用带内容哈希的长期缓存策略。
- 不存在的带扩展名资源不应错误地回退到入口文档，应保留 `404`，以避免掩盖资源发布问题。
- 无扩展名的产品路由应回退到 `/index.html`；具体 rewrite 语法由选用的 CDN、对象存储或 Web 服务器决定，故本仓库不伪造平台配置。

## v0.1.0 边界

本阶段 Web 构建物没有后端 transport。部署配置不应因为当前 Mock 页面而引入虚构的 API proxy、SSE 或 WebRTC 信令规则；这些配置应在相应 `contract/` entrypoint 冻结后再加入。
