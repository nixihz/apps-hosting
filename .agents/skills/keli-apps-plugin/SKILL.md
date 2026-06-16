---
name: keli-apps-plugin
description: Use when developing, scaffolding, packaging, publishing, uploading, or debugging a Keli Apps plugin or app with apps.yaml, keli-cli, /x/<name> routes, /api/x/install-upload, page/menu/api/webhook/cron plugin kinds, and the Keli Apps web installer workflow.
---

# Keli Apps Plugin Development

This skill guides developers building apps or plugins for a **Keli Apps** instance. Keli Apps hosts small apps under `/x/<name>`, manages backend processes when declared, and installs zip packages that contain a single `apps.yaml` manifest.

Use this whenever the user wants to:

- Scaffold a Keli Apps app or plugin.
- Write, validate, or fix an `apps.yaml` manifest.
- Package a plugin zip for the web installer.
- Publish a plugin with `keli-cli publish`.
- Debug route, entry, backend, permission, or plugin kind issues.
- Host the current project on Keli Apps, for example: "使用 keli-apps-plugin 这个 skill，把本项目托管到 Keli Apps 平台上线".

## First-time Hosting Confirmation

When the user asks to host or publish the current project to Keli Apps for the first time, inspect the project first, infer sensible defaults, then confirm the deployment identity before writing the manifest or publishing.

Required confirmation fields:

- `name` - app identifier. Default to the normalized project or package name.
- `route` - default to `/x/<name>`.

Recommended inferred defaults:

- `title` - package title or readable name.
- `title_i18n` - bilingual display names when Chinese and English names are known.
- `type` - `frontend`, `fullstack`, `backend`, or `plugin`.
- `entry` - for static apps, usually `dist`; for nested frontend apps, `web/dist`.
- `logo` - optional app card logo, such as `assets/logo.svg`, if the project contains or needs one.
- Backend command, port, and health path when a server entry exists.

Example confirmation:

```text
我准备按下面的默认值把本项目托管到 Keli Apps：
- name: my-project
- route: /x/my-project
- title: My Project
- type: frontend
- entry: dist

请确认是否使用这些值；如果要调整，请直接告诉我要改成什么。
```

If the user changes a value, their choice wins. After confirmation, create or update `apps.yaml`, keep all file paths relative to the app root, build if needed, and run the requested package, preview, or publish flow.

## Core Mental Model

A Keli Apps package is a directory or zip with `apps.yaml` at the package root, plus frontend build output and optional backend code.

```text
my-app/
├── apps.yaml
├── dist/
│   └── index.html
└── server/
    └── index.js
```

The manifest is the source of truth for installation, routing, process management, permissions, and plugin registration.

For user-facing apps and plugins, always prefer bilingual metadata:

- Keep `title` and `description` as fallback text.
- Add `title_i18n.zh` / `title_i18n.en` for the card title.
- Add `description_i18n.zh` / `description_i18n.en` for the card description.
- Add `logo: assets/logo.svg` or another package-relative image path when a custom card logo is available or generated.
- Supported logo formats are `svg`, `png`, `jpg`, `jpeg`, `webp`, and `gif`.

## apps.yaml Manifest

Minimal static frontend app:

```yaml
name: my-frontend-app
title: 我的前端应用
title_i18n:
  zh: 我的前端应用
  en: My Frontend App
type: frontend
version: 1.0.0
route: /x/my-frontend-app
entry: dist
logo: assets/logo.svg
author: your-team
description: 一句话说明这个应用是做什么的
description_i18n:
  zh: 一句话说明这个应用是做什么的
  en: One sentence describing what this app does
```

Fullstack app:

```yaml
name: my-fullstack-app
title: 我的全栈应用
title_i18n:
  zh: 我的全栈应用
  en: My Fullstack App
type: fullstack
version: 1.0.0
route: /x/my-fullstack-app
description: 同时包含前端体验和后端 API 的应用
description_i18n:
  zh: 同时包含前端体验和后端 API 的应用
  en: An app with both frontend UI and backend APIs
logo: assets/logo.svg
frontend:
  entry: web/dist
backend:
  command: node server/index.js
  port: 3000
  health: /health
env:
  - DATABASE_URL
  - JWT_SECRET
```

Page-style plugin:

```yaml
name: hello-plugin
title: Hello 插件示例
title_i18n:
  zh: Hello 插件示例
  en: Hello Plugin Example
type: plugin
version: 1.0.0
route: /x/hello-plugin
entry: dist
logo: assets/logo.svg
author: platform-team
description: 演示如何把页面型插件接入 Keli Apps。
description_i18n:
  zh: 演示如何把页面型插件接入 Keli Apps。
  en: Demonstrates how to add a page plugin to Keli Apps.
plugin:
  kind: page
  mount: menu
  icon: plugin
  category: examples
```

## Type Matrix

| `type` | What it is | Required fields |
| --- | --- | --- |
| `frontend` | Static SPA or multi-page app | `entry` |
| `fullstack` | Frontend plus managed backend process | `frontend.entry`, `backend.command`, `backend.port`, `backend.health` |
| `backend` | Backend-only service | `backend.command`, `backend.port`, `backend.health` |
| `plugin` | Platform extension | `plugin.kind` plus kind-specific fields |

## Plugin Kinds

Under `type: plugin`, set `plugin.kind` to one of:

- `page` - static page mounted at `/x/<name>`. Requires `entry`.
- `menu` - page plugin that is intended for the platform menu. Set `plugin.mount: menu`.
- `api` - backend HTTP service proxied under `/api/plugins/<name>/*`. Requires backend fields.
- `webhook` - inbound HTTP endpoint under `/hooks/<name>/*`.
- `cron` - scheduled task. Requires a command and schedule.

Cron example:

```yaml
name: refresh-job
title: Refresh Job
type: plugin
version: 1.0.0
route: /x/refresh-job
plugin:
  kind: cron
  command: node jobs/refresh.js
  schedule:
    everySeconds: 300
```

## Path and Packaging Rules

- `apps.yaml` must be in the package root.
- `route` must start with `/x/` and should normally be `/x/<name>`.
- `entry`, `frontend.entry`, `backend.command`, `plugin.command`, and build paths must be relative to the app root.
- `logo`, `icon`, or `ui.logo` must be a package-relative path and should point to an existing file in the package.
- Do not use absolute paths such as `/opt/...`, `/Users/...`, `C:\...`, or `~/...`.
- Do not reference files outside the package with `..`.
- A zip upload must contain exactly one app root that includes `apps.yaml`; nested packages are allowed only when the zip clearly contains one manifest.
- Packaging should exclude `node_modules`, `.git`, `.env`, logs, temp files, and previous zip output.

## Authoring Workflow

1. Inspect the project: `package.json`, build scripts, Vite/Next config, `dist`, `web`, `server`, and existing manifest files.
2. Infer app type and default route.
3. Confirm first-time hosting identity with the user.
4. Create or update `apps.yaml` with relative paths, bilingual title/description metadata, and a logo path when available.
5. Build the frontend or validate backend entry if needed.
6. Package or publish through `keli-cli`, or provide a zip for the web installer.

## keli-cli Workflow

The public developer CLI is `keli-cli`. It validates `apps.yaml`, packages the app, uploads it to `/api/x/install-upload`, and installs it.

Before any `keli-cli package` or `keli-cli publish` command, verify that the CLI is installed:

```bash
command -v keli-cli
```

Installing this Skill does not install the CLI binary. If `keli-cli` is not available on PATH, stop and guide the user to install the hosted CLI tarball:

```bash
npm install -g https://apps.example.com/downloads/keli-cli/latest.tgz
```

This tarball is distributed by the Keli Apps instance and does not require publishing to the npm registry.

After the CLI is available, verify login status:

```bash
keli-cli whoami
```

If `whoami` reports that the user is not logged in or returns an authentication error, guide the user to log in with a one-time code:

```bash
keli-cli login --server https://apps.example.com --code 123456
```

Replace `123456` with the code provided by the Keli Apps login flow. Continue packaging or publishing only after `keli-cli whoami` succeeds.

Typical interactive flow:

```bash
command -v keli-cli
keli-cli whoami
keli-cli login --server https://apps.example.com --code 123456
keli-cli whoami
keli-cli package ./my-app --output dist/my-app.zip
keli-cli publish ./my-app
keli-cli publish ./my-app --update
```

Token login for automation:

```bash
keli-cli login --server https://apps.example.com --token ymj_xxx
```

Important behavior:

- First publish installs a new app and refuses to overwrite an existing app.
- Updating an existing app must be explicit: use `keli-cli publish ./my-app --update`.
- Use `keli-cli package` when the user only wants a zip to upload manually.

## Web Installer

If the user has a zip or wants a manual path:

- Open `https://apps.example.com/admin/install`.
- Install the `keli-apps-plugin` skill if needed.
- Generate or review the app structure and `apps.yaml`.
- Upload the zip through the installer endpoint `/api/x/install-upload`.

## Analytics

Keli Apps can inject Google Analytics when the instance sets `APPS_GOOGLE_ANALYTICS_ID`.
Do not hard-code a shared analytics ID in generated apps. If the platform already injects analytics, avoid adding another tag in the app HTML.

## Output Checklist

Before replying:

- `apps.yaml` exists at the app root.
- `name`, `title`, `type`, `version`, and `route` are present.
- `title_i18n.zh`, `title_i18n.en`, `description_i18n.zh`, and `description_i18n.en` are present for user-facing apps/plugins when reasonable.
- Custom `logo`, `icon`, or `ui.logo` paths are relative, safe, and included in the package.
- Routes use `/x/<name>`.
- All paths are relative to the app root.
- Page/menu plugins have a valid frontend `entry`.
- API/webhook plugins have backend command, port, and health path.
- Cron plugins have command and schedule.
- The package command or publish command is included.
