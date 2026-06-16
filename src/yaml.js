export function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const withoutComment = stripComment(rawLine);
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^\s*/)[0].length;
    const line = withoutComment.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;
    if (line.startsWith('- ')) {
      if (!Array.isArray(parent)) throw new Error(`YAML 列表位置非法：${rawLine}`);
      parent.push(parseScalar(line.slice(2).trim()));
      continue;
    }
    const idx = line.indexOf(':');
    if (idx === -1) throw new Error(`YAML 行缺少冒号：${rawLine}`);
    const key = line.slice(0, idx).trim();
    const rest = line.slice(idx + 1).trim();
    if (!key) throw new Error(`YAML key 为空：${rawLine}`);
    if (rest === '') {
      const value = ['env', 'permissions', 'menus', 'plugins', 'categories', 'groups', 'tenants', 'versionNotes'].includes(key) ? [] : {};
      parent[key] = value;
      stack.push({ indent, value });
    } else {
      parent[key] = parseScalar(rest);
    }
  }
  return root;
}

export function stringifyYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) return value.map((item) => `${pad}- ${formatScalar(item)}`).join('\n');
  return Object.entries(value).map(([key, val]) => {
    if (val && typeof val === 'object') return `${pad}${key}:\n${stringifyYaml(val, indent + 2)}`;
    return `${pad}${key}: ${formatScalar(val)}`;
  }).join('\n');
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && line[i - 1] !== '\\') quote = quote === ch ? null : ch;
    if (ch === '#' && !quote) return line.slice(0, i);
  }
  return line;
}

function parseScalar(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
  if (raw.startsWith('[') && raw.endsWith(']')) return raw.slice(1, -1).split(',').map((x) => parseScalar(x.trim())).filter((x) => x !== '');
  return raw;
}

function formatScalar(value) {
  if (typeof value === 'string') return /[:#\n]/.test(value) ? JSON.stringify(value) : value;
  return String(value);
}

function nextMeaningfulLine(lines, start) {
  for (let i = start; i < lines.length; i++) if (stripComment(lines[i]).trim()) return stripComment(lines[i]);
  return null;
}
