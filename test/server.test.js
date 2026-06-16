import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateTotpCode } from '../src/security.js';
import { resolveLang } from '../src/i18n.js';

const cli = path.resolve('bin/apps.js');
const totpSecret = 'JBSWY3DPEHPK3PXP';

test('server upload install requires admin, validates zip and installs safe plugin package', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-upload-data-'));
  const data = path.join(root, 'data');
  const serverPort = await getFreePort();
  const env = { ...process.env, APPS_DATA_DIR: data, APPS_PORT: String(serverPort), APPS_2FA_SECRET: totpSecret, APPS_GOOGLE_ANALYTICS_ID: 'G-TEST1234' };
  const child = spawn('node', ['src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitFor(`http://127.0.0.1:${serverPort}/api/x`);

    const validZip = createStoredZip({
      'apps.yaml': ['name: uploaded-plugin', 'title: Uploaded Plugin', 'type: plugin', 'version: 1.0.0', 'route: /x/uploaded-plugin', 'entry: dist', 'plugin:', '  kind: page'].join('\n'),
      'dist/index.html': '<h1>uploaded</h1>',
      'dist/version.json': '{"version":"1.0.0"}',
      'dist/assets/site.css': 'body{color:#123}',
      'dist/_app/immutable/chunks/app.js': 'console.log("immutable")'
    });
    const nonAdmin = await uploadZip(serverPort, validZip, 'uploaded-plugin.zip');
    assert.equal(nonAdmin.status, 401);

    const login = await fetch(`http://127.0.0.1:${serverPort}/api/session/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: currentTotp() })
    });
    const cookie = login.headers.get('set-cookie');

    const badType = await uploadZip(serverPort, Buffer.from('not zip'), 'bad.txt', { cookie });
    assert.equal(badType.status, 500);
    assert.match(await badType.text(), /仅支持上传 \.zip/);

    const missingManifest = await uploadZip(serverPort, createStoredZip({ 'dist/index.html': '<h1>missing</h1>' }), 'missing.zip', { cookie });
    assert.equal(missingManifest.status, 500);
    assert.match(await missingManifest.text(), /缺少 apps.yaml/);

    const traversal = await uploadZip(serverPort, createStoredZip({ '../outside.txt': 'pwned', 'apps.yaml': 'name: unsafe\ntitle: Unsafe\ntype: frontend\nversion: 1.0.0\nroute: /x/unsafe\nentry: dist' }), 'unsafe.zip', { cookie });
    assert.equal(traversal.status, 500);
    assert.match(await traversal.text(), /路径不安全/);
    await assert.rejects(fs.access(path.join(data, 'outside.txt')));
    await assert.rejects(fs.access(path.join(root, 'outside.txt')));

    const installed = await uploadZip(serverPort, validZip, 'uploaded-plugin.zip', { cookie });
    const installedText = await installed.text();
    assert.equal(installed.status, 200, installedText);
    const body = JSON.parse(installedText);
    assert.deepEqual(body, { name: 'uploaded-plugin', route: '/x/uploaded-plugin', status: 'installed' });
    const duplicateInstall = await uploadZip(serverPort, validZip, 'uploaded-plugin.zip', { cookie });
    assert.equal(duplicateInstall.status, 500);
    assert.match(await duplicateInstall.text(), /应用已存在：uploaded-plugin/);
    const updateZip = createStoredZip({
      'apps.yaml': ['name: uploaded-plugin', 'title: Uploaded Plugin', 'type: plugin', 'version: 1.1.0', 'route: /x/uploaded-plugin', 'entry: dist', 'plugin:', '  kind: page'].join('\n'),
      'dist/index.html': '<h1>updated</h1>',
      'dist/version.json': '{"version":"1.1.0"}',
      'dist/assets/site.css': 'body{color:#456}',
      'dist/_app/immutable/chunks/app.js': 'console.log("updated immutable")'
    });
    const updated = await uploadZip(serverPort, updateZip, 'uploaded-plugin.zip', { cookie, mode: 'update' });
    const updatedText = await updated.text();
    assert.equal(updated.status, 200, updatedText);
    assert.deepEqual(JSON.parse(updatedText), { name: 'uploaded-plugin', route: '/x/uploaded-plugin', status: 'updated' });
    await fs.access(path.join(data, 'apps/uploaded-plugin/apps.yaml'));
    const app = await fetch(`http://127.0.0.1:${serverPort}/api/x/uploaded-plugin`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(app.manifest.route, '/x/uploaded-plugin');

    const appIndexRes = await fetch(`http://127.0.0.1:${serverPort}/x/uploaded-plugin/`);
    assert.equal(appIndexRes.headers.get('cache-control'), 'no-cache');
    assert.match(appIndexRes.headers.get('etag'), /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    assert.match(appIndexRes.headers.get('last-modified'), /GMT$/);
    assert.match(await appIndexRes.text(), /googletagmanager\.com\/gtag\/js\?id=G-TEST1234/);

    const versionRes = await fetch(`http://127.0.0.1:${serverPort}/x/uploaded-plugin/version.json`);
    assert.equal(versionRes.headers.get('cache-control'), 'no-cache');

    const cssRes = await fetch(`http://127.0.0.1:${serverPort}/x/uploaded-plugin/assets/site.css`);
    assert.equal(cssRes.headers.get('cache-control'), 'public, max-age=3600');

    const immutableRes = await fetch(`http://127.0.0.1:${serverPort}/x/uploaded-plugin/_app/immutable/chunks/app.js`);
    assert.equal(immutableRes.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const notModified = await fetch(`http://127.0.0.1:${serverPort}/x/uploaded-plugin/_app/immutable/chunks/app.js`, { headers: { 'if-none-match': immutableRes.headers.get('etag') } });
    assert.equal(notModified.status, 304);
    assert.equal(notModified.headers.get('etag'), immutableRes.headers.get('etag'));

    const nestedZip = createStoredZip({
      '__MACOSX/._react-spa-demo': 'metadata',
      'examples/react-spa-demo/apps.yaml': ['name: nested-spa', 'title: Nested SPA', 'type: frontend', 'version: 1.0.0', 'route: /x/nested-spa', 'entry: dist'].join('\n'),
      'examples/react-spa-demo/dist/index.html': `<script>const base = '/x/nested-spa'; history.pushState({}, '', base + '/settings'); fetch('/api/x');</script><h1>nested</h1>`,
      'examples/react-spa-demo/dist/new.html': '<title>new nested</title><h1>new nested</h1>',
      'examples/react-spa-demo/dist/_app/immutable/assets/app.abcdef12.js': 'console.log("nested")',
      'examples/react-spa-demo/dist/assets/app.js': 'console.log("plain")'
    });
    const nested = await uploadZip(serverPort, nestedZip, 'react-spa-demo.zip', { cookie });
    const nestedText = await nested.text();
    assert.equal(nested.status, 200, nestedText);
    assert.deepEqual(JSON.parse(nestedText), { name: 'nested-spa', route: '/x/nested-spa', status: 'installed' });
    await fs.access(path.join(data, 'apps/nested-spa/apps.yaml'));
    const exactRoute = await fetch(`http://127.0.0.1:${serverPort}/x/nested-spa`, { redirect: 'manual' });
    assert.equal(exactRoute.status, 302);
    assert.equal(exactRoute.headers.get('location'), '/x/nested-spa/');
    const prefixedHtml = await fetch(`http://127.0.0.1:${serverPort}/x/nested-spa/`, { headers: { 'x-forwarded-prefix': '/yuma' } }).then((r) => r.text());
    assert.match(prefixedHtml, /'\/yuma\/x\/nested-spa'/);
    assert.match(prefixedHtml, /'\/yuma\/api\/x'/);
    assert.match(prefixedHtml, /googletagmanager\.com\/gtag\/js\?id=G-TEST1234/);
    const indexRes = await fetch(`http://127.0.0.1:${serverPort}/x/nested-spa/`);
    assert.equal(indexRes.headers.get('cache-control'), 'no-cache');
    const hashedAsset = await fetch(`http://127.0.0.1:${serverPort}/x/nested-spa/_app/immutable/assets/app.abcdef12.js`);
    assert.equal(hashedAsset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const plainAsset = await fetch(`http://127.0.0.1:${serverPort}/x/nested-spa/assets/app.js`);
    assert.equal(plainAsset.headers.get('cache-control'), 'public, max-age=3600');
    const newHtml = await fetch(`http://127.0.0.1:${serverPort}/x/nested-spa/new`).then((r) => r.text());
    assert.match(newHtml, /nested/);
    assert.match(newHtml, /gtag\('config', 'G-TEST1234'\)/);
  } finally {
    child.kill('SIGTERM');
  }
});

test('server exposes app list, login, config center and backend proxy without market/favorites pages', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-server-data-'));
  const data = path.join(root, 'data');
  const cliDownloads = path.join(root, 'cli-downloads');
  const appDir = path.join(root, 'data-query-tool');
  const serverPort = await getFreePort();
  const backendPort = await getFreePort();
  const env = { ...process.env, APPS_DATA_DIR: data, APPS_PORT: String(serverPort), APPS_2FA_SECRET: totpSecret, APPS_CLI_DOWNLOAD_DIR: cliDownloads };

  await fs.mkdir(cliDownloads, { recursive: true });
  await fs.writeFile(path.join(cliDownloads, 'latest.tgz'), 'fake cli package');
  await fs.mkdir(path.join(appDir, 'web/dist'), { recursive: true });
  await fs.mkdir(path.join(appDir, 'server'), { recursive: true });
  await fs.writeFile(path.join(appDir, 'web/dist/index.html'), '<!doctype html><h1>Data Query Tool</h1>');
  await fs.writeFile(path.join(appDir, 'server/index.js'), `import http from 'node:http';\nconst port=process.env.PORT||3000;\nhttp.createServer((req,res)=>{res.setHeader('content-type','application/json'); if(req.url==='/health') return res.end(JSON.stringify({ok:true})); res.end(JSON.stringify({url:req.url, env:process.env.RUNTIME_FLAG||'', user:req.headers['x-apps-user']||'', tenant:req.headers['x-apps-tenant']||''}));}).listen(port);\n`);
  await fs.writeFile(path.join(appDir, 'apps.yaml'), ['name: data-query-tool', 'title: 数据查询工具', 'type: fullstack', 'version: 1.0.0', 'route: /x/data-query-tool', 'frontend:', '  entry: web/dist', 'backend:', '  command: node server/index.js', `  port: ${backendPort}`, '  health: /health', 'env:', '  - RUNTIME_FLAG', 'permissions:', '  - data-query:view', 'tenants:', '  - team-a', 'groups:', '  - ops', 'versionNotes:', '  - first release', 'categories:', '  - data'].join('\n'));

  assert.equal(spawnSync('node', [cli, 'install', 'examples/team-nav'], { env }).status, 0);
  assert.equal(spawnSync('node', [cli, 'install', appDir], { env }).status, 0);
  const child = spawn('node', ['src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitFor(`http://127.0.0.1:${serverPort}/api/x`);
    const apps = await fetch(`http://127.0.0.1:${serverPort}/api/x`).then((r) => r.json());
    assert.equal(apps.some((app) => app.name === 'team-nav'), true);
    const teamNavZh = apps.find((app) => app.name === 'team-nav');
    assert.equal(teamNavZh.manifest.title, '团队导航页');
    assert.equal(teamNavZh.manifest.description, '聚合团队常用系统链接，支持搜索和分类展示。');
    assert.equal(teamNavZh.logo, '/api/x/team-nav/logo');
    const teamNavEn = await fetch(`http://127.0.0.1:${serverPort}/api/x/team-nav`, { headers: { cookie: 'lang=en' } }).then((r) => r.json());
    assert.equal(teamNavEn.manifest.title, 'Team Navigation');
    assert.equal(teamNavEn.manifest.description, 'Collects frequently used team system links with search and categorized browsing.');
    const teamNavLogo = await fetch(`http://127.0.0.1:${serverPort}/api/x/team-nav/logo`);
    assert.equal(teamNavLogo.status, 200);
    assert.equal(teamNavLogo.headers.get('content-type'), 'image/svg+xml');

    const noAccess = await fetch(`http://127.0.0.1:${serverPort}/x/data-query-tool`);
    assert.equal(noAccess.status, 403);

    const login = await fetch(`http://127.0.0.1:${serverPort}/api/session/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: currentTotp() })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /apps_session=/);

    const proxied = await waitForJson(`http://127.0.0.1:${serverPort}/x/data-query-tool/api/runtime?x=1`, { cookie }, (body) => body.url === '/api/runtime?x=1');
    assert.equal(proxied.user, '2fa-admin');
    assert.equal(proxied.tenant, '');

    const marketApi = await fetch(`http://127.0.0.1:${serverPort}/api/market/apps?category=data`, { headers: { cookie } });
    assert.equal(marketApi.status, 404);

    const favorite = await fetch(`http://127.0.0.1:${serverPort}/api/x/data-query-tool/favorite`, { method: 'POST', headers: { cookie } });
    assert.equal(favorite.status, 404);

    const putConfig = await fetch(`http://127.0.0.1:${serverPort}/api/x/data-query-tool/config`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ env: { RUNTIME_FLAG: 'hot-reloaded' } })
    });
    assert.equal(putConfig.status, 200);

    await waitForJson(`http://127.0.0.1:${serverPort}/x/data-query-tool/api/runtime`, { cookie }, (body) => body.env === 'hot-reloaded');

    const history = await fetch(`http://127.0.0.1:${serverPort}/api/x/data-query-tool/config/history`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(history.at(-1).env.RUNTIME_FLAG, 'hot-reloaded');

    const metrics = await fetch(`http://127.0.0.1:${serverPort}/api/x/data-query-tool/metrics`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(metrics.requests >= 1, true);

    const deployments = await fetch(`http://127.0.0.1:${serverPort}/api/x/data-query-tool/deployments`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(Array.isArray(deployments), true);

    const accessLogs = await fetch(`http://127.0.0.1:${serverPort}/api/x/data-query-tool/access-logs`, { headers: { cookie } }).then((r) => r.text());
    assert.match(accessLogs, /runtime/);

    const homeAdmin = await fetch(`http://127.0.0.1:${serverPort}/`, { headers: { cookie } }).then((r) => r.text());
    assert.match(homeAdmin, /管理台/);
    assert.match(homeAdmin, /Keli Apps/);
    assert.match(homeAdmin, /<h2>Apps<\/h2>/);
    assert.match(homeAdmin, /\/api\/x\/team-nav\/logo/);
    assert.match(homeAdmin, /app-icon-image/);
    assert.doesNotMatch(homeAdmin, /<h2>已安装<\/h2>/);
    assert.doesNotMatch(homeAdmin, /class="command-panel"/);
    assert.doesNotMatch(homeAdmin, /home-summary/);
    assert.doesNotMatch(homeAdmin, /Auralis/i);
    assert.match(homeAdmin, /brand-mark/);
    assert.match(homeAdmin, /keliAppsLogo/);
    assert.match(homeAdmin, /backdrop-filter:blur/);
    assert.match(homeAdmin, /\.topbar\{position:relative;z-index:40/);
    assert.match(homeAdmin, /\.lang-menu\{position:relative;z-index:60/);
    assert.match(homeAdmin, /\.lang-options\{position:absolute;[^}]*z-index:70/);
    assert.match(homeAdmin, /\.hero-shell:has\(\.lang-menu\[open\]\)\{overflow:visible\}/);
    assert.doesNotMatch(homeAdmin, /御马监/);
    assert.doesNotMatch(homeAdmin, /应用市场/);
    assert.doesNotMatch(homeAdmin, /收藏中心/);
    assert.doesNotMatch(homeAdmin, /href="\/market"/);
    assert.doesNotMatch(homeAdmin, /href="\/favorites"/);
    assert.match(homeAdmin, /运行任务/);
    assert.match(homeAdmin, /href="\/\?lang=en"/);
    assert.match(homeAdmin, /<summary>语言 <span aria-hidden="true">⌄<\/span><\/summary>/);
    assert.doesNotMatch(homeAdmin, /document\.cookie='lang=/);
    assert.match(homeAdmin, />打开<\/a>/);
    assert.doesNotMatch(homeAdmin, /打开应用/);

    const reorderGuest = await fetch(`http://127.0.0.1:${serverPort}/api/x/reorder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ names: ['data-query-tool', 'team-nav'] })
    });
    assert.equal(reorderGuest.status, 401);
    const reordered = await fetch(`http://127.0.0.1:${serverPort}/api/x/reorder`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ names: ['data-query-tool', 'team-nav'] })
    });
    assert.equal(reordered.status, 200);
    assert.deepEqual((await reordered.json()).apps.map((app) => app.name), ['data-query-tool', 'team-nav']);
    const appsAfterReorder = await fetch(`http://127.0.0.1:${serverPort}/api/x`, { headers: { cookie } }).then((r) => r.json());
    assert.deepEqual(appsAfterReorder.map((app) => app.name), ['data-query-tool', 'team-nav']);
    const homeAfterReorder = await fetch(`http://127.0.0.1:${serverPort}/`, { headers: { cookie } }).then((r) => r.text());
    assert.equal(homeAfterReorder.indexOf('/x/data-query-tool') < homeAfterReorder.indexOf('/x/team-nav'), true);

    const langRedirect = await fetch(`http://127.0.0.1:${serverPort}/admin?lang=en`, { redirect: 'manual', headers: { cookie } });
    assert.equal(langRedirect.status, 302);
    assert.equal(langRedirect.headers.get('location'), '/admin');
    assert.match(langRedirect.headers.get('set-cookie'), /lang=en; Path=\/; Max-Age=31536000; SameSite=Lax/);
    assert.equal(langRedirect.headers.get('cache-control'), 'no-store');
    const prefixedLangRedirect = await fetch(`http://127.0.0.1:${serverPort}/admin?view=apps&lang=zh`, { redirect: 'manual', headers: { cookie, 'x-forwarded-prefix': '/yuma' } });
    assert.equal(prefixedLangRedirect.status, 302);
    assert.equal(prefixedLangRedirect.headers.get('location'), '/yuma/admin?view=apps');
    const englishAdmin = await fetch(`http://127.0.0.1:${serverPort}/admin`, { headers: { cookie: `${cookie}; lang=en` } }).then((r) => r.text());
    assert.match(englishAdmin, /Console/);
    assert.doesNotMatch(englishAdmin, /Wish Pool Submissions/);
    assert.match(englishAdmin, /<summary>Language <span aria-hidden="true">⌄<\/span><\/summary>/);
    assert.match(englishAdmin, /href="\/admin\?lang=zh"/);
    const prefixedAdmin = await fetch(`http://127.0.0.1:${serverPort}/admin?view=apps`, { headers: { cookie, 'x-forwarded-prefix': '/yuma' } }).then((r) => r.text());
    assert.match(prefixedAdmin, /href="\/yuma\/admin\?view=apps&amp;lang=en"/);
    const prefixedLogin = await fetch(`http://127.0.0.1:${serverPort}/login?next=%2Fadmin`, { headers: { 'x-forwarded-prefix': '/yuma' } }).then((r) => r.text());
    assert.match(prefixedLogin, /href="\/yuma\/login\?next=%2Fadmin&amp;lang=en"/);

    const homeGuest = await fetch(`http://127.0.0.1:${serverPort}/`).then((r) => r.text());
    assert.doesNotMatch(homeGuest, /googletagmanager\.com\/gtag\/js/);
    assert.match(homeGuest, /href="\/about"/);
    assert.doesNotMatch(homeGuest, /href="\/about#purpose"/);
    assert.doesNotMatch(homeGuest, /href="\/about#values"/);
    assert.doesNotMatch(homeGuest, /许愿池/);
    assert.doesNotMatch(homeGuest, /id="wish-form"/);
    assert.doesNotMatch(homeGuest, /name="email"/);
    assert.doesNotMatch(homeGuest, /name="name"/);
    const englishHome = await fetch(`http://127.0.0.1:${serverPort}/`, { headers: { cookie: 'lang=en' } }).then((r) => r.text());
    assert.doesNotMatch(englishHome, /Wish Pool/);
    assert.match(englishHome, /href="\/about"/);
    const aboutPage = await fetch(`http://127.0.0.1:${serverPort}/about`).then((r) => r.text());
    assert.match(aboutPage, /公共利益型软件组织/);
    assert.match(aboutPage, /class="about-page"/);
    assert.doesNotMatch(aboutPage, /Earendil/i);
    assert.match(aboutPage, /href="#purpose"/);
    assert.match(aboutPage, /href="#values"/);
    assert.match(aboutPage, /href="#principles"/);
    assert.match(aboutPage, /id="purpose"/);
    assert.match(aboutPage, /id="values"/);
    assert.match(aboutPage, /id="principles"/);
    const wishListGuest = await fetch(`http://127.0.0.1:${serverPort}/api/wishes`);
    assert.equal(wishListGuest.status, 404);
    const messageSubmit = await fetch(`http://127.0.0.1:${serverPort}/api/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'v@example.com', message: 'Build a bilingual roadmap board' }) });
    assert.equal(messageSubmit.status, 404);
    assert.doesNotMatch(homeGuest, /应用市场/);
    assert.doesNotMatch(homeGuest, /收藏中心/);
    assert.doesNotMatch(homeGuest, /href="\/market"/);
    assert.doesNotMatch(homeGuest, /href="\/favorites"/);
    assert.match(homeGuest, /<a class="brand" href="\/" aria-label="首页">/);
    assert.doesNotMatch(homeGuest, /管理台/);
    assert.doesNotMatch(homeGuest, /运行任务/);
    assert.doesNotMatch(homeGuest, /当前角色/);
    assert.doesNotMatch(homeGuest, /插件应用/);
    assert.doesNotMatch(homeGuest, /href="\/admin\/install"/);
    assert.doesNotMatch(homeGuest, /href="\/login"/);

    assert.doesNotMatch(homeAdmin, /href="\/admin\/deploy"/);
    assert.doesNotMatch(homeAdmin, /href="\/admin-login"/);
    assert.match(homeAdmin, /退出/);

    const adminPage = await fetch(`http://127.0.0.1:${serverPort}/admin`, { headers: { cookie } }).then((r) => r.text());
    assert.match(adminPage, /Keli Apps/);
    assert.match(adminPage, /管理界面/);
    assert.doesNotMatch(adminPage, /许愿池提交列表/);
    assert.doesNotMatch(adminPage, /Build a bilingual roadmap board/);
    assert.match(adminPage, /admin-table/);
    assert.match(adminPage, /class="admin-actions"/);
    assert.match(adminPage, /id="save-app-order"/);
    assert.match(adminPage, /id="admin-status"/);
    assert.match(adminPage, /排序已保存/);
    assert.match(adminPage, /\.admin-action\{[^}]*background:transparent/);
    assert.match(adminPage, /\.admin-toolbar \.admin-action\{[^}]*background:linear-gradient/);
    assert.doesNotMatch(adminPage, /alert\(await response\.text\(\)\)/);
    assert.match(adminPage, /data-app-name="data-query-tool"/);
    assert.match(adminPage, /拖拽应用行可调整首页和列表展示顺序/);
    assert.doesNotMatch(adminPage, /APPS_ADMIN_TOKEN/);
    assert.doesNotMatch(adminPage, /prompt\(/);
    assert.match(adminPage, /data-method="DELETE"/);
    assert.match(adminPage, /删除/);
    assert.match(adminPage, /keliAppsLogo/);
    assert.doesNotMatch(adminPage, /御马监/);

    const removed = await fetch(`http://127.0.0.1:${serverPort}/api/x/data-query-tool`, { method: 'DELETE', headers: { cookie } });
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { removed: 'data-query-tool' });
    const afterRemove = await fetch(`http://127.0.0.1:${serverPort}/api/x`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(afterRemove.some((app) => app.name === 'data-query-tool'), false);
    await assert.rejects(fs.access(path.join(data, 'apps/data-query-tool/apps.yaml')));

    const adminDeployPage = await fetch(`http://127.0.0.1:${serverPort}/admin/deploy`, { headers: { cookie } });
    assert.equal(adminDeployPage.status, 404);

    const adminLoginPage = await fetch(`http://127.0.0.1:${serverPort}/admin-login`);
    assert.equal(adminLoginPage.status, 404);

    const marketPage = await fetch(`http://127.0.0.1:${serverPort}/market`, { headers: { cookie } });
    assert.equal(marketPage.status, 404);
    const marketDetailPage = await fetch(`http://127.0.0.1:${serverPort}/market/x/team-nav`, { headers: { cookie } });
    assert.equal(marketDetailPage.status, 404);
    const favoritesPage = await fetch(`http://127.0.0.1:${serverPort}/favorites`, { headers: { cookie } });
    assert.equal(favoritesPage.status, 404);

    const loginPage = await fetch(`http://127.0.0.1:${serverPort}/login`, { headers: { cookie } }).then((r) => r.text());
    assert.doesNotMatch(loginPage, /logout-form/);
    assert.match(loginPage, /退出/);
    const installPage = await fetch(`http://127.0.0.1:${serverPort}/admin/install`, { headers: { cookie } }).then((r) => r.text());
    assert.match(installPage, /安装和使用 Skill/);
    assert.match(installPage, /href="\/admin\/install"/);
    assert.doesNotMatch(installPage, /总览/);
    assert.doesNotMatch(installPage, /选择安装主题/);
    assert.doesNotMatch(installPage, /keli-cli publish \.\/my-app --update/);
    const installSkillPage = installPage;
    assert.match(installSkillPage, new RegExp(`npx skills add http://127\\.0\\.0\\.1:${serverPort} --skill keli-apps-plugin -a codex -g -y`));
    assert.match(installSkillPage, new RegExp(`npm install -g http://127\\.0\\.0\\.1:${serverPort}/downloads/keli-cli/latest\\.tgz`));
    assert.doesNotMatch(installSkillPage, /keli-cli publish \.\/my-app --update/);
    const installFlowPage = await fetch(`http://127.0.0.1:${serverPort}/admin/install/flow`, { headers: { cookie } }).then((r) => r.text());
    assert.match(installFlowPage, new RegExp(`keli-cli login --server http://127\\.0\\.0\\.1:${serverPort} --code 123456`));
    const proxiedInstallPage = await fetch(`http://127.0.0.1:${serverPort}/admin/install`, { headers: { cookie, 'x-forwarded-proto': 'https', 'x-forwarded-host': 'apps.example.com' } }).then((r) => r.text());
    assert.match(proxiedInstallPage, /npx skills add https:\/\/apps\.example\.com --skill keli-apps-plugin -a codex -g -y/);
    assert.match(installFlowPage, /keli-cli publish \.\/my-app --update/);
    assert.match(installFlowPage, /class="active">流程逻辑/);
    const installPromptPage = await fetch(`http://127.0.0.1:${serverPort}/admin/install/prompt`, { headers: { cookie } }).then((r) => r.text());
    assert.match(installPromptPage, /复制给 Agent 的提示词/);
    assert.match(installPage, /流程逻辑/);
    assert.doesNotMatch(installPage, /应用市场/);

    const cliDownload = await fetch(`http://127.0.0.1:${serverPort}/downloads/keli-cli/latest.tgz`);
    assert.equal(cliDownload.status, 200);
    assert.equal(cliDownload.headers.get('content-type'), 'application/gzip');
    assert.equal(cliDownload.headers.get('cache-control'), 'no-cache');
    assert.equal(cliDownload.headers.get('content-disposition'), 'attachment; filename="latest.tgz"');
    assert.equal(await cliDownload.text(), 'fake cli package');

    const skillsIndex = await fetch(`http://127.0.0.1:${serverPort}/.well-known/agent-skills/index.json`).then((r) => r.json());
    assert.equal(skillsIndex.skills[0].name, 'keli-apps-plugin');
    assert.deepEqual(skillsIndex.skills[0].files, ['SKILL.md']);
    const skillMd = await fetch(`http://127.0.0.1:${serverPort}/.well-known/agent-skills/keli-apps-plugin/SKILL.md`).then((r) => r.text());
    assert.match(skillMd, /name: keli-apps-plugin/);
    assert.match(skillMd, /apps.yaml/);
  } finally {
    child.kill('SIGTERM');
  }
});

test('resolveLang parses i18n cookie by cookie-name boundary only', () => {
  assert.equal(resolveLang({ headers: { cookie: 'mylang=en; langish=zh', 'accept-language': 'zh-CN' } }), 'zh');
  assert.equal(resolveLang({ headers: { cookie: 'foo=1; lang=en; other=zh', 'accept-language': 'zh-CN' } }), 'en');
  assert.equal(resolveLang({ headers: { cookie: 'xlang=zh; lang=zh', 'accept-language': 'en-US' } }), 'zh');
});

function currentTotp() {
  return generateTotpCode(totpSecret, Math.floor(Date.now() / 1000 / 30));
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function uploadZip(port, data, filename, options = {}) {
  const form = new FormData();
  if (options.mode) form.append('mode', options.mode);
  form.append('plugin', new Blob([data], { type: 'application/zip' }), filename);
  const headers = { ...options };
  delete headers.mode;
  return await fetch(`http://127.0.0.1:${port}/api/x/install-upload`, { method: 'POST', headers, body: form });
}

function createStoredZip(entries) {
  const fileParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    fileParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...fileParts, ...centralParts, eocd]);
}

async function waitFor(url) {
  for (let i = 0; i < 40; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server not ready: ${url}`);
}

async function waitForJson(url, headers, predicate) {
  for (let i = 0; i < 40; i++) {
    try {
      const body = await fetch(url, { headers }).then((r) => r.json());
      if (predicate(body)) return body;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`json not ready: ${url}`);
}
