# 静态资源缓存响应头发布清单

## 变更清单

- 服务模块：`src/server.js`
  - 静态应用文件响应统一增加 `cache-control`。
  - `.html` 响应：`no-cache`，避免 SPA 入口和路由 fallback 长期缓存导致发布后仍加载旧资源。
  - `_app/immutable` 目录下的构建产物：`public, max-age=31536000, immutable`。
  - 其他常见静态资源：`public, max-age=3600`。
- 测试模块：`test/server.test.js`
  - 覆盖安装后静态应用的 HTML、hash 资源、非 hash 资源三类缓存响应头。
- 配置/依赖：无新增配置项、无新增 npm 依赖、无数据库/数据迁移。

## 本地验证

- `node --test test/server.test.js`：2/2 通过。
- `npm test`：26/26 通过。

## 发布步骤

1. 合并包含 `src/server.js` 和 `test/server.test.js` 的变更。
2. 发布前在目标构建环境执行 `npm test`，确认全量测试通过。
3. 部署服务并访问任一静态应用：
   - `/x/<name>/` 应返回 `cache-control: no-cache`。
   - `/x/<name>/_app/immutable/...` 资源应返回 `cache-control: public, max-age=31536000, immutable`。
4. 观察静态应用首屏加载、路由 fallback、资源 404 指标与访问日志。

## 回滚要点

- 回滚触发条件：静态应用入口无法刷新到新版本、资源缓存策略导致异常 404/旧资源混用、或代理/CDN 与新响应头策略冲突。
- 代码回滚：撤回 `src/server.js` 中 `staticCacheHeaders` 调用及 helper，恢复静态文件仅返回 `content-type` 的行为。
- 测试回滚：撤回 `test/server.test.js` 中缓存响应头断言和新增测试资源 fixture。
- 回滚验证：重新执行 `npm test`，并确认静态应用请求不再包含本次新增的 `cache-control` 策略。
