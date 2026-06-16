# apps Phase 1 / Phase 2 / Phase 3 完成说明

本文档记录当前仓库已经落地的 Phase 1、Phase 2、Phase 3 能力，以及对应入口。

## Phase 1

### 应用管理

- 安装：`apps install <dir>`
- 卸载：`apps remove <name>`
- 启用 / 停用：`apps enable|disable <name>`
- 查看详情：`apps info <name>`
- 应用列表：`apps list`

### 前端应用支持

- 静态资源托管
- SPA fallback
- 子路径挂载
- 图标 / 描述 / 作者等元信息展示

### 服务端应用支持

- `backend.command`
- `backend.port`
- `backend.health`
- 启动 / 停止
- 日志查看
- 统一入口代理：`/apps/<name>/api/*`

### 平台基础能力

- 登录：`/login`
- 会话接口：`/api/session`
- 权限控制：`permissions`
- 用户组控制：`groups`
- 租户隔离：`tenants`
- 运维面板：`/admin`
- 配置中心：
  - `GET /api/x/<name>/config`
  - `PUT /api/x/<name>/config`
  - `GET /api/x/<name>/config/history`

## Phase 2

### 应用市场

应用市场与收藏中心入口已禁用：`/market`、`/market/x/<name>`、`/favorites` 与 `/api/market/apps` 返回 404。

### 插件机制

支持：

- `page`
- `menu`
- `api`
- `webhook`
- `cron`

入口：

- API 插件：`/api/plugins/<name>/*`
- Webhook 插件：`/hooks/<name>/*`
- Cron 插件：`plugin.command` + `plugin.schedule.everySeconds`

### 配置治理

- 环境变量
- 密钥
- 配置版本历史
- 配置变更审计：`/api/audit`

## Phase 3

### 部署流水线

- 部署：`apps deploy <dir>`
- 发布历史：`apps deployments <name>`
- 回滚：`apps rollback <name> [releaseId]`
- 构建日志：发布记录中的 `build.logFile`
- Git 元数据采集：commit / branch / remote（当源目录为 git 仓库时）
- 管理 API：
  - `POST /api/x/<name>/deploy`
  - `POST /api/x/<name>/rollback`
  - `GET /api/x/<name>/deployments`

### 可观测性

- 应用日志：`GET /api/x/<name>/logs`
- 访问日志：`GET /api/x/<name>/access-logs`
- 错误日志：`GET /api/x/<name>/error-logs`
- 性能指标：`GET /api/x/<name>/metrics`
- 健康状态：`GET /api/x/<name>/health`

### 资源治理与稳定性

- 存储限制：`resources.storageMb`
- 内存配额声明：`resources.memoryMb`
- 服务重启策略：
  - `runtime.restartPolicy`
  - `runtime.maxRetries`
  - `runtime.restartDelayMs`
- 生命周期管理：启用 / 停用 / 启动 / 停止 / 部署 / 回滚

## 当前边界

- Git 部署当前基于“本地目录 + git 元数据识别”，未内建远程仓库 clone 流程。
- 灰度发布当前未做多副本流量切换，实现的是可回滚发布链路。
- CPU / 网络限制当前未做真实进程级隔离，先支持 manifest 声明与存储限制。

## 验证

```bash
npm test
```
