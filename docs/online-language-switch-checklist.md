# 线上语言切换无效：部署与反向代理核查清单

## 仓库内证据

- 运行入口：`package.json` 的 `npm start` 为 `node ./src/server.js`，默认端口来自 `PORT` / `APPS_PORT` / `4173`。
- 语言切换实现：`src/server.js` 识别 `?lang=zh|en` 后写入 `Set-Cookie: lang=...; Path=/; Max-Age=31536000; SameSite=Lax` 并 302 跳回原路径。
- 语言解析：`src/i18n.js` 优先从 `lang` cookie 解析语言。
- 反向代理前缀支持：`src/server.js` 支持 `X-Forwarded-Prefix`，有该头时会把跳转路径补上外部挂载前缀。
- 静态缓存策略：`src/server.js` 的 `staticCacheHeaders()` 对静态应用 `index.html` / `version.json` 返回 `no-cache`，`_app/immutable` 返回一年 immutable。

## 必查 1：确认部署路径和线上代码版本

在服务器执行：

```bash
cd /srv/keli-apps/current
pwd
node -p "require('./package.json').scripts.start"
git rev-parse --short HEAD 2>/dev/null || true
git status --short 2>/dev/null || true
grep -n "function redirectWithLang" src/server.js
grep -n "x-forwarded-prefix" src/server.js
grep -n "cache-control.*no-store\\|staticCacheHeaders" src/server.js
```

判断：

- 如果实际工作目录不是部署目标目录，要修正 CI 的 `DEPLOY_PATH` 或 systemd `WorkingDirectory`。
- 如果线上 `src/server.js` 没有 `redirectWithLang()` / `X-Forwarded-Prefix` 相关代码，说明服务仍运行旧代码，需要重新部署并重启。

## 必查 2：确认 systemd 工作目录和环境

在服务器执行：

```bash
systemctl cat keli-apps.service
systemctl show keli-apps.service -p FragmentPath -p WorkingDirectory -p ExecStart -p Environment -p User
systemctl status --no-pager --full keli-apps.service
journalctl -u keli-apps.service -n 80 --no-pager
```

期望：

```ini
WorkingDirectory=/srv/keli-apps/current
ExecStart=/usr/bin/npm start
Environment=APPS_DATA_DIR=/srv/keli-apps/shared/.apps-data
```

修改 service 后执行：

```bash
systemctl daemon-reload
systemctl restart keli-apps.service
systemctl status --no-pager --full keli-apps.service
```

## 必查 3：反向代理是否传递 `X-Forwarded-Prefix`

如果公网入口挂在子路径，例如 `https://apps.example.com/platform/`，反向代理的 location 必须向 Node 传递前缀：

```nginx
location /platform/ {
    proxy_pass http://127.0.0.1:4173/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Prefix /platform;
}
```

核查命令：

```bash
nginx -T 2>&1 | grep -nE "server_name|location /platform|proxy_pass|X-Forwarded-Prefix|proxy_set_header"
nginx -t
systemctl reload nginx
```

判断：

- 没有 `X-Forwarded-Prefix` 时，点击语言切换会请求 `/platform/admin?lang=en`，后端可能返回 `Location: /admin`，浏览器跳出前缀。
- 加上请求头且部署了新代码后，应返回 `Location: /platform/admin`。

## 必查 4：HTML/静态缓存是否保留旧页面

线上验证响应头：

```bash
curl -kI https://apps.example.com/platform/admin
curl -kI 'https://apps.example.com/platform/admin?lang=en'
curl -kI https://apps.example.com/platform/x/<name>/
curl -kI https://apps.example.com/platform/x/<name>/_app/immutable/<asset>
```

建议：

```nginx
proxy_no_cache $http_cookie $arg_lang;
proxy_cache_bypass $http_cookie $arg_lang;
```

动态 HTML 和语言切换 302 不应被缓存为 `public, max-age=...`；静态 hash 资源可以长期缓存，`index.html` 不可长期缓存。

## 必查 5：验证线上确实运行新代码

按顺序执行：

```bash
curl -sS -D- -o /dev/null -H 'X-Forwarded-Prefix: /platform' 'http://127.0.0.1:4173/admin?lang=en'
curl -k -sS -D- -o /dev/null 'https://apps.example.com/platform/admin?lang=en'
curl -k -sS -H 'Cookie: lang=en' 'https://apps.example.com/platform/admin' | grep -E 'Console|Install|Deploy|Language'
curl -k -sS -D- -o /dev/null 'https://apps.example.com/platform/admin?lang=zh'
curl -k -sS -H 'Cookie: lang=zh' 'https://apps.example.com/platform/admin' | grep -E '管理台|安装向导|部署|Language'
```

如果第 1 步正确、第 2 步错误：问题在反向代理未传 `X-Forwarded-Prefix` 或改写了 `Location`。  
如果第 1 步错误：问题在 systemd 仍运行旧代码或未重启到正确目录。  
如果响应头正确但浏览器仍无效：优先清理/绕过浏览器、CDN、代理缓存，并确认没有旧 Service Worker。
