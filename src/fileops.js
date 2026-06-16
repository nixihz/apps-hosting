import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

export async function copyDir(src, dest) {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else if (entry.isSymbolicLink()) await fs.symlink(await fs.readlink(from), to);
    else await fs.copyFile(from, to);
  }
}

export function safeJoin(root, requestPath) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, requestPath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  return target;
}

export async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export function existsSync(file) { return fssync.existsSync(file); }
