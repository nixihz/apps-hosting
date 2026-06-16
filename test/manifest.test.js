import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateManifest, getFrontendEntry, normalizeRoute } from '../src/manifest.js';

test('validateManifest accepts frontend manifests', async () => {
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-manifest-ok-'));
  await fs.mkdir(path.join(appDir, 'dist'), { recursive: true });
  await fs.mkdir(path.join(appDir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(appDir, 'assets/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await assert.doesNotReject(() => validateManifest({ name: 'demo', title: 'Demo', title_i18n: { zh: '示例', en: 'Demo' }, type: 'frontend', version: '1.0.0', route: '/x/demo', entry: 'dist', logo: 'assets/logo.svg', description_i18n: { zh: '示例应用', en: 'Demo app' } }, appDir));
});

test('validateManifest rejects invalid manifests', async () => {
  await assert.rejects(() => validateManifest({}), /缺少必填字段/);
  await assert.rejects(() => validateManifest({ name: 'Demo!', title: 'Demo', type: 'frontend', version: '1', route: '/x', entry: 'dist' }), /只能包含/);
  await assert.rejects(() => validateManifest({ name: 'demo', title: 'Demo', type: 'bad', version: '1', route: '/x' }), /不支持/);
  await assert.rejects(() => validateManifest({ name: 'demo', title: 'Demo', type: 'frontend', version: '1', route: 'x', entry: 'dist' }), /route/);
  await assert.rejects(() => validateManifest({ name: 'demo', title: 'Demo', type: 'frontend', version: '1', route: '/x', entry: 'dist', env: 'DATABASE_URL' }), /env 必须是字符串数组/);
  await assert.rejects(() => validateManifest({ name: 'demo', title: 'Demo', type: 'backend', version: '1', route: '/x', backend: { command: 'node server.js', port: '3000' } }), /backend.port/);
  await assert.rejects(() => validateManifest({ name: 'demo', title: 'Demo', title_i18n: { fr: 'Démo' }, type: 'frontend', version: '1', route: '/x', entry: 'dist' }), /title_i18n/);
  await assert.rejects(() => validateManifest({ name: 'demo', title: 'Demo', type: 'frontend', version: '1', route: '/x', entry: 'dist', logo: '../logo.svg' }), /logo/);
});

test('validateManifest checks referenced paths', async () => {
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-manifest-path-'));
  await assert.rejects(() => validateManifest({ name: 'demo', title: 'Demo', type: 'frontend', version: '1.0.0', route: '/x/demo', entry: 'dist' }, appDir), /前端入口不存在/);
});

test('validateManifest supports api and cron plugins', async () => {
  const apiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-plugin-api-'));
  await assert.doesNotReject(() => validateManifest({ name: 'api-plugin', title: 'API Plugin', type: 'plugin', version: '1.0.0', route: '/x/api-plugin', plugin: { kind: 'api' }, backend: { command: 'node server.js', port: 3001, health: '/health' } }, apiDir));
  await assert.rejects(() => validateManifest({ name: 'cron-plugin', title: 'Cron Plugin', type: 'plugin', version: '1.0.0', route: '/x/cron-plugin', plugin: { kind: 'cron', command: 'node job.js', schedule: { everySeconds: 0 } } }), /everySeconds/);
});

test('validateManifest supports build runtime and resource policies', async () => {
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-runtime-'));
  await fs.mkdir(path.join(appDir, 'dist'), { recursive: true });
  await assert.doesNotReject(() => validateManifest({ name: 'runtime-demo', title: 'Runtime Demo', type: 'frontend', version: '1.0.0', route: '/x/runtime-demo', entry: 'dist', environments: ['dev', 'staging'], build: { command: 'npm run build' }, runtime: { type: 'static', restartPolicy: 'on-failure', maxRetries: 2, restartDelayMs: 100 }, resources: { storageMb: 10, memoryMb: 256 } }, appDir));
  await assert.rejects(() => validateManifest({ name: 'bad-runtime', title: 'Bad Runtime', type: 'frontend', version: '1.0.0', route: '/x/bad-runtime', entry: 'dist', runtime: { restartPolicy: 'sometimes' } }, appDir), /restartPolicy/);
  await assert.rejects(() => validateManifest({ name: 'bad-runtime-type', title: 'Bad Runtime Type', type: 'frontend', version: '1.0.0', route: '/x/bad-runtime-type', entry: 'dist', runtime: { type: 'ruby' } }, appDir), /runtime.type/);
});

test('manifest helpers', () => {
  assert.equal(getFrontendEntry({ frontend: { entry: 'web/dist' } }), 'web/dist');
  assert.equal(normalizeRoute('//x/demo//'), '/x/demo');
});
