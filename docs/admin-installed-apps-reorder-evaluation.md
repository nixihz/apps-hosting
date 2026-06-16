# 管理台「已安装应用」拖拽排序可行性评估

## 结论

可行，当前项目的应用列表顺序已经天然由 `registry.json` 中 `apps` 数组顺序决定；管理台 `/admin`、`GET /api/x`、首页 `/` 等读取时均直接使用 `loadRegistry().apps` 或在其基础上过滤，没有额外数据库或 ORM 层。实现拖拽排序的最小方案是在应用记录上增加持久化排序字段，并提供管理员重排 API，由管理台表格拖拽后提交新顺序。

## 当前代码证据

- `src/store.js`
  - `registryFile()` 指向数据目录下的 `registry.json`。
  - `loadRegistry()` / `saveRegistry()` 直接读写 `{ apps: [...] }`。
  - `upsertApp(record)` 新应用追加到 `registry.apps`，更新应用时保留旧字段并覆盖新字段。
  - `reconcileInstalledApps()` 在 registry 缺失时从 `apps/` 目录恢复应用，当前按文件系统目录遍历顺序追加。
- `src/installer.js`
  - `installAppFromDirectory()` 安装后调用 `upsertApp({ name, path, manifest, enabled: true })`，当前没有设置排序字段。
- `src/server.js`
  - `/admin` 在 `renderAdmin()` 中使用 `(await loadRegistry()).apps` 直接渲染表格。
  - `GET /api/x` 直接返回 `(await loadRegistry()).apps.map(publicApp)`。
  - 首页 `/` 在 `renderHome()` 中基于 registry apps 过滤展示。
  - 管理 API 已有 `canAdmin(req, session)` 权限模式，可复用于重排接口。
- `src/openapi.js`、`README.md` 目前只列出应用列表、部署、配置等 API，未包含排序 API。
- `bin/apps.js` 的 `list()` 也直接按 registry apps 顺序输出。

## 推荐数据模型

建议在每个应用记录上增加平台级字段：

```json
{
  "name": "team-nav",
  "sortOrder": 1000,
  "updatedAt": "2026-05-17T00:00:00.000Z"
}
```

不建议写入 `manifest` / `apps.yaml`，原因：

1. 排序是平台安装实例的管理状态，不是应用包自身元数据。
2. 同一应用包在不同环境/租户可有不同管理顺序。
3. 现有 `upsertApp()` 会保留 registry 上的旧字段，排序字段放在 app record 顶层更容易兼容部署/更新。

排序规则建议：

- 读取列表统一调用一个 helper，例如 `sortApps(apps)`：先按 `sortOrder` 升序，再按 `installedAt`，最后按 `name` 稳定兜底。
- 存储时支持旧数据迁移：没有 `sortOrder` 的应用按当前数组顺序补齐 `1000, 2000, 3000...`。
- 安装新应用时默认放末尾：`max(sortOrder) + 1000`；如果旧数据无字段，则先规范化再追加。
- 重排后可直接把传入顺序重写为 `1000 * (index + 1)`，实现简单且便于以后插队。

## API 建议

新增管理员接口：

```http
PUT /api/x/order
Content-Type: application/json
Authorization: Bearer <admin token> 或管理员 cookie

{
  "names": ["team-nav", "data-query-tool", "hello-plugin"]
}
```

响应：

```json
{
  "ok": true,
  "apps": [
    { "name": "team-nav", "sortOrder": 1000 },
    { "name": "data-query-tool", "sortOrder": 2000 }
  ]
}
```

校验建议：

- 必须 `canAdmin(req, session)`。
- `names` 必须是数组、去重后长度与当前 registry apps 一致。
- 每个 name 必须存在；缺失、重复、未知应用返回 400。
- 保存前只更新 `sortOrder` 和 `updatedAt`，不要修改 `manifest`。
- 失败时不部分写入。

可选增量接口：

```http
PATCH /api/x/<name>/order
{ "before": "other-app" }
```

但 MVP 推荐 `PUT /api/x/order`，前端实现和后端校验都更直接。

## 前端交互建议

当前管理台是 `src/server.js` 中服务端拼接 HTML，无独立前端框架；可以原生实现：

- 在 `/admin` 表格中给 `<tbody>` 加 `id="appRows"`，每行 `<tr draggable="true" data-name="...">`。
- 增加「顺序」列和拖拽把手（如 `☰`），拖拽过程中用 CSS class 高亮目标位置。
- `dragstart` 保存当前行，`dragover` 阻止默认，按鼠标位置插入到目标行前/后。
- `drop` 后收集 `tbody.querySelectorAll('tr')` 的 `data-name`，调用 `PUT /api/x/order`。
- 保存成功后可不刷新，仅显示「已保存」；失败则 alert 并 `location.reload()` 回滚。
- 保留无障碍备用按钮：每行「上移 / 下移」按钮复用同一保存函数，移动端比拖拽更可靠。

## 需要修改的文件

最小实现清单：

1. `src/store.js`
   - 新增 `normalizeAppOrder(registry)` / `sortApps(apps)` / `reorderApps(names)`。
   - `loadRegistry()` 返回前保证旧数据补 `sortOrder` 并保存。
   - `upsertApp()` 新安装应用写入末尾 `sortOrder`，更新应用保留原排序。
   - `reconcileInstalledApps()` 恢复应用时写入末尾排序。
2. `src/server.js`
   - 导入新的 `sortApps` / `reorderApps`。
   - `/api/x`、`renderAdmin()`、`renderDeployWizard()`、`renderHome()` 等列表入口使用统一排序。
   - 新增 `PUT /api/x/order` 管理 API。
   - `/admin` 表格增加 drag/drop 脚本和保存提示。
3. `src/openapi.js`
   - 增加 `PUT /api/x/order` 文档。
4. `README.md` 或 `docs/final-overview.md`
   - 补充排序 API 和管理台拖拽说明。
5. `sdk/node/client.js`、`sdk/types.d.ts`（可选但建议）
   - 增加 `reorderApps(names)` 方法与类型字段 `sortOrder?: number`。
6. `bin/apps.js`（可选）
   - `list()` 按统一排序输出。
   - 如需要 CLI 支持，可新增 `apps order app-a app-b ...`。
7. 测试
   - `test/store.test.js`：验证旧 registry 自动补排序、新安装默认末尾、重排校验。
   - `test/phase78.test.js` 或 `test/server.test.js`：验证非管理员不能重排、管理员重排后 `/admin`/`/api/x` 顺序改变。

## 风险与注意点

- 如果只依赖 `registry.apps` 数组顺序而不加字段，重排实现更少，但安装、恢复、未来导出/合并时容易丢失语义；建议显式字段。
- 首页和市场是否应跟随管理员排序是产品决策：若只要求「管理/已安装应用」排序，则只改 `/admin`；若希望全平台统一展示顺序，则所有列表都用 `sortApps()`。
- 目前没有并发写锁；两个管理员同时重排可能后写覆盖先写。MVP 可接受，严谨方案可在请求中带 `updatedAt`/版本号做冲突检测。
- 从目录恢复 registry 时文件系统顺序不保证业务顺序，只能作为兜底初始排序。
