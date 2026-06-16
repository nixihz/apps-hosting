import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateTotpCode } from '../src/security.js';

const cli = path.resolve('bin/apps.js');
const totpSecret = 'JBSWY3DPEHPK3PXP';

test('phase 7 admin product pages and phase 8 security APIs are available without security admin page', async () => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-phase78-'));
  const serverPort = 4900 + Math.floor(Math.random() * 100);
  const env = { ...process.env, APPS_DATA_DIR: dataRoot, APPS_PORT: String(serverPort), APPS_SECRET_KEY: 'test-secret-key', APPS_2FA_SECRET: totpSecret };
  assert.equal(spawnSync('node', [cli, 'install', 'examples/team-nav'], { env }).status, 0);

  const child = spawn('node', ['src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitFor(`http://127.0.0.1:${serverPort}/api/x`);

    const login = await fetch(`http://127.0.0.1:${serverPort}/api/session/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: currentTotp() })
    });
    const cookie = login.headers.get('set-cookie');

    const admin = await fetch(`http://127.0.0.1:${serverPort}/admin`, { headers: { cookie } }).then((r) => r.text());
    assert.match(admin, /安装向导/);
    assert.doesNotMatch(admin, /href="\/admin\/deploy"/);
    assert.doesNotMatch(admin, /href="\/admin-login"/);
    assert.match(admin, /退出/);
    assert.doesNotMatch(admin, /href="\/admin\/security"/);

    const securityPage = await fetch(`http://127.0.0.1:${serverPort}/admin/security`, { headers: { cookie } });
    assert.equal(securityPage.status, 404);

    const detail = await fetch(`http://127.0.0.1:${serverPort}/admin/x/team-nav`, { headers: { cookie } }).then((r) => r.text());
    assert.match(detail, /配置编辑器/);
    assert.match(detail, /日志查看器/);

    const wizard = await fetch(`http://127.0.0.1:${serverPort}/admin/deploy`, { headers: { cookie } });
    assert.equal(wizard.status, 404);

    const adminLoginPage = await fetch(`http://127.0.0.1:${serverPort}/admin-login`);
    assert.equal(adminLoginPage.status, 404);

    const loginPage = await fetch(`http://127.0.0.1:${serverPort}/login`, { headers: { cookie } }).then((r) => r.text());
    assert.doesNotMatch(loginPage, /logout-form/);
    assert.match(loginPage, /退出/);

    const token = await fetch(`http://127.0.0.1:${serverPort}/api/security/tokens`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ci', roles: ['admin'] })
    }).then((r) => r.json());
    assert.match(token.token, /^ymj_/);

    const session = await fetch(`http://127.0.0.1:${serverPort}/api/session`, { headers: { authorization: `Bearer ${token.token}` } }).then((r) => r.json());
    assert.equal(session.roles.includes('admin'), true);
    assert.equal(session.permissions.includes('platform:admin'), true);

    const user = await fetch(`http://127.0.0.1:${serverPort}/api/security/users`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice', groups: ['ops'], roles: ['viewer'] })
    }).then((r) => r.json());
    assert.equal(user.name, 'alice');

    await fetch(`http://127.0.0.1:${serverPort}/api/x/team-nav/config`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ secrets: { API_KEY: 'plain-secret' } })
    });
    const config = await fetch(`http://127.0.0.1:${serverPort}/api/x/team-nav/config`, { headers: { authorization: `Bearer ${token.token}` } }).then((r) => r.json());
    assert.equal(config.secrets.API_KEY, '******');
    const stored = JSON.parse(await fs.readFile(path.join(dataRoot, 'config', 'team-nav.json'), 'utf8'));
    assert.notEqual(stored.secrets.API_KEY, 'plain-secret');
    assert.match(stored.secrets.API_KEY, /^enc:v1:/);

    const marketDetail = await fetch(`http://127.0.0.1:${serverPort}/market/x/team-nav`);
    assert.equal(marketDetail.status, 404);
  } finally {
    child.kill('SIGTERM');
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
