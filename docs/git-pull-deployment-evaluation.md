# Git 拉取部署评估

## 结论

项目可以改造为“服务器从 Git 仓库拉取代码并部署”，但不要把运行时数据目录纳入 Git 工作区。推荐采用 **服务端固定工作区 + bare mirror/checkout + 原子切换 + systemd 重启**，或使用 CI SSH 到服务器执行 `git fetch/reset`，替代直接 rsync 上传代码。

## 项目证据

- 项目为 Node ESM，`package.json` 声明 `node >=18`，`npm start` 为 `node ./src/server.js`。
- `.gitignore` 已排除 `node_modules/`、`.apps/`、`.apps-data/`、`.apps-about-data/`、`.pi/`、`.env`、日志和 CLI tarball 产物。
- 持久化数据由 `src/store.js` 基于 `APPS_DATA_DIR` 管理，包含 apps、logs、config、releases、staging 等目录。
- `.gitea/workflows/deploy.yml` 是可选部署模板，部署目标通过仓库 secrets/vars 配置，不应写入真实服务器地址或个人路径。

## 可行方案

### 方案 A：CI 触发服务端 git pull/reset

保留 CI 的测试和健康检查，把部署步骤设为 SSH 到服务器执行：

```bash
cd /srv/keli-apps
if [ ! -d .git ]; then
  git clone --depth=1 <repo-url> /tmp/keli-apps-checkout
  rsync -a /tmp/keli-apps-checkout/ /srv/keli-apps/
  rm -rf /tmp/keli-apps-checkout
fi
git fetch --prune origin main
git reset --hard origin/main
git clean -fd \
  -e .env \
  -e .apps-data/ \
  -e .apps/ \
  -e node_modules/
npm install --omit=dev --no-audit --prefer-offline
sudo systemctl restart keli-apps.service
```

适合：希望尽快替代手动上传，同时继续由 CI 控制测试、重启、健康检查。

### 方案 B：服务器 webhook 拉取部署

在服务器提供一个受签名保护的 webhook，收到 Git push 事件后执行同样的 `git fetch/reset`、重启和健康检查。仓库级代码部署建议独立 systemd service 或轻量脚本，避免应用进程重启自身导致链路复杂。

适合：不想在 CI 保存服务器 SSH 私钥，或希望仓库事件直接驱动服务器。

### 方案 C：bare 仓库 + release 目录原子切换

目录结构建议：

```text
/srv/keli-apps/repo.git
/srv/keli-apps/releases/<commit>/
/srv/keli-apps/current -> releases/<commit>
/srv/keli-apps/shared/.apps-data
/srv/keli-apps/shared/.env
```

部署步骤：

1. `git --git-dir=/srv/keli-apps/repo.git fetch origin main`
2. checkout 到新 release：`git --work-tree=.../releases/<commit> checkout -f <commit>`
3. 链接共享数据：`ln -sfn ../shared/.apps-data releases/<commit>/.apps-data`
4. 如有依赖：`npm ci --omit=dev`
5. `ln -sfn releases/<commit> current`
6. `sudo systemctl restart keli-apps.service`
7. 健康检查失败则把 `current` 回切到上一版本并重启。

适合：需要可回滚、避免半拉取状态污染正在运行的版本。

## 注意事项

1. **不要提交运行数据**：`.apps-data` 包含 app、发布快照、日志、配置、安全数据和 token，应作为 shared 持久目录并定期备份。
2. **工作区清理要加排除项**：`git clean -fdx` 会删除 `.apps-data`、`.env` 等，必须显式排除或把数据目录移出代码目录。
3. **systemd 环境要固定**：建议 service 设置 `WorkingDirectory=/srv/keli-apps/current`、`Environment=APPS_DATA_DIR=/srv/keli-apps/shared/.apps-data`。
4. **权限最小化**：不要长期用 root 部署；建议创建专用用户，仅授予代码目录、shared 数据目录和重启服务所需权限。
5. **密钥与 known_hosts**：服务端拉取需要 deploy key；CI SSH 到服务器时应固定 `known_hosts`，不要关闭主机校验。
6. **应用源码和平台源码分离**：平台内安装的应用源码、发布包和运行数据应与平台自身代码部署链路分开处理。

## 推荐自动化方式

短期：采用 **方案 A**，用 CI 触发服务端 `git fetch/reset`，保留测试和健康检查。

长期：演进到 **方案 C**，使用 release/current/shared 目录模型，实现原子发布和快速回滚，并把 `.apps-data` 从代码工作区迁移到 shared 目录。
