import fs from 'node:fs/promises';
import path from 'node:path';
import { dataDir, loadRegistry, registryFile } from './store.js';

export function currentEnvironment() {
  return process.env.APPS_ENV || 'dev';
}

export function supportedRuntimes() {
  return ['node', 'python', 'go', 'java', 'docker', 'static'];
}

export async function platformInfo() {
  const registry = await loadRegistry();
  return {
    name: 'apps',
    environment: currentEnvironment(),
    dataDir: dataDir(),
    appCount: registry.apps.length,
    supportedRuntimes: supportedRuntimes(),
    sdk: {
      node: 'sdk/node/client.js',
      types: 'sdk/types.d.ts'
    }
  };
}

export async function policyReport() {
  const registry = await loadRegistry();
  return {
    generatedAt: new Date().toISOString(),
    environment: currentEnvironment(),
    apps: registry.apps.map((app) => ({
      name: app.name,
      route: app.manifest.route,
      runtime: app.manifest.runtime?.type || inferRuntime(app),
      hasPermissions: Boolean(app.manifest.permissions?.length),
      hasTenants: Boolean(app.manifest.tenants?.length),
      hasBuild: Boolean(app.manifest.build?.command),
      restartPolicy: app.manifest.runtime?.restartPolicy || 'never',
      warnings: collectWarnings(app)
    }))
  };
}

export async function backupSnapshot() {
  return {
    exportedAt: new Date().toISOString(),
    environment: currentEnvironment(),
    registry: JSON.parse(await fs.readFile(registryFile(), 'utf8')),
    files: await listFiles(dataDir())
  };
}

function inferRuntime(app) {
  if (app.manifest.type === 'frontend') return 'static';
  return app.manifest.runtime?.type || 'node';
}

function collectWarnings(app) {
  const warnings = [];
  if (!app.manifest.runtime?.type && app.manifest.type !== 'frontend') warnings.push('未显式声明 runtime.type');
  if (!app.manifest.permissions?.length) warnings.push('未声明 permissions');
  if (!app.manifest.tenants?.length) warnings.push('未声明 tenants');
  return warnings;
}

async function listFiles(root) {
  const results = [];
  async function walk(dir, base = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.join(base, entry.name);
      if (entry.isDirectory()) await walk(full, rel);
      else results.push(rel);
    }
  }
  try {
    await walk(root);
  } catch {}
  return results.sort();
}
