import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cli = path.resolve('bin/apps.js');

test('server proxies api and webhook plugins', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-plugin-runtime-'));
  const data = path.join(root, 'data');
  const serverPort = 6200 + Math.floor(Math.random() * 100);
  const apiPort = 5600 + Math.floor(Math.random() * 100);
  const hookPort = 5800 + Math.floor(Math.random() * 100);
  const env = { ...process.env, APPS_DATA_DIR: data, APPS_PORT: String(serverPort) };

  const apiDir = path.join(root, 'report-api');
  await fs.mkdir(path.join(apiDir, 'server'), { recursive: true });
  await fs.writeFile(path.join(apiDir, 'server/index.js'), `import http from 'node:http';\nhttp.createServer((req,res)=>{res.setHeader('content-type','application/json'); if(req.url==='/health') return res.end(JSON.stringify({ok:true})); res.end(JSON.stringify({kind:'api',url:req.url}));}).listen(process.env.PORT);`);
  await fs.writeFile(path.join(apiDir, 'apps.yaml'), ['name: report-api', 'title: Report API', 'type: plugin', 'version: 1.0.0', 'route: /x/report-api', 'plugin:', '  kind: api', 'backend:', '  command: node server/index.js', `  port: ${apiPort}`, '  health: /health'].join('\n'));

  const hookDir = path.join(root, 'ci-webhook');
  await fs.mkdir(path.join(hookDir, 'server'), { recursive: true });
  await fs.writeFile(path.join(hookDir, 'server/index.js'), `import http from 'node:http';\nhttp.createServer((req,res)=>{res.setHeader('content-type','application/json'); if(req.url==='/health') return res.end(JSON.stringify({ok:true})); res.end(JSON.stringify({kind:'webhook',url:req.url,method:req.method}));}).listen(process.env.PORT);`);
  await fs.writeFile(path.join(hookDir, 'apps.yaml'), ['name: ci-webhook', 'title: CI Webhook', 'type: plugin', 'version: 1.0.0', 'route: /x/ci-webhook', 'plugin:', '  kind: webhook', 'backend:', '  command: node server/index.js', `  port: ${hookPort}`, '  health: /health'].join('\n'));

  assert.equal(spawnSync('node', [cli, 'install', apiDir], { env }).status, 0);
  assert.equal(spawnSync('node', [cli, 'install', hookDir], { env }).status, 0);

  const child = spawn('node', ['src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitFor(`http://127.0.0.1:${serverPort}/api/x`);
    const api = await waitForJson(`http://127.0.0.1:${serverPort}/api/plugins/report-api/report?q=1`, {}, (body) => body.kind === 'api');
    assert.equal(api.url, '/report?q=1');

    const hook = await waitForJson(`http://127.0.0.1:${serverPort}/hooks/ci-webhook/push`, { method: 'POST' }, (body) => body.kind === 'webhook');
    assert.equal(hook.url, '/push');
    assert.equal(hook.method, 'POST');
  } finally {
    child.kill('SIGTERM');
  }
});

async function waitFor(url) {
  for (let i = 0; i < 40; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server not ready: ${url}`);
}

async function waitForJson(url, options, predicate) {
  for (let i = 0; i < 40; i++) {
    try {
      const body = await fetch(url, options).then((r) => r.json());
      if (predicate(body)) return body;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`json not ready: ${url}`);
}
