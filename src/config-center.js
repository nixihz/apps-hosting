import fs from 'node:fs/promises';
import path from 'node:path';
import { configDir, dataDir } from './store.js';
import { decryptSecret, encryptSecret, maskSecret } from './security.js';

export async function ensureConfigCenter() {
  await fs.mkdir(configHistoryDir(), { recursive: true });
  await fs.mkdir(configDir(), { recursive: true });
  if (!(await exists(auditFile()))) await writeJson(auditFile(), []);
}

export async function getAppConfig(appName, options = {}) {
  await ensureConfigCenter();
  const config = await readJson(appConfigFile(appName), defaultConfig(appName));
  const secrets = Object.fromEntries(Object.entries(config.secrets || {}).map(([key, value]) => [key, options.raw ? decryptSecret(value) : maskSecret(value)]));
  return { ...config, secrets };
}

export async function updateAppConfig(appName, payload, actor = 'system') {
  await ensureConfigCenter();
  const current = await getAppConfig(appName, { raw: true });
  const next = {
    appName,
    env: normalizeMap(payload.env ?? current.env),
    secrets: encryptSecretMap(payload.secrets ?? current.secrets, current.secrets),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
    version: (current.version || 0) + 1
  };
  await writeJson(appConfigFile(appName), next);
  const history = await listConfigHistory(appName);
  history.push(next);
  await writeJson(appConfigHistoryFile(appName), history);
  await appendAudit({ type: 'config.update', appName, actor, at: next.updatedAt, version: next.version, envKeys: Object.keys(next.env), secretKeys: Object.keys(next.secrets) });
  return next;
}

export async function listConfigHistory(appName) {
  await ensureConfigCenter();
  return await readJson(appConfigHistoryFile(appName), []);
}

export async function listAuditLogs(limit = 200) {
  await ensureConfigCenter();
  const logs = await readJson(auditFile(), []);
  return logs.slice(-limit).reverse();
}

function appConfigFile(appName) {
  return path.join(configDir(), `${appName}.json`);
}

function appConfigHistoryFile(appName) {
  return path.join(configHistoryDir(), `${appName}.json`);
}

function configHistoryDir() {
  return path.join(dataDir(), 'config-history');
}

function auditFile() {
  return path.join(dataDir(), 'audit.json');
}

function defaultConfig(appName) {
  return { appName, env: {}, secrets: {}, version: 0, updatedAt: null, updatedBy: null };
}

async function appendAudit(entry) {
  const logs = await readJson(auditFile(), []);
  logs.push(entry);
  await writeJson(auditFile(), logs);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function normalizeMap(value) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [String(key), String(item)]));
}

function encryptSecretMap(value, previous = {}) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => {
    const text = String(item);
    const previousValue = previous[key];
    const plain = text === '******' && previousValue !== undefined ? String(previousValue) : text;
    return [String(key), plain.startsWith('enc:v1:') ? plain : encryptSecret(plain)];
  }));
}
