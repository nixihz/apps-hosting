import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function withTempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-store-'));
  process.env.APPS_DATA_DIR = dir;
  return await import(`../src/store.js?case=${Date.now()}${Math.random()}`);
}

test('store upsert, get and remove app', async () => {
  const store = await withTempStore();
  await store.upsertApp({ name: 'demo', path: '/tmp/demo', manifest: { name: 'demo', route: '/x/demo' } });
  assert.equal((await store.getApp('demo')).name, 'demo');
  await store.upsertApp({ name: 'demo', enabled: false });
  assert.equal((await store.getApp('demo')).enabled, false);
  await store.removeApp('demo');
  assert.equal(await store.getApp('demo'), undefined);
});

test('store assigns and persists app order', async () => {
  const store = await withTempStore();
  await store.upsertApp({ name: 'alpha', path: '/tmp/alpha', manifest: { name: 'alpha', route: '/x/alpha' } });
  await store.upsertApp({ name: 'beta', path: '/tmp/beta', manifest: { name: 'beta', route: '/x/beta' } });

  assert.deepEqual((await store.loadRegistry()).apps.map((app) => app.name), ['alpha', 'beta']);
  await store.reorderApps(['beta', 'alpha']);

  const apps = (await store.loadRegistry()).apps;
  assert.deepEqual(apps.map((app) => app.name), ['beta', 'alpha']);
  assert.deepEqual(apps.map((app) => app.sortOrder), [1000, 2000]);
  await assert.rejects(() => store.reorderApps(['beta']), /缺少应用：alpha/);
  await assert.rejects(() => store.reorderApps(['beta', 'beta']), /重复应用：beta/);
});

test('store recovers installed apps from apps directory when registry is missing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-store-recover-'));
  process.env.APPS_DATA_DIR = dir;
  delete process.env.APPS_ENV;
  const store = await import(`../src/store.js?case=recover-${Date.now()}${Math.random()}`);
  const appDir = path.join(store.appsDir(), 'persisted-app');
  await fs.mkdir(path.join(appDir, 'dist'), { recursive: true });
  await fs.writeFile(path.join(appDir, 'dist/index.html'), '<h1>persisted</h1>');
  await fs.writeFile(path.join(appDir, 'apps.yaml'), ['name: persisted-app', 'title: Persisted App', 'type: frontend', 'version: 1.0.0', 'route: /x/persisted-app', 'entry: dist'].join('\n'));
  await fs.rm(store.registryFile(), { force: true });

  const registry = await store.loadRegistry();
  assert.equal(registry.apps.some((app) => app.name === 'persisted-app' && app.recovered === true), true);
});

test('store isolates data dir by environment', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-store-env-'));
  process.env.APPS_DATA_DIR = dir;
  process.env.APPS_ENV = 'staging';
  const store = await import(`../src/store.js?case=${Date.now()}${Math.random()}`);
  assert.equal(store.dataDir().endsWith(path.join(path.basename(dir), 'staging')), true);
});
