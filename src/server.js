import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadRegistry, ensureStore, getApp, saveRegistry, removeApp, reorderApps, dataDir, stagingDir, appsDir } from './store.js';
import { resolveLang, t } from './i18n.js';
import { getFrontendEntry, normalizeRoute, readManifest } from './manifest.js';
import { exists, safeJoin } from './fileops.js';
import { startBackend, stopBackend, processStatus, tailLog, checkHealth } from './process-manager.js';
import { ensureConfigCenter, getAppConfig, listAuditLogs, listConfigHistory, updateAppConfig } from './config-center.js';
import { clearSessionCookie, createSessionCookie, sessionFromHeaders } from './session.js';
import { enrichSession, ensureSecurityStore, hasPermission, issueApiToken, listApiTokens, listGroups, listRoles, listUsers, revokeApiToken, sessionFromApiToken, upsertGroup, upsertRole, upsertUser, verifySignature, verifyTotpCode } from './security.js';
import { cronStatus, startCronPlugin, stopCronPlugin } from './scheduler.js';
import { deployApp, listDeployments, rollbackApp } from './deployments.js';
import { getMetrics, recordAccess, recordError, tailAccessLog, tailErrorLog } from './observability.js';
import { addWebhook, emitEvent, listDeliveries, listEvents, listWebhooks, removeWebhook } from './event-bus.js';
import { buildOpenApi } from './openapi.js';
import { backupSnapshot, platformInfo, policyReport } from './platform.js';
import { installAppFromDirectory } from './installer.js';
import { extractZip } from './zip.js';
import { renderInstallWizardBody } from './install-page.js';
import { isSkillDistributionPath, skillDistributionResponse } from './skill-distribution.js';

const port = Number(process.env.APPS_PORT || process.env.PORT || 4173);
const googleAnalyticsId = String(process.env.APPS_GOOGLE_ANALYTICS_ID || '').trim();
const googleAnalyticsSnippet = googleAnalyticsId ? `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${googleAnalyticsId}');
</script>` : '';

await ensureStore();
await ensureConfigCenter();
await ensureSecurityStore();
for (const app of (await loadRegistry()).apps) {
  await startBackend(app);
  await startCronPlugin(app);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const requestedLang = url.searchParams.get('lang');
    if (requestedLang === 'zh' || requestedLang === 'en') return redirectWithLang(req, res, url, requestedLang);
    if (isSkillDistributionPath(url.pathname)) return await serveSkillDistribution(res, url);
    if (url.pathname.startsWith('/downloads/keli-cli/')) return await serveCliDownload(res, url);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/' || url.pathname === '/index.html') return await renderHome(req, res);
    if (url.pathname === '/about') return await renderAbout(req, res);
    if (url.pathname === '/admin') return await renderAdmin(req, res, url);
    if (url.pathname.startsWith('/admin/x/')) return await renderAppDetail(req, res, url, url.pathname.split('/')[3]);
    if (url.pathname === '/admin/install' || url.pathname.startsWith('/admin/install/')) return await renderInstallWizardV2(req, res, url);
    if (url.pathname === '/login') return await renderLogin(req, res, url);
    if (url.pathname.startsWith('/hooks/')) return await handleWebhook(req, res, url);
    if (url.pathname.startsWith('/x/')) return await serveApp(req, res, url);
    return send(res, 404, 'Not Found');
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(t('zh','port_in_use',port));
    console.error(t('zh','data_dir',dataDir()));
    process.exit(1);
  }
  throw error;
});

server.listen(port, async () => {
  const registry = await loadRegistry();
  console.log(t('zh','server_running',port));
  console.log(`dataDir=${dataDir()} apps=${registry.apps.map((app) => app.name).join(', ') || '-'}`);
});

async function handleApi(req, res, url) {
  const lang = resolveLang(req);
  const session = await getSession(req);
  if (req.method === 'GET' && url.pathname === '/api/session') return json(res, 200, session);
  if (req.method === 'POST' && url.pathname === '/api/session/login') return await login(req, res);
  if (req.method === 'POST' && url.pathname === '/api/session/logout') return json(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie() });
  if (req.method === 'GET' && url.pathname === '/api/platform') return json(res, 200, await platformInfo());
  if (req.method === 'GET' && url.pathname === '/api/openapi.json') return json(res, 200, buildOpenApi(`${url.protocol}//${url.host}`));
  if (req.method === 'GET' && url.pathname === '/api/events') return json(res, 200, await listEvents(Number(url.searchParams.get('limit') || 100)));
  if (req.method === 'GET' && url.pathname === '/api/platform/webhooks') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await listWebhooks()); }
  if (req.method === 'POST' && url.pathname === '/api/platform/webhooks') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await addWebhook(await readJsonBody(req))); }
  if (req.method === 'GET' && url.pathname === '/api/platform/webhook-deliveries') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await listDeliveries(Number(url.searchParams.get('limit') || 100))); }
  if (req.method === 'GET' && url.pathname === '/api/platform/policy-report') return json(res, 200, await policyReport());
  if (req.method === 'GET' && url.pathname === '/api/platform/backup') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await backupSnapshot()); }
  if (url.pathname.startsWith('/api/security')) return await handleSecurityApi(req, res, url, session);
  if (req.method === 'GET' && url.pathname.startsWith('/api/auth/oidc/')) return json(res, 404, { error: t(lang, 'oidc_disabled') });
  if (req.method === 'GET' && url.pathname === '/api/x') return json(res, 200, (await loadRegistry()).apps.map((app) => publicApp(app, session, lang)));
  if (req.method === 'POST' && url.pathname === '/api/x/reorder') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await reorderInstalledApps(req)); }
  if (req.method === 'POST' && url.pathname === '/api/x/install-upload') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await installUploadedApp(req, session)); }
  const webhookMatch = url.pathname.match(/^\/api\/platform\/webhooks\/([^/]+)$/);
  if (req.method === 'DELETE' && webhookMatch) { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await removeWebhook(webhookMatch[1])); }
  if (req.method === 'GET' && url.pathname === '/api/audit') {
    if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') });
    return json(res, 200, await listAuditLogs(Number(url.searchParams.get('limit') || 200)));
  }
  const pluginProxy = url.pathname.match(/^\/api\/plugins\/([^/]+)(?:\/(.*))?$/);
  if (pluginProxy) return await proxyPluginApi(req, res, pluginProxy[1], pluginProxy[2] || '', url.search);
  const match = url.pathname.match(/^\/api\/x\/([^/]+)(?:\/(.*))?$/);
  if (!match) return json(res, 404, { error: t(lang, 'api_not_found') });
  const app = await getApp(match[1]);
  if (!app) return json(res, 404, { error: t(lang, 'app_not_found') });
  const action = match[2] || '';
  if (req.method === 'GET' && action === '') return json(res, 200, publicApp(app, session, lang));
  if (req.method === 'GET' && action === 'logo') return await serveAppLogo(res, app);
  if (req.method === 'GET' && action === 'logs') return send(res, 200, await tailLog(app.name, Number(url.searchParams.get('lines') || 200)), 'text/plain; charset=utf-8');
  if (req.method === 'GET' && action === 'access-logs') return send(res, 200, await tailAccessLog(app.name, Number(url.searchParams.get('lines') || 200)), 'text/plain; charset=utf-8');
  if (req.method === 'GET' && action === 'error-logs') return send(res, 200, await tailErrorLog(app.name, Number(url.searchParams.get('lines') || 200)), 'text/plain; charset=utf-8');
  if (req.method === 'GET' && action === 'health') return json(res, 200, await checkHealth(app));
  if (req.method === 'GET' && action === 'status') return json(res, 200, combinedStatus(app.name));
  if (req.method === 'GET' && action === 'metrics') return json(res, 200, getMetrics(app.name));
  if (req.method === 'GET' && action === 'deployments') return json(res, 200, await listDeployments(app.name));
  if (req.method === 'GET' && action === 'config') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await getAppConfig(app.name)); }
  if (req.method === 'GET' && action === 'config/history') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await listConfigHistory(app.name)); }
  if (req.method === 'PUT' && action === 'config') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await saveConfigAndReload(req, app, session)); }
  if (req.method === 'POST' && action === 'deploy') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await deployViaApi(req, app.name)); }
  if (req.method === 'POST' && action === 'rollback') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await rollbackViaApi(req, app.name)); }
  if (req.method === 'POST' && action === 'start') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); await startBackend(app); await startCronPlugin(app); return json(res, 200, combinedStatus(app.name)); }
  if (req.method === 'POST' && action === 'stop') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, { stopped: stopBackend(app.name) || stopCronPlugin(app.name) }); }
  if (req.method === 'POST' && (action === 'enable' || action === 'disable')) { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await setAppEnabled(app.name, action === 'enable')); }
  if (req.method === 'DELETE' && action === '') { if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') }); return json(res, 200, await deleteInstalledApp(app)); }
  return json(res, 404, { error: t(lang, 'api_not_found') });
}

async function serveApp(req, res, url) {
  const lang = resolveLang(req);
  const startedAt = Date.now();
  const session = await getSession(req);
  const registry = await loadRegistry();
  const app = findMountedApp(registry.apps, url.pathname);
  if (!app) return send(res, 404, t(lang, 'app_not_found'));
  if (!canAccess(session, app)) return json(res, 403, { error: t(lang, 'no_access') });
  const route = normalizeRoute(app.manifest.route);
  if (shouldProxyAppRequest(app, url.pathname, route)) {
    const subPath = `/${url.pathname.slice(route.length).replace(/^\//, '')}`.replace(/^\/$/, '/');
    return await proxyToBackend(req, res, app, subPath, url.search);
  }
  const entry = getFrontendEntry(app.manifest);
  if (!entry) return json(res, 404, { error: t(lang, 'no_frontend_entry') });
  if (url.pathname === route && !url.pathname.endsWith('/')) {
    res.writeHead(302, { location: `${route}/` });
    res.end();
    return;
  }
  const rel = decodeURIComponent(url.pathname.slice(route.length)).replace(/^\//, '') || 'index.html';
  const root = path.resolve(app.path, entry);
  let file = safeJoin(root, rel);
  if (file && !(await exists(file)) && !path.extname(file) && (await exists(`${file}.html`))) file = `${file}.html`;
  if (!file || !(await exists(file))) file = path.join(root, 'index.html');
  if (!(await exists(file))) return send(res, 404, 'index.html Not Found');
  let stat = await fs.stat(file);
  if (stat.isDirectory()) file = path.join(file, 'index.html');
  if (!(await exists(file))) return send(res, 404, 'index.html Not Found');
  stat = await fs.stat(file);
  const headers = staticCacheHeaders(file, stat);
  if (isFresh(req, headers)) {
    await recordAccess(app.name, { method: req.method, path: url.pathname, status: 304, durationMs: Date.now() - startedAt, type: 'static' });
    res.writeHead(304, headers);
    res.end();
    return;
  }
  await recordAccess(app.name, { method: req.method, path: url.pathname, status: 200, durationMs: Date.now() - startedAt, type: 'static' });
  const type = contentType(file);
  const body = await fs.readFile(file);
  return send(res, 200, rewriteStaticBodyForPrefix(req, body, file), type, headers);
}

async function handleWebhook(req, res, url) {
  const lang = resolveLang(req);
  const name = url.pathname.split('/')[2];
  const app = await getApp(name);
  if (!app || app.manifest?.plugin?.kind !== 'webhook') return json(res, 404, { error: t(lang, 'webhook_not_found') });
  let rawBody;
  const secret = app.manifest?.plugin?.webhookSecret || app.manifest?.webhookSecret;
  if (secret) {
    rawBody = await readRawBody(req);
    if (!verifySignature(secret, rawBody, req.headers['x-apps-signature'])) return json(res, 401, { error: t(lang, 'webhook_verify_failed') });
  }
  return await proxyToBackend(req, res, app, `/${url.pathname.split('/').slice(3).join('/')}`.replace(/^\/$/, '/'), url.search, rawBody);
}

async function renderHome(req, res) {
  const lang = resolveLang(req);
  const session = await getSession(req);
  const apps = (await loadRegistry()).apps.filter((app) => app.enabled && canAccess(session, app));
  const cards = (await Promise.all(apps.map(async (app, index) => {
    const categories = [...new Set([app.manifest.plugin?.category, ...(app.manifest.categories || [])].filter(Boolean))];
    const title = appTitle(app, lang);
    const description = appDescription(app, lang);
    return `<article class="app-card motion-card" data-motion-card style="--delay:${index * 70}ms;--hue:${(index * 47) % 360}"><div class="card-glow"></div><div class="card-head">${await appLogoHtml(app, lang)}<span class="motion-dot" aria-hidden="true"></span></div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${categories.length ? `<div class="chips">${categories.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}<div class="actions"><a class="primary-action" href="${escapeHtml(app.manifest.route)}">${t(lang, 'open_app')}</a></div></article>`;
  }))).join('');

  const canAdmin = hasPermission(session, 'platform:admin');
  const adminStats = canAdmin ? `<section class="stats"><div><strong>${apps.length}</strong><span>${t(lang, 'accessible_apps')}</span></div><div><strong>${apps.filter((app) => app.enabled).length}</strong><span>${t(lang, 'enabled_label')}</span></div><div><strong>${apps.filter((app) => renderStatusText(app.name) !== 'stopped').length}</strong><span>${t(lang, 'running_tasks')}</span></div><div><strong>${escapeHtml(session.name || 'guest')}</strong><span>${t(lang, 'user_label')}</span></div></section>` : '';
  const aboutAction = `<a class="story-action" href="/about">${t(lang, 'about_nav')} ›</a>`;
  const heroActions = `<div class="hero-actions">${aboutAction}${canAdmin ? `<a class="cta" href="/admin/install">${t(lang, 'install_wizard_title')}</a><a class="ghost" href="/admin">${t(lang, 'admin_panel')}</a>` : ''}</div>`;
  return send(res, 200, page(t(lang, 'home_title'), `<section class="hero-shell kinetic-stage" data-kinetic><header class="topbar glass">${brandHomeLink(lang, t(lang, 'brand_subtitle'), req)}${topbarNav(session, lang, req)}</header><div class="hero-grid"><div class="hero-copy"><p class="eyebrow">${t(lang, 'home_eyebrow', apps.length)}</p><h1 class="elastic-title" aria-label="${escapeHtml(t(lang, 'brand_name'))}">${[...t(lang, 'brand_name')].map((char, index) => `<span style="--i:${index}">${char === ' ' ? '&nbsp;' : escapeHtml(char)}</span>`).join('')}</h1><p class="lead">${t(lang, 'home_motion_lead')}</p>${heroActions}</div><div class="geo-scene" aria-hidden="true"><span class="geo geo-ring"></span><span class="geo geo-square"></span><span class="geo geo-pill"></span><span class="geo geo-dot"></span></div></div><i class="orb orb-a"></i><i class="orb orb-b"></i></section>${adminStats}<div class="section-title" id="apps"><h2>${t(lang, 'installed_apps')}</h2></div><section class="app-grid">${cards || `<article class="empty-state"><h2>${t(lang, 'no_accessible_apps')}</h2><p>${t(lang, 'install_hint')}</p></article>`}</section>`), 'text/html; charset=utf-8');
}

async function renderAbout(req, res) {
  const lang = resolveLang(req);
  const session = await getSession(req);
  return send(res, 200, page(t(lang, 'about_page_title'), `${aboutPageStyle()}<div class="about-page"><div class="about-shell"><header class="topbar about-topbar">${brandHomeLink(lang, t(lang, 'brand_subtitle'), req)}${topbarNav(session, lang, req)}</header><section class="about-hero"><div class="about-hero-copy"><h1>${t(lang, 'about_title')}</h1><p class="lead">${t(lang, 'about_body')}</p></div><nav class="about-jump" aria-label="${escapeHtml(t(lang, 'about_page_title'))}"><a href="#purpose">${t(lang, 'purpose_nav')}</a><a href="#values">${t(lang, 'values_nav')}</a><a href="#principles">${t(lang, 'principles_nav')}</a></nav></section>${renderManifesto(lang)}</div></div>`), 'text/html; charset=utf-8');
}

function aboutPageStyle() {
  return `<style>
    .about-page{--about-ink:#172033;--about-muted:#687386;--about-rule:#d7dce5;--about-paper:#fbfaf6;--about-accent:#b84a32;color:var(--about-ink);background:linear-gradient(180deg,#f7f4ee 0%,#fbfaf6 46%,#f3f0e8 100%);border:1px solid #ece6dc;box-shadow:0 24px 70px #3a2d2012}
    .about-shell{width:min(1040px,100%);margin:0 auto;padding:18px clamp(18px,4vw,44px) 64px}
    .about-page .about-topbar{padding:4px 0 28px;border-bottom:1px solid var(--about-rule)}
    .about-page .brand-mark{box-shadow:none;border-color:#e2ddd2;background:#fff}
    .about-page nav a,.about-page nav summary,.about-page .nav-logout{background:#fff;border-color:#e5dfd4;box-shadow:none;color:var(--about-ink)}
    .about-page .about-hero{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:38px;align-items:end;margin:0;padding:70px 0 34px;border:0;border-radius:0;background:transparent;box-shadow:none;overflow:visible}
    .about-page .about-hero:before,.about-page .about-hero:after{display:none}
    .about-page .about-hero-copy{padding:0;align-self:auto}
    .about-page .eyebrow,.about-page .section-kicker{color:var(--about-accent);letter-spacing:.18em}
    .about-page .about-hero-copy h1{max-width:820px;font-family:Georgia,'Times New Roman',serif;font-size:clamp(38px,6vw,72px);line-height:1.02;letter-spacing:-.035em;font-weight:500}
    .about-page .lead{max-width:700px;margin-top:24px;font-size:clamp(17px,2vw,21px);line-height:1.8;color:#3f4858}
    .about-page .about-jump{display:grid;gap:10px;padding:0;align-self:end}
    .about-page .about-jump a{justify-content:flex-start;background:transparent;color:var(--about-ink);border:0;border-bottom:1px solid var(--about-rule);border-radius:0;box-shadow:none;padding:12px 0;font-weight:700}
    .about-page .about-jump a:hover{transform:none;color:var(--about-accent);box-shadow:none}
    .about-page .manifesto{margin:18px 0 0;padding:0}
    .about-page .manifesto:before{display:none}
    .about-page .manifesto-index{position:static;justify-content:flex-start;margin:0 0 18px;padding-top:18px;border-top:1px solid var(--about-rule)}
    .about-page .manifesto-index a{background:transparent;border:0;border-radius:0;box-shadow:none;padding:6px 0;margin-right:18px;color:var(--about-muted)}
    .about-page .manifesto-about{padding:40px 0 44px;background:transparent;border:0;border-top:2px solid var(--about-ink);box-shadow:none}
    .about-page .manifesto-about h2{max-width:780px;font-family:Georgia,'Times New Roman',serif;font-size:clamp(32px,4.6vw,58px);line-height:1.04;letter-spacing:-.03em;font-weight:500}
    .about-page .manifesto-about p:not(.section-kicker){max-width:700px;color:#3f4858}
    .about-page .manifesto-grid{grid-template-columns:1fr;gap:0;margin-top:0}
    .about-page .manifesto-block{padding:34px 0;background:transparent;border:0;border-radius:0;border-top:1px solid var(--about-rule);box-shadow:none}
    .about-page .manifesto-block h3{font-family:Georgia,'Times New Roman',serif;font-size:clamp(28px,3.4vw,44px);letter-spacing:-.025em;font-weight:500}
    .about-page .manifesto-block p{max-width:720px;color:#3f4858}
    .about-page .values-block ul{gap:0;margin-top:26px;border-top:1px solid var(--about-rule)}
    .about-page .values-block li{grid-template-columns:minmax(180px,.34fr) 1fr;gap:28px;padding:18px 0;border-top:0;border-bottom:1px solid var(--about-rule)}
    .about-page .values-block strong{font-size:16px;color:var(--about-ink)}
    .about-page .values-block span{color:#495365}
    .about-page .principles-block{padding-bottom:0}
    @media(max-width:820px){.about-shell{padding:14px 18px 44px}.about-page .about-hero{grid-template-columns:1fr;gap:24px;padding:44px 0 28px}.about-page .about-jump{display:flex;flex-wrap:wrap}.about-page .about-jump a{border:1px solid var(--about-rule);border-radius:999px;padding:9px 12px;background:#fff}.about-page .values-block li{grid-template-columns:1fr;gap:7px}}
  </style>`;
}

function renderManifesto(lang) {
  const purposeItems = t(lang, 'purpose_items');
  const values = t(lang, 'values_items');
  const principles = t(lang, 'principles_items');
  return `<section class="manifesto" id="about" aria-label="${escapeHtml(t(lang, 'about_page_title'))}">
    <div class="manifesto-index"><a href="#about">${t(lang, 'about_nav')} ›</a><a href="#purpose">${t(lang, 'purpose_nav')}</a><a href="#values">${t(lang, 'values_nav')}</a><a href="#principles">${t(lang, 'principles_nav')}</a></div>
    <div class="manifesto-grid">
      <article id="purpose" class="manifesto-block values-block"><p class="section-kicker">${t(lang, 'purpose_nav')}</p><h3>${t(lang, 'purpose_title')}</h3><p>${t(lang, 'purpose_body')}</p><ul>${purposeItems.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></li>`).join('')}</ul></article>
      <article id="values" class="manifesto-block values-block"><p class="section-kicker">${t(lang, 'values_nav')}</p><h3>${t(lang, 'values_title')}</h3><ul>${values.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></li>`).join('')}</ul></article>
      <article id="principles" class="manifesto-block values-block principles-block"><p class="section-kicker">${t(lang, 'principles_nav')}</p><h3>${t(lang, 'principles_title')}</h3><ul>${principles.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></li>`).join('')}</ul></article>
    </div>
  </section>`;
}

async function renderAdmin(req, res, url) {
  const lang = resolveLang(req);
  const session = await getSession(req);
  if (!requireAuthenticatedPage(req, res, url, session)) return;
  if (!hasPermission(session, 'platform:admin')) return send(res, 403, page(t(lang, 'no_permission_admin'), `<article><h1>${t(lang, 'no_permission_admin')}</h1><p>${t(lang, 'admin_login_required')}</p><p><a class="primary" href="/login?next=${encodeURIComponent(url.pathname)}">${t(lang, 'switch_account')}</a></p></article>`), 'text/html; charset=utf-8');
  const apps = (await loadRegistry()).apps;
  const body = `${adminPageStyle()}<section class="hero-shell compact"><header class="topbar glass">${brandHomeLink(lang, t(lang, 'ops_panel'), req)}${topbarNav(session, lang, req)}</header><div class="admin-hero"><p class="eyebrow">${t(lang, 'admin_summary')}</p><h1>${t(lang, 'ops_panel')}</h1><p class="lead">${t(lang, 'admin_console_lead')}</p></div><i class="orb orb-a"></i></section>${renderAdminStats(apps, session, lang)}${renderAdminTable(apps, lang)}${renderAdminScript(lang)}`;
  return send(res, 200, page(t(lang, 'admin_panel'), body), 'text/html; charset=utf-8');
}

function adminPageStyle() {
  return `<style>
    .admin-table{table-layout:auto}
    .admin-toolbar{display:flex;justify-content:flex-end;gap:10px;margin:0 0 12px}
    .sort-handle{width:42px;color:#64748b;cursor:grab;font-size:20px;user-select:none}
    .admin-table tr.dragging{opacity:.55}
    .admin-table tr.drag-over{box-shadow:inset 0 2px 0 #3157c9}
    .admin-status{margin-right:auto;color:#15803d;font:700 13px ui-sans-serif,system-ui,sans-serif}
    .admin-status.error{color:#b91c1c}
    .admin-actions{display:flex;gap:5px 10px;flex-wrap:wrap;align-items:center;max-width:620px}
    .admin-action{display:inline-flex;align-items:center;justify-content:center;min-height:auto;margin:0;border:0;border-radius:0;padding:2px 0;font:700 13px ui-sans-serif,system-ui,sans-serif;color:#3157c9;background:transparent;box-shadow:none;cursor:pointer;text-decoration:none;transition:color .15s}
    .admin-action:hover{color:#123a6f;text-decoration:underline;text-underline-offset:3px;transform:none;box-shadow:none}
    .admin-action.danger{color:#b91c1c;background:transparent;border:0;box-shadow:none}
    .admin-action.danger:hover{color:#7f1d1d}
    .admin-action:disabled{color:#94a3b8;cursor:wait;text-decoration:none}
    .admin-table td a.admin-action{color:#3157c9;margin:0}
    .admin-table td a.admin-action:hover{color:#123a6f}
    .admin-toolbar .admin-action{min-height:34px;border:1px solid #ffffffc7;border-radius:999px;padding:8px 12px;color:#fff;background:linear-gradient(135deg,#123a6f,#3157c9 58%,#00a8c7);box-shadow:0 12px 28px #0f5ea81f}
    .admin-toolbar .admin-action:hover{color:#fff;text-decoration:none;transform:translateY(-1px);box-shadow:0 16px 34px #0f5ea82b}
    .admin-toolbar .admin-action:disabled{opacity:.55;cursor:not-allowed}
    @media(max-width:820px){.admin-table{display:block;overflow-x:auto}.admin-actions{min-width:360px}}
  </style>`;
}

function renderAdminStats(apps, session, lang) {
  return `<section class="stats"><div><strong>${apps.length}</strong><span>${t(lang, 'app')}</span></div><div><strong>${apps.filter((app) => app.enabled).length}</strong><span>${t(lang, 'enable')}</span></div><div><strong>${apps.filter((app) => renderStatusText(app.name) !== 'stopped').length}</strong><span>${t(lang, 'running_tasks')}</span></div><div><strong>${escapeHtml(session.name || 'guest')}</strong><span>${t(lang, 'user_label')}</span></div></section>`;
}

function renderAdminTable(apps, lang) {
  const rows = apps.map((app) => renderAdminRow(app, lang)).join('');
  return `<div class="admin-toolbar"><span class="admin-status" id="admin-status" role="status" aria-live="polite"></span><button class="admin-action" type="button" id="save-app-order" disabled>${t(lang, 'save_order')}</button></div><table class="admin-table" id="admin-app-table"><thead><tr><th>${t(lang, 'sort')}</th><th>${t(lang, 'app')}</th><th>${t(lang, 'type')}</th><th>${t(lang, 'status')}</th><th>${t(lang, 'tenant')}</th><th>${t(lang, 'action')}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAdminRow(app, lang) {
  return `<tr draggable="true" data-app-name="${escapeHtml(app.name)}"><td class="sort-handle" aria-label="${escapeHtml(t(lang, 'sort'))}">☰</td><td>${escapeHtml(app.name)}</td><td>${escapeHtml(app.manifest.type)}</td><td>${escapeHtml(renderStatusText(app.name))}</td><td>${escapeHtml((app.manifest.tenants || []).join(', ') || '-')}</td><td>${renderAdminActions(app, lang)}</td></tr>`;
}

function renderAdminActions(app, lang) {
  const appPath = `/api/x/${encodeURIComponent(app.name)}`;
  const toggleAction = app.enabled ? 'disable' : 'enable';
  const toggleLabel = app.enabled ? t(lang, 'disable') : t(lang, 'enable');
  return `<div class="admin-actions">
    ${adminActionLink(`/admin/x/${encodeURIComponent(app.name)}`, t(lang, 'detail'))}
    ${adminActionLink(app.manifest.route, t(lang, 'open'))}
    ${adminActionLink(`${appPath}/logs`, t(lang, 'logs'))}
    ${adminActionLink(`${appPath}/access-logs`, t(lang, 'access_logs'))}
    ${adminActionLink(`${appPath}/metrics`, t(lang, 'metrics'))}
    ${adminActionLink(`${appPath}/deployments`, t(lang, 'deployments'))}
    ${adminActionLink(`${appPath}/config`, t(lang, 'config'))}
    ${adminActionButton(app.name, toggleAction, toggleLabel)}
    ${adminActionButton(app.name, 'start', t(lang, 'start'))}
    ${adminActionButton(app.name, 'stop', t(lang, 'stop'))}
    ${adminActionButton(app.name, '', t(lang, 'delete'), 'danger', 'DELETE', t(lang, 'confirm_delete_app', app.name))}
  </div>`;
}

function adminActionLink(href, label) {
  return `<a class="admin-action" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function adminActionButton(name, action, label, variant = 'primary', method = 'POST', confirm = '') {
  const className = variant === 'danger' ? 'admin-action danger' : 'admin-action';
  return `<button class="${className}" type="button" data-app-action="${escapeHtml(action)}" data-app-name="${escapeHtml(name)}" data-method="${escapeHtml(method)}"${confirm ? ` data-confirm="${escapeHtml(confirm)}"` : ''}>${escapeHtml(label)}</button>`;
}

function renderAdminScript(lang) {
  const actionCompleted = JSON.stringify(t(lang, 'action_completed'));
  const orderSaved = JSON.stringify(t(lang, 'order_saved'));
  const requestFailed = JSON.stringify(t(lang, 'request_failed'));
  return `<script>
function adminHeaders(){
  const token=localStorage.appsToken;
  return {'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})};
}
function showAdminStatus(message,isError=false){
  const status=document.getElementById('admin-status');
  if(!status)return;
  status.textContent=message;
  status.classList.toggle('error',isError);
}
async function adminErrorText(response){
  const text=await response.text();
  try{
    const body=JSON.parse(text);
    return body.error||body.message||text||${requestFailed};
  }catch{
    return text||${requestFailed};
  }
}
document.querySelector('.admin-table')?.addEventListener('click',async(event)=>{
  const button=event.target.closest('button[data-app-name]');
  if(!button)return;
  const message=button.dataset.confirm;
  if(message&&!confirm(message))return;
  const name=encodeURIComponent(button.dataset.appName);
  const action=button.dataset.appAction;
  const path='/api/x/'+name+(action?'/'+action:'');
  button.disabled=true;
  try{
    const response=await fetch(path,{method:button.dataset.method||'POST',headers:adminHeaders()});
    if(!response.ok){
      const error=await adminErrorText(response);
      showAdminStatus(error,true);
      alert(error);
      return;
    }
    showAdminStatus(${actionCompleted});
    setTimeout(()=>location.reload(),450);
  }catch(error){
    const message=error?.message||${requestFailed};
    showAdminStatus(message,true);
    alert(message);
  }finally{
    button.disabled=false;
  }
});
(()=>{
  const table=document.getElementById('admin-app-table');
  const tbody=table?.querySelector('tbody');
  const saveButton=document.getElementById('save-app-order');
  if(!tbody||!saveButton)return;
  let dragged=null;
  tbody.addEventListener('dragstart',(event)=>{
    const row=event.target.closest('tr[data-app-name]');
    if(!row)return;
    dragged=row;
    row.classList.add('dragging');
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData('text/plain',row.dataset.appName);
  });
  tbody.addEventListener('dragover',(event)=>{
    if(!dragged)return;
    event.preventDefault();
    const target=event.target.closest('tr[data-app-name]');
    if(!target||target===dragged)return;
    const box=target.getBoundingClientRect();
    target.classList.add('drag-over');
    tbody.insertBefore(dragged,event.clientY<box.top+box.height/2?target:target.nextSibling);
    saveButton.disabled=false;
  });
  tbody.addEventListener('dragleave',(event)=>event.target.closest('tr')?.classList.remove('drag-over'));
  tbody.addEventListener('dragend',()=>{
    dragged?.classList.remove('dragging');
    tbody.querySelectorAll('.drag-over').forEach((row)=>row.classList.remove('drag-over'));
    dragged=null;
  });
  saveButton.addEventListener('click',async()=>{
    const names=[...tbody.querySelectorAll('tr[data-app-name]')].map((row)=>row.dataset.appName);
    saveButton.disabled=true;
    try{
      const response=await fetch('/api/x/reorder',{method:'POST',headers:adminHeaders(),body:JSON.stringify({names})});
      if(!response.ok){
        const error=await adminErrorText(response);
        showAdminStatus(error,true);
        alert(error);
        saveButton.disabled=false;
        return;
      }
      showAdminStatus(${orderSaved});
      setTimeout(()=>location.reload(),450);
    }catch(error){
      const message=error?.message||${requestFailed};
      showAdminStatus(message,true);
      alert(message);
      saveButton.disabled=false;
    }
  });
})();
</script>`;
}

async function renderAppDetail(req, res, url, name) {
  const lang = resolveLang(req);
  const session = await getSession(req);
  if (!requireAuthenticatedPage(req, res, url, session)) return;
  if (!hasPermission(session, 'platform:admin')) return send(res, 403, page(t(lang, 'no_permission_app'), `<article><h1>${t(lang, 'no_permission_app')}</h1><p>${t(lang, 'no_permission_app_detail')}</p><p><a class="primary" href="/login?next=${encodeURIComponent(url.pathname)}">${t(lang, 'switch_account')}</a></p></article>`), 'text/html; charset=utf-8');
  const app = await getApp(name);
  if (!app) return send(res, 404, t(lang, 'app_not_found'));
  const [config, deployments, health, logs, accessLogs] = await Promise.all([getAppConfig(app.name), listDeployments(app.name), checkHealth(app), tailLog(app.name, 80), tailAccessLog(app.name, 80)]);
  const title = appTitle(app, lang);
  return send(res, 200, page(`${escapeHtml(title)} - ${t(lang, 'app_detail_title')}`, `<header class="topbar"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(app.name)} · ${escapeHtml(app.manifest.type)} · ${t(lang, 'user_label')} ${escapeHtml(session.name)}</p></div>${topbarNav(session, lang, req)}</header><section class="grid"><article><h2>${t(lang, 'basic_info')}</h2><pre>${escapeHtml(JSON.stringify(publicApp(app, session, lang), null, 2))}</pre></article><article><h2>${t(lang, 'health_and_metrics')}</h2><pre>${escapeHtml(JSON.stringify({ health, metrics: getMetrics(app.name) }, null, 2))}</pre></article></section><article><h2>${t(lang, 'config_editor')}</h2><form id="cfg"><textarea name="json" rows="10">${escapeHtml(JSON.stringify({ env: config.env, secrets: config.secrets }, null, 2))}</textarea><button>${t(lang, 'save_config_and_restart')}</button></form></article><article><h2>${t(lang, 'deployment_history')}</h2><table><tbody>${deployments.map((item) => `<tr><td>${escapeHtml(item.releaseId || item.id || '')}</td><td>${escapeHtml(item.version || '')}</td><td>${escapeHtml(item.createdAt || '')}</td><td><button onclick="rollback('${escapeHtml(item.releaseId || item.id || '')}')">${t(lang, 'rollback')}</button></td></tr>`).join('') || `<tr><td>${t(lang, 'no_deployments')}</td></tr>`}</tbody></table></article><section class="grid"><article><h2>${t(lang, 'log_viewer')}</h2><pre>${escapeHtml(logs)}</pre></article><article><h2>${t(lang, 'access_logs')}</h2><pre>${escapeHtml(accessLogs)}</pre></article></section><script>function headers(){const t=localStorage.appsToken;return {'content-type':'application/json',...(t?{authorization:'Bearer '+t}:{})}}document.getElementById('cfg').onsubmit=async(e)=>{e.preventDefault();const body=e.target.json.value;const r=await fetch('/api/x/${app.name}/config',{method:'PUT',headers:headers(),body});alert(await r.text());};async function rollback(id){const r=await fetch('/api/x/${app.name}/rollback',{method:'POST',headers:headers(),body:JSON.stringify({releaseId:id})});alert(await r.text());}</script>`), 'text/html; charset=utf-8');
}

async function renderInstallWizard(req, res, url) {
  const lang = resolveLang(req);
  const session = await getSession(req);
  if (!requireAuthenticatedPage(req, res, url, session)) return;
  if (!hasPermission(session, 'platform:admin')) return send(res, 403, t(lang, 'no_permission_install'));
  const wizardBody = `<header class="topbar"><h1>${t(lang, 'install_wizard_title')}</h1>${topbarNav(session, lang, req)}</header>

<style>
.wizard-steps{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 10px}
.wizard-steps button{opacity:.72;background:#ffffffb8;color:#475569;border:1px solid #ffffffe0;box-shadow:0 10px 28px #1e3a8a0d}
.wizard-steps button.active{opacity:1;background:linear-gradient(135deg,#123a6f,#3157c9 54%,#00a8c7);color:#fff;border-color:#7dd3fc80;box-shadow:0 14px 34px #0f5ea833}
.step{display:none}
.step.active{display:block}
.field-table{width:100%;border-collapse:separate;border-spacing:0;margin:10px 0}
.field-table th,.field-table td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left;font-size:13px}
.field-table th{background:#fff0cf;border-radius:10px 10px 0 0}
.field-table code{background:#f8fafc;border:1px solid #e5e7eb;padding:2px 6px;border-radius:999px}
.prompt-card{position:relative}
.prompt-card pre{min-height:120px}
.copy-btn{position:absolute;top:10px;right:10px;border-radius:10px;padding:6px 10px;font-size:12px;background:#fff0cf;color:#7a4308;border:1px solid #f1d293;cursor:pointer}
.copy-btn:hover{background:#ffe3ac}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.tabs button{background:#ffffffb8;color:#475569;border:1px solid #ffffffe0;box-shadow:0 10px 28px #1e3a8a0d}
.tabs button.active{background:linear-gradient(135deg,#123a6f,#3157c9 54%,#00a8c7);color:#fff;border-color:#7dd3fc80;box-shadow:0 14px 34px #0f5ea833}
.panel{display:none}
.panel.active{display:block}
.toc{position:sticky;top:18px;align-self:start}
.toc a{display:block;padding:6px 10px;border-radius:10px;color:#475569;text-decoration:none;font-size:13px}
.toc a:hover{background:#f8fafc}
.two-col{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:start}
@media(max-width:820px){.two-col{grid-template-columns:1fr}.toc{position:static}}
</style>

<section class="wizard-steps" id="stepBar">
  <button class="active" data-step="0">${t(lang, 'step_overview')}</button>
  <button data-step="1">${t(lang, 'step_fields')}</button>
  <button data-step="2">${t(lang, 'step_packaging')}</button>
  <button data-step="3">${t(lang, 'step_prompts')}</button>
</section>

<div id="wizardContent">

<!-- Step 0: Overview -->
<div class="step active" data-index="0">
  <article>
    <h2>${t(lang, 'what_is_yaml')}</h2>
    <p>${t(lang, 'yaml_desc')}</p>
    <div class="grid" style="margin-top:14px">
      <article>
        <h3>${t(lang, 'app_type_overview')}</h3>
        <ul>
          <li><code>frontend</code> — ${t(lang, 'type_frontend')}</li>
          <li><code>fullstack</code> — ${t(lang, 'type_fullstack')}</li>
          <li><code>backend</code> — ${t(lang, 'type_backend')}</li>
          <li><code>plugin</code> — ${t(lang, 'type_plugin')}</li>
        </ul>
      </article>
      <article>
        <h3>${t(lang, 'install_method')}</h3>
        <ul>
          <li>${t(lang, 'cli_install_desc')}</li>
        </ul>
      </article>
    </div>
  </article>
</div>

<!-- Step 1: Field docs -->
<div class="step" data-index="1">
  <div class="two-col">
    <nav class="toc" id="fieldToc">
      <a href="#fields-common">${t(lang, 'common_fields')}</a>
      <a href="#fields-frontend">frontend</a>
      <a href="#fields-fullstack">fullstack</a>
      <a href="#fields-backend">backend</a>
      <a href="#fields-plugin">plugin</a>
    </nav>
    <div>
      <article id="fields-common">
        <h2>${t(lang, 'common_fields')}</h2>
        <table class="field-table">
          <thead><tr><th>${t(lang, 'field')}</th><th>${t(lang, 'required')}</th><th>${t(lang, 'description')}</th></tr></thead>
          <tbody>
            <tr><td><code>name</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_name')}</td></tr>
            <tr><td><code>title</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_title')}</td></tr>
            <tr><td><code>type</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_type')}</td></tr>
            <tr><td><code>version</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_version')}</td></tr>
            <tr><td><code>route</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_route')}</td></tr>
            <tr><td><code>description</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_description')}</td></tr>
            <tr><td><code>logo</code> / <code>icon</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_logo')}</td></tr>
            <tr><td><code>author</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_author')}</td></tr>
            <tr><td><code>permissions</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_permissions')}</td></tr>
            <tr><td><code>groups</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_groups')}</td></tr>
            <tr><td><code>tenants</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_tenants')}</td></tr>
            <tr><td><code>categories</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_categories')}</td></tr>
            <tr><td><code>versionNotes</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_versionNotes')}</td></tr>
          </tbody>
        </table>
      </article>
      <article id="fields-frontend">
        <h2>${t(lang, 'frontend_fields')}</h2>
        <table class="field-table">
          <thead><tr><th>${t(lang, 'field')}</th><th>${t(lang, 'required')}</th><th>${t(lang, 'description')}</th></tr></thead>
          <tbody>
            <tr><td><code>entry</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_entry')}</td></tr>
          </tbody>
        </table>
        <h3>${t(lang, 'full_example')}</h3>
        <pre>name: team-nav
title: ${t(lang, 'ex_team_nav_title')}
title_i18n:
  zh: ${t(lang, 'ex_team_nav_title')}
  en: Team Navigation
type: frontend
version: 1.0.0
route: /x/team-nav
description: ${t(lang, 'ex_team_nav_desc')}
description_i18n:
  zh: ${t(lang, 'ex_team_nav_desc')}
  en: Collect frequently used team system links with search and categories.
entry: dist</pre>
      </article>
      <article id="fields-fullstack">
        <h2>${t(lang, 'fullstack_fields')}</h2>
        <table class="field-table">
          <thead><tr><th>${t(lang, 'field')}</th><th>${t(lang, 'required')}</th><th>${t(lang, 'description')}</th></tr></thead>
          <tbody>
            <tr><td><code>entry</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_entry_fs')}</td></tr>
            <tr><td><code>backend.command</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_backend_command')}</td></tr>
            <tr><td><code>backend.port</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_backend_port')}</td></tr>
            <tr><td><code>backend.healthPath</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_healthPath')}</td></tr>
            <tr><td><code>env</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_env')}</td></tr>
          </tbody>
        </table>
        <h3>${t(lang, 'full_example')}</h3>
        <pre>name: task-board
title: ${t(lang, 'ex_task_board_title')}
title_i18n:
  zh: ${t(lang, 'ex_task_board_title')}
  en: Task Board
type: fullstack
version: 1.2.0
route: /x/task-board
description: ${t(lang, 'ex_task_board_desc')}
description_i18n:
  zh: ${t(lang, 'ex_task_board_desc')}
  en: A task board with frontend interaction and backend API.
entry: dist
backend:
  command: node server.js
  port: 4001
  healthPath: /health
env:
  NODE_ENV: production
  DB_URL: \${DB_URL}</pre>
      </article>
      <article id="fields-backend">
        <h2>${t(lang, 'backend_fields')}</h2>
        <table class="field-table">
          <thead><tr><th>${t(lang, 'field')}</th><th>${t(lang, 'required')}</th><th>${t(lang, 'description')}</th></tr></thead>
          <tbody>
            <tr><td><code>backend.command</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_backend_command2')}</td></tr>
            <tr><td><code>backend.port</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_backend_port2')}</td></tr>
            <tr><td><code>backend.healthPath</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_healthPath2')}</td></tr>
            <tr><td><code>env</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_env2')}</td></tr>
          </tbody>
        </table>
        <h3>${t(lang, 'full_example')}</h3>
        <pre>name: report-api
title: ${t(lang, 'ex_report_api_title')}
title_i18n:
  zh: ${t(lang, 'ex_report_api_title')}
  en: Report API
type: backend
version: 2.0.0
route: /x/report-api
description: ${t(lang, 'ex_report_api_desc')}
description_i18n:
  zh: ${t(lang, 'ex_report_api_desc')}
  en: Provides report query and export APIs.
backend:
  command: uvicorn main:app --host 127.0.0.1 --port 4002
  port: 4002
  healthPath: /health
env:
  PYTHON_ENV: production</pre>
      </article>
      <article id="fields-plugin">
        <h2>${t(lang, 'plugin_fields')}</h2>
        <table class="field-table">
          <thead><tr><th>${t(lang, 'field')}</th><th>${t(lang, 'required')}</th><th>${t(lang, 'description')}</th></tr></thead>
          <tbody>
            <tr><td><code>plugin.kind</code></td><td>${t(lang, 'yes')}</td><td>${t(lang, 'desc_plugin_kind')}</td></tr>
            <tr><td><code>plugin.category</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_plugin_category')}</td></tr>
            <tr><td><code>entry</code></td><td>${t(lang, 'page_required')}</td><td>${t(lang, 'desc_entry_page')}</td></tr>
            <tr><td><code>backend.command</code></td><td>${t(lang, 'api_cron_webhook_required')}</td><td>${t(lang, 'desc_backend_command3')}</td></tr>
            <tr><td><code>backend.port</code></td><td>${t(lang, 'api_webhook_required')}</td><td>${t(lang, 'desc_backend_port3')}</td></tr>
            <tr><td><code>plugin.interval</code></td><td>${t(lang, 'cron_required')}</td><td>${t(lang, 'desc_plugin_interval')}</td></tr>
            <tr><td><code>webhookSecret</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_webhookSecret')}</td></tr>
            <tr><td><code>env</code></td><td>${t(lang, 'no')}</td><td>${t(lang, 'desc_env3')}</td></tr>
          </tbody>
        </table>
        <h3>${t(lang, 'page_example')}</h3>
        <pre>name: status-page
title: ${t(lang, 'ex_status_page_title')}
title_i18n:
  zh: ${t(lang, 'ex_status_page_title')}
  en: Status Page
type: plugin
version: 1.0.0
route: /x/status-page
plugin:
  kind: page
  category: monitor
entry: dist</pre>
        <h3>${t(lang, 'api_example')}</h3>
        <pre>name: translate-api
title: ${t(lang, 'ex_translate_api_title')}
title_i18n:
  zh: ${t(lang, 'ex_translate_api_title')}
  en: Translate API
type: plugin
version: 1.0.0
route: /x/translate-api
plugin:
  kind: api
  category: tool
backend:
  command: node index.js
  port: 4003</pre>
        <h3>${t(lang, 'cron_example')}</h3>
        <pre>name: daily-report
title: ${t(lang, 'ex_daily_report_title')}
title_i18n:
  zh: ${t(lang, 'ex_daily_report_title')}
  en: Daily Report
type: plugin
version: 1.0.0
route: /x/daily-report
plugin:
  kind: cron
  category: automation
  interval: 86400
backend:
  command: python cron.py</pre>
        <h3>${t(lang, 'webhook_example')}</h3>
        <pre>name: deploy-hook
title: ${t(lang, 'ex_deploy_hook_title')}
title_i18n:
  zh: ${t(lang, 'ex_deploy_hook_title')}
  en: Deploy Hook
type: plugin
version: 1.0.0
route: /x/deploy-hook
plugin:
  kind: webhook
  category: devops
backend:
  command: node webhook.js
  port: 4004
webhookSecret: \${WEBHOOK_SECRET}</pre>
      </article>
    </div>
  </div>
</div>

<!-- Step 2: Packaging -->
<div class="step" data-index="2">
  <article>
    <h2>${t(lang, 'packaging_requirements')}</h2>
    <p>${t(lang, 'packaging_desc')}</p>
    <div class="grid">
      <article>
        <h3>${t(lang, 'directory_structure')}</h3>
        <pre>my-app/
  apps.yaml
  dist/          # frontend / fullstack / plugin(page) static assets
  assets/logo.png # ${t(lang, 'structure_logo_comment')}
  server.js      # fullstack / backend / plugin(api|cron|webhook) backend entry
  package.json   # Node deps (optional)</pre>
      </article>
      <article>
        <h3>${t(lang, 'key_constraints')}</h3>
        <ul>
          <li>${t(lang, 'constraint_root')}</li>
          <li>${t(lang, 'constraint_yaml')}</li>
          <li>${t(lang, 'constraint_symlink')}</li>
          <li>${t(lang, 'constraint_route')}</li>
          <li>${t(lang, 'constraint_command')}</li>
          <li>${t(lang, 'constraint_env')}</li>
          <li>${t(lang, 'constraint_logo')}</li>
        </ul>
      </article>
    </div>
    <article style="margin-top:14px">
      <h3>${t(lang, 'entry_backend_table')}</h3>
      <table class="field-table">
        <thead><tr><th>${t(lang, 'type')}</th><th>entry</th><th>backend.command</th></tr></thead>
        <tbody>
          <tr><td>frontend</td><td>${t(lang, 'required_dist')}</td><td>${t(lang, 'not_needed')}</td></tr>
          <tr><td>fullstack</td><td>${t(lang, 'required_dist')}</td><td>${t(lang, 'required_start')}</td></tr>
          <tr><td>backend</td><td>${t(lang, 'not_needed')}</td><td>${t(lang, 'required_start')}</td></tr>
          <tr><td>plugin / page</td><td>${t(lang, 'required_dist')}</td><td>${t(lang, 'not_needed')}</td></tr>
          <tr><td>plugin / api</td><td>${t(lang, 'not_needed')}</td><td>${t(lang, 'required_port')}</td></tr>
          <tr><td>plugin / cron</td><td>${t(lang, 'not_needed')}</td><td>${t(lang, 'required_interval')}</td></tr>
          <tr><td>plugin / webhook</td><td>${t(lang, 'not_needed')}</td><td>${t(lang, 'required_port_secret')}</td></tr>
        </tbody>
      </table>
    </article>
  </article>
</div>

<!-- Step 3: AI Prompts -->
<div class="step" data-index="3">
  <article>
    <h2>${t(lang, 'ai_prompts')}</h2>
    <p>${t(lang, 'ai_prompts_desc')}</p>
    <div class="tabs" id="promptTabs">
      <button class="active" data-tab="prompt-frontend">frontend</button>
      <button data-tab="prompt-fullstack">fullstack</button>
      <button data-tab="prompt-backend">backend</button>
      <button data-tab="prompt-plugin">plugin</button>
    </div>
    <div id="promptPanels">
      <div class="panel active prompt-card" id="prompt-frontend">
        <button class="copy-btn" data-copy="prompt-frontend-text">${t(lang, 'copy')}</button>
        <pre id="prompt-frontend-text">${escapeHtml(t(lang, 'prompt_frontend_text'))}</pre>
      </div>
      <div class="panel prompt-card" id="prompt-fullstack">
        <button class="copy-btn" data-copy="prompt-fullstack-text">${t(lang, 'copy')}</button>
        <pre id="prompt-fullstack-text">${escapeHtml(t(lang, 'prompt_fullstack_text'))}</pre>
      </div>
      <div class="panel prompt-card" id="prompt-backend">
        <button class="copy-btn" data-copy="prompt-backend-text">${t(lang, 'copy')}</button>
        <pre id="prompt-backend-text">${escapeHtml(t(lang, 'prompt_backend_text'))}</pre>
      </div>
      <div class="panel prompt-card" id="prompt-plugin">
        <button class="copy-btn" data-copy="prompt-plugin-text">${t(lang, 'copy')}</button>
        <pre id="prompt-plugin-text">${escapeHtml(t(lang, 'prompt_plugin_text'))}</pre>
      </div>
    </div>
  </article>
</div>

</div>

<script>
(function(){
  const stepBar=document.getElementById('stepBar');
  const steps=Array.from(document.querySelectorAll('.step'));
  stepBar.addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;const idx=+b.dataset.step;steps.forEach((s,i)=>{s.classList.toggle('active',i===idx);});Array.from(stepBar.children).forEach((btn,i)=>{btn.classList.toggle('active',i===idx);});});
  const promptTabs=document.getElementById('promptTabs');
  const panels=document.querySelectorAll('#promptPanels .panel');
  promptTabs.addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;const id=b.dataset.tab;panels.forEach(p=>p.classList.toggle('active',p.id===id));Array.from(promptTabs.children).forEach(btn=>btn.classList.toggle('active',btn.dataset.tab===id));});
  document.querySelectorAll('.copy-btn').forEach(btn=>{btn.addEventListener('click',function(){const id=this.dataset.copy;const el=document.getElementById(id);if(!el)return;navigator.clipboard.writeText(el.textContent).then(()=>{const t=this.textContent;this.textContent=${JSON.stringify(t(lang, 'copied'))};setTimeout(()=>this.textContent=t,1200);}).catch(()=>{const t=this.textContent;this.textContent=${JSON.stringify(t(lang, 'copy_failed'))};setTimeout(()=>this.textContent=t,1200);});});});
})();
</script>`;
  return send(res, 200, page(t(lang, 'install_wizard_title'), wizardBody), 'text/html; charset=utf-8');
}

async function renderInstallWizardV2(req, res, url) {
  const lang = resolveLang(req);
  const session = await getSession(req);
  if (!requireAuthenticatedPage(req, res, url, session)) return;
  if (!hasPermission(session, 'platform:admin')) return send(res, 403, t(lang, 'no_permission_install'));
  const wizardBody = renderInstallWizardBody(topbarNav(session, lang, req, url), url.pathname, requestOrigin(req));
  return send(res, 200, page(t(lang, 'install_wizard_title'), wizardBody), 'text/html; charset=utf-8');
}

async function serveSkillDistribution(res, url) {
  const response = await skillDistributionResponse(url.pathname);
  if (!response) return send(res, 404, 'Skill Not Found');
  return send(res, response.status, response.body, response.type, response.headers);
}

async function serveCliDownload(res, url) {
  const filename = decodeURIComponent(url.pathname.split('/').at(-1) || '');
  if (!/^([a-z0-9-]+-\d+\.\d+\.\d+|latest)\.tgz$/i.test(filename)) return send(res, 404, 'CLI Not Found');
  const root = path.resolve(process.env.APPS_CLI_DOWNLOAD_DIR || 'dist/npm');
  const file = path.resolve(root, filename);
  if (file !== root && !file.startsWith(`${root}${path.sep}`) || !(await exists(file))) return send(res, 404, 'CLI Not Found');
  return send(res, 200, await fs.readFile(file), 'application/gzip', {
    'cache-control': filename === 'latest.tgz' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'content-disposition': `attachment; filename="${filename}"`
  });
}

async function renderLogin(req, res, url) {
  const lang = resolveLang(req);
  const session = await getSession(req);
  const next = url.searchParams.get('next') || '/';
  const loggedIn = session.authenticated;
  const loginPanel = `<form id="login-form"><label>${t(lang, 'code_label')} <input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="${t(lang, 'code_placeholder')}" required></label><button>${loggedIn ? t(lang, 'reverify') : t(lang, 'login_2fa_btn')}</button></form><p><small>${t(lang, 'login_hint')}</small></p>`;
  const sessionPanel = loggedIn ? `<article><h2>${t(lang, 'current_logged_in')}</h2><p>${t(lang, 'session_label')}：<strong>${escapeHtml(session.name)}</strong> · ${t(lang, 'role_label')}：${escapeHtml(session.roles.join(', ') || t(lang, 'none'))}</p></article>` : '';
  return send(res, 200, page(t(lang, 'login_2fa'), `${topbarNav(session, lang, req, url)}<h1>${loggedIn ? t(lang, 'session_2fa') : t(lang, 'login_2fa')}</h1><p>${t(lang, 'login_desc')}</p>${sessionPanel}${loginPanel}<script>document.getElementById('login-form').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const r=await fetch('/api/session/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(fd.entries()))});if(!r.ok){alert(await r.text());return;}location.href=${JSON.stringify(next)};};</script>`), 'text/html; charset=utf-8');
}

async function login(req, res) {
  const payload = await readJsonBody(req);
  if (!verifyTotpCode(payload.code)) return json(res, 401, { error: t(resolveLang(req), 'invalid_2fa') });
  const enriched = await enrichSession({ name: '2fa-admin', roles: ['admin'], authenticated: true });
  return json(res, 200, enriched, { 'set-cookie': createSessionCookie(enriched) });
}

async function saveConfigAndReload(req, app, session) {
  const payload = await readJsonBody(req);
  const config = await updateAppConfig(app.name, payload, session.name || 'admin');
  stopBackend(app.name);
  await startBackend(app);
  await emitEvent('app.config.updated', { appName: app.name, actor: session.name || 'admin', version: config.version });
  return config;
}

async function reorderInstalledApps(req) {
  const payload = await readJsonBody(req);
  const apps = await reorderApps(payload.names);
  return { ok: true, apps: apps.map((app) => ({ name: app.name, sortOrder: app.sortOrder })) };
}

async function installUploadedApp(req, session) {
  const lang = resolveLang(req);
  const form = await readMultipartForm(req);
  const upload = form.files.find((part) => part.name === 'plugin');
  if (!upload) throw new Error(t(lang, 'missing_zip_file'));
  const mode = String(form.fields.mode || form.fields.action || '').trim().toLowerCase();
  const allowUpdate = ['update', 'deploy'].includes(mode);
  const filename = upload.filename || 'plugin.zip';
  if (!filename.toLowerCase().endsWith('.zip')) throw new Error(t(lang, 'zip_only'));
  const uploadRoot = path.join(stagingDir(), 'uploads');
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const workDir = path.join(uploadRoot, id);
  const zipFile = path.join(workDir, sanitizeFilename(filename));
  const extractDir = path.join(workDir, 'extracted');
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(zipFile, upload.data);
  await extractZip(zipFile, extractDir);
  const appDir = await findUploadedAppRoot(extractDir);
  const manifest = await readManifest(appDir);
  if (!manifest.route.startsWith('/x/')) throw new Error(t(lang, 'route_must_apps'));
  const record = await installAppFromDirectory(appDir, { allowUpdate });
  stopBackend(record.name);
  stopCronPlugin(record.name);
  await startBackend(record);
  await startCronPlugin(record);
  await emitEvent(allowUpdate ? 'app.updated' : 'app.installed', { appName: record.name, actor: session.name || 'admin', source: 'upload' });
  return { name: record.name, route: record.manifest.route, status: allowUpdate ? 'updated' : 'installed' };
}

async function findUploadedAppRoot(extractDir) {
  const manifestFiles = await findManifestFiles(extractDir);
  if (manifestFiles.length === 0) throw new Error(t('zh', 'missing_yaml'));
  if (manifestFiles.length > 1) throw new Error(`${t('zh', 'multiple_yaml')}: ${manifestFiles.map((file) => path.relative(extractDir, file)).join(', ')}`);
  return path.dirname(manifestFiles[0]);
}

async function findManifestFiles(root) {
  const result = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '__MACOSX' || entry.name === '.DS_Store') continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`${t('zh', 'symlink_rejected')}: ${path.relative(root, file)}`);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && entry.name === 'apps.yaml') result.push(file);
    }
  }
  await walk(root);
  return result;
}

async function readMultipartFile(req, fieldName) {
  const form = await readMultipartForm(req);
  const file = form.files.find((part) => part.name === fieldName && part.filename);
  if (!file) throw new Error(t('zh', 'missing_zip_file'));
  return file;
}

async function readMultipartForm(req) {
  const contentType = String(req.headers['content-type'] || '');
  const boundaryMatch = contentType.match(/multipart\/form-data;\s*boundary=(?:(?:"([^"]+)")|([^;]+))/i);
  if (!boundaryMatch) throw new Error(t('zh', 'multipart_required'));
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const body = await readRawBody(req);
  const parts = parseMultipart(body, boundary);
  return {
    files: parts.filter((part) => part.filename),
    fields: Object.fromEntries(parts.filter((part) => !part.filename).map((part) => [part.name, part.data.toString('utf8')]))
  };
}

function parseMultipart(body, boundary) {
  const marker = Buffer.from(`--${boundary}`);
  const parts = [];
  let offset = 0;
  while (offset < body.length) {
    const start = body.indexOf(marker, offset);
    if (start < 0) break;
    const next = body.indexOf(marker, start + marker.length);
    if (next < 0) break;
    let part = body.subarray(start + marker.length, next);
    if (part.subarray(0, 2).toString() === '--') break;
    if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === '\r\n') part = part.subarray(0, -2);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd >= 0) {
      const headers = part.subarray(0, headerEnd).toString('utf8');
      const data = part.subarray(headerEnd + 4);
      const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || '';
      const name = disposition.match(/name="([^"]+)"/i)?.[1];
      const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
      if (name) parts.push({ name, filename, data, headers });
    }
    offset = next;
  }
  return parts;
}

function sanitizeFilename(filename) {
  return path.basename(String(filename || 'plugin.zip')).replace(/[^a-zA-Z0-9._-]/g, '_') || 'plugin.zip';
}

async function deployViaApi(req, appName) {
  const lang = resolveLang(req);
  const payload = await readJsonBody(req);
  if (!payload.sourcePath) throw new Error(t(lang, 'deploy_needs_sourcePath'));
  const record = await deployApp(payload.sourcePath, { name: appName });
  await startBackend(record);
  await startCronPlugin(record);
  await emitEvent('app.deployed', { appName: record.name, releaseId: record.currentReleaseId, sourcePath: payload.sourcePath });
  return { name: record.name, currentReleaseId: record.currentReleaseId };
}

async function rollbackViaApi(req, appName) {
  const payload = await readJsonBody(req);
  const record = await rollbackApp(appName, payload.releaseId);
  stopBackend(appName);
  stopCronPlugin(appName);
  await startBackend(record);
  await startCronPlugin(record);
  await emitEvent('app.rolledback', { appName: record.name, releaseId: record.currentReleaseId });
  return { name: record.name, currentReleaseId: record.currentReleaseId };
}

async function deleteInstalledApp(app) {
  stopBackend(app.name);
  stopCronPlugin(app.name);
  await removeApp(app.name);
  const ownedAppsRoot = path.resolve(appsDir());
  const appPath = path.resolve(app.path);
  if (appPath.startsWith(`${ownedAppsRoot}${path.sep}`)) await fs.rm(appPath, { recursive: true, force: true });
  await emitEvent('app.removed', { appName: app.name });
  return { removed: app.name };
}

async function handleSecurityApi(req, res, url, session) {
  const lang = resolveLang(req);
  if (!canAdmin(req, session)) return json(res, 401, { error: t(lang, 'unauthorized') });
  if (req.method === 'GET' && url.pathname === '/api/security/users') return json(res, 200, await listUsers());
  if (req.method === 'POST' && url.pathname === '/api/security/users') return json(res, 200, await upsertUser(await readJsonBody(req)));
  if (req.method === 'GET' && url.pathname === '/api/security/groups') return json(res, 200, await listGroups());
  if (req.method === 'POST' && url.pathname === '/api/security/groups') return json(res, 200, await upsertGroup(await readJsonBody(req)));
  if (req.method === 'GET' && url.pathname === '/api/security/roles') return json(res, 200, await listRoles());
  if (req.method === 'POST' && url.pathname === '/api/security/roles') return json(res, 200, await upsertRole(await readJsonBody(req)));
  if (req.method === 'GET' && url.pathname === '/api/security/tokens') return json(res, 200, await listApiTokens());
  if (req.method === 'POST' && url.pathname === '/api/security/tokens') return json(res, 200, await issueApiToken(await readJsonBody(req)));
  const tokenMatch = url.pathname.match(/^\/api\/security\/tokens\/([^/]+)$/);
  if (req.method === 'DELETE' && tokenMatch) return json(res, 200, await revokeApiToken(tokenMatch[1]));
  return json(res, 404, { error: t(lang, 'security_api_not_found') });
}

async function getSession(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ymj_')) {
    const tokenSession = await sessionFromApiToken(auth.slice('Bearer '.length));
    if (tokenSession) return tokenSession;
  }
  return await enrichSession(sessionFromHeaders(req));
}

function findMountedApp(apps, pathname) {
  return apps.filter((item) => item.enabled).sort((a, b) => b.manifest.route.length - a.manifest.route.length).find((item) => pathname === normalizeRoute(item.manifest.route) || pathname.startsWith(`${normalizeRoute(item.manifest.route)}/`));
}

function shouldProxyAppRequest(app, pathname, route) {
  if (!app.manifest?.backend?.command) return false;
  if (!getFrontendEntry(app.manifest)) return true;
  return pathname === `${route}/api` || pathname.startsWith(`${route}/api/`);
}

async function proxyPluginApi(req, res, name, subPath, search) {
  const lang = resolveLang(req);
  const app = await getApp(name);
  if (!app || app.manifest?.plugin?.kind !== 'api') return json(res, 404, { error: t(lang, 'api_plugin_not_found') });
  return await proxyToBackend(req, res, app, `/${subPath}`.replace(/^\/$/, '/'), search);
}

async function proxyToBackend(req, res, app, subPath, search, bodyOverride) {
  const lang = resolveLang(req);
  const startedAt = Date.now();
  if (!app.manifest?.backend?.port) return json(res, 502, { error: t(lang, 'backend_port_missing') });
  const target = `http://127.0.0.1:${app.manifest.backend.port}${subPath}${search}`;
  try {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : (bodyOverride ?? await readRawBody(req));
    const session = await getSession(req);
    const upstream = await fetch(target, {
      method: req.method,
      headers: buildProxyHeaders(req, app, session),
      body,
      redirect: 'manual'
    });
    const headers = Object.fromEntries(upstream.headers.entries());
    delete headers['content-length'];
    res.writeHead(upstream.status, headers);
    const data = Buffer.from(await upstream.arrayBuffer());
    res.end(data);
    await recordAccess(app.name, { method: req.method, path: subPath + search, status: upstream.status, durationMs: Date.now() - startedAt, type: 'proxy' });
  } catch (error) {
    await recordError(app.name, { method: req.method, path: subPath + search, message: error.message, type: 'proxy' });
    return json(res, 502, { error: `${t(lang, 'backend_proxy_failed')}: ${error.message}` });
  }
}

function buildProxyHeaders(req, app, session) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers.upgrade;
  delete headers['proxy-connection'];
  delete headers['content-length'];
  headers['x-apps-app'] = app.name;
  headers['x-apps-user'] = session.name;
  if (session.tenant) headers['x-apps-tenant'] = session.tenant;
  if (session.permissions.length) headers['x-apps-permissions'] = session.permissions.join(',');
  if (session.groups.length) headers['x-apps-groups'] = session.groups.join(',');
  return headers;
}

function canAccess(session, app) {
  if (hasPermission(session, 'platform:admin')) return true;
  const permissions = app.manifest.permissions || [];
  const groups = app.manifest.groups || [];
  const tenants = app.manifest.tenants || [];
  if (tenants.length && !tenants.includes(session.tenant)) return false;
  if (groups.length && !groups.some((group) => session.groups.includes(group))) return false;
  if (permissions.length && !permissions.some((perm) => session.permissions.includes(perm))) return false;
  return true;
}

function canAdmin(req, session) {
  const token = process.env.APPS_ADMIN_TOKEN;
  const tokenOk = token ? (req.headers.authorization === `Bearer ${token}` || req.headers['x-apps-token'] === token) : false;
  return tokenOk || hasPermission(session || {}, 'platform:admin') || hasPermission(session || {}, 'security:manage');
}

function requireAuthenticatedPage(req, res, url, session) {
  if (session?.authenticated) return true;
  const next = encodeURIComponent(url.pathname + url.search);
  res.writeHead(302, { location: `/login?next=${next}` });
  res.end();
  return false;
}

function authNav(session, lang = 'zh') {
  if (session?.authenticated) return `<button class="nav-logout" type="button" onclick="logoutSession()">${escapeHtml(session.name)} · ${t(lang, 'logout')}</button>`;
  return `<a href="/login">${t(lang, 'login')}</a>`;
}

function redirectWithLang(req, res, url, lang) {
  url.searchParams.delete('lang');
  const location = publicUrlPath(req, url);
  res.writeHead(302, {
    location,
    'cache-control': 'no-store',
    'set-cookie': `lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`
  });
  res.end();
}

function langSwitcher(lang, req, url) {
  const currentUrl = url || currentRequestUrl(req);
  const options = ['en', 'zh'].map((item) => {
    const label = t(item, 'lang_' + item);
    if (item === lang) return `<span class="lang-option active" aria-current="true">${label}</span>`;
    const nextUrl = new URL(currentUrl.toString());
    nextUrl.searchParams.set('lang', item);
    return `<a class="lang-option" href="${escapeHtml(publicUrlPath(req, nextUrl))}">${label}</a>`;
  }).join('');
  return `<details class="lang-menu"><summary>${t(lang, 'language')} <span aria-hidden="true">⌄</span></summary><div class="lang-options" role="menu">${options}</div></details>`;
}

function currentRequestUrl(req) {
  return new URL(req?.url || '/', `http://${req?.headers?.host || 'localhost'}`);
}

function requestOrigin(req) {
  const protocol = String(req?.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '127.0.0.1:4173').split(',')[0].trim();
  return `${protocol}://${host}`.replace(/\/+$/, '');
}

function publicUrlPath(req, url) {
  const pathAndSearch = `${url.pathname || '/'}${url.search || ''}`;
  const prefix = normalizeForwardedPrefix(req?.headers?.['x-forwarded-prefix']);
  return prefix ? `${prefix}${pathAndSearch}` : pathAndSearch;
}

function topbarNav(session, lang = 'zh', req, url) {
  const storyLinks = `<a href="/about">${t(lang, 'about_nav')}</a>`;
  if (!session?.authenticated) return `<nav>${storyLinks}${langSwitcher(lang, req, url)}</nav>`;
  const isAdmin = hasPermission(session, 'platform:admin');
  const adminClass = isAdmin ? '' : ' class="disabled" style="opacity:.5;pointer-events:none"';
  const adminItems = `<a href="/admin"${adminClass}>${t(lang, 'admin')}</a><a href="/admin/install"${adminClass}>${t(lang, 'install_wizard')}</a>`;
  return `<nav><a href="/">${t(lang, 'home')}</a>${storyLinks}${adminItems}${authNav(session, lang)}${langSwitcher(lang, req, url)}</nav>`;
}

function brandHomeLink(lang, subtitle, req) {
  return `<a class="brand" href="${escapeHtml(publicUrlPath(req, new URL('/', currentRequestUrl(req))))}" aria-label="${escapeHtml(t(lang, 'home'))}">${brandLogo()}<span><strong>${t(lang, 'brand_name')}</strong><small>${escapeHtml(subtitle)}</small></span></a>`;
}

async function setAppEnabled(name, enabled) {
  const registry = await loadRegistry();
  const app = registry.apps.find((item) => item.name === name);
  if (!app) throw new Error(`App not found: ${name}`);
  app.enabled = enabled;
  app.updatedAt = new Date().toISOString();
  await saveRegistry(registry);
  if (!enabled) {
    stopBackend(name);
    stopCronPlugin(name);
  } else {
    await startBackend(app);
    await startCronPlugin(app);
  }
  return { name, enabled };
}

function combinedStatus(name) {
  return { backend: processStatus(name), cron: cronStatus(name) };
}

function renderStatusText(name) {
  const status = combinedStatus(name);
  if (status.backend.running) return `backend(pid=${status.backend.pid})`;
  if (status.cron.running) return `cron/${status.cron.interval}s`;
  return 'stopped';
}

function renderPluginLabel(app, lang = 'zh') {
  const state = app.enabled ? t(lang, 'enabled_label') : t(lang, 'disabled_label');
  if (app.manifest.type !== 'plugin') return state;
  return `${t(lang, 'plugin_label')}/${app.manifest.plugin?.kind || 'page'} · ${state}`;
}

function publicApp(app, session, lang = 'zh') {
  const title = appTitle(app, lang);
  const description = appDescription(app, lang);
  return {
    ...app,
    manifest: {
      ...app.manifest,
      title,
      description
    },
    logo: appLogoUrl(app),
    accessible: canAccess(session, app),
    process: combinedStatus(app.name),
    metrics: getMetrics(app.name),
    deploymentCount: app.deployments?.length || 0
  };
}

function appTitle(app, lang = 'zh') {
  return localizedManifestText(app.manifest, 'title', lang) || app.name;
}

function appDescription(app, lang = 'zh') {
  return localizedManifestText(app.manifest, 'description', lang) || app.manifest.description || app.name;
}

function localizedManifestText(manifest, field, lang = 'zh') {
  const candidates = [manifest[`${field}_i18n`], manifest[`${field}I18n`]];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      const value = candidate[lang] || candidate[lang === 'zh' ? 'zh-CN' : 'en-US'];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  return manifest[field];
}

async function appLogoHtml(app, lang = 'zh') {
  const title = appTitle(app, lang);
  const src = await findAppLogoRelative(app);
  if (src) return `<span class="app-icon app-icon-image"><img src="${escapeHtml(appLogoUrl(app))}" alt="${escapeHtml(title)} logo" loading="lazy"></span>`;
  return `<span class="app-icon" aria-hidden="true">${escapeHtml(title.slice(0, 1))}</span>`;
}

function appLogoUrl(app) {
  return `/api/x/${encodeURIComponent(app.name)}/logo`;
}

async function serveAppLogo(res, app) {
  const relative = await findAppLogoRelative(app);
  if (!relative) return send(res, 404, 'Logo Not Found');
  const file = safeJoin(app.path, relative);
  if (!file || !(await exists(file))) return send(res, 404, 'Logo Not Found');
  return send(res, 200, await fs.readFile(file), contentType(file), { 'cache-control': 'public, max-age=3600' });
}

async function findAppLogoRelative(app) {
  const declared = app.manifest.logo || app.manifest.icon || app.manifest.ui?.logo;
  const entry = getFrontendEntry(app.manifest);
  const extensions = ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif'];
  const autoDirs = ['assets', 'public', 'static', 'icons'];
  const candidates = [
    declared,
    ...autoDirs.flatMap((dir) => extensions.map((ext) => `${dir}/logo.${ext}`)),
    ...(entry ? extensions.map((ext) => `${entry}/logo.${ext}`) : []),
    ...(entry ? autoDirs.flatMap((dir) => extensions.map((ext) => `${entry}/${dir}/logo.${ext}`)) : [])
  ].filter(Boolean);
  for (const relative of candidates) {
    if (!isSafeLogoPath(relative)) continue;
    const file = safeJoin(app.path, relative);
    if (file && await exists(file)) {
      const stat = await fs.stat(file);
      if (stat.isFile()) return relative;
    }
  }
  return null;
}

function isSafeLogoPath(value) {
  return typeof value === 'string' && value.trim() && !path.isAbsolute(value) && !value.split(/[\\/]+/).includes('..') && ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(value).toLowerCase());
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  return raw.length ? JSON.parse(raw.toString('utf8')) : {};
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks.map((item) => Buffer.isBuffer(item) ? item : Buffer.from(item)));
}

function brandLogo() { return `<span class="brand-mark brand-wordmark" aria-label="KELI logo"><svg viewBox="0 0 128 64" role="img" aria-labelledby="keliAppsLogoTitle"><title id="keliAppsLogoTitle">KELI striped logo</title><defs><linearGradient id="keliAppsLogo" x1="10" y1="10" x2="118" y2="54"><stop stop-color="#123a6f"/><stop offset=".5" stop-color="#3157c9"/><stop offset="1" stop-color="#00a8c7"/></linearGradient><mask id="keliStripeMask"><rect width="128" height="64" fill="#000"/><text x="10" y="46" font-family="Arial Black, Impact, ui-sans-serif, system-ui, sans-serif" font-size="42" font-weight="900" letter-spacing="2.5" fill="#fff">KELI</text></mask></defs><g mask="url(#keliStripeMask)"><rect x="6" y="12" width="116" height="5" rx="2.5" fill="url(#keliAppsLogo)"/><rect x="6" y="20" width="116" height="5" rx="2.5" fill="url(#keliAppsLogo)"/><rect x="6" y="28" width="116" height="5" rx="2.5" fill="url(#keliAppsLogo)"/><rect x="6" y="36" width="116" height="5" rx="2.5" fill="url(#keliAppsLogo)"/><rect x="6" y="44" width="116" height="5" rx="2.5" fill="url(#keliAppsLogo)"/></g><g fill="#00a8c7" opacity=".88"><circle cx="113" cy="18" r="2.2"/><circle cx="119" cy="26" r="1.6"/><circle cx="111" cy="39" r="1.8"/></g><path d="M9 52h72" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" opacity=".42"/></svg></span>`; }

function keliFaviconHref() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>KELI striped favicon</title><defs><linearGradient id="keliFavGradient" x1="16" y1="20" x2="112" y2="104"><stop stop-color="#123a6f"/><stop offset=".52" stop-color="#3157c9"/><stop offset="1" stop-color="#00a8c7"/></linearGradient><filter id="keliFavShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#082f49" flood-opacity=".28"/></filter><mask id="keliFavStripeMask"><rect width="128" height="128" fill="#000"/><text x="9" y="78" font-family="Arial Black, Impact, ui-sans-serif, system-ui, sans-serif" font-size="39" font-weight="900" letter-spacing="1.6" fill="#fff">KELI</text></mask></defs><rect x="8" y="8" width="112" height="112" rx="28" fill="#f8fdff"/><g filter="url(#keliFavShadow)" mask="url(#keliFavStripeMask)"><rect x="8" y="34" width="112" height="6" rx="3" fill="url(#keliFavGradient)"/><rect x="8" y="45" width="112" height="6" rx="3" fill="url(#keliFavGradient)"/><rect x="8" y="56" width="112" height="6" rx="3" fill="url(#keliFavGradient)"/><rect x="8" y="67" width="112" height="6" rx="3" fill="url(#keliFavGradient)"/><rect x="8" y="78" width="112" height="6" rx="3" fill="url(#keliFavGradient)"/></g><g fill="#00a8c7" opacity=".9"><circle cx="105" cy="36" r="3.2"/><circle cx="113" cy="49" r="2.3"/><circle cx="102" cy="87" r="2.7"/></g><path d="M22 91h64" stroke="#7dd3fc" stroke-width="4" stroke-linecap="round" opacity=".55"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function page(title, body) { return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>${googleAnalyticsSnippet}<link rel="icon" type="image/svg+xml" sizes="any" href="${escapeHtml(keliFaviconHref())}"><style>:root{--ink:#123a6f;--muted:#64748b;--soft:#f5f9fc;--card:#ffffffb8;--line:#dbeafecc;--accent:#3157c9;--blue:#0ea5e9;--green:#14b8a6;--shadow:0 24px 70px #0f5ea81c;--radius:28px}*{box-sizing:border-box}html{background:#f5f7fb;scroll-behavior:smooth}body{margin:0;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:radial-gradient(circle at 18% -8%,#dbeafe 0,#0000 34%),radial-gradient(circle at 90% 4%,#cffafe 0,#0000 28%),linear-gradient(180deg,#fbfdff 0%,#f5f9fc 52%,#eef6fb 100%);color:var(--ink);-webkit-font-smoothing:antialiased}body:before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(120deg,#fff8,#fff0 34%),radial-gradient(circle at 50% 0,#fff 0,#fff0 46%)}main{position:relative;width:min(1180px,calc(100% - 40px));margin:0 auto 64px;padding-top:18px}.topbar{position:relative;z-index:40;display:flex;justify-content:space-between;gap:20px;align-items:center}nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center}nav a,a{color:var(--ink);text-decoration:none}nav a,nav summary,.nav-logout{margin:0;padding:10px 14px;border-radius:999px;background:#ffffffa8;border:1px solid #ffffffc9;box-shadow:0 8px 26px #0f5ea812;backdrop-filter:blur(22px);font-size:14px}nav summary,.nav-logout{cursor:pointer;list-style:none;color:var(--ink)}nav summary::-webkit-details-marker{display:none}nav a:hover,nav summary:hover,.nav-logout:hover,.ghost:hover,.primary-action:hover,.cta:hover,.story-action:hover{transform:translateY(-2px);box-shadow:0 16px 38px #0f5ea820}.lang-menu{position:relative;z-index:60}.lang-options{position:absolute;right:0;top:calc(100% + 8px);z-index:70;display:grid;gap:6px;min-width:150px;padding:8px;border:1px solid #ffffffc9;border-radius:18px;background:#ffffffed;box-shadow:0 18px 46px #0f5ea820;backdrop-filter:blur(22px)}.lang-options .lang-option{display:block;margin:0;padding:9px 11px;border-radius:12px;white-space:nowrap}.lang-options .active{color:var(--muted);background:#f1f5f9;border:1px solid #e5e7eb;box-shadow:none}.hero-shell:has(.lang-menu[open]){overflow:visible}.hero-shell{position:relative;overflow:hidden;margin:12px 0 28px;padding:18px;border:1px solid #ffffffe6;border-radius:36px;background:linear-gradient(135deg,#ffffffe0,#f8fafcc7 55%,#eef2ffb5);box-shadow:var(--shadow);backdrop-filter:blur(28px);transform-style:preserve-3d}.hero-shell:before{content:"";position:absolute;inset:-1px;background:radial-gradient(circle at var(--mx,50%) var(--my,28%),#38bdf830,#0000 34%),linear-gradient(120deg,#fff8,#fff0 36%);pointer-events:none;transition:opacity .25s}.kinetic-stage{--mx:62%;--my:34%}.hero-shell.compact{padding-bottom:26px}.glass{position:relative;z-index:40}.brand{display:flex;align-items:center;gap:12px;color:var(--ink);text-decoration:none;border-radius:24px;transition:.2s}.brand:hover{transform:translateY(-2px)}.brand-mark,.app-icon{display:grid;place-items:center;border-radius:18px;background:linear-gradient(135deg,#123a6f,#3157c9 58%,#00a8c7);color:#fff;box-shadow:inset 0 1px 0 #ffffff66,0 16px 34px #0f5ea82b}.brand-mark{width:96px;height:48px;padding:6px 8px;overflow:hidden;background:linear-gradient(135deg,#ffffffd8,#eefbffba);border:1px solid #ffffffd8}.brand-mark svg{width:100%;height:100%;display:block;filter:drop-shadow(0 5px 10px #082f4930)}.brand strong{display:block;font-size:19px;letter-spacing:-.02em}.brand small{display:block;color:var(--muted);font-size:12px;margin-top:2px}.hero-grid{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1.18fr) 320px;gap:34px;align-items:end;padding:74px 30px 30px}.hero-copy{transform:translate3d(calc(var(--tx,0px)*-.22),calc(var(--ty,0px)*-.16),0)}.elastic-title span{display:inline-block;animation:letter-pop .72s cubic-bezier(.2,1.4,.35,1) both;animation-delay:calc(var(--i)*38ms)}.geo-scene{position:relative;min-height:310px;transform:translate3d(calc(var(--tx,0px)*.5),calc(var(--ty,0px)*.38),0);will-change:transform}.geo{position:absolute;display:block;will-change:transform;filter:drop-shadow(0 24px 36px #0f5ea82a)}.geo-ring{inset:44px 42px auto auto;width:190px;height:190px;border:28px solid #3157c9;border-radius:50%;background:#ccfbf166;animation:float-spin 8s ease-in-out infinite}.geo-square{right:180px;top:18px;width:92px;height:92px;border-radius:24px;background:linear-gradient(135deg,#38bdf8,#a78bfa);animation:soft-bounce 5.2s ease-in-out infinite}.geo-pill{right:8px;bottom:42px;width:210px;height:76px;border-radius:999px;background:linear-gradient(135deg,#123a6f,#3157c9 50%,#00a8c7);animation:drift 6.8s ease-in-out infinite}.geo-dot{right:230px;bottom:22px;width:54px;height:54px;border-radius:50%;background:#2dd4bf;animation:soft-bounce 4.4s ease-in-out infinite reverse}.admin-hero{position:relative;z-index:2;padding:56px 30px 18px}.eyebrow{margin:0 0 12px;font:700 12px/1.2 ui-sans-serif,system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#3157c9}.hero-shell h1,.admin-hero h1{max-width:820px;margin:0;font-size:clamp(44px,7vw,86px);line-height:.94;letter-spacing:-.065em}.admin-hero h1{font-size:clamp(38px,5vw,68px)}.lead{max-width:680px;margin:22px 0 0;font-size:19px;line-height:1.75;color:#4b5563}.hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}.cta,.ghost,.primary-action,.primary,.story-action{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:12px 18px;font:700 14px ui-sans-serif,system-ui,sans-serif;transition:.2s;border:1px solid #0000}.cta,.primary-action,.primary,button{color:#fff;background:linear-gradient(135deg,#123a6f,#3157c9 58%,#00a8c7);box-shadow:0 16px 38px #0f5ea82b}.story-action{color:#123a6f;background:#fff;border-color:#b9e4f4;box-shadow:0 16px 38px #0f5ea817}.ghost{color:#123a6f;background:#ffffffa8;border-color:#fff}.orb{position:absolute;border-radius:999px;filter:blur(6px);opacity:.6}.orb-a{width:360px;height:360px;right:6%;top:8%;background:radial-gradient(circle,#7dd3fc,#0000 68%)}.orb-b{width:300px;height:300px;left:-80px;bottom:-100px;background:radial-gradient(circle,#c4b5fd,#0000 70%)}.about-hero{position:relative;min-height:clamp(520px,72vh,760px);display:grid;grid-template-rows:auto 1fr auto;margin:12px 0 46px;padding:18px;border:1px solid #ffffffe8;border-radius:36px;background:linear-gradient(135deg,#fafdff,#eef9fb 52%,#f8fafc);box-shadow:var(--shadow);overflow:hidden}.about-hero:before{content:"";position:absolute;inset:auto -12% -38% 34%;height:520px;background:radial-gradient(circle,#7dd3fc55,#0000 62%);filter:blur(4px)}.about-hero:after{content:"";position:absolute;right:38px;bottom:36px;width:min(38vw,420px);height:min(38vw,420px);border:1px solid #123a6f24;border-radius:50%;box-shadow:inset 0 0 0 32px #ffffff66,inset 0 0 0 64px #3157c910;pointer-events:none}.about-hero-copy{position:relative;z-index:2;align-self:center;padding:56px clamp(10px,5vw,72px) 34px}.about-hero-copy h1{max-width:960px;margin:0;font-size:clamp(48px,8vw,108px);line-height:.92;letter-spacing:-.07em}.about-hero .lead{font-size:clamp(18px,2vw,24px);max-width:780px}.about-jump{position:relative;z-index:2;justify-content:flex-start;padding:0 clamp(10px,5vw,72px) 34px}.about-jump a{background:#123a6f;color:#fff;border-color:#123a6f;box-shadow:0 16px 38px #0f5ea82b}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:22px 0}.stats div,article,table,form{background:var(--card);border:1px solid #ffffffe6;border-radius:var(--radius);padding:22px;box-shadow:0 16px 50px #0f5ea814;backdrop-filter:blur(22px)}.stats strong{display:block;font-size:31px;letter-spacing:-.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stats span,.meta,.chips,.status{font-family:ui-sans-serif,system-ui,sans-serif}.stats span,.meta{color:var(--muted)}.manifesto{position:relative;margin:72px 0 58px;padding:6px 0 0}.manifesto:before{content:"";position:absolute;inset:18px 0 auto 0;height:1px;background:linear-gradient(90deg,#0000,#3157c980,#0000)}.manifesto-index{position:sticky;top:14px;z-index:20;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-bottom:28px}.manifesto-index a{font-size:13px;padding:8px 12px;border-radius:999px;background:#ffffffe0;border:1px solid #ffffffec;box-shadow:0 12px 34px #0f5ea812}.manifesto-about{padding:44px clamp(24px,6vw,70px);background:linear-gradient(135deg,#ffffffd8,#f8fafcbd 56%,#ecfeffad);border-radius:0;border-left:2px solid #123a6f;box-shadow:0 16px 48px #0f5ea810}.manifesto-about h2{max-width:920px;margin:0;font-size:clamp(40px,6.5vw,88px);line-height:.95;letter-spacing:-.07em}.manifesto-about p:not(.section-kicker){max-width:760px;margin:28px 0 0;font-size:clamp(18px,2.2vw,25px);line-height:1.72;color:#334155}.manifesto-grid{display:grid;grid-template-columns:.92fr 1.08fr;gap:18px;margin-top:18px}.manifesto-block{border-radius:0;background:#ffffffe0}.manifesto-block h3{margin:0;font-size:clamp(28px,4vw,52px);line-height:1;letter-spacing:-.055em}.manifesto-block p{margin:18px 0 0;color:#475569;font-size:18px;line-height:1.75}.values-block ul{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:12px}.values-block li{display:grid;grid-template-columns:150px 1fr;gap:18px;padding:16px 0;border-top:1px solid #dbeafe}.values-block strong{font-size:15px;color:#123a6f}.values-block span{color:#475569;line-height:1.65}.section-title{display:flex;align-items:end;justify-content:space-between;margin:34px 0 14px}.section-title h2{margin:0;font-size:34px;letter-spacing:-.045em}.section-kicker{color:#5f7fb3;font:700 12px ui-sans-serif,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase}.app-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.app-card{position:relative;overflow:hidden;margin:0;animation:rise .55s both;animation-delay:var(--delay);transition:transform .28s cubic-bezier(.2,1.25,.35,1),box-shadow .28s;transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(var(--lift,0));will-change:transform}.app-card:hover{--lift:-6px;box-shadow:0 30px 80px #0f5ea820}.motion-card:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at var(--cx,50%) var(--cy,20%),hsla(var(--hue),90%,70%,.28),#0000 36%);opacity:.75;pointer-events:none}.motion-dot{margin-left:auto;width:10px;height:10px;border-radius:999px;background:hsl(var(--hue),85%,58%);box-shadow:0 0 0 8px hsla(var(--hue),85%,58%,.12);animation:pulse 2.4s ease-in-out infinite}.card-glow{position:absolute;inset:auto -70px -110px auto;width:190px;height:190px;border-radius:50%;background:hsl(var(--hue),86%,70%,.25)}.card-head{display:flex;align-items:center;justify-content:flex-start}.app-icon{width:48px;height:48px;font-size:22px;overflow:hidden}.app-icon img{width:100%;height:100%;object-fit:cover;display:block}.app-icon-image{background:#fff;padding:0}.status{font-size:12px;border-radius:999px;padding:6px 9px;background:#f1f5f9;color:#475569}.status.live{background:#dcfce7;color:#15803d}.app-card h2{margin:22px 0 8px;font-size:24px;letter-spacing:-.035em}.app-card p{color:#4b5563;line-height:1.65}.meta,.chips,.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.meta code,code,.tag,.chips span{background:#f8fafc;border:1px solid #e5e7eb;padding:3px 8px;border-radius:999px}.chips{margin-top:14px}.chips span{font-size:12px;color:#475569}.actions{margin-top:20px}.actions a{margin:0}.empty-state{grid-column:1/-1;text-align:center;padding:52px}.admin-table{overflow:hidden}table{width:100%;border-collapse:separate;border-spacing:0}td,th{padding:13px 12px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}th{font-size:12px;color:#3157c9;text-transform:uppercase;letter-spacing:.08em}td a{display:inline-flex;margin:2px 4px 2px 0;color:#3157c9}button{margin:2px 4px 2px 0;border:0;border-radius:999px;padding:8px 12px;cursor:pointer}input,select,textarea{padding:10px 12px;border:1px solid #d1d5db;border-radius:14px;margin:0 8px 8px 0;min-width:220px;background:#ffffffe0}textarea{width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}pre{white-space:pre-wrap;overflow:auto;background:linear-gradient(135deg,#123a6f,#1e4f87 62%,#0f766e);color:#eaf7ff;border-radius:18px;padding:16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}label{display:block;margin:10px 0}@keyframes rise{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(var(--lift,0))}}@keyframes letter-pop{from{opacity:0;transform:translateY(26px) scaleY(.7) rotate(-4deg);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}@keyframes float-spin{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-18px) rotate(12deg)}}@keyframes soft-bounce{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(10px,-22px,0) scale(1.08)}}@keyframes drift{0%,100%{transform:translateX(0) rotate(-8deg)}50%{transform:translateX(-24px) rotate(5deg)}}@keyframes pulse{0%,100%{transform:scale(1);opacity:.72}50%{transform:scale(1.35);opacity:1}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.geo-scene,.hero-copy,.app-card{transform:none!important}}@media(max-width:820px){main{width:min(100% - 24px,1180px)}.hero-grid{grid-template-columns:1fr;padding:46px 8px 16px}.geo-scene{min-height:210px;opacity:.72}.admin-hero,.about-hero-copy{padding:40px 8px 12px}.about-hero{min-height:auto}.about-jump{padding:4px 8px 22px}.topbar,.section-title{align-items:flex-start;flex-direction:column}.stats{grid-template-columns:repeat(2,1fr)}.hero-shell h1{font-size:44px}.manifesto{margin-top:44px}.manifesto-index{position:relative;top:auto;justify-content:flex-start}.manifesto-about{padding:30px 22px}.manifesto-grid{grid-template-columns:1fr}.values-block li{grid-template-columns:1fr;gap:6px}}</style><main>${body}</main><script>async function logoutSession(){const r=await fetch('/api/session/logout',{method:'POST'});if(r.ok)location.href='/login';else alert(await r.text());}(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const stage=document.querySelector('[data-kinetic]');let raf=0;if(stage){const move=(event)=>{const rect=stage.getBoundingClientRect();const x=event.clientX-rect.left;const y=event.clientY-rect.top;cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{stage.style.setProperty('--mx',(x/rect.width*100).toFixed(2)+'%');stage.style.setProperty('--my',(y/rect.height*100).toFixed(2)+'%');stage.style.setProperty('--tx',((x/rect.width)-.5)*28+'px');stage.style.setProperty('--ty',((y/rect.height)-.5)*28+'px');});};stage.addEventListener('pointermove',move,{passive:true});stage.addEventListener('pointerleave',()=>{stage.style.removeProperty('--tx');stage.style.removeProperty('--ty');},{passive:true});}const grid=document.querySelector('.app-grid');const cards=[...document.querySelectorAll('[data-motion-card]')].map((card)=>({card,rx:0,ry:0,lift:0,cx:50,cy:20,trx:0,try:0,tlift:0,tcx:50,tcy:20}));let cardFrame=0;const lerp=(a,b,t)=>a+(b-a)*t;const animateCards=()=>{let moving=false;cards.forEach((item)=>{item.rx=lerp(item.rx,item.trx,.14);item.ry=lerp(item.ry,item.try,.14);item.lift=lerp(item.lift,item.tlift,.16);item.cx=lerp(item.cx,item.tcx,.18);item.cy=lerp(item.cy,item.tcy,.18);if(Math.abs(item.rx-item.trx)+Math.abs(item.ry-item.try)+Math.abs(item.lift-item.tlift)>.03)moving=true;item.card.style.setProperty('--rx',item.rx.toFixed(2)+'deg');item.card.style.setProperty('--ry',item.ry.toFixed(2)+'deg');item.card.style.setProperty('--lift',item.lift.toFixed(2)+'px');item.card.style.setProperty('--cx',item.cx.toFixed(2)+'%');item.card.style.setProperty('--cy',item.cy.toFixed(2)+'%');});if(moving)cardFrame=requestAnimationFrame(animateCards);else cardFrame=0;};const startCards=()=>{if(!cardFrame)cardFrame=requestAnimationFrame(animateCards);};if(grid&&cards.length){grid.addEventListener('pointermove',(event)=>{cards.forEach((item)=>{const rect=item.card.getBoundingClientRect();const centerX=rect.left+rect.width/2;const centerY=rect.top+rect.height/2;const dx=event.clientX-centerX;const dy=event.clientY-centerY;const distance=Math.hypot(dx,dy);const influence=Math.max(0,1-distance/380)**2;const px=Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width));const py=Math.min(1,Math.max(0,(event.clientY-rect.top)/rect.height));item.trx=(-dy/rect.height*8*influence);item.try=(dx/rect.width*10*influence);item.tlift=-10*influence;item.tcx=px*100;item.tcy=py*100;});startCards();},{passive:true});grid.addEventListener('pointerleave',()=>{cards.forEach((item)=>{item.trx=0;item.try=0;item.tlift=0;});startCards();},{passive:true});}})();</script>`; }
function json(res, status, body, headers = {}) { return send(res, status, JSON.stringify(body, null, 2), 'application/json; charset=utf-8', headers); }
function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  const dynamicHeaders = type.startsWith('text/html') ? { 'cache-control': 'no-store' } : {};
  res.writeHead(status, { 'content-type': type, ...dynamicHeaders, ...headers });
  res.end(body);
}
function contentType(file) { return ({ '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif' })[path.extname(file)] || 'application/octet-stream'; }
function staticCacheHeaders(file, stat) {
  const name = path.basename(file).toLowerCase();
  const ext = path.extname(file).toLowerCase();
  const parts = file.split(path.sep);
  let cacheControl = 'no-cache';
  if (parts.includes('_app') && parts.includes('immutable')) cacheControl = 'public, max-age=31536000, immutable';
  else if (name === 'index.html' || name === 'version.json') cacheControl = 'no-cache';
  else if (['.css', '.js', '.mjs', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2'].includes(ext)) cacheControl = 'public, max-age=3600';
  return {
    'cache-control': cacheControl,
    etag: `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
    'last-modified': stat.mtime.toUTCString()
  };
}
function isFresh(req, headers) {
  const etag = String(headers.etag || '');
  const ifNoneMatch = String(req.headers['if-none-match'] || '');
  if (etag && ifNoneMatch.split(',').map((item) => item.trim()).includes(etag)) return true;
  const ifModifiedSince = Date.parse(String(req.headers['if-modified-since'] || ''));
  const lastModified = Date.parse(String(headers['last-modified'] || ''));
  return Number.isFinite(ifModifiedSince) && Number.isFinite(lastModified) && ifModifiedSince >= lastModified;
}
function rewriteStaticBodyForPrefix(req, body, file) {
  const ext = path.extname(file);
  const prefix = normalizeForwardedPrefix(req.headers['x-forwarded-prefix']);
  if (!prefix && ext !== '.html') return body;
  if (!['.html', '.js', '.css'].includes(ext)) return body;
  let text = body.toString('utf8');
  if (ext === '.html') text = injectGoogleAnalytics(text);
  if (prefix) {
    for (const route of ['/x/', '/api/', '/admin', '/login', '/hooks/']) {
      text = text.replaceAll(`'${route}`, `'${prefix}${route}`);
      text = text.replaceAll(`"${route}`, `"${prefix}${route}`);
      text = text.replaceAll(`\`${route}`, `\`${prefix}${route}`);
    }
  }
  return text;
}
function injectGoogleAnalytics(html) {
  if (!googleAnalyticsSnippet) return html;
  if (html.includes(googleAnalyticsId) || html.includes('googletagmanager.com/gtag/js')) return html;
  if (/<\/head\s*>/i.test(html)) return html.replace(/<\/head\s*>/i, `${googleAnalyticsSnippet}</head>`);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (tag) => `${tag}${googleAnalyticsSnippet}`);
  return `${googleAnalyticsSnippet}${html}`;
}
function normalizeForwardedPrefix(value) {
  const prefix = String(value || '').split(',')[0].trim().replace(/\/+$/g, '');
  if (!prefix || prefix === '/' || !prefix.startsWith('/') || prefix.includes('..') || prefix.includes('?') || prefix.includes('#') || /[\s"'<>]/.test(prefix)) return '';
  return prefix;
}
function escapeHtml(input) { return String(input).replace(/[&<>"']/g, (ch) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }
