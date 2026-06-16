import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { logsDir } from './store.js';

const jobs = new Map();

export async function startCronPlugin(app) {
  if (!isCronPlugin(app) || !app.enabled) return null;
  if (jobs.has(app.name)) return jobs.get(app.name);
  await fsp.mkdir(logsDir(), { recursive: true });
  const interval = Number(app.manifest.plugin.schedule.everySeconds);
  const logFile = path.join(logsDir(), `${app.name}.log`);
  const timer = setInterval(() => runOnce(app, logFile), interval * 1000);
  const state = { running: true, type: 'cron', interval, logFile, timer, startedAt: new Date().toISOString() };
  jobs.set(app.name, state);
  runOnce(app, logFile);
  return state;
}

export function stopCronPlugin(name) {
  const job = jobs.get(name);
  if (!job) return false;
  clearInterval(job.timer);
  jobs.delete(name);
  return true;
}

export function cronStatus(name) {
  const job = jobs.get(name);
  if (!job) return { running: false };
  return { running: true, type: 'cron', interval: job.interval, startedAt: job.startedAt, logFile: job.logFile };
}

export function isCronPlugin(app) {
  return app.manifest?.type === 'plugin' && app.manifest?.plugin?.kind === 'cron' && app.manifest?.plugin?.schedule?.everySeconds && app.manifest?.plugin?.command;
}

function runOnce(app, logFile) {
  const out = fs.createWriteStream(logFile, { flags: 'a' });
  out.write(`\n[${new Date().toISOString()}] cron ${app.manifest.plugin.command}\n`);
  const child = spawn(app.manifest.plugin.command, {
    cwd: app.path,
    shell: true,
    env: { ...process.env, APPS_APP_NAME: app.name },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  child.on('exit', (code, signal) => {
    if (!out.destroyed) out.write(`[${new Date().toISOString()}] cron exit code=${code} signal=${signal}\n`);
    if (!out.destroyed) out.end();
  });
}
