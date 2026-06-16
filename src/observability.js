import fs from 'node:fs/promises';
import path from 'node:path';
import { logsDir } from './store.js';

const metrics = new Map();

export async function recordAccess(appName, payload) {
  const state = ensureMetric(appName);
  state.requests += 1;
  state.totalDurationMs += payload.durationMs;
  if (payload.status >= 400) state.errors += 1;
  state.lastAccessAt = new Date().toISOString();
  await appendLog(path.join(logsDir(), `${appName}.access.log`), payload);
}

export async function recordError(appName, payload) {
  const state = ensureMetric(appName);
  state.errors += 1;
  state.lastErrorAt = new Date().toISOString();
  await appendLog(path.join(logsDir(), `${appName}.error.log`), payload);
}

export function getMetrics(appName) {
  const state = ensureMetric(appName);
  return {
    requests: state.requests,
    errors: state.errors,
    avgDurationMs: state.requests ? Number((state.totalDurationMs / state.requests).toFixed(2)) : 0,
    totalDurationMs: state.totalDurationMs,
    lastAccessAt: state.lastAccessAt,
    lastErrorAt: state.lastErrorAt
  };
}

export async function tailAccessLog(appName, lines = 200) {
  return await tail(path.join(logsDir(), `${appName}.access.log`), lines);
}

export async function tailErrorLog(appName, lines = 200) {
  return await tail(path.join(logsDir(), `${appName}.error.log`), lines);
}

function ensureMetric(appName) {
  if (!metrics.has(appName)) metrics.set(appName, { requests: 0, errors: 0, totalDurationMs: 0, lastAccessAt: null, lastErrorAt: null });
  return metrics.get(appName);
}

async function appendLog(file, payload) {
  await fs.mkdir(logsDir(), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n`);
}

async function tail(file, lines) {
  try {
    const text = await fs.readFile(file, 'utf8');
    return text.split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '';
  }
}
