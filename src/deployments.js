import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { appsDir, loadRegistry, logsDir, nextAppSortOrder, releasesDir, saveRegistry, stagingDir } from './store.js';
import { copyDir, exists } from './fileops.js';
import { readManifest, validateManifest } from './manifest.js';
import { parseYaml } from './yaml.js';

export async function deployApp(sourceDir, options = {}) {
  const sourcePath = path.resolve(sourceDir);
  const stageId = releaseId();
  const stageDir = path.join(stagingDir(), `${options.name || 'app'}-${stageId}`);
  await fs.rm(stageDir, { recursive: true, force: true });
  await copyDir(sourcePath, stageDir);

  const manifestFile = path.join(stageDir, 'apps.yaml');
  const manifest = parseYaml(await fs.readFile(manifestFile, 'utf8'));
  if (options.name && options.name !== manifest.name) manifest.name = options.name;
  await validateManifest(manifest);
  const registry = await loadRegistry();
  const existing = registry.apps.find((app) => app.name === manifest.name);
  assertRouteAvailable(registry.apps, manifest);

  const build = await runBuild(stageDir, manifest);
  await validateManifest(manifest, stageDir);
  const storageBytes = await dirSize(stageDir);
  assertStorageLimit(manifest, storageBytes);
  const release = {
    id: releaseId(),
    version: manifest.version,
    route: manifest.route,
    sourcePath,
    git: await gitMetadata(sourcePath),
    deployedAt: new Date().toISOString(),
    build,
    storageBytes
  };

  const snapshotDir = releaseSnapshotDir(manifest.name, release.id);
  const targetDir = path.join(appsDir(), manifest.name);
  await copyDir(stageDir, snapshotDir);
  await copyDir(stageDir, targetDir);
  await fs.rm(stageDir, { recursive: true, force: true });

  const next = {
    ...(existing || {}),
    name: manifest.name,
    path: targetDir,
    sourcePath,
    manifest,
    enabled: existing?.enabled ?? true,
    currentReleaseId: release.id,
    deployments: [...(existing?.deployments || []), release],
    updatedAt: new Date().toISOString(),
    installedAt: existing?.installedAt || new Date().toISOString(),
    sortOrder: existing?.sortOrder ?? nextAppSortOrder(registry.apps)
  };
  if (existing) registry.apps[registry.apps.findIndex((app) => app.name === manifest.name)] = next;
  else registry.apps.push(next);
  await saveRegistry(registry);
  return next;
}

export async function rollbackApp(name, release = null) {
  const registry = await loadRegistry();
  const app = registry.apps.find((item) => item.name === name);
  if (!app) throw new Error(`应用不存在：${name}`);
  const targetRelease = release ? app.deployments?.find((item) => item.id === release) : app.deployments?.at(-2);
  if (!targetRelease) throw new Error('没有可回滚的版本');
  const snapshotDir = releaseSnapshotDir(name, targetRelease.id);
  if (!(await exists(snapshotDir))) throw new Error(`回滚快照不存在：${targetRelease.id}`);

  const rollbackRelease = {
    id: releaseId(),
    version: targetRelease.version,
    route: targetRelease.route,
    sourcePath: targetRelease.sourcePath,
    git: targetRelease.git,
    deployedAt: new Date().toISOString(),
    rollbackFrom: app.currentReleaseId,
    rollbackTo: targetRelease.id,
    build: { status: 'rolled-back', logFile: '', durationMs: 0 }
  };

  const targetDir = path.join(appsDir(), name);
  const rollbackSnapshot = releaseSnapshotDir(name, rollbackRelease.id);
  await copyDir(snapshotDir, targetDir);
  await copyDir(snapshotDir, rollbackSnapshot);
  const manifest = await readManifest(targetDir);

  app.path = targetDir;
  app.sourcePath = targetRelease.sourcePath;
  app.manifest = manifest;
  app.currentReleaseId = rollbackRelease.id;
  app.deployments = [...(app.deployments || []), rollbackRelease];
  app.updatedAt = new Date().toISOString();
  await saveRegistry(registry);
  return app;
}

export async function listDeployments(name) {
  const registry = await loadRegistry();
  const app = registry.apps.find((item) => item.name === name);
  if (!app) throw new Error(`应用不存在：${name}`);
  return app.deployments || [];
}

function assertRouteAvailable(apps, manifest) {
  const duplicated = apps.find((app) => app.name !== manifest.name && app.manifest?.route === manifest.route);
  if (duplicated) throw new Error(`路由已被应用 ${duplicated.name} 占用：${manifest.route}`);
}

async function runBuild(appDir, manifest) {
  const command = manifest.build?.command;
  const startedAt = Date.now();
  const logFile = path.join(logsDir(), `${manifest.name}-build-${releaseId()}.log`);
  await fs.mkdir(logsDir(), { recursive: true });
  if (!command) return { status: 'skipped', logFile, durationMs: 0 };
  const output = [];
  const result = await new Promise((resolve) => {
    const child = spawn(command, { cwd: appDir, shell: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (buf) => output.push(buf));
    child.stderr.on('data', (buf) => output.push(buf));
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });
  await fs.writeFile(logFile, Buffer.concat(output.map((item) => Buffer.isBuffer(item) ? item : Buffer.from(item))));
  const build = { status: result.code === 0 ? 'success' : 'failed', logFile, durationMs: Date.now() - startedAt, code: result.code, signal: result.signal };
  if (result.code !== 0) throw new Error(`构建失败：${manifest.name}，日志：${logFile}`);
  return build;
}

async function gitMetadata(sourcePath) {
  const gitDir = path.join(sourcePath, '.git');
  if (!(await exists(gitDir))) return null;
  return {
    commit: await runGit(sourcePath, ['rev-parse', 'HEAD']),
    branch: await runGit(sourcePath, ['branch', '--show-current']),
    remote: await runGit(sourcePath, ['remote', 'get-url', 'origin'])
  };
}

async function runGit(cwd, args) {
  return await new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    child.stdout.on('data', (buf) => chunks.push(buf));
    child.on('exit', (code) => resolve(code === 0 ? Buffer.concat(chunks).toString('utf8').trim() : ''));
  });
}

function assertStorageLimit(manifest, storageBytes) {
  const limitMb = manifest.resources?.storageMb;
  if (!limitMb) return;
  if (storageBytes > limitMb * 1024 * 1024) throw new Error(`应用产物超过存储限制：${storageBytes} bytes > ${limitMb} MB`);
}

async function dirSize(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(file);
    else if (entry.isFile()) total += (await fs.stat(file)).size;
  }
  return total;
}

function releaseSnapshotDir(name, release) {
  return path.join(releasesDir(), name, release, 'app');
}

function releaseId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + Math.random().toString(36).slice(2, 8);
}
