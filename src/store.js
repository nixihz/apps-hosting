import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { readManifest } from './manifest.js';

export function dataDir() {
  const base = path.resolve(process.env.APPS_DATA_DIR || '.apps');
  const env = process.env.APPS_ENV;
  return env ? path.join(base, env) : base;
}

export function registryFile() { return path.join(dataDir(), 'registry.json'); }
export function appsDir() { return path.join(dataDir(), 'apps'); }
export function logsDir() { return path.join(dataDir(), 'logs'); }
export function configDir() { return path.join(dataDir(), 'config'); }
export function releasesDir() { return path.join(dataDir(), 'releases'); }
export function stagingDir() { return path.join(dataDir(), 'staging'); }

export async function ensureStore() {
  await fs.mkdir(appsDir(), { recursive: true });
  await fs.mkdir(logsDir(), { recursive: true });
  await fs.mkdir(configDir(), { recursive: true });
  await fs.mkdir(releasesDir(), { recursive: true });
  await fs.mkdir(stagingDir(), { recursive: true });

  const existsRegistry = fssync.existsSync(registryFile());
  const registry = existsRegistry ? await readRegistryFile() : { apps: [] };
  const { registry: reconciled, changed } = await reconcileInstalledApps(registry);
  const normalized = normalizeAppOrder(reconciled);
  if (!existsRegistry || changed || normalized.changed) await saveRegistry(normalized.registry);
}

export async function loadRegistry() {
  await ensureStore();
  const registry = await readRegistryFile();
  return { apps: sortApps(registry.apps) };
}

export async function saveRegistry(registry) {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(registryFile(), JSON.stringify(registry, null, 2));
}

export async function upsertApp(record) {
  const registry = await loadRegistry();
  const now = new Date().toISOString();
  const idx = registry.apps.findIndex((app) => app.name === record.name);
  if (idx >= 0) registry.apps[idx] = { ...registry.apps[idx], ...record, sortOrder: registry.apps[idx].sortOrder, updatedAt: now };
  else registry.apps.push({ enabled: true, installedAt: now, updatedAt: now, sortOrder: nextAppSortOrder(registry.apps), ...record });
  registry.apps = sortApps(registry.apps);
  await saveRegistry(registry);
  return registry.apps.find((app) => app.name === record.name);
}

export async function reorderApps(names) {
  if (!Array.isArray(names)) throw new Error('排序参数 names 必须是数组');
  const registry = await loadRegistry();
  validateReorderNames(registry.apps, names);
  const now = new Date().toISOString();
  const byName = new Map(registry.apps.map((app) => [app.name, app]));
  registry.apps = names.map((name, index) => ({ ...byName.get(name), sortOrder: (index + 1) * 1000, updatedAt: now }));
  await saveRegistry(registry);
  return registry.apps;
}

export function sortApps(apps) {
  return [...apps].sort((a, b) => compareAppOrder(a, b));
}

export function nextAppSortOrder(apps) {
  const orders = apps.map((app, index) => toOrderNumber(app.sortOrder, index)).filter(Number.isFinite);
  return orders.length ? Math.max(...orders) + 1000 : 1000;
}

export async function removeApp(name) {
  const registry = await loadRegistry();
  const next = registry.apps.filter((app) => app.name !== name);
  if (next.length === registry.apps.length) throw new Error(`应用不存在：${name}`);
  registry.apps = next;
  await saveRegistry(registry);
}

export async function getApp(name) {
  const registry = await loadRegistry();
  return registry.apps.find((app) => app.name === name);
}

async function readRegistryFile() {
  try {
    const parsed = JSON.parse(await fs.readFile(registryFile(), 'utf8'));
    return { apps: Array.isArray(parsed.apps) ? parsed.apps : [] };
  } catch {
    return { apps: [] };
  }
}

async function reconcileInstalledApps(registry) {
  const apps = Array.isArray(registry.apps) ? [...registry.apps] : [];
  const names = new Set(apps.map((app) => app.name));
  let changed = false;
  let entries = [];
  try {
    entries = await fs.readdir(appsDir(), { withFileTypes: true });
  } catch {
    return { registry: { apps }, changed };
  }
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const appPath = path.join(appsDir(), entry.name);
    const manifestFile = path.join(appPath, 'apps.yaml');
    if (!fssync.existsSync(manifestFile)) continue;
    try {
      const manifest = await readManifest(appPath);
      const existing = apps.find((app) => app.name === manifest.name);
      if (existing) {
        if (existing.path !== appPath || JSON.stringify(existing.manifest) !== JSON.stringify(manifest)) {
          existing.path = appPath;
          existing.manifest = manifest;
          existing.updatedAt = new Date().toISOString();
          changed = true;
        }
        continue;
      }
      const now = new Date().toISOString();
      apps.push({ name: manifest.name, path: appPath, manifest, enabled: true, installedAt: now, updatedAt: now, sortOrder: nextAppSortOrder(apps), recovered: true });
      names.add(manifest.name);
      changed = true;
    } catch {
      // 损坏的应用目录不参与自动恢复，避免 server 启动被单个坏目录阻塞。
    }
  }
  return { registry: { apps }, changed };
}

function normalizeAppOrder(registry) {
  const apps = Array.isArray(registry.apps) ? registry.apps : [];
  let changed = false;
  const ordered = apps.map((app, index) => {
    if (Number.isFinite(Number(app.sortOrder))) return app;
    changed = true;
    return { ...app, sortOrder: (index + 1) * 1000 };
  });
  const sorted = sortApps(ordered).map((app, index) => {
    const sortOrder = (index + 1) * 1000;
    if (app.sortOrder === sortOrder) return app;
    changed = true;
    return { ...app, sortOrder };
  });
  changed = changed || sorted.some((app, index) => app.name !== apps[index]?.name);
  return { registry: { ...registry, apps: sorted }, changed };
}

function validateReorderNames(apps, names) {
  const known = new Set(apps.map((app) => app.name));
  const seen = new Set();
  for (const name of names) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('排序参数包含无效应用名');
    if (seen.has(name)) throw new Error(`排序参数包含重复应用：${name}`);
    if (!known.has(name)) throw new Error(`排序参数包含未知应用：${name}`);
    seen.add(name);
  }
  const missing = apps.filter((app) => !seen.has(app.name)).map((app) => app.name);
  if (missing.length) throw new Error(`排序参数缺少应用：${missing.join(', ')}`);
}

function compareAppOrder(a, b) {
  const byOrder = toOrderNumber(a.sortOrder, Number.POSITIVE_INFINITY) - toOrderNumber(b.sortOrder, Number.POSITIVE_INFINITY);
  if (byOrder) return byOrder;
  const byInstalled = String(a.installedAt || '').localeCompare(String(b.installedAt || ''));
  return byInstalled || String(a.name || '').localeCompare(String(b.name || ''));
}

function toOrderNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
