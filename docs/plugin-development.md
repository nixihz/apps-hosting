# 插件开发样例

Keli Apps 当前已支持多种插件形态：页面型、菜单型、API 型、Webhook 型、Cron 型。插件本质上仍是一个带 `apps.yaml` 的小应用，平台按声明把它安装、启动并挂载到统一入口。

示例目录：`examples/hello-plugin`。

## 目录结构

```text
hello-plugin/
├── apps.yaml
└── dist/
    └── index.html
```

真实项目可以把 `dist/` 换成 Vue / React / Svelte 构建产物。

## apps.yaml

```yaml
name: hello-plugin
title: Hello 插件示例
type: plugin
version: 1.0.0
route: /x/hello-plugin
entry: dist
author: platform-team
description: 演示如何把一个页面型插件接入 Keli Apps。
plugin:
  kind: page
  mount: menu
  icon: 🧩
  category: examples
```

字段说明：

- `type: plugin`：声明这是插件型应用。
- `route`：平台访问路径，建议统一放在 `/x/<name>` 下。
- `entry`：页面型 / 菜单型插件的静态构建产物目录。
- `plugin.kind`：插件类型，支持 `page` / `menu` / `api` / `webhook` / `cron`。
- `plugin.mount`：建议挂载位置，常见如 `menu`。
- `plugin.icon`：菜单或市场展示用图标。
- `plugin.category`：插件分类。

## 安装到平台

在项目根目录执行：

```bash
APPS_DATA_DIR=.apps-data node ./bin/apps.js install ./examples/hello-plugin
```

查看已安装应用：

```bash
APPS_DATA_DIR=.apps-data node ./bin/apps.js list
```

启动平台：

```bash
APPS_DATA_DIR=.apps-data APPS_PORT=4199 node ./src/server.js
```

访问：

```text
http://127.0.0.1:4199/x/hello-plugin
http://127.0.0.1:4199/admin
```

## 权限配置

如果插件只允许特定权限访问，可以加：

```yaml
permissions:
  - hello-plugin:view
```

访问时需要带请求头：

```bash
curl -H 'x-apps-permissions: hello-plugin:view' \
  http://127.0.0.1:4199/x/hello-plugin
```

未带权限头时平台返回 `403`。

## 从零创建插件

也可以使用 CLI 生成骨架：

```bash
node ./bin/apps.js create plugin my-plugin
```

然后编辑：

```text
my-plugin/apps.yaml
my-plugin/dist/index.html
```

再安装：

```bash
APPS_DATA_DIR=.apps-data node ./bin/apps.js install ./my-plugin
```

## API / Webhook / Cron 插件

### API 插件

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

访问入口：

```text
/api/plugins/report-api/*
```

### Webhook 插件

```yaml
name: ci-webhook
title: CI Webhook
type: plugin
version: 1.0.0
route: /x/ci-webhook
plugin:
  kind: webhook
backend:
  command: node server/index.js
  port: 4302
  health: /health
```

访问入口：

```text
/hooks/ci-webhook/*
```

### Cron 插件

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

## 当前边界

- 页面/菜单插件走静态资源托管。
- API/Webhook 插件走后端代理。
- Cron 插件走进程内定时调度。
- 复杂插件元数据继续建议放在 `plugin:` 节点下，保持向后兼容。
