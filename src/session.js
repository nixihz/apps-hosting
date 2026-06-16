import crypto from 'node:crypto';
import { parseCookies } from './cookies.js';

const cookieName = 'apps_session';

export function readSession(req) {
  const raw = parseCookies(req.headers.cookie || '')[cookieName];
  if (!raw) return anonymousSession();
  try {
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return normalizeProfile({ ...payload, authenticated: true });
  } catch {
    return anonymousSession();
  }
}

export function createSessionCookie(profile) {
  const payload = Buffer.from(JSON.stringify(normalizeProfile({ ...profile, authenticated: true }))).toString('base64url');
  return `${cookieName}=${payload}; Path=/; HttpOnly; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`;
}

export function sessionFromHeaders(req) {
  const session = readSession(req);
  const permissions = splitList(req.headers['x-apps-permissions']);
  const groups = splitList(req.headers['x-apps-groups']);
  const roles = splitList(req.headers['x-apps-roles']);
  const headerIdentity = Boolean(req.headers['x-apps-user'] || req.headers['x-apps-tenant'] || permissions.length || groups.length || roles.length);
  return normalizeProfile({
    ...session,
    authenticated: session.authenticated || headerIdentity,
    name: req.headers['x-apps-user'] || session.name,
    tenant: req.headers['x-apps-tenant'] || session.tenant,
    permissions: permissions.length ? permissions : session.permissions,
    groups: groups.length ? groups : session.groups,
    roles: roles.length ? roles : session.roles
  });
}

export function normalizeProfile(profile = {}) {
  const authenticated = Boolean(profile.authenticated);
  return {
    id: profile.id || (authenticated ? crypto.randomUUID() : 'guest'),
    name: String(profile.name || 'guest'),
    tenant: profile.tenant ? String(profile.tenant) : '',
    permissions: uniq(splitList(profile.permissions)),
    groups: uniq(splitList(profile.groups)),
    roles: uniq(splitList(profile.roles)),
    authenticated
  };
}

export function anonymousSession() {
  return { id: 'guest', name: 'guest', tenant: '', permissions: [], groups: [], roles: [], authenticated: false };
}

function splitList(value) {
  if (Array.isArray(value)) return value.flatMap(splitList);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function uniq(items) {
  return [...new Set(items)];
}
