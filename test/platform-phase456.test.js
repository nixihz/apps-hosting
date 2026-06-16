import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateTotpCode } from '../src/security.js';

const cli = path.resolve('bin/apps.js');
const totpSecret = 'JBSWY3DPEHPK3PXP';

test('platform exposes openapi, policy report, events, webhooks and env-aware info', async () => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-phase456-'));
  const serverPort = 4400 + Math.floor(Math.random() * 200);
  const webhookPort = 4700 + Math.floor(Math.random() * 200);
  const env = { ...process.env, APPS_DATA_DIR: dataRoot, APPS_ENV: 'staging', APPS_PORT: String(serverPort), APPS_2FA_SECRET: totpSecret };
  assert.equal(spawnSync('node', [cli, 'install', 'examples/team-nav'], { env }).status, 0);

  const deliveries = [];
  const hookServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    deliveries.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => hookServer.listen(webhookPort, resolve));

  const child = spawn('node', ['src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitFor(`http://127.0.0.1:${serverPort}/api/platform`);
    const platform = await fetch(`http://127.0.0.1:${serverPort}/api/platform`).then((r) => r.json());
    assert.equal(platform.environment, 'staging');
    assert.equal(platform.supportedRuntimes.includes('python'), true);

    const openapi = await fetch(`http://127.0.0.1:${serverPort}/api/openapi.json`).then((r) => r.json());
    assert.equal(openapi.openapi.startsWith('3.'), true);

    const policy = await fetch(`http://127.0.0.1:${serverPort}/api/platform/policy-report`).then((r) => r.json());
    assert.equal(policy.environment, 'staging');
    assert.equal(policy.apps[0].name, 'team-nav');

    const login = await fetch(`http://127.0.0.1:${serverPort}/api/session/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: currentTotp() })
    });
    const cookie = login.headers.get('set-cookie');

    const webhook = await fetch(`http://127.0.0.1:${serverPort}/api/platform/webhooks`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ url: `http://127.0.0.1:${webhookPort}/hook`, events: ['app.deployed'] })
    }).then((r) => r.json());
    assert.equal(Boolean(webhook.id), true);

    const deploy = await fetch(`http://127.0.0.1:${serverPort}/api/x/team-nav/deploy`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sourcePath: path.resolve('examples/team-nav') })
    }).then((r) => r.json());
    assert.equal(Boolean(deploy.currentReleaseId), true);

    await waitForCondition(() => deliveries.some((item) => item.type === 'app.deployed'));

    const events = await fetch(`http://127.0.0.1:${serverPort}/api/events?limit=20`).then((r) => r.json());
    assert.equal(events.some((item) => item.type === 'app.deployed'), true);

    const hookDeliveries = await fetch(`http://127.0.0.1:${serverPort}/api/platform/webhook-deliveries`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(hookDeliveries.some((item) => item.ok === true), true);

    const backup = await fetch(`http://127.0.0.1:${serverPort}/api/platform/backup`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(backup.environment, 'staging');
    assert.equal(Array.isArray(backup.files), true);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => hookServer.close(resolve));
  }
});

function currentTotp() {
  return generateTotpCode(totpSecret, Math.floor(Date.now() / 1000 / 30));
}

async function waitFor(url) {
  for (let i = 0; i < 40; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server not ready: ${url}`);
}

async function waitForCondition(check) {
  for (let i = 0; i < 40; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('condition not ready');
}
