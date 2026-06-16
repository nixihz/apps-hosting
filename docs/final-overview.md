# Keli Apps（apps runtime）最终总览

Keli Apps 是一个高端、现代、可插拔、可治理的轻应用中枢；底层继续兼容 apps CLI、`apps.yaml`、环境变量与既有 API Header。当前仓库已经完成 Phase 1 ~ Phase 8 的可运行基线实现，覆盖应用托管、插件生态、部署回滚、可观测性、多环境、多运行时、开放 API、SDK、事件集成、组织级治理与 Apple 官网式视觉管理体验。

## 一句话能力

让团队可以用统一的 `apps.yaml` 把前端、后端、全栈、插件和自动化任务快速接入 Keli Apps，并通过简洁、高级、留白充足的统一入口完成访问、部署、配置、权限、日志、审计和治理。

## 快速启动

```bash
npm test
APPS_DATA_DIR=.apps-data node ./bin/apps.js install ./examples/team-nav
APPS_DATA_DIR=.apps-data node ./src/server.js
```

常用入口：

- 首页：`http://127.0.0.1:4173/`
- 登录页：`http://127.0.0.1:4173/login`
- 运维面板：`http://127.0.0.1:4173/admin`
- OpenAPI：`http://127.0.0.1:4173/api/openapi.json`
- 平台信息：`http://127.0.0.1:4173/api/platform`

## 品牌与视觉

- 展示品牌统一为 **Keli Apps**，旧展示品牌不再出现在首页、管理界面与示例文案中。
- 首页与管理界面采用 Apple 官网式设计语言：大标题、充足留白、低饱和渐变、玻璃质感卡片、清晰统计层级与克制动效。
- 运行时兼容性不变：CLI 名称、数据目录、`apps.yaml` 和 `x-apps-*` Header 继续可用。

## 核心模块

| 模块 | 能力 |
| --- | --- |
| 应用托管 | frontend / fullstack / backend / plugin 安装、启停、卸载、统一访问 |
| 路由网关 | 静态资源托管、SPA fallback、`/x/<name>/api/*` 后端代理 |
| 权限与租户 | 登录会话、请求头覆盖、`permissions` / `groups` / `tenants` 控制 |
| 插件生态 | page / menu / api / webhook / cron 插件 |
| 配置中心 | env / secrets 覆盖、配置历史、变更审计、后端热重启 |
| 部署流水线 | deploy / deployments / rollback、构建日志、发布快照、Git 元数据 |
| 可观测性 | 应用日志、访问日志、错误日志、指标、健康检查 |
| 多环境 | `APPS_ENV` 环境隔离数据目录 |
| 多运行时 | node / python / go / java / docker / static 声明与脚手架 |
| 开放集成 | OpenAPI、Node SDK、事件总线、平台 Webhook |
| 组织治理 | 治理报告、备份导出、运行时与资源声明校验 |

## CLI 总览

```bash
node ./bin/apps.js install <dir>
node ./bin/apps.js deploy <dir>
node ./bin/apps.js deployments <name>
node ./bin/apps.js rollback <name> [releaseId]
node ./bin/apps.js list
node ./bin/apps.js info <name>
node ./bin/apps.js enable <name>
node ./bin/apps.js disable <name>
node ./bin/apps.js remove <name>
node ./bin/apps.js create <type> <name>
```

`create` 支持：

- `frontend`
- `fullstack`
- `backend`
- `plugin`
- `python-backend`
- `go-backend`
- `java-backend`
- `docker-app`

## API 总览

### 平台

- `GET /api/platform`
- `GET /api/openapi.json`
- `GET /api/platform/policy-report`
- `GET /api/platform/backup`

### 应用

- `GET /api/x`
- `GET /api/x/<name>`
- `POST /api/x/<name>/start`
- `POST /api/x/<name>/stop`
- `POST /api/x/<name>/enable`
- `POST /api/x/<name>/disable`
- `DELETE /api/x/<name>`

### 配置、部署、观测

- `GET /api/x/<name>/config`
- `PUT /api/x/<name>/config`
- `GET /api/x/<name>/config/history`
- `POST /api/x/<name>/deploy`
- `POST /api/x/<name>/rollback`
- `GET /api/x/<name>/deployments`
- `GET /api/x/<name>/logs`
- `GET /api/x/<name>/access-logs`
- `GET /api/x/<name>/error-logs`
- `GET /api/x/<name>/metrics`
- `GET /api/x/<name>/health`

### 插件与事件

- API 插件：`/api/plugins/<name>/*`
- Webhook 插件：`/hooks/<name>/*`
- 事件列表：`GET /api/events`
- 平台 Webhook：`GET|POST /api/platform/webhooks`
- 删除 Webhook：`DELETE /api/platform/webhooks/:id`
- 投递记录：`GET /api/platform/webhook-deliveries`

## apps.yaml 关键字段

- `name` / `title` / `type` / `version` / `route`
- `entry` 或 `frontend.entry`
- `backend.command` / `backend.port` / `backend.health`
- `permissions` / `groups` / `tenants`
- `categories` / `versionNotes`
- `build.command`
- `runtime.type`
- `runtime.restartPolicy`
- `runtime.maxRetries`
- `runtime.restartDelayMs`
- `resources.storageMb`
- `resources.memoryMb`

详见：`docs/apps-yaml.md`

## SDK

- Node SDK：`sdk/node/client.js`
- 类型定义：`sdk/types.d.ts`
- 文档：`docs/sdk.md`

## 验收状态

当前测试：

```bash
npm test
```

已覆盖：

- CLI 安装 / 启停 / 部署 / 回滚 / 脚手架
- manifest 校验
- fullstack 后端代理
- API / Webhook / Cron 插件
- 配置中心与热重启
- 进程重启策略
- 平台 OpenAPI / 事件 / Webhook / 治理 / 备份
- 多环境数据隔离

## 相关文档

- `README.md`
- `ROADMAP.md`
- `docs/phase-1-2-3-completion.md`
- `docs/phase-4-5-6-completion.md`
- `docs/plugin-development.md`
- `docs/apps-yaml.md`
- `docs/sdk.md`
