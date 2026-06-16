import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from './store.js';

const builtinRoles = {
  admin: ['platform:admin', 'apps:read', 'apps:write', 'config:write', 'security:manage', 'audit:read'],
  developer: ['apps:read', 'apps:write', 'config:write'],
  viewer: ['apps:read'],
  auditor: ['apps:read', 'audit:read']
};

export async function ensureSecurityStore() {
  await fs.mkdir(securityDir(), { recursive: true });
  if (!(await exists(usersFile()))) await writeJson(usersFile(), []);
  if (!(await exists(groupsFile()))) await writeJson(groupsFile(), []);
  if (!(await exists(rolesFile()))) await writeJson(rolesFile(), Object.entries(builtinRoles).map(([name, permissions]) => ({ name, permissions, builtin: true })));
  if (!(await exists(tokensFile()))) await writeJson(tokensFile(), []);
}

export async function securitySummary() {
  await ensureSecurityStore();
  const [users, groups, roles, tokens] = await Promise.all([listUsers(), listGroups(), listRoles(), listApiTokens()]);
  return { users, groups, roles, tokens };
}

export async function listUsers() { await ensureSecurityStore(); return await readJson(usersFile(), []); }
export async function listGroups() { await ensureSecurityStore(); return await readJson(groupsFile(), []); }
export async function listRoles() { await ensureSecurityStore(); return await readJson(rolesFile(), []); }
export async function listApiTokens() {
  await ensureSecurityStore();
  return (await readJson(tokensFile(), [])).map(({ tokenHash, ...item }) => item);
}

export async function upsertUser(payload) {
  await ensureSecurityStore();
  const users = await listUsers();
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('user.name 必填');
  const next = { name, tenant: String(payload.tenant || ''), groups: toList(payload.groups), roles: toList(payload.roles), permissions: toList(payload.permissions), updatedAt: now() };
  const idx = users.findIndex((item) => item.name === name);
  if (idx >= 0) users[idx] = { ...users[idx], ...next };
  else users.push({ createdAt: now(), ...next });
  await writeJson(usersFile(), users);
  return next;
}

export async function upsertGroup(payload) {
  await ensureSecurityStore();
  const groups = await listGroups();
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('group.name 必填');
  const next = { name, roles: toList(payload.roles), permissions: toList(payload.permissions), updatedAt: now() };
  const idx = groups.findIndex((item) => item.name === name);
  if (idx >= 0) groups[idx] = { ...groups[idx], ...next };
  else groups.push({ createdAt: now(), ...next });
  await writeJson(groupsFile(), groups);
  return next;
}

export async function upsertRole(payload) {
  await ensureSecurityStore();
  const roles = await listRoles();
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('role.name 必填');
  const next = { name, permissions: toList(payload.permissions), updatedAt: now(), builtin: Boolean(payload.builtin) };
  const idx = roles.findIndex((item) => item.name === name);
  if (idx >= 0) roles[idx] = { ...roles[idx], ...next, builtin: roles[idx].builtin || next.builtin };
  else roles.push({ createdAt: now(), ...next });
  await writeJson(rolesFile(), roles);
  return next;
}

export async function issueApiToken(payload) {
  await ensureSecurityStore();
  const raw = `ymj_${crypto.randomBytes(24).toString('base64url')}`;
  const token = { id: crypto.randomUUID(), name: String(payload.name || 'api-token'), tokenHash: hashToken(raw), roles: toList(payload.roles), permissions: toList(payload.permissions), groups: toList(payload.groups), tenant: String(payload.tenant || ''), createdAt: now(), lastUsedAt: null };
  const tokens = await readJson(tokensFile(), []);
  tokens.push(token);
  await writeJson(tokensFile(), tokens);
  const { tokenHash, ...safe } = token;
  return { ...safe, token: raw };
}

export async function revokeApiToken(id) {
  await ensureSecurityStore();
  const tokens = await readJson(tokensFile(), []);
  await writeJson(tokensFile(), tokens.filter((item) => item.id !== id));
  return { revoked: id };
}

export async function sessionFromApiToken(rawToken) {
  if (!rawToken) return null;
  await ensureSecurityStore();
  const tokens = await readJson(tokensFile(), []);
  const idx = tokens.findIndex((item) => item.tokenHash === hashToken(rawToken));
  if (idx < 0) return null;
  tokens[idx].lastUsedAt = now();
  await writeJson(tokensFile(), tokens);
  return enrichSession({ id: tokens[idx].id, name: tokens[idx].name, tenant: tokens[idx].tenant, groups: tokens[idx].groups, roles: tokens[idx].roles, permissions: tokens[idx].permissions, token: true, authenticated: true });
}

export async function enrichSession(profile) {
  await ensureSecurityStore();
  const [users, groups, roles] = await Promise.all([listUsers(), listGroups(), listRoles()]);
  const user = users.find((item) => item.name === profile.name);
  const groupNames = uniq([...(profile.groups || []), ...(user?.groups || [])]);
  const roleNames = uniq([...(profile.roles || []), ...(user?.roles || []), ...groups.filter((group) => groupNames.includes(group.name)).flatMap((group) => group.roles || [])]);
  const rolePerms = roles.filter((role) => roleNames.includes(role.name)).flatMap((role) => role.permissions || []);
  const groupPerms = groups.filter((group) => groupNames.includes(group.name)).flatMap((group) => group.permissions || []);
  return { ...profile, tenant: profile.tenant || user?.tenant || '', groups: groupNames, roles: roleNames, permissions: uniq([...(profile.permissions || []), ...(user?.permissions || []), ...groupPerms, ...rolePerms]) };
}

export function hasPermission(session, permission) {
  if (!session?.authenticated && !session?.token) return false;
  return session.permissions?.includes('platform:admin') || session.permissions?.includes(permission) || session.roles?.includes('admin');
}

export function verifyTotpCode(code, options = {}) {
  const secret = totpSecret();
  const digits = Number(options.digits || 6);
  const step = Number(options.step || 30);
  const window = Number(options.window ?? 1);
  const normalized = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const nowStep = Math.floor(Date.now() / 1000 / step);
  for (let offset = -window; offset <= window; offset++) {
    const expected = generateTotpCode(secret, nowStep + offset, digits);
    if (safeEqual(normalized, expected)) return true;
  }
  return false;
}

export function totpConfigured() {
  return Boolean(process.env.APPS_2FA_SECRET || process.env.APPS_SECRET_KEY);
}

export function generateTotpCode(secret, counter, digits = 6) {
  const key = decodeTotpSecret(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

export function oidcAuthorizeUrl(reqUrl) {
  const issuer = process.env.APPS_OIDC_ISSUER;
  const clientId = process.env.APPS_OIDC_CLIENT_ID;
  if (!issuer || !clientId) return null;
  const callback = new URL('/api/auth/oidc/callback', reqUrl.origin).toString();
  const target = new URL('/authorize', issuer);
  target.searchParams.set('client_id', clientId);
  target.searchParams.set('redirect_uri', callback);
  target.searchParams.set('response_type', 'code');
  target.searchParams.set('scope', 'openid profile email groups');
  return target.toString();
}

export function encryptSecret(value) {
  const text = String(value ?? '');
  const key = secretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value) {
  const text = String(value ?? '');
  if (!text.startsWith('enc:v1:')) return text;
  const [, , iv, tag, encrypted] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function maskSecret(value) {
  if (!value) return '';
  return '******';
}

export function signPayload(secret, body) {
  return crypto.createHmac('sha256', String(secret)).update(body).digest('hex');
}

export function verifySignature(secret, body, signature) {
  if (!secret) return true;
  const expected = signPayload(secret, body);
  const actual = String(signature || '').replace(/^sha256=/, '');
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function securityDir() { return path.join(dataDir(), 'security'); }
function usersFile() { return path.join(securityDir(), 'users.json'); }
function groupsFile() { return path.join(securityDir(), 'groups.json'); }
function rolesFile() { return path.join(securityDir(), 'roles.json'); }
function tokensFile() { return path.join(securityDir(), 'tokens.json'); }
function now() { return new Date().toISOString(); }
function toList(value) { return Array.isArray(value) ? value.map(String).filter(Boolean) : String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
function uniq(items) { return [...new Set((items || []).filter(Boolean))]; }
function hashToken(raw) { return crypto.createHash('sha256').update(String(raw)).digest('hex'); }
function secretKey() { return crypto.createHash('sha256').update(process.env.APPS_SECRET_KEY || 'apps-local-development-key').digest(); }
function totpSecret() { return process.env.APPS_2FA_SECRET || process.env.APPS_SECRET_KEY || 'apps-local-development-key'; }
function decodeTotpSecret(secret) {
  const text = String(secret || '').replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z2-7]+=*$/.test(text)) return decodeBase32(text);
  return Buffer.from(String(secret || ''), 'utf8');
}
function decodeBase32(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of input.replace(/=+$/g, '')) {
    const value = alphabet.indexOf(ch);
    if (value < 0) throw new Error('APPS_2FA_SECRET 不是有效的 base32');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
async function writeJson(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2)); }
