import fs from 'node:fs/promises';
import path from 'node:path';
import { readManifest } from './manifest.js';
import { createZip } from './zip.js';

const DEFAULT_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.apps',
  '.apps-data',
  '.apps-package',
  '.pi',
  '__pycache__'
]);

const DEFAULT_SKIP_FILES = new Set([
  '.DS_Store',
  '.env'
]);

const DEFAULT_SKIP_SUFFIXES = [
  '.log',
  '.pyc',
  '.pyo',
  '.zip'
];

export async function packageApp(sourceDir, options = {}) {
  const source = path.resolve(sourceDir);
  const manifest = await readManifest(source);
  const output = path.resolve(options.output || path.join(source, 'dist', `${manifest.name}-keli-apps.zip`));
  const entries = await collectPackageEntries(source, manifest.name, output);
  if (!entries.some((entry) => entry.name === `${manifest.name}/apps.yaml`)) throw new Error('打包失败：缺少 apps.yaml');
  const result = await createZip(output, entries);
  return { ...result, name: manifest.name, route: manifest.route, manifest };
}

async function collectPackageEntries(source, packageRootName, output) {
  const entries = [];
  const resolvedOutput = path.resolve(output);
  async function walk(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      const file = path.join(dir, dirent.name);
      if (path.resolve(file) === resolvedOutput) continue;
      const rel = path.relative(source, file).replaceAll(path.sep, '/');
      if (!rel || shouldSkip(rel, dirent)) continue;
      if (dirent.isSymbolicLink()) throw new Error(`打包目录包含符号链接，已拒绝：${rel}`);
      if (dirent.isDirectory()) {
        await walk(file);
      } else if (dirent.isFile()) {
        entries.push({
          name: `${packageRootName}/${rel}`,
          data: await fs.readFile(file)
        });
      }
    }
  }
  await walk(source);
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function shouldSkip(relativePath, dirent) {
  const parts = relativePath.split('/');
  if (parts.some((part) => DEFAULT_SKIP_DIRS.has(part))) return true;
  if (DEFAULT_SKIP_FILES.has(dirent.name)) return true;
  if (DEFAULT_SKIP_SUFFIXES.some((suffix) => dirent.name.endsWith(suffix))) return true;
  return false;
}
