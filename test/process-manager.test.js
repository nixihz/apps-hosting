import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startBackend, stopBackend, processStatus, checkHealth, tailLog } from '../src/process-manager.js';
import { updateAppConfig } from '../src/config-center.js';

const port = 4567;

test('process manager starts backend, checks health, tails logs and stops', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-pm-'));
  process.env.APPS_DATA_DIR = path.join(root, 'data');
  const appDir = path.join(root, 'app');
  await fs.mkdir(path.join(appDir, 'server'), { recursive: true });
  await fs.writeFile(path.join(appDir, 'server/index.js'), `import http from 'node:http';\nhttp.createServer((req,res)=>{console.log(req.url); res.end(req.url==='/health'?'ok':(process.env.RUNTIME_FLAG||'hello'))}).listen(process.env.PORT);\n`);
  const app = { name: 'pm-demo', enabled: true, path: appDir, manifest: { backend: { command: 'node server/index.js', port, health: '/health' } } };
  await updateAppConfig('pm-demo', { env: { RUNTIME_FLAG: 'configured' } }, 'tester');
  await startBackend(app);
  assert.equal(processStatus('pm-demo').running, true);
  await waitForHealth(app);
  assert.equal((await checkHealth(app)).ok, true);
  const body = await fetch(`http://127.0.0.1:${port}/runtime`).then((r) => r.text());
  assert.equal(body, 'configured');
  assert.match(await tailLog('pm-demo'), /starting/);
  assert.equal(stopBackend('pm-demo'), true);
});

test('process manager restarts backend on failure when policy enabled', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-restart-'));
  process.env.APPS_DATA_DIR = path.join(root, 'data');
  const appDir = path.join(root, 'app');
  const restartPort = 4700 + Math.floor(Math.random() * 200);
  await fs.mkdir(path.join(appDir, 'server'), { recursive: true });
  const markerFile = JSON.stringify(path.join(appDir, 'server/.started'));
  await fs.writeFile(path.join(appDir, 'server/index.js'), `import fs from 'node:fs';\nimport http from 'node:http';\nconst marker=${markerFile};\nif(!fs.existsSync(marker)){fs.writeFileSync(marker,'1');process.exit(1);}\nhttp.createServer((req,res)=>res.end(req.url==='/health'?'ok':'restarted')).listen(process.env.PORT);\n`);
  const app = { name: 'restart-demo', enabled: true, path: appDir, manifest: { backend: { command: 'node server/index.js', port: restartPort, health: '/health' }, runtime: { restartPolicy: 'on-failure', maxRetries: 2, restartDelayMs: 100 } } };
  await startBackend(app);
  await waitForHealth(app, 60);
  assert.equal((await fetch(`http://127.0.0.1:${restartPort}/runtime`).then((r) => r.text())), 'restarted');
  assert.equal(stopBackend('restart-demo'), true);
});

async function waitForHealth(app, retries = 30) {
  for (let i = 0; i < retries; i++) {
    const health = await checkHealth(app);
    if (health.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('backend health not ready');
}
