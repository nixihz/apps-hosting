import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startCronPlugin, stopCronPlugin, cronStatus } from '../src/scheduler.js';
import { tailLog } from '../src/process-manager.js';

test('scheduler runs cron plugin and writes logs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-cron-'));
  process.env.APPS_DATA_DIR = path.join(root, 'data');
  const appDir = path.join(root, 'cron-app');
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(path.join(appDir, 'job.js'), "console.log('cron-ok')\n");
  const app = { name: 'cron-demo', enabled: true, path: appDir, manifest: { type: 'plugin', plugin: { kind: 'cron', command: 'node job.js', schedule: { everySeconds: 1 } } } };
  await startCronPlugin(app);
  assert.equal(cronStatus('cron-demo').running, true);
  await waitForLog('cron-demo', /cron-ok/);
  assert.equal(stopCronPlugin('cron-demo'), true);
});

async function waitForLog(name, pattern) {
  for (let i = 0; i < 30; i++) {
    const log = await tailLog(name, 50);
    if (pattern.test(log)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`log not ready: ${name}`);
}
