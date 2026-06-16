const pages = [
  ['skill', '/admin/install', '安装 Skill', '安装插件开发规范到本机 Agent。'],
  ['flow', '/admin/install/flow', '流程逻辑', '理解 Skill、keli-cli、zip 和发布链路。'],
  ['prompt', '/admin/install/prompt', '生成提示词', '按应用类型复制给 Agent 的提示词。']
];

export function renderInstallWizardBody(navHtml, pathname = '/admin/install', instanceOrigin = 'http://127.0.0.1:4173') {
  const active = activePage(pathname);
  return `${navHtml}
${installPageStyle()}
<section class="install-hero-panel">
  <p class="install-kicker">KELI APPS RELEASE PATH</p>
  <h1>Keli Apps 安装向导</h1>
  <p>先把插件开发 Skill 安装到本机 Agent，再安装由本实例托管的 keli-cli tarball，用它校验、打包、登录并发布。</p>
</section>
<section class="install-console">
  ${installSidebar(active)}
  <div class="install-main">
    ${renderActivePanel(active, instanceOrigin)}
  </div>
</section>
${copyScript()}`;
}

function activePage(pathname) {
  const slug = pathname.split('/').filter(Boolean).at(-1);
  if (slug === 'flow' || slug === 'prompt') return slug;
  return 'skill';
}

function renderActivePanel(active, instanceOrigin) {
  if (active === 'flow') return flowPanel(instanceOrigin);
  if (active === 'prompt') return promptPanel();
  return skillPanel(instanceOrigin);
}

function installSidebar(active) {
  return `<aside class="install-rail">
    <div class="rail-brand"><span>KL</span><div><strong>应用安装</strong><small>Skill, CLI, 上传</small></div></div>
    <nav>
      ${pages.map(([key, href, label]) => `<a href="${href}"${key === active ? ' class="active"' : ''}>${label}</a>`).join('')}
    </nav>
    <p>推荐先全局安装 <code>keli-apps-plugin</code>，再让 Agent 生成 apps.yaml、相对路径和发布命令。</p>
  </aside>`;
}

function skillPanel(instanceOrigin) {
  return `<section class="install-panel" id="skill">
    <header><h2>安装和使用 Skill</h2><p>安装 Keli Apps 插件开发规范，让 AI 按平台规则生成应用结构、apps.yaml 和发布命令；CLI 由平台单独托管。</p></header>
    <div class="command-split">
      ${commandBlock('安装到 Codex 全局环境', '适合多个项目复用同一套 Keli Apps 开发规范。', `npx skills add ${instanceOrigin} --skill keli-apps-plugin -a codex -g -y`)}
      ${commandBlock('只在当前项目使用', '适合只在当前工作区开发 Keli Apps 插件。', `npx skills add ${instanceOrigin} --skill keli-apps-plugin -a codex -y`)}
    </div>
    ${commandBlock('安装 keli-cli', 'Skill 只提供规则，真正打包和发布需要 CLI。', `npm install -g ${instanceOrigin}/downloads/keli-cli/latest.tgz`, 'wide')}
    ${commandBlock('使用 Skill', '首次使用前确认应用名称和访问路径。', '使用 keli-apps-plugin 这个 skill，把本项目托管到 Keli Apps 平台上线', 'wide')}
  </section>`;
}

function flowPanel(instanceOrigin) {
  const steps = [
    ['1', 'Skill 生成项目', '生成源码、入口目录和 apps.yaml，并约束所有路径使用包内相对路径。'],
    ['2', 'keli-cli 校验清单', '读取 apps.yaml，检查 name、route、entry、backend、plugin.kind 等必填项。'],
    ['3', '打包为 zip', '把应用目录打成可上传插件包，zip 内必须能找到一个 apps.yaml。'],
    ['4', '发布到实例', 'keli-cli publish 上传到 /api/x/install-upload；首次安装禁止覆盖，更新需显式 --update。']
  ];
  return `<section class="install-panel" id="flow">
    <header><h2>Skill 和 keli-cli 流程逻辑</h2><p>Skill 负责生成符合平台规范的项目；keli-cli 负责校验、打包、登录并发布到当前 Keli Apps 实例。</p></header>
    <div class="flow-line">${steps.map(flowStep).join('')}</div>
    <div class="command-split compact">
      ${commandBlock('2FA 登录', '', `keli-cli login --server ${instanceOrigin} --code 123456`)}
      ${commandBlock('打包检查', '', 'keli-cli package ./my-app --output dist/my-app.zip')}
      ${commandBlock('首次发布', '', 'keli-cli publish ./my-app')}
      ${commandBlock('显式更新', '', 'keli-cli publish ./my-app --update')}
    </div>
  </section>`;
}

function promptPanel() {
  return `<section class="install-panel" id="prompt">
    <header><h2>应用类型和生成提示词</h2><p>按目标类型选择 apps.yaml 结构和运行方式。</p></header>
    <div class="type-grid">
      <button class="type-card active" type="button">纯前端 SPA<span>entry: dist</span></button>
      <button class="type-card" type="button">全栈应用<span>frontend + backend</span></button>
      <button class="type-card" type="button">纯后端 API<span>backend only</span></button>
      <button class="type-card" type="button">页面型插件<span>plugin.kind: page</span></button>
      <button class="type-card" type="button">API 型插件<span>/api/plugins/*</span></button>
      <button class="type-card" type="button">定时任务插件<span>schedule</span></button>
    </div>
    ${commandBlock('复制给 Agent 的提示词', '', generatorPrompt(), 'wide prompt')}
  </section>`;
}

function commandBlock(title, desc, code, variant = '') {
  return `<div class="install-command ${variant}"><div><h3>${title}</h3>${desc ? `<p>${desc}</p>` : ''}</div><div class="code-copy"><code>${code}</code><button type="button" onclick="copyCode(this)">复制</button></div></div>`;
}

function flowStep([number, title, desc]) {
  return `<article><span>${number}</span><h3>${title}</h3><p>${desc}</p></article>`;
}

function generatorPrompt() {
  return `请帮我生成一个符合 Keli Apps 平台规范的前端应用。

apps.yaml 必须放在应用目录根目录，所有路径只能使用包内相对路径。
route 统一使用 /x/<name>，不要写本机绝对路径。
前端产物目录使用 dist；如有后端，backend.command 也必须是相对命令。
生成后补充可执行的打包或发布命令。`;
}

function copyScript() {
  return `<script>
async function copyCode(button){const code=button.closest('.code-copy')?.querySelector('code')?.textContent||'';const label=button.textContent;try{await navigator.clipboard.writeText(code);button.textContent='已复制';setTimeout(()=>button.textContent=label,1400);}catch{button.textContent='复制失败';setTimeout(()=>button.textContent=label,1400);}}
</script>`;
}

function installPageStyle() {
  return `<style>
.install-hero-panel{margin:18px 0 22px;padding:28px 0 20px;border-bottom:1px solid #d9e2ee}.install-hero-panel h1{margin:0;font-size:clamp(30px,4vw,48px);letter-spacing:-.04em}.install-hero-panel p{max-width:880px;color:#5b6676;font-size:17px;line-height:1.7}.install-kicker{margin:0 0 10px;color:#0f766e;font:800 12px/1.2 ui-sans-serif,system-ui,sans-serif;letter-spacing:.18em}
.install-console{display:grid;grid-template-columns:280px minmax(0,1fr);gap:22px}.install-rail{position:sticky;top:18px;align-self:start;border-right:1px solid #d9e2ee;padding:0 22px 22px 0}.rail-brand{display:flex;gap:12px;align-items:center;margin-bottom:18px}.rail-brand span{display:grid;place-items:center;width:50px;height:50px;border-radius:50%;background:#1f2933;color:#fff;font-weight:900}.rail-brand strong{display:block}.rail-brand small{display:block;color:#6b7280;margin-top:3px}.install-rail nav{display:grid;gap:8px;margin:16px 0}.install-rail nav a{border-radius:8px;background:#fff;border:1px solid #d9e2ee;box-shadow:none}.install-rail nav a:hover{box-shadow:none;transform:none;border-color:#38bdf8;background:#eef9ff}.install-rail p{color:#5b6676;line-height:1.65}
.install-rail nav a.active{border-color:#0284c7;background:#e0f2fe;color:#0f3f73}
.install-main{display:grid;gap:16px}.install-panel{border:1px solid #d9e2ee;border-radius:8px;background:#ffffffc7;box-shadow:0 12px 38px #0f172a0d;padding:0;overflow:hidden}.install-panel>header{padding:20px 22px;border-bottom:1px solid #d9e2ee;background:#f8fafc}.install-panel h2,.install-panel h3{margin:0}.install-panel header p,.install-command p,.flow-line p{margin:7px 0 0;color:#5b6676;line-height:1.6}
.overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:18px 22px}.overview-card{display:block;border:1px solid #d9e2ee;border-radius:8px;background:#fff;padding:18px;min-height:138px}.overview-card:hover{border-color:#38bdf8;background:#eef9ff;box-shadow:none;transform:none}.overview-card span{display:block;color:#0f3f73;font-weight:800;font-size:20px}.overview-card p{margin:10px 0 0;color:#5b6676;line-height:1.65}
.command-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:18px 22px}.command-split.compact{grid-template-columns:repeat(4,minmax(0,1fr));padding-top:0}.install-command{display:grid;gap:12px;min-width:0;border:1px solid #d9e2ee;border-radius:8px;background:#fff;padding:14px}.install-command>div{min-width:0}.install-command.wide{grid-column:1/-1;margin:0 22px 20px}.code-copy{position:relative;min-width:0;max-width:100%}.code-copy code{display:block;width:100%;max-width:100%;overflow-wrap:anywhere;word-break:break-word;border-radius:6px;background:#20262e;color:#edf7ff;padding:12px 76px 12px 13px;font:13px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}.code-copy button{position:absolute;z-index:1;right:8px;top:8px;margin:0;border-radius:6px;background:#f8fafc;color:#111827;border:1px solid #cbd5e1;box-shadow:none}
.flow-line{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding:18px 22px}.flow-line article{position:relative;margin:0;min-height:150px;border:1px solid #d9e2ee;border-radius:8px;background:#fff;box-shadow:none}.flow-line article:not(:last-child):after{content:"";position:absolute;right:-14px;top:50%;width:14px;height:2px;background:#38bdf8}.flow-line span{display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:#dcfce7;color:#047857;font-weight:800;margin-bottom:12px}
.type-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:18px 22px}.type-card{display:grid;justify-items:start;gap:5px;margin:0;border-radius:8px;border:1px solid #d9e2ee;background:#fff;color:#172033;box-shadow:none;text-align:left}.type-card.active{border-color:#0284c7;background:#e0f2fe}.type-card span{color:#64748b;font-size:12px}
@media(max-width:960px){.install-console{grid-template-columns:1fr}.install-rail{position:static;border-right:0;border-bottom:1px solid #d9e2ee;padding-right:0}.command-split,.command-split.compact,.flow-line,.type-grid{grid-template-columns:1fr}.flow-line article:after{display:none}.install-command.wide{margin:0 18px 18px}}
</style>`;
}
