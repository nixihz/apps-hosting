# 管理/已安装应用拖拽排序可行性评估

## 结论

可行，改动范围较小。当前“管理台/已安装应用”列表由 `src/server.js` 的 `renderAdmin()` 直接服务端渲染，数据来自 `loadRegistry().apps`；应用持久化数据保存在 `APPS_DATA_DIR/registry.json` 的 `apps` 数组中。只要把管理员拖拽后的顺序写回 `registry.apps`（或写入每个 app 的排序字段并在读取时排序），即可在管理台、首页、部署选择框等使用同一顺序。

推荐方案：**以 `registry.apps` 数组顺序作为主排序，辅以每个 app 的 `order` 数字字段作为显式排序值**。API 保存时同时重排数组并写入 `order`，这样兼容现有代码中大量依赖数组顺序的地方，也便于后续查询和迁移。

## 当前代码依据

- `src/store.js`
  - `registryFile()` 指向 `dataDir()/registry.json`。
  - `loadRegistry()` 返回 `{ apps }`，不做排序。
  - `saveRegistry(registry)` 直接 JSON 写回 registry。
  - `upsertApp(record)` 新安装应用默认 `registry.apps.push(...)`，已有应用原地合并。
  - `reconcileInstalledApps()` 自动恢复应用时追加到 `apps` 尾部。
- `src/server.js`
  - `GET /api/x`：`(await loadRegistry()).apps.map(...)` 返回列表。
  - `renderAdmin()`：`const apps = (await loadRegistry()).apps;` 后渲染表格。
  - `renderHome()`、`renderDeployWizard()` 等也使用 `loadRegistry().apps` 的自然顺序。
  - 鉴权复用 `canAdmin(req, session)`，支持 2FA 会话、`APPS_ADMIN_TOKEN` 和具备权限的 API token。
- `src/deployments.js`
  - `deployApp()` 更新应用时使用 `registry.apps = registry.apps.filter(...).concat(next)`，会把重新部署的应用移动到最后；实现排序时需要修正，避免部署破坏手工顺序。
- `src/openapi.js`
  - 需要补充新增排序 API 文档。

## 数据存储建议

`registry.json` 示例：

```json
{
  "apps": [
    { "name": "typorb", "order": 0, "installedAt": "...", "updatedAt": "..." },
    { "name": "another", "order": 1, "installedAt": "...", "updatedAt": "..." }
  ]
}
```

规则：

1. `order` 为非负整数，按列表位置从 `0` 开始重算。
2. 排序 API 接收完整应用名数组，例如 `{ "names": ["typorb", "another"] }`。
3. API 校验必须覆盖全部已安装应用且不能重复/包含未知应用；否则返回 400，避免丢失应用。
4. 未设置 `order` 的历史数据按现有数组顺序初始化，无需一次性迁移文件；第一次保存顺序时补齐。
5. 新安装/自动恢复应用追加到尾部，`order` 设为当前最大值 + 1 或重算后的末尾序号。
6. 重新部署、回滚、启停、配置更新不应改变 `order` 和数组位置。

## API 建议

新增：`PUT /api/x/order`

- 权限：与启停/安装一致，使用 `canAdmin(req, session)`。
- 请求：`{ "names": ["app-a", "app-b", "app-c"] }`
- 响应：按新顺序返回公开应用列表，或返回 `{ ok: true, apps: [...] }`。
- 错误：
  - 401：未授权。
  - 400：`names` 不是数组、重复、缺少应用、包含未知应用。

可选新增：`POST /api/x/:name/move`

- 请求：`{ "before": "target-name" }` 或 `{ "after": "target-name" }`。
- 适合移动单项，但前端拖拽结束后一次性提交完整顺序更简单、更幂等。

## 前端交互建议

当前管理台是内嵌 HTML/JS，无前端构建工具，因此可直接用 HTML5 Drag and Drop：

1. 在 `renderAdmin()` 的 `<tbody>` 或每个 `<tr>` 上增加 `draggable="true"` 和 `data-name`。
2. 增加一列“排序”或拖拽手柄（例如 `☰`），避免误拖操作按钮。
3. 拖拽结束后重排 DOM，并启用“保存排序”按钮。
4. 点击保存时读取所有 `tr[data-name]`，调用 `PUT /api/x/order`。
5. 保存成功后提示并刷新；失败时 alert 错误并可重新加载。
6. 移动端建议同时提供“上移/下移”按钮作为无鼠标兜底。

## 需要修改的文件

最小实现：

1. `src/store.js`
   - 新增 `normalizeAppOrder(registry)`：按数组位置补齐/重算 `order`。
   - 新增 `reorderApps(names)`：校验应用名集合，重排 `registry.apps`，写入 `order` 和 `updatedAt`。
   - `upsertApp()` 新增应用时设置末尾 `order`；已有应用保留 `order`。
   - `reconcileInstalledApps()` 自动恢复应用时设置末尾 `order`。
2. `src/server.js`
   - import `reorderApps`。
   - 在 `handleApi()` 中 `/api/x` GET 之后或之前新增 `PUT /api/x/order`，使用 `canAdmin()` 鉴权。
   - `renderAdmin()` 渲染 draggable 表格和保存排序脚本。
   - 如希望首页/市场按 `order` 确定顺序，确保它们使用已规范化的 `loadRegistry().apps`。
3. `src/deployments.js`
   - 修正 `deployApp()` 中 `filter(...).concat(next)` 导致部署后应用被移到末尾的问题：如果已有应用，按原 index 替换；不存在时追加，并设置末尾 `order`。
4. `src/openapi.js`
   - 补充 `PUT /api/x/order`。
5. `test/store.test.js` 或新增测试
   - 覆盖 `reorderApps()` 成功、重复/缺失/未知名称报错。
6. `test/server.test.js`
   - 覆盖未登录排序 401、登录后排序成功、`GET /api/x` 顺序变化、重新部署不破坏排序。

## 风险与注意事项

- 如果只保存 `order` 不重排 `registry.apps`，现有多处页面/API 仍按数组自然顺序展示，必须统一排序入口；因此推荐同时重排数组。
- `deployApp()` 当前会把应用移到列表尾部，这是实现拖拽排序时必须处理的兼容点。
- `findMountedApp(registry.apps, url.pathname)` 使用 apps 顺序匹配路由。由于 manifest 已禁止重复 route，排序不会改变路由解析语义；若未来允许嵌套路由，需要按 route 长度优先而非 app 顺序。
- 多管理员并发拖拽时最后一次保存覆盖前一次；当前文件存储没有版本号。需要强一致时可给 API 增加 `updatedAt`/etag 校验，但最小方案可接受最后写入生效。
