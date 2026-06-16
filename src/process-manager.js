import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { logsDir } from './store.js';
import { getAppConfig } from './config-center.js';

const processes = new Map();
const restartAttempts = new Map();

export async function startBackend(app) {
  if (!app.manifest?.backend?.command || !app.enabled) return null;
  if (processes.has(app.name)) return processes.get(app.name);
  await fsp.mkdir(logsDir(), { recursive: true });
  const logFile = path.join(logsDir(), `${app.name}.log`);
  const out = fs.createWriteStream(logFile, { flags: 'a' });
  out.write(`\n[${new Date().toISOString()}] starting ${app.manifest.backend.command}\n`);
  const child = spawn(app.manifest.backend.command, {
    cwd: app.path,
    shell: true,
    env: await buildEnv(app),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  const state = { pid: child.pid, startedAt: new Date().toISOString(), child, logFile, app, stopping: false };
  processes.set(app.name, state);
  child.on('exit', (code, signal) => {
    out.write(`[${new Date().toISOString()}] exited code=${code} signal=${signal}\n`);
    processes.delete(app.name);
    out.end();
    if (!state.stopping && shouldRestart(app, code)) {
      const attempts = restartAttempts.get(app.name) || 0;
      const maxRetries = Number(app.manifest?.runtime?.maxRetries ?? 3);
      if (attempts < maxRetries) {
        restartAttempts.set(app.name, attempts + 1);
        setTimeout(() => startBackend(app).catch(() => {}), Number(app.manifest?.runtime?.restartDelayMs || 300));
      }
    } else {
      restartAttempts.delete(app.name);
    }
  });
  return state;
}

export function stopBackend(name) {
  const state = processes.get(name);
  if (!state) return false;
  state.stopping = true;
  state.child.kill('SIGTERM');
  processes.delete(name);
  restartAttempts.delete(name);
  return true;
}

export function processStatus(name) {
  const state = processes.get(name);
  if (!state) return { running: false };
  return { running: true, pid: state.pid, startedAt: state.startedAt, logFile: state.logFile };
}

export async function tailLog(name, lines = 200) {
  const file = path.join(logsDir(), `${name}.log`);
  try {
    const text = await fsp.readFile(file, 'utf8');
    return text.split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '';
  }
}

export async function checkHealth(app) {
  const status = processStatus(app.name);
  const health = app.manifest?.backend?.health;
  const port = app.manifest?.backend?.port;
  if (!health || !port || !status.running) return { ok: status.running || !app.manifest?.backend, status };
  try {
    const res = await fetch(`http://127.0.0.1:${port}${health}`, { signal: AbortSignal.timeout(2000) });
    return { ok: res.ok, status, code: res.status };
  } catch (error) {
    return { ok: false, status, error: error.message };
  }
}

function shouldRestart(app, code) {
  const policy = app.manifest?.runtime?.restartPolicy || 'never';
  if (policy === 'always') return true;
  if (policy === 'on-failure') return code !== 0;
  return false;
}

async function buildEnv(app) {
  const env = { ...process.env, APPS_APP_NAME: app.name };
  if (app.manifest.backend?.port) env.PORT = String(app.manifest.backend.port);
  for (const key of app.manifest.env || []) if (process.env[key]) env[key] = process.env[key];
  const overrides = await getAppConfig(app.name, { raw: true });
  Object.assign(env, overrides.env || {}, overrides.secrets || {});
  return env;
}
