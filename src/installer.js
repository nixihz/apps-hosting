import path from 'node:path';
import { appsDir, loadRegistry, upsertApp } from './store.js';
import { copyDir } from './fileops.js';
import { readManifest, validateManifest } from './manifest.js';

export async function installAppFromDirectory(sourceDir, options = {}) {
  const source = path.resolve(sourceDir);
  const manifest = await readManifest(source);
  const name = options.name || manifest.name;
  if (name !== manifest.name) manifest.name = name;
  await validateManifest(manifest, source);
  assertAppsRoute(manifest);
  const existing = await assertInstallAllowed(manifest, options);
  const target = path.join(appsDir(), manifest.name);
  const resolvedTarget = path.resolve(target);
  if (!isInside(path.resolve(appsDir()), resolvedTarget)) throw new Error('安装目标路径不安全');
  if (source !== resolvedTarget) await copyDir(source, resolvedTarget);
  const appPath = source === resolvedTarget ? source : resolvedTarget;
  return await upsertApp({ ...(existing || {}), name: manifest.name, path: appPath, manifest, enabled: existing?.enabled ?? true });
}

export async function assertRouteAvailable(manifest) {
  const registry = await loadRegistry();
  const duplicated = registry.apps.find((app) => app.name !== manifest.name && app.manifest?.route === manifest.route);
  if (duplicated) throw new Error(`路由已被应用 ${duplicated.name} 占用：${manifest.route}`);
}

async function assertInstallAllowed(manifest, options = {}) {
  const registry = await loadRegistry();
  const existing = registry.apps.find((app) => app.name === manifest.name);
  const duplicatedRoute = registry.apps.find((app) => app.name !== manifest.name && app.manifest?.route === manifest.route);
  if (duplicatedRoute) throw new Error(`路由已被应用 ${duplicatedRoute.name} 占用：${manifest.route}`);
  if (existing && !options.allowUpdate) throw new Error(`应用已存在：${manifest.name}。如需更新请使用 deploy 或显式 update。`);
  if (existing && existing.manifest?.route !== manifest.route) throw new Error(`更新不能修改应用路由：${existing.manifest.route} -> ${manifest.route}`);
  return existing;
}

function assertAppsRoute(manifest) {
  if (!String(manifest.route || '').startsWith('/x/')) throw new Error('route 必须保持 /x/<name> 规则，不能添加反向代理前缀');
}

function isInside(root, target) {
  const resolvedRoot = path.resolve(root);
  return target === resolvedRoot || target.startsWith(`${resolvedRoot}${path.sep}`);
}
