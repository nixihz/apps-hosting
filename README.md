# Keli Apps

Keli Apps is a lightweight app hosting runtime for small internal tools, static apps, fullstack apps, backend services, and platform plugins. It provides one runtime for installing apps from `apps.yaml`, serving them under `/x/<name>`, managing backend processes, storing app config, and exposing admin APIs.

## Features

- App hosting for `frontend`, `fullstack`, `backend`, and `plugin` packages
- Static SPA fallback, subpath mounting, and backend proxying
- Plugin kinds: page, menu, API, webhook, and cron
- Admin console for installed apps, health, logs, config, deployments, and rollback
- Config center with env overrides, encrypted secrets, history, and audit logs
- RBAC security model with users, groups, roles, API tokens, and a minimal TOTP gate for local/admin bootstrap
- Platform APIs for OpenAPI, events, webhooks, policy reports, and backups
- Node SDK, local CLI, plugin templates, and installable AI skill docs

## Quick Start

```bash
npm test
APPS_DATA_DIR=.apps-data node ./bin/apps.js install ./examples/team-nav
APPS_DATA_DIR=.apps-data node ./src/server.js
```

Open:

- Home: http://127.0.0.1:4173/
- Admin: http://127.0.0.1:4173/admin
- Login: http://127.0.0.1:4173/login
- Demo app: http://127.0.0.1:4173/x/team-nav
- Apps API: http://127.0.0.1:4173/api/x

## Configuration

Copy `.env.example` for local or production configuration. Do not commit real secrets.

Important variables:

- `APPS_PORT`: HTTP port, default `4173`
- `APPS_DATA_DIR`: runtime data directory, default `.apps`
- `APPS_ENV`: optional environment namespace
- `APPS_SECRET_KEY`: production encryption/session key material
- `APPS_2FA_SECRET`: base32 TOTP secret for the built-in local/admin bootstrap gate
- `APPS_ADMIN_TOKEN`: optional global admin API token
- `APPS_GOOGLE_ANALYTICS_ID`: optional GA ID; unset means no GA injection
- `APPS_CLI_DOWNLOAD_DIR`: CLI tarball directory, default `dist/npm`

The runtime data directories `.apps/`, `.apps-data/`, `.apps-about-data/`, `.pi/`, `.env*`, logs, and CLI tarballs are ignored by Git.

## CLI

Local runtime CLI:

```bash
node ./bin/apps.js install <dir>
node ./bin/apps.js list
node ./bin/apps.js info <name>
node ./bin/apps.js enable <name>
node ./bin/apps.js disable <name>
node ./bin/apps.js remove <name>
node ./bin/apps.js deploy <dir>
node ./bin/apps.js deployments <name>
node ./bin/apps.js rollback <name> [releaseId]
node ./bin/apps.js package <dir> --output dist/my-app.zip
node ./bin/apps.js create frontend my-app
node ./bin/apps.js create plugin my-plugin
```

Remote publishing uses `keli-cli`:

```bash
keli-cli login --server https://apps.example.com --code 123456
keli-cli package ./my-app --output dist/my-app.zip
keli-cli publish ./my-app
keli-cli publish ./my-app --update
```

`install` refuses to overwrite existing apps by default. Use `deploy` for local updates with deployment history, or `keli-cli publish --update` for explicit remote updates.

## App Manifest

Each app package contains an `apps.yaml` at its root.

Minimal frontend app:

```yaml
name: hello-plugin
title: Hello Plugin
type: frontend
version: 1.0.0
route: /x/hello-plugin
entry: dist
```

Fullstack app:

```yaml
name: data-query-tool
title: Data Query Tool
type: fullstack
version: 1.0.0
route: /x/data-query-tool
frontend:
  entry: web/dist
backend:
  command: node server/index.js
  port: 4001
  health: /health
env:
  - DATABASE_URL
```

See [docs/apps-yaml.md](docs/apps-yaml.md) for the full manifest reference.

## Security

Admin pages require `platform:admin`. The built-in login page only accepts a TOTP code and is intended as a minimal local/admin bootstrap gate, not as a complete production authentication system.

For public or production deployments, implement real user authentication in front of or inside the platform. Recommended options include passkeys/WebAuthn, OIDC/SSO, or a trusted reverse-proxy identity layer. Do not expose the built-in TOTP-only flow as the sole admin login on the public internet; a single factor code is not a safe replacement for a complete login system with user identity, phishing resistance, session policy, recovery, and audit controls.

Automation can use issued `ymj_` API tokens with `Authorization: Bearer <token>` after access has been properly protected.

Security APIs:

- Users: `GET/POST /api/security/users`
- Groups: `GET/POST /api/security/groups`
- Roles: `GET/POST /api/security/roles`
- API tokens: `GET/POST /api/security/tokens`, `DELETE /api/security/tokens/<id>`
- Login: `POST /api/session/login` with `{ "code": "123456" }`

## Development

Useful commands:

```bash
npm test
npm run package:cli
APPS_DATA_DIR=.apps-data node ./bin/apps.js install ./examples/hello-plugin
APPS_DATA_DIR=.apps-data node ./src/server.js
```

Plugin examples:

- `examples/hello-plugin`
- `examples/team-nav`
- `examples/react-spa-demo`

Development docs:

- [Plugin development](docs/plugin-development.md)
- [React SPA demo](docs/react-spa-demo.md)
- [SDK](docs/sdk.md)
- [Final overview](docs/final-overview.md)
- [Release notes](RELEASE_NOTES.md)

## AI Skill Distribution

The repository includes Keli Apps authoring skills under `.agents/skills/`. A running Keli Apps instance serves the public plugin development skill from:

```text
/.well-known/agent-skills/index.json
/.well-known/agent-skills/keli-apps-plugin/SKILL.md
```

Install from a deployed instance:

```bash
npx skills add https://apps.example.com --skill keli-apps-plugin -a codex -g -y
```

Install from this repository during local development:

```bash
npx skills add . --skill keli-apps-plugin -a codex -g -y
```

The skill only teaches the authoring rules. Install `keli-cli` separately from a running instance when remote publishing is needed:

```bash
npm install -g https://apps.example.com/downloads/keli-cli/latest.tgz
```

## Deployment Template

`.gitea/workflows/deploy.yml` is a manual deployment template. Configure deployment targets through repository secrets/vars:

- Secrets: `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`
- Vars: `DEPLOY_PATH`, `DEPLOY_SERVICE`, `DEPLOY_HEALTH_URL`

Do not commit production hostnames, private paths, tokens, or SSH keys.

## License

MIT
