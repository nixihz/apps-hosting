#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { appsDir, ensureStore, getApp, loadRegistry, removeApp, saveRegistry } from '../src/store.js';
import { exists } from '../src/fileops.js';
import { writeManifest } from '../src/manifest.js';
import { installAppFromDirectory } from '../src/installer.js';
import { stopBackend } from '../src/process-manager.js';
import { deployApp, listDeployments, rollbackApp } from '../src/deployments.js';
import { packageApp } from '../src/packager.js';

const args = process.argv.slice(2);
const command = args[0];

try {
  await ensureStore();
  switch (command) {
    case 'install': await install(args.slice(1)); break;
    case 'list': await list(); break;
    case 'info': await info(required(args[1], '缺少应用名称')); break;
    case 'enable': await setEnabled(required(args[1], '缺少应用名称'), true); break;
    case 'disable': await setEnabled(required(args[1], '缺少应用名称'), false); break;
    case 'remove': await uninstall(required(args[1], '缺少应用名称')); break;
    case 'deploy': await deploy(args.slice(1)); break;
    case 'package': await packageCommand(args.slice(1)); break;
    case 'publish-plugin': await packageCommand(args.slice(1)); break;
    case 'rollback': await rollback(required(args[1], '缺少应用名称'), args[2]); break;
    case 'deployments': await deployments(required(args[1], '缺少应用名称')); break;
    case 'create': await create(required(args[1], '缺少应用类型'), required(args[2], '缺少应用名称')); break;
    case 'help': case '-h': case '--help': case undefined: help(); break;
    default: throw new Error(`未知命令：${command}`);
  }
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

async function install(argv) {
  const source = path.resolve(required(argv.find((arg) => !arg.startsWith('--')), '缺少应用目录'));
  const record = await installAppFromDirectory(source, { name: flagValue(argv, '--name') });
  console.log(`✓ 已安装 ${record.name} -> ${record.manifest.route}`);
}

async function list() {
  const apps = (await loadRegistry()).apps;
  if (!apps.length) return console.log('暂无已安装的应用');
  for (const app of apps) console.log(`${app.enabled ? '●' : '○'} ${app.name}\t${app.manifest.type}\t${app.manifest.version}\t${app.manifest.route}`);
}

async function info(name) {
  const app = await getApp(name);
  if (!app) throw new Error(`应用不存在：${name}`);
  console.log(JSON.stringify(app, null, 2));
}

async function setEnabled(name, enabled) {
  const registry = await loadRegistry();
  const app = registry.apps.find((item) => item.name === name);
  if (!app) throw new Error(`应用不存在：${name}`);
  app.enabled = enabled;
  app.updatedAt = new Date().toISOString();
  await saveRegistry(registry);
  if (!enabled) stopBackend(name);
  console.log(`✓ 已${enabled ? '启用' : '停用'} ${name}`);
}

async function uninstall(name) {
  const app = await getApp(name);
  if (!app) throw new Error(`应用不存在：${name}`);
  stopBackend(name);
  await removeApp(name);
  if (app.path.startsWith(path.resolve(appsDir()))) await fs.rm(app.path, { recursive: true, force: true });
  console.log(`✓ 已卸载 ${name}`);
}

async function deploy(argv) {
  const source = path.resolve(required(argv.find((arg) => !arg.startsWith('--')), '缺少应用目录'));
  const name = flagValue(argv, '--name');
  const record = await deployApp(source, { name });
  console.log(`✓ 已部署 ${record.name} -> ${record.manifest.route} (${record.currentReleaseId})`);
}

async function packageCommand(argv) {
  const source = path.resolve(required(firstPositional(argv), '缺少应用目录'));
  const result = await packageApp(source, { output: flagValue(argv, '--output') || flagValue(argv, '--out') || flagValue(argv, '-o') });
  console.log(formatPackageResult(result));
}

async function rollback(name, release) {
  const app = await rollbackApp(name, release);
  console.log(`✓ 已回滚 ${name} -> ${app.currentReleaseId}`);
}

async function deployments(name) {
  console.log(JSON.stringify(await listDeployments(name), null, 2));
}

async function create(type, name) {
  const allowed = new Set(['frontend', 'fullstack', 'backend', 'plugin', 'python-backend', 'go-backend', 'java-backend', 'docker-app']);
  if (!allowed.has(type)) throw new Error(`不支持的类型：${type}`);
  if (!/^[a-z0-9][a-z0-9-_.]*$/.test(name)) throw new Error('应用名称只能包含小写字母、数字、-、_、.');
  const dir = path.resolve(name);
  if (await exists(dir)) throw new Error(`目录已存在：${dir}`);
  const manifest = baseManifest(type, name);
  if (manifest.entry || manifest.frontend?.entry) await fs.mkdir(path.join(dir, 'dist'), { recursive: true });
  await writeManifest(dir, manifest);
  if (manifest.entry || manifest.frontend?.entry) await fs.writeFile(path.join(dir, 'dist', 'index.html'), demoHtml(manifest.title));
  if (type === 'fullstack' || type === 'backend') {
    await fs.mkdir(path.join(dir, 'server'), { recursive: true });
    await fs.writeFile(path.join(dir, 'server', 'index.js'), "import http from 'node:http';\nconst port=process.env.PORT||3000;\nhttp.createServer((req,res)=>{res.end(req.url==='/health'?'ok':'hello apps')}).listen(port);\n");
  }
  if (type === 'python-backend') {
    await fs.mkdir(path.join(dir, 'server'), { recursive: true });
    await fs.writeFile(path.join(dir, 'server', 'app.py'), "from http.server import BaseHTTPRequestHandler, HTTPServer\nimport os\nclass Handler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200)\n        self.end_headers()\n        self.wfile.write(b'ok' if self.path == '/health' else b'hello apps')\nHTTPServer(('0.0.0.0', int(os.getenv('PORT', '3000'))), Handler).serve_forever()\n");
  }
  if (type === 'go-backend') {
    await fs.mkdir(path.join(dir, 'server'), { recursive: true });
    await fs.writeFile(path.join(dir, 'server', 'main.go'), "package main\nimport (\n  \"fmt\"\n  \"net/http\"\n  \"os\"\n)\nfunc main(){ port:=os.Getenv(\"PORT\"); if port==\"\" { port=\"3000\" }; http.HandleFunc(\"/\", func(w http.ResponseWriter,r *http.Request){ if r.URL.Path==\"/health\" { fmt.Fprint(w,\"ok\") } else { fmt.Fprint(w,\"hello apps\") } }); http.ListenAndServe(\":\"+port,nil) }\n");
  }
  if (type === 'java-backend') {
    await fs.mkdir(path.join(dir, 'server'), { recursive: true });
    await fs.writeFile(path.join(dir, 'server', 'Main.java'), "public class Main { public static void main(String[] args) throws Exception { com.sun.net.httpserver.HttpServer server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress(Integer.parseInt(System.getenv().getOrDefault(\"PORT\",\"3000\"))), 0); server.createContext(\"/\", exchange -> { byte[] body = (exchange.getRequestURI().getPath().equals(\"/health\") ? \"ok\" : \"hello apps\").getBytes(); exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close(); }); server.start(); } }\n");
  }
  if (type === 'docker-app') {
    await fs.writeFile(path.join(dir, 'Dockerfile'), "FROM nginx:alpine\nCOPY dist /usr/share/nginx/html\n");
  }
  console.log(`✓ 已创建 ${type} 应用：${dir}`);
}

function baseManifest(type, name) {
  const normalizedType = ['python-backend', 'go-backend', 'java-backend', 'docker-app'].includes(type) ? (type === 'docker-app' ? 'frontend' : 'backend') : type;
  const manifest = { name, title: name, type: normalizedType, version: '1.0.0', route: `/x/${name}` };
  if (type === 'frontend' || type === 'plugin' || type === 'docker-app') manifest.entry = 'dist';
  if (type === 'fullstack') manifest.frontend = { entry: 'dist' };
  if (type === 'fullstack' || type === 'backend') manifest.backend = { command: 'node server/index.js', port: 3000, health: '/health' };
  if (type === 'python-backend') { manifest.backend = { command: 'python3 server/app.py', port: 3000, health: '/health' }; manifest.runtime = { type: 'python' }; }
  if (type === 'go-backend') { manifest.backend = { command: 'go run server/main.go', port: 3000, health: '/health' }; manifest.runtime = { type: 'go' }; }
  if (type === 'java-backend') { manifest.backend = { command: 'javac server/Main.java && java -cp server Main', port: 3000, health: '/health' }; manifest.runtime = { type: 'java' }; }
  if (type === 'docker-app') { manifest.runtime = { type: 'docker' }; }
  if (type === 'backend' || type === 'fullstack') manifest.runtime = { type: 'node' };
  if (type === 'frontend' || type === 'plugin') manifest.runtime = { type: 'static' };
  return manifest;
}

function required(value, message) { if (!value) throw new Error(message); return value; }
function flagValue(argv, name) { const idx = argv.indexOf(name); return idx >= 0 ? argv[idx + 1] : undefined; }
function firstPositional(argv) {
  const flagsWithValues = new Set(['--name', '--output', '--out', '-o']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (flagsWithValues.has(arg)) { i++; continue; }
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
    '  上传方式: 管理台 /admin/install 选择该 zip，或使用 keli-cli publish <dir>'
  ].join('\n');
}
function demoHtml(title) { return `<!doctype html><meta charset="utf-8"><title>${title}</title><h1>${title}</h1><p>Generated by apps.</p>\n`; }
function help() { console.log(`用法: apps <command> [options]\n\n命令:\n  install <dir> [--name name]  安装新应用，默认禁止覆盖\n  deploy <dir> [--name name]   构建并更新应用，记录发布历史\n  package <dir> [-o file]      打包为可上传安装的 Keli Apps zip\n  publish-plugin <dir>         package 的兼容别名\n  deployments <name>           查看发布历史\n  rollback <name> [releaseId]  回滚到指定版本（默认上一个）\n  list                         列出应用\n  info <name>                  查看详情\n  enable <name>                启用应用\n  disable <name>               停用应用\n  remove <name>                卸载应用\n  create <type> <name>         创建脚手架\n\ncreate 支持类型:\n  frontend | fullstack | backend | plugin\n  python-backend | go-backend | java-backend | docker-app\n`); }
