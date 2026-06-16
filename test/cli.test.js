import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cli = path.resolve('bin/apps.js');

test('cli installs demo and toggles enabled state', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-cli-data-'));
  const env = { ...process.env, APPS_DATA_DIR: data };
  assert.equal(spawnSync('node', [cli, 'install', 'examples/team-nav'], { env }).status, 0);
  const list = spawnSync('node', [cli, 'list'], { env, encoding: 'utf8' });
  assert.match(list.stdout, /team-nav/);
  assert.equal(spawnSync('node', [cli, 'disable', 'team-nav'], { env }).status, 0);
  const info = spawnSync('node', [cli, 'info', 'team-nav'], { env, encoding: 'utf8' });
  assert.match(info.stdout, /"enabled": false/);
  assert.equal(spawnSync('node', [cli, 'enable', 'team-nav'], { env }).status, 0);
  assert.equal(spawnSync('node', [cli, 'remove', 'team-nav'], { env }).status, 0);
});

test('cli installs plugin example', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-plugin-data-'));
  const env = { ...process.env, APPS_DATA_DIR: data };
  assert.equal(spawnSync('node', [cli, 'install', 'examples/hello-plugin'], { env }).status, 0);
  const info = spawnSync('node', [cli, 'info', 'hello-plugin'], { env, encoding: 'utf8' });
  assert.match(info.stdout, /"type": "plugin"/);
  assert.match(info.stdout, /"kind": "page"/);
});

test('cli installs react spa demo', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-react-data-'));
  const env = { ...process.env, APPS_DATA_DIR: data };
  assert.equal(spawnSync('node', [cli, 'install', 'examples/react-spa-demo'], { env }).status, 0);
  const info = spawnSync('node', [cli, 'info', 'react-spa-demo'], { env, encoding: 'utf8' });
  assert.match(info.stdout, /"route": "\/x\/react-spa-demo"/);
  assert.match(info.stdout, /"entry": "dist"/);
});

test('cli rejects duplicate routes', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-route-data-'));
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-route-app-'));
  const env = { ...process.env, APPS_DATA_DIR: data };
  const appDir = path.join(cwd, 'another-nav');
  await fs.mkdir(path.join(appDir, 'dist'), { recursive: true });
  await fs.writeFile(path.join(appDir, 'dist/index.html'), '<h1>another</h1>');
  await fs.writeFile(path.join(appDir, 'apps.yaml'), ['name: another-nav', 'title: Another Nav', 'type: frontend', 'version: 1.0.0', 'route: /x/team-nav', 'entry: dist'].join('\n'));
  assert.equal(spawnSync('node', [cli, 'install', 'examples/team-nav'], { env }).status, 0);
  const second = spawnSync('node', [cli, 'install', appDir], { env, encoding: 'utf8' });
  assert.equal(second.status, 1);
  assert.match(second.stderr, /路由已被应用 team-nav 占用/);
});

test('cli refuses implicit overwrite and packages app zip', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-package-data-'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-package-app-'));
  const env = { ...process.env, APPS_DATA_DIR: data };
  const appDir = path.join(root, 'package-app');
  await fs.mkdir(path.join(appDir, 'dist'), { recursive: true });
  await fs.writeFile(path.join(appDir, 'dist/index.html'), '<h1>package</h1>');
  await fs.writeFile(path.join(appDir, '.env'), 'SECRET=hidden');
  await fs.writeFile(path.join(appDir, 'apps.yaml'), ['name: package-app', 'title: Package App', 'type: frontend', 'version: 1.0.0', 'route: /x/package-app', 'entry: dist'].join('\n'));
  assert.equal(spawnSync('node', [cli, 'install', appDir], { env }).status, 0);
  const duplicate = spawnSync('node', [cli, 'install', appDir], { env, encoding: 'utf8' });
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /应用已存在：package-app/);

  const output = path.join(root, 'package-app.zip');
  const packaged = spawnSync('node', [cli, 'package', appDir, '--output', output], { env, encoding: 'utf8' });
  assert.equal(packaged.status, 0, packaged.stderr);
  assert.match(packaged.stdout, /已打包 package-app/);
  const zip = await fs.readFile(output);
  assert.match(zip.toString('latin1'), /package-app\/apps.yaml/);
  assert.doesNotMatch(zip.toString('latin1'), /\.env/);
});

test('cli deploys, records releases and rolls back', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-deploy-data-'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-deploy-app-'));
  const env = { ...process.env, APPS_DATA_DIR: data };
  const appDir = path.join(root, 'deploy-app');
  await fs.mkdir(path.join(appDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(appDir, 'src/index.html'), '<h1>v1</h1>');
  await fs.writeFile(path.join(appDir, 'apps.yaml'), ['name: deploy-app', 'title: Deploy App', 'type: frontend', 'version: 1.0.0', 'route: /x/deploy-app', 'entry: dist', 'build:', '  command: mkdir -p dist && cp src/index.html dist/index.html'].join('\n'));
  assert.equal(spawnSync('node', [cli, 'deploy', appDir], { env }).status, 0);
  await fs.writeFile(path.join(appDir, 'src/index.html'), '<h1>v2</h1>');
  await fs.writeFile(path.join(appDir, 'apps.yaml'), ['name: deploy-app', 'title: Deploy App', 'type: frontend', 'version: 1.1.0', 'route: /x/deploy-app', 'entry: dist', 'build:', '  command: mkdir -p dist && cp src/index.html dist/index.html'].join('\n'));
  assert.equal(spawnSync('node', [cli, 'deploy', appDir], { env }).status, 0);
  const history = spawnSync('node', [cli, 'deployments', 'deploy-app'], { env, encoding: 'utf8' });
  assert.match(history.stdout, /1.0.0/);
  assert.match(history.stdout, /1.1.0/);
  assert.equal(spawnSync('node', [cli, 'rollback', 'deploy-app'], { env }).status, 0);
  const deployedHtml = await fs.readFile(path.join(data, 'apps/deploy-app/dist/index.html'), 'utf8');
  assert.match(deployedHtml, /v1/);
});

test('cli create generates frontend and fullstack scaffolds', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apps-create-'));
  const frontend = spawnSync('node', [cli, 'create', 'frontend', 'test-app'], { cwd, encoding: 'utf8' });
  assert.equal(frontend.status, 0, frontend.stderr);
  await fs.access(path.join(cwd, 'test-app/apps.yaml'));
  await fs.access(path.join(cwd, 'test-app/dist/index.html'));
  const fullstack = spawnSync('node', [cli, 'create', 'fullstack', 'test-fs'], { cwd, encoding: 'utf8' });
  assert.equal(fullstack.status, 0, fullstack.stderr);
  await fs.access(path.join(cwd, 'test-fs/server/index.js'));
  const pythonBackend = spawnSync('node', [cli, 'create', 'python-backend', 'test-py'], { cwd, encoding: 'utf8' });
  assert.equal(pythonBackend.status, 0, pythonBackend.stderr);
  await fs.access(path.join(cwd, 'test-py/server/app.py'));
});
