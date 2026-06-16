---
name: keli-apps-plugin-demo-pack
description: Create or update Keli Apps plugin packaging files for an existing plugin project. Use when the user asks to generate, repair, or review apps.yaml, plugin metadata, or Taskfile.yml packaging tasks such as task package:apps for Keli Apps page, menu, API, webhook, or cron plugins.
---

# Keli Apps 插件 apps.yaml 与 Taskfile 引导

## 何时使用

当用户位于一个已存在或正在开发的 Keli Apps 插件项目中，希望 AI **分析当前插件项目本身**，并生成/修正可直接使用的 `apps.yaml`，同时补充或生成 `Taskfile.yml` 中的常用命令时使用本 skill。触发判断主要依赖 front matter；本节只补充执行边界。

本 skill 的目标不是创建通用 demo 包，也不是替代用户完成一次性 zip 打包；它应作为工作流引导，帮助 AI 根据当前项目结构减少重复配置劳动。

## 核心产出

- 当前插件项目根目录下的 `apps.yaml`。
- 当前插件项目根目录下的 `Taskfile.yml`（新增或合并命令）。
- 至少包含可执行入口：`task package:apps`。
- 必要时补充校验、安装、清理等辅助 task，但不要把“生成 demo 目录”或“套用固定模板打包”作为默认目标。

## 工作原则

1. 先识别当前插件项目，而不是套用固定 demo：
   - 读取现有 `package.json`、`Taskfile.yml`、`vite.config.*`、`src/`、`dist/`、`public/`、`server/` 等线索。
   - 判断插件类型：`page` / `menu` / `api` / `webhook` / `cron`。
   - 判断构建产物目录，常见为 `dist`。
2. 生成的 `apps.yaml` 必须贴合项目事实：
   - `name` 使用项目名或用户指定名，保持小写字母、数字、`-`、`_`、`.`。
   - `title`、`description` 优先从项目语义或用户描述提炼。
   - `type: plugin`。
   - 页面/菜单插件需要 `entry` 指向实际构建产物目录。
   - API/Webhook 插件需要 `backend.command`、`backend.port`，并尽量包含健康检查路径。
   - Cron 插件需要 `plugin.command` 与 `plugin.schedule.everySeconds`。
3. 修改 `Taskfile.yml` 时优先合并，不覆盖用户已有任务：
   - 若文件不存在，则创建最小可用版本。
   - 若已存在，保留已有 `version`、`vars`、`env`、任务与注释，追加缺失任务。
   - 必须保证 `task package:apps` 可用于产出可上传的插件压缩包。
4. 若项目信息不足，先给出合理默认值并标注待确认项；不要凭空引入依赖。

## Analytics 统计

Keli Apps 可通过实例环境变量 `APPS_GOOGLE_ANALYTICS_ID` 统一注入 Google Analytics。
打包示例不要硬编码共享统计 ID；如果平台已经统一注入，应避免在插件 HTML 中重复添加统计标签。

## `apps.yaml` 检查清单

最小通用字段：

```yaml
name: <plugin-name>
title: <display-title>
type: plugin
version: 1.0.0
route: /x/<plugin-name>
description: <short-description>
plugin:
  kind: page
```

页面/菜单插件常用字段：

```yaml
entry: dist
plugin:
  kind: page
  mount: menu
  icon: 🧩
  category: plugins
```

API 插件常用字段：

```yaml
plugin:
  kind: api
backend:
  command: node server/index.js
  port: 4301
  health: /health
runtime:
  type: node
```

输出前确认：

- `apps.yaml` 存在于插件项目根目录。
- `name/title/type/version/route/plugin.kind` 齐全。
- `type` 为 `plugin`。
- `plugin.kind` 是 `page`、`menu`、`api`、`webhook`、`cron` 之一。
- 页面/菜单插件的 `entry` 目录与构建任务一致。
- API/Webhook 后端命令与端口来自项目事实或明确默认值。

## `Taskfile.yml` 建议任务

若项目已有构建命令，`package:apps` 应先调用构建，再打包 `apps.yaml` 与必要产物。示例可按项目实际调整：

```yaml
version: '3'

tasks:
  build:
    cmds:
      - npm run build

  package:apps:
    desc: Build and package Keli Apps plugin
    deps:
      - build
    cmds:
      - rm -f {{.PACKAGE_NAME | default "app-plugin.zip"}}
      - zip -r {{.PACKAGE_NAME | default "app-plugin.zip"}} apps.yaml dist
```

可选辅助任务：

```yaml
  apps:check:
    desc: Check required Keli Apps plugin files
    cmds:
      - test -f apps.yaml
      - test -d dist

  apps:clean:
    desc: Remove generated app package
    cmds:
      - rm -f {{.PACKAGE_NAME | default "app-plugin.zip"}}
```

注意：以上只是 Taskfile 写法参考。实际修改时应根据当前项目的包管理器、构建命令、产物目录、后端目录来调整，例如 `pnpm build`、`bun run build`、`server/`、`assets/`、`package.json` 等。

## 模板使用边界

`templates/page/apps.yaml` 与 `templates/api/apps.yaml` 只作为字段结构参考。使用时必须替换占位符和 demo 文案，并根据项目事实调整 `entry`、`backend.command`、`backend.port`、`plugin.category`、`plugin.icon` 等字段。

## 推荐操作流程

1. 在当前插件项目根目录收集事实：项目名、构建脚本、产物目录、入口页面或后端入口。
2. 生成或修正 `apps.yaml`，只写与项目匹配的字段。
3. 生成或合并 `Taskfile.yml`，确保存在 `package:apps`。
4. 如环境允许，可用只读/轻量命令检查 YAML 文件和关键路径；不要主动安装依赖。
5. 回复用户时说明：
   - 已生成/修改的文件。
   - `apps.yaml` 的关键字段来源。
   - 可执行命令：`task package:apps`。
   - 仍需用户确认的字段（如端口、Logo、权限、分类）。

## 参考文件

在 Keli Apps 仓库内可参考：

- `docs/plugin-development.md`
- `docs/apps-yaml.md`
- `examples/hello-plugin/apps.yaml`
- `bin/apps.js`
