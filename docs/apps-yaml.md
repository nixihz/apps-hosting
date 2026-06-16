# apps.yaml 规范

`apps.yaml` 用于描述一个可被 Keli Apps 安装、托管和治理的小应用。

## 必填字段

```yaml
name: team-nav
title: 团队导航页
type: frontend
version: 1.0.0
route: /x/team-nav
```

字段说明：

- `name`：应用唯一标识，只允许小写字母、数字、`-`、`_`、`.`
- `title`：展示名称，非空字符串
- `type`：应用类型，支持 `frontend` / `fullstack` / `backend` / `plugin`
- `version`：版本号，非空字符串
- `route`：平台挂载路由，必须以 `/` 开头，安装时会做规范化

> 同一平台内 `route` 不能冲突。

## frontend

最小前端应用：

```yaml
name: team-nav
title: 团队导航页
title_i18n:
  zh: 团队导航页
  en: Team Navigation
type: frontend
version: 1.0.0
route: /x/team-nav
entry: dist
logo: assets/logo.svg
author: infra-team
description: 团队常用系统导航
description_i18n:
  zh: 聚合团队常用系统链接，支持搜索和分类展示。
  en: Collects frequently used team system links with search and categorized browsing.
```

额外规则：

- `entry` 必填，表示前端静态资源目录
- 安装时会校验 `entry` 路径真实存在
- `logo` 可选，填写应用包内相对路径；支持 `svg` / `png` / `jpg` / `jpeg` / `webp` / `gif`
- `title_i18n` 和 `description_i18n` 可选；首页与 API 会按当前语言优先使用 `zh` / `en` 文案

## fullstack

```yaml
name: data-query-tool
title: 运营数据查询工具
type: fullstack
version: 1.0.0
route: /x/data-query-tool
frontend:
  entry: web/dist
backend:
  command: node server/index.js
  port: 3000
  health: /health
env:
  - DATABASE_URL
permissions:
  - data-query:view
```

额外规则：

- `frontend.entry` 必填，且目录必须存在
- `backend.command` 必填
- `backend.port` 如填写，必须是正整数
- `backend.health` 如填写，必须以 `/` 开头

## backend

```yaml
name: worker-api
title: Worker API
type: backend
version: 1.0.0
route: /x/worker-api
backend:
  command: node server/index.js
  port: 3010
  health: /health
```

## plugin

页面型插件：

```yaml
name: hello-plugin
title: Hello Plugin
type: plugin
version: 1.0.0
route: /x/hello-plugin
entry: dist
plugin:
  kind: page
```

API 型插件：

```yaml
name: report-api
title: Report API
type: plugin
version: 1.0.0
route: /x/report-api
plugin:
  kind: api
backend:
  command: node server/index.js
  port: 4301
  health: /health
```

Cron 型插件：

```yaml
name: sync-cron
title: Sync Cron
type: plugin
version: 1.0.0
route: /x/sync-cron
plugin:
  kind: cron
  command: node job.js
  schedule:
    everySeconds: 60
```

## 可选字段

- `author`：作者/团队
- `description`：应用描述
- `title_i18n` / `description_i18n`：中英文展示文案映射，支持 `zh` / `en` / `zh-CN` / `en-US`
- `logo` / `icon` / `ui.logo`：首页卡片 Logo，必须是包内相对路径，支持 `svg` / `png` / `jpg` / `jpeg` / `webp` / `gif`
- `env`：环境变量白名单，必须为字符串数组
- `permissions`：访问权限列表，必须为字符串数组
- `groups`：允许访问的用户组，必须为字符串数组
- `tenants`：允许访问的租户，必须为字符串数组
- `categories`：市场分类，必须为字符串数组
- `versionNotes`：版本说明，必须为字符串数组
- `environments`：允许部署的环境列表，如 `dev` / `staging` / `production`
- `build.command`：部署时构建命令
- `runtime.type`：`node` / `python` / `go` / `java` / `docker` / `static`
- `runtime.restartPolicy`：`never` / `on-failure` / `always`
- `runtime.maxRetries`：最大重启次数
- `runtime.restartDelayMs`：重启延迟
- `resources.storageMb`：构建产物最大存储限制
- `resources.memoryMb`：内存配额声明

## 安装校验

执行 `apps install <dir>` 时，当前会校验：

1. 必填字段完整
2. `name` / `type` / `route` 合法
3. `entry` 路径存在
4. `logo` / `icon` / `ui.logo` 如填写，必须是安全的包内相对路径且文件存在
5. `backend` 配置合法
6. `env` / `permissions` 为字符串数组
7. 平台内无重复 `route`
8. plugin.kind 与其运行时配置匹配（如 `api/webhook` 需要 `backend.command`，`cron` 需要 `plugin.command` 和 `plugin.schedule.everySeconds`）
9. `build` / `runtime` / `resources` 字段值合法
