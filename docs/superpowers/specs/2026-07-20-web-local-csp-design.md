# Web 本地联调 CSP 修复设计

> **状态：已归档（Archived）。** 本文只记录历史阶段设计，不是现行产品能力说明。[ADR 0002](../../adr/0002-protect-production-api-truth.md)、固定的共享契约与当前部署文档为权威来源。

## 目标

允许从 `http://127.0.0.1:5173` 提供的 Web 开发页面访问配置为
`http://127.0.0.1:8000` 的项目后端，消除浏览器因 CSP `connect-src` 拦截而产生的
`TypeError: Failed to fetch`。

## 方案

只修改 `apps/web/index.html` 的开发 Web CSP，在现有
`connect-src 'self' http://localhost:* ws://localhost:*` 中加入
`http://127.0.0.1:*`。保留现有来源，不扩大脚本、样式、图片或其他资源权限。

本次不修改 Electron CSP，不修改后端 CORS、监听地址或任何 `workspace-back/` 实现。

## 验证

新增一个读取真实 Web HTML 的回归测试，断言 `connect-src` 同时保留现有规则并允许
`http://127.0.0.1:*`。先观察测试因缺少该来源失败，再完成最小 HTML 修改并观察测试通过。
随后运行相关前端测试，并刷新本地 Web 页面确认简历和知识库能够通过真实 HTTP Gateway
加载后端数据。

## 风险边界

新增权限仅匹配回环地址上的 HTTP 端口，目的是支持本地开发联调；不会允许任意远程主机，
也不会向前端暴露密钥或放宽后端身份边界。
