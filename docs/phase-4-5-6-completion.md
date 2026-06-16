# apps Phase 4 / Phase 5 / Phase 6 完成说明

说明：原始 `ROADMAP.md` 明确写到了 Phase 4。为了支持本轮长程推进，当前仓库已把后续能力继续收敛为 **Phase 5 / Phase 6 基线实现**，并同步补充到 `ROADMAP.md`。

## Phase 4：平台化与扩展阶段

### 已完成基线

- 多环境支持：`APPS_ENV`
  - 数据目录按环境隔离，如 `.apps/staging`
- 多运行时声明：
  - `runtime.type`: `node` / `python` / `go` / `java` / `docker` / `static`
- 多运行时脚手架：
  - `create python-backend`
  - `create go-backend`
  - `create java-backend`
  - `create docker-app`
- 开发者工具：
  - Node SDK：`sdk/node/client.js`
  - 类型定义：`sdk/types.d.ts`
  - SDK 文档：`docs/sdk.md`
- 平台开放能力：
  - OpenAPI：`GET /api/openapi.json`
  - 平台信息：`GET /api/platform`

## Phase 5：开放集成与自动化阶段

### 已完成基线

- 事件总线：
  - `GET /api/events`
- Webhook 订阅：
  - `GET /api/platform/webhooks`
  - `POST /api/platform/webhooks`
  - `DELETE /api/platform/webhooks/:id`
  - `GET /api/platform/webhook-deliveries`
- 自动化事件：
  - `app.deployed`
  - `app.rolledback`
  - `app.config.updated`
- 部署自动化 API：
  - `POST /api/x/<name>/deploy`
  - `POST /api/x/<name>/rollback`
  - `GET /api/x/<name>/deployments`
- SDK 已可直接调用平台接口

## Phase 6：治理与组织级标准化阶段

### 已完成基线

- 治理报告：`GET /api/platform/policy-report`
- 平台备份导出：`GET /api/platform/backup`
- 多环境隔离基线：`APPS_ENV`
- 运行时与资源声明校验：
  - `runtime.type`
  - `runtime.restartPolicy`
  - `runtime.maxRetries`
  - `runtime.restartDelayMs`
  - `resources.storageMb`
  - `resources.memoryMb`
- 多运行时模板沉淀
- SDK 类型定义沉淀

## 相关文件

- `src/platform.js`
- `src/event-bus.js`
- `src/openapi.js`
- `sdk/node/client.js`
- `sdk/types.d.ts`
- `docs/sdk.md`
- `ROADMAP.md`

## 验证

```bash
npm test
```

当前结果：测试全部通过。
