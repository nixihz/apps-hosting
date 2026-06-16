# Phase 7 ~ Phase 8 完成说明

本文件记录 apps 在 Phase 7「体验增强与管理台产品化」和 Phase 8「安全、认证与权限体系增强」中的基线交付。

## Phase 7：体验增强与管理台产品化

已交付：

- 管理台首页增强：保留安装向导入口；不再展示部署向导、安全中心入口。
- 应用详情页：`/admin/x/<name>`
  - 应用基础信息
  - 健康状态与指标
  - 配置编辑器
  - 发布历史与回滚入口
  - 应用日志与访问日志查看器
- 应用安装向导：`/admin/install`
- 应用市场与收藏中心页面已禁用：`/market`、`/market/x/<name>`、`/favorites` 返回 404。

## Phase 8：安全、认证与权限体系增强

已交付：

- RBAC 模型：用户、用户组、角色、权限聚合。
- 内置角色：
  - `admin`
  - `developer`
  - `viewer`
  - `auditor`
- API token：
  - `GET /api/security/tokens`
  - `POST /api/security/tokens`
  - `DELETE /api/security/tokens/<id>`
  - 支持 `Authorization: Bearer ymj_xxx`
- 安全管理 API：
  - `GET/POST /api/security/users`
  - `GET/POST /api/security/groups`
  - `GET/POST /api/security/roles`
- OIDC/OAuth2 登录入口：`GET /api/auth/oidc/login`
- Webhook 签名：
  - 平台出站 webhook 使用 `x-apps-signature: sha256=<hmac>`
  - 入站 webhook 可通过 `plugin.webhookSecret` / `webhookSecret` 启用校验
- secrets 加密存储：
  - 使用 AES-256-GCM 加密落盘
  - 配置查询默认返回 `******`
  - 后端进程启动时自动解密注入环境变量

## 验证

```bash
npm test
```

当前结果：全部通过。
