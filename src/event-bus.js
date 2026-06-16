import fs from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from './store.js';
import { signPayload } from './security.js';

export async function emitEvent(type, payload = {}) {
  const event = { id: eventId(), type, at: new Date().toISOString(), payload };
  const events = await readJson(eventsFile(), []);
  events.push(event);
  await writeJson(eventsFile(), events.slice(-500));
  const hooks = await listWebhooks();
  for (const hook of hooks.filter((item) => !item.events?.length || item.events.includes(type))) {
    void deliverWebhook(hook, event);
  }
  return event;
}

export async function listEvents(limit = 100) {
  const events = await readJson(eventsFile(), []);
  return events.slice(-limit).reverse();
}

export async function listWebhooks() {
  return await readJson(webhooksFile(), []);
}

export async function addWebhook(payload) {
  if (!payload?.url) throw new Error('webhook.url 必填');
  const hooks = await listWebhooks();
  const hook = { id: eventId(), url: String(payload.url), events: Array.isArray(payload.events) ? payload.events.map(String) : [], secret: payload.secret ? String(payload.secret) : '', createdAt: new Date().toISOString() };
  hooks.push(hook);
  await writeJson(webhooksFile(), hooks);
  return hook;
}

export async function removeWebhook(id) {
  const hooks = await listWebhooks();
  const next = hooks.filter((item) => item.id !== id);
  await writeJson(webhooksFile(), next);
  return { removed: id };
}

async function deliverWebhook(hook, event) {
  const result = { id: eventId(), webhookId: hook.id, eventId: event.id, url: hook.url, at: new Date().toISOString() };
  try {
    const body = JSON.stringify(event);
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(hook.secret ? { 'x-apps-signature': `sha256=${signPayload(hook.secret, body)}` } : {})
      },
      body,
      signal: AbortSignal.timeout(3000)
    });
    result.status = res.status;
    result.ok = res.ok;
  } catch (error) {
    result.ok = false;
    result.error = error.message;
  }
  const deliveries = await readJson(deliveriesFile(), []);
  deliveries.push(result);
  await writeJson(deliveriesFile(), deliveries.slice(-500));
}

export async function listDeliveries(limit = 100) {
  const items = await readJson(deliveriesFile(), []);
  return items.slice(-limit).reverse();
}

function eventsFile() { return path.join(dataDir(), 'events.json'); }
function webhooksFile() { return path.join(dataDir(), 'webhooks.json'); }
function deliveriesFile() { return path.join(dataDir(), 'webhook-deliveries.json'); }
function eventId() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}
