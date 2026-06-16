export function parseCookies(input) {
  const cookies = {};
  for (const part of String(input || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const name = trimmed.slice(0, idx).trim();
    if (!isCookieName(name)) continue;
    cookies[name] = trimmed.slice(idx + 1);
  }
  return cookies;
}

function isCookieName(name) {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name);
}
