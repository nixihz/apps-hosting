# Keli Apps（apps runtime）

Keli Apps 是一个更现代、高级的轻应用中枢，底层继续兼容 apps CLI 与运行时。当前仓库已完成 Phase 1 ~ Phase 8 的基线实现：前端/全栈/后端/插件应用托管、统一入口访问、配置中心、部署回滚、可观测性、多环境、多运行时、OpenAPI、SDK、事件总线、Webhook、治理报告、备份导出、产品化管理台与 RBAC 安全体系。


## 品牌与界面

- 产品展示名已升级为 **Keli Apps**，替代旧展示品牌。
- 首页与管理界面采用 Apple 官网式视觉：大留白、低饱和渐变、玻璃拟态卡片、圆角层级和克制动效。
- CLI、环境变量、`apps.yaml` 与既有 API Header 保持兼容，避免影响已安装应用。

## 快速开始

```bash
npm test
APPS_DATA_DIR=.apps-data node ./bin/apps.js install ./examples/team-nav
APPS_DATA_DIR=.apps-data node ./src/server.js
```

访问：

- 平台首页：http://127.0.0.1:4173/
- 管理台：http://127.0.0.1:4173/admin
- 登录页：http://127.0.0.1:4173/login
- Demo 应用：http://127.0.0.1:4173/x/team-nav
- 插件示例：http://127.0.0.1:4173/x/hello-plugin
- 应用 API：http://127.0.0.1:4173/api/x

## AI Skills

本仓库随代码提供可安装到本机 agent 的 skills，来源目录为 `.agents/skills/`。线上服务通过 well-known skills 端点分发 `keli-apps-plugin`。

注意：下面的命令只安装 AI Skill，让 Codex 知道 Keli Apps 插件开发规则；它不会安装 `keli-cli` 可执行文件。

```bash
npx skills add https://apps.example.com --skill keli-apps-plugin -a codex -g -y
```

本地开发时也可以从仓库根目录安装：

```bash
npx skills add . --skill keli-apps-plugin -a codex -g -y
```

`keli-cli` 需要单独安装。平台会按 `qinglong` 的方式托管 CLI tarball，不依赖 npm registry：

```bash
npm install -g https://apps.example.com/downloads/keli-cli/latest.tgz
keli-cli publish ./my-app
```

维护者发布新版 CLI tarball：

```bash
npm run package:cli
```

然后把 `dist/npm/` 发布到线上服务对应目录，`latest.tgz` 会作为固定安装入口。

## CLI

```bash
node ./bin/apps.js install <dir>
node ./bin/apps.js list
node ./bin/apps.js info <name>
node ./bin/apps.js enable <name>
node ./bin/apps.js disable <name>
node ./bin/apps.js remove <name>
node ./bin/apps.js deploy <dir>
node ./bin/apps.js package <dir> --output dist/my-app.zip
node ./bin/apps.js publish-plugin <dir>
node ./bin/apps.js deployments <name>
node ./bin/apps.js rollback <name> [releaseId]
node ./bin/apps.js create frontend my-app
node ./bin/apps.js create plugin my-plugin
```

默认数据目录是 `.apps`，可通过 `APPS_DATA_DIR` 覆盖。安装、启动 server、CLI 管理时必须使用同一个 `APPS_DATA_DIR`；平台也会在 registry 缺失时从 `apps/` 目录自动恢复已安装应用，避免 server 重启后安装信息丢失。

`install` 默认只安装新应用，发现同名应用会拒绝覆盖；更新已有应用请使用 `deploy` 保留发布历史，或在 `keli-cli publish` 中显式选择 update。

面向管理员远程发布可使用 `keli-cli`：

```bash
keli-cli login --server https://apps.example.com --code 123456
keli-cli package ./my-app --output dist/my-app.zip
keli-cli publish ./my-app
keli-cli publish ./my-app --update
keli-cli logout
```

`keli-cli login` 支持 2FA 验证码，也支持 `--token ymj_xxx` 用于自动化。

## 开源部署配置

仓库不应提交真实运行数据和密钥。`.gitignore` 已排除 `.apps/`、`.apps-data/`、`.apps-about-data/`、`.pi/`、`.env*`、日志和 CLI tarball 产物；需要配置时复制 `.env.example` 并在本地或服务器环境中填写真实值。

- `APPS_SECRET_KEY`、`APPS_2FA_SECRET`、`APPS_ADMIN_TOKEN` 必须在生产环境设置为强随机值。
- `APPS_GOOGLE_ANALYTICS_ID` 可选；未设置时不会注入 Google Analytics。
- `.gitea/workflows/deploy.yml` 是手动部署模板，部署目标从 `DEPLOY_HOST`、`DEPLOY_SSH_KEY`、`DEPLOY_KNOWN_HOSTS`、`DEPLOY_PATH`、`DEPLOY_SERVICE`、`DEPLOY_HEALTH_URL` 读取，不要把真实服务器信息写进仓库。

## 应用配置

见 `docs/apps-yaml.md`。每个应用通过 `apps.yaml` 声明名称、类型、版本、路由、前端入口和后端启动命令。

## 插件开发

React SPA 示例见 `examples/react-spa-demo`，安装说明见 `docs/react-spa-demo.md`。

插件开发样例见 `examples/hello-plugin`，接入说明见 `docs/plugin-development.md`。

安装示例插件：

```bash
APPS_DATA_DIR=.apps-data node ./bin/apps.js install ./examples/hello-plugin
```

## 当前能力

### Phase 1

- 纯前端 / fullstack / backend 应用安装与托管
- SPA fallback、子路径挂载、统一入口访问
- backend 路由网关：`/x/<name>/api/*` 直达后端服务
- 登录页与会话注入：后台统一使用 2FA 动态验证码登录
- 应用权限控制：`permissions` / `groups` / `tenants`
- 运维面板：启停、日志、健康检查、状态查看
- 配置中心：应用 env / secrets 覆盖、历史版本、审计日志

### Phase 2

- 插件类型：`page` / `menu` / `api` / `webhook` / `cron`
- API 插件入口：`/api/plugins/<name>/*`
- Webhook 插件入口：`/hooks/<name>/*`
- Cron 插件调度：`plugin.command` + `plugin.schedule.everySeconds`
- 审计接口：`/api/audit`

### Phase 3

- 发布命令：`deploy / deployments / rollback`
- 构建日志与发布历史
- Git 元数据采集（commit / branch / remote）
- 管理 API：应用部署、回滚、发布记录查询
- 访问日志 / 错误日志 / 指标接口
- 服务重启策略：`runtime.restartPolicy`
- 存储限制：`resources.storageMb`

### Phase 4

- 多环境支持：`APPS_ENV`
- 多运行时声明：`runtime.type`
- 多运行时脚手架：python / go / java / docker
- 平台信息接口：`GET /api/platform`
- OpenAPI：`GET /api/openapi.json`
- Node SDK：`sdk/node/client.js`

### Phase 5

- 事件总线：`GET /api/events`
- 平台 Webhook 订阅与投递记录
- 事件驱动自动化：deploy / rollback / config update
- 平台 SDK 调用链路

### Phase 6

- 治理报告：`GET /api/platform/policy-report`
- 备份导出：`GET /api/platform/backup`
- 多环境隔离目录
- 运行时 / 资源 / 权限基线检查

### Phase 7

- 产品化管理台：应用详情页、安装向导、部署向导、安全管理入口
- 应用详情页：基础信息、健康指标、配置编辑器、发布历史、回滚、日志查看器
- 管理页面可直接触发部署、配置保存和回滚等常规操作

### Phase 8

- 安全中心：用户、用户组、角色与 API token 管理 API
- RBAC 权限模型：内置 `admin` / `developer` / `viewer` / `auditor` 角色
- API token 签发、列表脱敏、撤销与 Bearer 认证
- 2FA/TOTP 登录入口，账号密码暂不启用
- Webhook HMAC-SHA256 签名投递与入站签名校验
- secrets AES-GCM 加密存储，接口默认只返回掩码

## 登录与访问控制

登录页只接受 2FA/TOTP 动态验证码，不提供账号密码表单。验证码校验通过后写入管理员 cookie 会话；未登录时会话显式标记为 `authenticated: false`，登录后仅展示当前 2FA 会话信息，不展示退出登录入口。

2FA 密钥通过环境变量配置：

- `APPS_2FA_SECRET`：推荐，兼容常见 Authenticator 的 base32 secret
- 未配置时会回退使用 `APPS_SECRET_KEY` 派生本地 TOTP secret

会话字段包括：

- `name`
- `tenant`
- `permissions`
- `groups`
- `roles`
- `authenticated`

自动化场景也支持直接通过请求头覆盖：

- `x-apps-user`
- `x-apps-tenant`
- `x-apps-permissions`
- `x-apps-groups`
- `x-apps-roles`

## 安全与权限

- 用户：`GET/POST /api/security/users`
- 用户组：`GET/POST /api/security/groups`
- 角色：`GET/POST /api/security/roles`
- API token：`GET/POST /api/security/tokens`，`DELETE /api/security/tokens/<id>`
- 2FA 登录：`POST /api/session/login`，请求体 `{ "code": "123456" }`

运维管理页需要 `platform:admin`。`APPS_ADMIN_TOKEN` 仍可作为管理 API 的全局 token；签发的 `ymj_` API token 可通过 `Authorization: Bearer <token>` 使用。

## 配置中心

- 查看配置：`GET /api/x/<name>/config`
- 更新配置：`PUT /api/x/<name>/config`
- 查看历史：`GET /api/x/<name>/config/history`
- 查看审计：`GET /api/audit`

更新配置后，后端应用会自动重启以加载新环境变量。

## 部署与回滚

- 发布：`node ./bin/apps.js deploy <dir>`
- 历史：`node ./bin/apps.js deployments <name>`
- 回滚：`node ./bin/apps.js rollback <name> [releaseId]`
- 部署 API：`POST /api/x/<name>/deploy`
- 回滚 API：`POST /api/x/<name>/rollback`
- 发布记录：`GET /api/x/<name>/deployments`

## 可观测性

- 应用日志：`GET /api/x/<name>/logs`
- 访问日志：`GET /api/x/<name>/access-logs`
- 错误日志：`GET /api/x/<name>/error-logs`
- 指标：`GET /api/x/<name>/metrics`
- 健康：`GET /api/x/<name>/health`

更多说明见：

- `docs/final-overview.md`
- `docs/next-roadmap.md`
- `RELEASE_NOTES.md`
- `docs/phase-1-2-3-completion.md`
- `docs/phase-4-5-6-completion.md`
- `docs/phase-7-8-completion.md`
- `docs/sdk.md`

## tmux-team 长程开发

本仓库已可通过 `tmux-team` 组建协作团队。当前团队角色：

- `architect`：架构与验收负责人
- `backend`：CLI / 后端 / 进程管理实现建议
- `qa`：测试与验收设计
