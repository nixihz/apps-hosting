import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import { packageApp } from './packager.js';
import { installAppFromDirectory } from './installer.js';

const packageFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
const serverFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './server.js');

export async function runDeveloperCommand(command, argv = [], options = {}) {
  const binaryName = options.binaryName || 'keli-cli';
  switch (command) {
    case 'login': await login(argv, binaryName); break;
    case 'publish': await publish(argv, binaryName); break;
    case 'package': await packageOnly(argv); break;
    case 'run': await runLocal(argv); break;
    case 'whoami': case 'status': await whoami(argv); break;
    case 'logout': await logout(); break;
    case 'version': case '-v': case '--version': await version(binaryName); break;
    case 'help': case '-h': case '--help': case undefined: developerHelp(binaryName); break;
    default: throw new Error(`未知命令：${command}`);
  }
}

async function login(argv, binaryName) {
  const existing = await loadConfig();
  let server = flagValue(argv, '--server') || flagValue(argv, '-s') || firstPositional(argv) || existing.server;
  const token = flagValue(argv, '--token') || flagValue(argv, '-t') || process.env.KELI_APPS_TOKEN || existing.token;
  let code = flagValue(argv, '--code') || flagValue(argv, '-c');
  if (!server) {
    const rl = readline.createInterface({ input, output });
    try {
      server = await rl.question('Keli Apps server URL: ');
    } finally {
      rl.close();
    }
  }
  server = normalizeServer(required(server, '缺少 server URL'));
  let auth;
  if (token) {
    auth = { type: 'token', token };
  } else {
    if (!code) {
      const rl = readline.createInterface({ input, output });
      try {
        code = await rl.question('2FA code: ');
      } finally {
        rl.close();
      }
    }
    auth = await loginWith2fa(server, required(code, '缺少 2FA 验证码'));
  }
  const platform = await assertAdminAccess(server, auth);
  await saveConfig({ server, ...auth, platform, loggedInAt: new Date().toISOString() });
  console.log(`✓ 已登录 ${server}`);
}

async function publish(argv, binaryName) {
  const config = await loadConfig();
  const server = normalizeServer(flagValue(argv, '--server') || flagValue(argv, '-s') || config.server || '');
  const auth = resolveAuth(argv, config);
  if (!server || !auth) throw new Error(`请先执行 ${binaryName} login，或传入 --server 和 --token`);
  await assertAdminAccess(server, auth);
  const source = path.resolve(firstPositional(argv) || '.');
  const output = flagValue(argv, '--output') || flagValue(argv, '--out') || flagValue(argv, '-o');
  const mode = argv.includes('--update') ? 'update' : 'install';
  const packaged = await packageApp(source, { output });
  const result = await uploadPackage(server, auth, packaged.path, { update: mode === 'update' });
  console.log(formatPublishResult(packaged, result, mode));
}

async function packageOnly(argv) {
  const source = path.resolve(required(firstPositional(argv), '缺少应用目录'));
  const result = await packageApp(source, { output: flagValue(argv, '--output') || flagValue(argv, '--out') || flagValue(argv, '-o') });
  console.log(formatPackageResult(result));
}

async function runLocal(argv) {
  const source = path.resolve(firstPositional(argv) || '.');
  const port = Number(flagValue(argv, '--port') || flagValue(argv, '-p') || process.env.PORT || process.env.APPS_PORT || 4173);
  if (!Number.isInteger(port) || port <= 0) throw new Error('--port 必须是正整数');
  const dataRoot = path.resolve(flagValue(argv, '--data-dir') || flagValue(argv, '-d') || path.join(source, '..', '.keli-local'));
  process.env.APPS_DATA_DIR = dataRoot;
  process.env.APPS_PORT = String(port);
  process.env.PORT = String(port);

  const record = await installAppFromDirectory(source, { allowUpdate: true });
  console.log(`✓ 已安装本地应用 ${record.name}`);
  console.log(`  数据目录: ${dataRoot}`);
  console.log(`  应用地址: http://127.0.0.1:${port}${record.manifest.route}`);
  console.log(`  管理台: http://127.0.0.1:${port}/admin`);
  console.log('  停止: Ctrl+C');

  const child = spawn(process.execPath, [serverFile], {
    env: { ...process.env, APPS_DATA_DIR: dataRoot, APPS_PORT: String(port), PORT: String(port) },
    stdio: 'inherit'
  });
  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once('SIGINT', () => forward('SIGINT'));
  process.once('SIGTERM', () => forward('SIGTERM'));
  const code = await new Promise((resolve) => {
    child.once('exit', (exitCode, signal) => resolve(signal ? 0 : exitCode || 0));
  });
  process.exitCode = code;
}

async function whoami(argv) {
  const config = await loadConfig();
  const server = normalizeServer(flagValue(argv, '--server') || flagValue(argv, '-s') || config.server || '');
  const auth = resolveAuth(argv, config);
  if (!server || !auth) throw new Error('未登录');
  const platform = await assertAdminAccess(server, auth);
  console.log(JSON.stringify({ server, platform }, null, 2));
}

async function logout() {
  await fs.rm(configFile(), { force: true });
  console.log('✓ 已退出登录');
}

async function version(binaryName) {
  const pkg = JSON.parse(await fs.readFile(packageFile, 'utf8'));
  console.log(`${binaryName} ${pkg.version}`);
}

async function loginWith2fa(server, code) {
  const response = await cliFetch(apiUrl(server, '/api/session/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`2FA 登录失败：HTTP ${response.status} ${text}`);
  const cookie = readSetCookie(response.headers);
  if (!cookie) throw new Error('2FA 登录失败：服务端未返回 session cookie');
  return { type: 'cookie', cookie };
}

async function assertAdminAccess(server, auth) {
  const response = await cliFetch(apiUrl(server, '/api/platform'), { headers: authHeaders(auth) });
  if (response.status === 401 || response.status === 403) throw new Error('登录校验失败：当前账号没有平台管理权限');
  if (!response.ok) throw new Error(`平台信息读取失败：HTTP ${response.status} ${await response.text()}`);
  const platform = await response.json();
  const protectedResponse = await cliFetch(apiUrl(server, '/api/platform/webhooks'), { headers: authHeaders(auth) });
  if (protectedResponse.status === 401 || protectedResponse.status === 403) throw new Error('登录校验失败：当前账号没有平台管理权限');
  if (!protectedResponse.ok) throw new Error(`管理权限校验失败：HTTP ${protectedResponse.status} ${await protectedResponse.text()}`);
  return platform;
}

async function uploadPackage(server, auth, zipFile, options = {}) {
  const data = await fs.readFile(zipFile);
  const form = new FormData();
  form.append('mode', options.update ? 'update' : 'install');
  form.append('plugin', new Blob([data], { type: 'application/zip' }), path.basename(zipFile));
  const response = await cliFetch(apiUrl(server, '/api/x/install-upload'), {
    method: 'POST',
    headers: authHeaders(auth),
    body: form
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`发布失败：HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function resolveAuth(argv, config) {
  const token = flagValue(argv, '--token') || flagValue(argv, '-t') || process.env.KELI_APPS_TOKEN || config.token;
  if (token) return { type: 'token', token };
  if (config.cookie) return { type: 'cookie', cookie: config.cookie };
  return null;
}

function authHeaders(auth) {
  if (auth.type === 'token') return { authorization: `Bearer ${auth.token}` };
  if (auth.type === 'cookie') return { cookie: auth.cookie };
  return {};
}

async function cliFetch(url, options = {}) {
  return await fetch(url, options);
}

function readSetCookie(headers) {
  if (typeof headers.getSetCookie === 'function') {
    const cookies = headers.getSetCookie();
    if (cookies.length) return cookies.join('; ');
  }
  return headers.get('set-cookie') || '';
}

function apiUrl(server, pathname) {
  return new URL(pathname, server).toString();
}

function normalizeServer(value) {
  if (!value) return '';
  const url = new URL(String(value));
  url.pathname = url.pathname.replace(/\/+$/g, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/g, '');
}

async function loadConfig() {
  try {
    return JSON.parse(await fs.readFile(configFile(), 'utf8'));
  } catch {
    return {};
  }
}

async function saveConfig(config) {
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(configFile(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function configDir() {
  return path.join(os.homedir(), '.keli-cli');
}

function configFile() {
  return path.join(configDir(), 'config.json');
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function flagValue(argv, name) {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

function firstPositional(argv) {
  const flagsWithValues = new Set(['--server', '-s', '--token', '-t', '--code', '-c', '--output', '--out', '-o', '--port', '-p', '--data-dir', '-d']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (flagsWithValues.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith('-')) return arg;
  }
  return undefined;
}

function formatPackageResult(result) {
  return [
    `✓ 已打包 ${result.name}`,
    `  访问路由: ${result.route}`,
    `  插件包: ${result.path}`,
    `  文件数: ${result.files}`,
    '  上传方式: 管理台 /admin/install 选择该 zip，或执行 keli-cli publish <dir>'
  ].join('\n');
}

function formatPublishResult(packaged, result, mode) {
  return [
    `✓ 已${mode === 'update' ? '更新' : '发布'} ${result.name || packaged.name}`,
    `  访问路由: ${result.route || packaged.route}`,
    `  插件包: ${packaged.path}`,
    `  状态: ${result.status || 'installed'}`
  ].join('\n');
}

export function developerHelp(binaryName = 'keli-cli') {
  console.log([
    `用法: ${binaryName} <command> [options]`,
    '',
    '管理员发布命令:',
    '  login --server <url> --code 123456    使用 2FA 登录并保存 session',
    '  login --server <url> --token <token>  使用管理/API token 登录，适合自动化',
    '  publish [dir]                         打包当前目录并上传安装，默认禁止覆盖',
    '  publish [dir] --update                显式更新已有应用',
    '  package <dir> [-o file]               只打包为可上传安装的 Keli Apps zip',
    '  run [dir] [-p port] [-d dataDir]       本地安装并启动预览',
    '  whoami                                查看当前登录的 Keli Apps 实例',
    '  version                               查看 CLI 版本',
    '  logout                                清除本地登录信息',
    '',
    '示例:',
    `  ${binaryName} login --server https://apps.example.com --code 123456`,
    `  ${binaryName} login --server https://apps.example.com --token ymj_xxx`,
    `  ${binaryName} package ./my-app --output dist/my-app.zip`,
    `  ${binaryName} publish ./my-app`,
    `  ${binaryName} publish ./my-app --update`
  ].join('\n'));
}
