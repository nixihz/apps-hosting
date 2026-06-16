import fs from 'node:fs/promises';
import path from 'node:path';
import { parseYaml, stringifyYaml } from './yaml.js';

export const SUPPORTED_TYPES = new Set(['frontend', 'fullstack', 'backend', 'plugin']);

export async function readManifest(appDir) {
  const file = path.join(appDir, 'apps.yaml');
  const text = await fs.readFile(file, 'utf8');
  const manifest = parseYaml(text);
  await validateManifest(manifest, appDir);
  return manifest;
}

export async function writeManifest(appDir, manifest) {
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(path.join(appDir, 'apps.yaml'), `${stringifyYaml(manifest)}\n`);
}

export async function validateManifest(manifest, appDir) {
  const required = ['name', 'title', 'type', 'version', 'route'];
  for (const key of required) if (!manifest[key]) throw new Error(`apps.yaml 缺少必填字段：${key}`);
  if (!/^[a-z0-9][a-z0-9-_.]*$/.test(manifest.name)) throw new Error('应用 name 只能包含小写字母、数字、-、_、.，且必须以字母或数字开头');
  if (!SUPPORTED_TYPES.has(manifest.type)) throw new Error(`不支持的应用 type：${manifest.type}`);
  if (!isNonEmptyString(manifest.title)) throw new Error('title 必须是非空字符串');
  if (!isNonEmptyString(manifest.version)) throw new Error('version 必须是非空字符串');
  if (!String(manifest.route).startsWith('/')) throw new Error('route 必须以 / 开头');
  manifest.route = normalizeRoute(manifest.route);

  if (manifest.author !== undefined && !isNonEmptyString(manifest.author)) throw new Error('author 必须是非空字符串');
  if (manifest.description !== undefined && typeof manifest.description !== 'string') throw new Error('description 必须是字符串');
  ensureLocalizedTextMap(manifest.title_i18n, 'title_i18n');
  ensureLocalizedTextMap(manifest.description_i18n, 'description_i18n');
  ensureLocalizedTextMap(manifest.titleI18n, 'titleI18n');
  ensureLocalizedTextMap(manifest.descriptionI18n, 'descriptionI18n');
  const logoPath = manifest.logo || manifest.icon || manifest.ui?.logo;
  if (logoPath !== undefined) validateAssetPath(logoPath, 'logo');
  ensureArrayOfStrings(manifest.env, 'env');
  ensureArrayOfStrings(manifest.permissions, 'permissions');
  ensureArrayOfStrings(manifest.groups, 'groups');
  ensureArrayOfStrings(manifest.tenants, 'tenants');
  ensureArrayOfStrings(manifest.categories, 'categories');
  ensureArrayOfStrings(manifest.versionNotes, 'versionNotes');
  ensureArrayOfStrings(manifest.environments, 'environments');

  const frontendEntry = getFrontendEntry(manifest);
  const pluginKind = manifest.plugin?.kind || 'page';
  const requiresFrontend = manifest.type === 'frontend' || manifest.type === 'fullstack' || (manifest.type === 'plugin' && ['page', 'menu'].includes(pluginKind));
  const requiresBackend = manifest.type === 'backend' || manifest.type === 'fullstack' || (manifest.type === 'plugin' && ['api', 'webhook'].includes(pluginKind));

  if (requiresFrontend && !frontendEntry) throw new Error('前端应用必须配置 entry 或 frontend.entry');
  if (frontendEntry !== undefined && !isNonEmptyString(frontendEntry)) throw new Error('entry 或 frontend.entry 必须是非空字符串');
  if (appDir && frontendEntry) await assertPathExists(appDir, frontendEntry, `前端入口不存在：${frontendEntry}`);
  if (appDir && logoPath) await assertPathExists(appDir, logoPath, `logo 文件不存在：${logoPath}`);

  if (requiresBackend) {
    if (!isNonEmptyString(manifest.backend?.command)) throw new Error('服务端应用必须配置 backend.command');
    if (manifest.backend?.port !== undefined && (!Number.isInteger(manifest.backend.port) || manifest.backend.port <= 0)) throw new Error('backend.port 必须是正整数');
    if (manifest.backend?.health !== undefined && !String(manifest.backend.health).startsWith('/')) throw new Error('backend.health 必须以 / 开头');
  }

  if (manifest.runtime?.type !== undefined && !['node', 'python', 'go', 'java', 'docker', 'static'].includes(manifest.runtime.type)) throw new Error('runtime.type 只支持 node / python / go / java / docker / static');
  if (manifest.build?.command !== undefined && !isNonEmptyString(manifest.build.command)) throw new Error('build.command 必须是非空字符串');
  if (manifest.runtime?.restartPolicy !== undefined && !['never', 'on-failure', 'always'].includes(manifest.runtime.restartPolicy)) throw new Error('runtime.restartPolicy 只支持 never / on-failure / always');
  if (manifest.runtime?.maxRetries !== undefined && (!Number.isInteger(manifest.runtime.maxRetries) || manifest.runtime.maxRetries < 0)) throw new Error('runtime.maxRetries 必须是非负整数');
  if (manifest.runtime?.restartDelayMs !== undefined && (!Number.isInteger(manifest.runtime.restartDelayMs) || manifest.runtime.restartDelayMs < 0)) throw new Error('runtime.restartDelayMs 必须是非负整数');
  if (manifest.resources?.storageMb !== undefined && (!Number.isInteger(manifest.resources.storageMb) || manifest.resources.storageMb <= 0)) throw new Error('resources.storageMb 必须是正整数');
  if (manifest.resources?.memoryMb !== undefined && (!Number.isInteger(manifest.resources.memoryMb) || manifest.resources.memoryMb <= 0)) throw new Error('resources.memoryMb 必须是正整数');

  if (manifest.type === 'plugin') {
    if (!['page', 'menu', 'api', 'webhook', 'cron'].includes(pluginKind)) throw new Error(`不支持的 plugin.kind：${pluginKind}`);
    if (manifest.plugin?.category !== undefined && !isNonEmptyString(manifest.plugin.category)) throw new Error('plugin.category 必须是非空字符串');
    if (manifest.plugin?.mount !== undefined && !isNonEmptyString(manifest.plugin.mount)) throw new Error('plugin.mount 必须是非空字符串');
    if (pluginKind === 'cron') {
      if (!isNonEmptyString(manifest.plugin?.command)) throw new Error('cron 插件必须配置 plugin.command');
      if (!Number.isInteger(manifest.plugin?.schedule?.everySeconds) || manifest.plugin.schedule.everySeconds <= 0) throw new Error('cron 插件必须配置正整数 plugin.schedule.everySeconds');
    }
  }
}

export function getFrontendEntry(manifest) {
  return manifest.frontend?.entry || manifest.entry;
}

export function normalizeRoute(route) {
  const clean = `/${String(route).replace(/^\/+|\/+$/g, '')}`;
  return clean === '/' ? '/' : clean;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function ensureArrayOfStrings(value, field) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item))) throw new Error(`${field} 必须是字符串数组`);
}

function ensureLocalizedTextMap(value, field) {
  if (value === undefined) return;
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${field} 必须是语言到文本的映射`);
  for (const [lang, text] of Object.entries(value)) {
    if (!['zh', 'en', 'zh-CN', 'en-US'].includes(lang)) throw new Error(`${field} 只支持 zh/en/zh-CN/en-US`);
    if (!isNonEmptyString(text)) throw new Error(`${field}.${lang} 必须是非空字符串`);
  }
}

function validateAssetPath(value, field) {
  if (!isNonEmptyString(value)) throw new Error(`${field} 必须是非空字符串`);
  if (path.isAbsolute(value) || value.split(/[\\/]+/).includes('..')) throw new Error(`${field} 必须是应用包内的相对路径`);
  if (!['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(value).toLowerCase())) throw new Error(`${field} 只支持 svg/png/jpg/jpeg/webp/gif`);
}

async function assertPathExists(appDir, relativePath, message) {
  const target = path.join(appDir, relativePath);
  try {
    await fs.access(target);
  } catch {
    throw new Error(message);
  }
}
