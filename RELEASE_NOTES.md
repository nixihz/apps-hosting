# Release Notes

## v0.8.0 - Phase 7 ~ Phase 8 Management Console and Security Baseline

本版本推进并完成 Roadmap Phase 7 与 Phase 8 的基线实现，重点补齐管理台产品化体验、安全认证与权限体系。

### Added

- Phase 7 管理台产品化：
  - 应用详情页：基础信息、健康指标、配置编辑器、发布历史、回滚入口、日志查看器。
  - 应用安装向导与部署向导页面。
  - 安全管理页入口。
- Phase 8 安全、认证与权限：
  - 用户、用户组、角色、API token 管理 API。
  - RBAC 权限模型与内置角色：`admin` / `developer` / `viewer` / `auditor`。
  - API token 签发、列表脱敏、撤销与 Bearer token 会话识别。
  - OIDC/OAuth2 登录入口与 callback 会话映射。
  - Webhook HMAC-SHA256 签名投递；入站 webhook 支持签名校验。
  - secrets AES-GCM 加密落盘，配置查询默认脱敏。
- OpenAPI 增加安全管理接口说明。
- `package.json` 版本升级到 `0.8.0`。

### Disabled

- 应用市场与收藏中心已禁用：移除导航入口，`/market`、`/market/apps/<name>`、`/favorites`、`/api/market/apps` 与收藏切换接口返回 404。

### Verification

```bash
npm test
```

当前测试全部通过（26/26）。

## v0.7.0 - Post-MVP Feature Expansion Roadmap

MVP 主干已经完成。本版本作为下一个阶段的规划版本，明确后续“丰富各种功能”的产品方向与迭代节奏。

### Added

- 新增后 MVP 路线图：`docs/next-roadmap.md`
- `ROADMAP.md` 扩展 Phase 7 ~ Phase 12：
  - Phase 7：体验增强与管理台产品化
  - Phase 8：安全、认证与权限体系增强
  - Phase 9：部署流水线与运行时生产化
  - Phase 10：插件 SDK 与生态市场
  - Phase 11：可观测性、告警与治理增强
  - Phase 12：分布式、多节点与组织级部署
- README 增加下一阶段路线图入口
- `package.json` 版本升级到 `0.7.0`

### Positioning

`v0.7.0` 是 **Post-MVP Feature Expansion Planning Release**：

- 标记 MVP 主干已完成
- 开启后续功能丰富阶段
- 为管理台、认证权限、生产化部署、插件生态、告警治理、多节点部署建立后续目标

### Verification

```bash
npm test
```

当前测试全部通过。

## v0.6.0 - Phase 1 ~ Phase 6 Baseline

本版本完成 Keli Apps（兼容 apps runtime）的 Phase 1 ~ Phase 6 基线实现，形成一个可运行、可测试、可扩展的小应用托管平台原型。

### Highlights

- 完成 frontend / fullstack / backend / plugin 应用托管。
- 完成应用市场、插件机制、配置中心、权限与租户控制。
- 完成部署、发布历史、回滚、构建日志与 Git 元数据采集。
- 完成可观测性：日志、访问日志、错误日志、指标、健康检查。
- 完成多环境、多运行时、OpenAPI、SDK、事件总线、平台 Webhook。
- 完成治理报告、备份导出与组织级标准化基线。

## Phase 1：MVP 阶段

### Added

- CLI：`install` / `list` / `info` / `enable` / `disable` / `remove` / `create`
- 前端静态资源托管
- SPA fallback
- 子路径挂载
- fullstack/backend 进程管理
- 后端健康检查
- 后端日志查看
- 平台首页与运维面板
- 登录页与会话注入
- `permissions` / `groups` / `tenants` 访问控制
- 配置中心：env / secrets / history / audit

## Phase 2：插件生态阶段

### Added

- 应用市场：搜索 / 分类 / 收藏 / 版本说明
- 插件类型：`page` / `menu` / `api` / `webhook` / `cron`
- API 插件代理：`/api/plugins/<name>/*`
- Webhook 插件代理：`/hooks/<name>/*`
- Cron 插件调度：`plugin.command` + `plugin.schedule.everySeconds`
- 审计接口：`GET /api/audit`

## Phase 3：工程化与运维增强阶段

### Added

- CLI 发布：`apps deploy <dir>`
- 发布历史：`apps deployments <name>`
- 回滚：`apps rollback <name> [releaseId]`
- 管理 API：deploy / rollback / deployments
- 发布快照与构建日志
- Git 元数据采集：commit / branch / remote
- 访问日志：`GET /api/x/<name>/access-logs`
- 错误日志：`GET /api/x/<name>/error-logs`
- 指标：`GET /api/x/<name>/metrics`
- 重启策略：`runtime.restartPolicy`
- 存储限制：`resources.storageMb`

## Phase 4：平台化与扩展阶段

### Added

- 多环境隔离：`APPS_ENV`
- 多运行时声明：`runtime.type`
- 支持运行时：`node` / `python` / `go` / `java` / `docker` / `static`
- 多运行时脚手架：
  - `create python-backend`
  - `create go-backend`
  - `create java-backend`
  - `create docker-app`
- 平台信息：`GET /api/platform`
- OpenAPI：`GET /api/openapi.json`
- Node SDK 与类型定义

## Phase 5：开放集成与自动化阶段

### Added

- 事件总线：`GET /api/events`
- 平台 Webhook 注册、删除、投递记录
- 事件：
  - `app.deployed`
  - `app.rolledback`
  - `app.config.updated`
- SDK 调用部署、回滚、指标、事件等接口。

## Phase 6：治理与组织级标准化阶段

### Added

- 治理报告：`GET /api/platform/policy-report`
- 平台备份导出：`GET /api/platform/backup`
- 运行时、资源、环境、权限基线检查
- 多运行时模板沉淀
- SDK 类型定义沉淀

## Tests

当前测试覆盖：

- CLI 工作流
- manifest 校验
- 后端进程管理与重启策略
- fullstack 路由代理
- API / Webhook / Cron 插件
- 配置中心
- 部署与回滚
- 平台 OpenAPI、事件、Webhook、治理、备份
- 多环境隔离

验证命令：

```bash
npm test
```

当前结果：全部通过。

## Commits

- `8376937` feat: complete phase 1 2 3 baseline for apps
- `f4a3107` feat: complete phase 4 5 6 baseline for apps
