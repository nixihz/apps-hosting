import { parseCookies } from './cookies.js';

const TRANSLATIONS = {
  zh: {
    // Common / Nav
    home: '首页',
    admin: '管理台',
    install_wizard: '安装向导',
    deploy_wizard: '部署向导',
    security: '安全',
    admin_login: '管理员登录',
    login: '登录',
    logout: '退出',
    switch_account: '切换账号',
    language: '语言',
    lang_zh: '🇨🇳 中文',
    lang_en: '🇬🇧 English',

    // Brand
    brand_name: 'Keli Apps',
    brand_subtitle: 'Keli Apps Cloud',

    // Home
    home_title: 'Keli Apps',
    no_accessible_apps: '暂无可访问应用',
    install_hint: '请使用 apps install 安装，或联系管理员分配权限。',
    accessible_apps: '可访问应用',
    running_tasks: '运行任务',
    plugin_apps: '插件应用',
    current_role: '当前角色',
    enabled_label: '已启用',
    disabled_label: '已停用',
    plugin_label: '插件',
    open_app: '打开',
    app_gallery: '应用空间',
    admin_summary: '关键运行指标',

    home_eyebrow: (count) => `动态运行时 · ${count} 个应用`,
    home_motion_lead: '借助 AI，我的想法终于一个个实现了，还在持续产出，欢迎关注！',
    about_nav: '关于',
    about_page_title: '关于 Keli Apps',
    purpose_nav: '意图',
    values_nav: '价值观',
    principles_nav: '运营原则',
    about_title: 'Keli Apps 是一个正在成形的公共利益型软件组织。',
    about_body: '我计划把它建设成一个以公共利益为边界的软件组织：用软件、开放协议和 AI 时代的新工作方式，帮助真实的人把想法变成可靠、可分享、能长期生长的应用。',
    purpose_title: '创作软件与开放协议',
    purpose_body: '我们相信手艺，也相信开放。软件正在塑造信息被理解的方式，并越来越多地影响现实被感知的方式。这样的力量必须带着责任被构建。',
    purpose_items: [
      { title: '增强人的主体性', body: 'AI 可能是人类见过最强大的工具之一，但挥动工具的人应该是人。我们使用 AI 扩展判断、创造和行动，而不是把判断交出去。' },
      { title: '连接分歧与无知', body: '人类是一个共同体。我们选择从共同处出发，持续靠近事实，认真分享事实，让理解成为协作的基础。' },
      { title: '培育持久的快乐与理解', body: '我们希望产品带来的不是短暂刺激，而是长期可用的快乐、更清晰的表达，以及人与人之间更多的相互理解。' }
    ],
    values_title: '我们的价值观',
    values_items: [
      { title: '保持同理心', body: '先理解具体的人、具体的处境和真实限制，再谈方案、效率和规模。' },
      { title: '专注卓越', body: '不把“能跑”当终点。我们在细节、可靠性、表达和体验上持续提高标准。' },
      { title: '我们而非我', body: '重要成果来自协作。个人锋芒应该服务整体，而不是消耗整体。' },
      { title: '家庭第一', body: '工作服务生活，不吞噬生活。可持续的创造力需要被认真保护。' },
      { title: '原创好奇心', body: '不满足于搬运答案。我们追问第一性问题，尊重独立观察和原创表达。' },
      { title: '透明脆弱', body: '清楚说出事实、风险和不知道的部分，让信任建立在真实之上。' },
      { title: '积极意图与结果', body: '相信善意，也检验结果。好的动机需要被实际影响证明。' }
    ],
    principles_title: '运营原则',
    principles_items: [
      { title: '我们是行动者', body: '发现问题就向前一步。少一点旁观，多一点交付。' },
      { title: '创造美', body: '美不是装饰，是对使用者注意力、情绪和尊严的尊重。' },
      { title: '保持魅力', body: '产品可以严肃，也应该有吸引力。好工具值得被反复打开。' },
      { title: '深思但坚持不懈', body: '先想清楚关键判断，再持续推进，不被短期困难轻易改写方向。' },
      { title: '技术是手段，不是目的', body: '选择技术是为了服务人、产品和长期维护，而不是为了炫耀复杂度。' },
      { title: '雄心勃勃的目标，可信的步骤', body: '愿景可以很远，但每一步都要能被验证、复盘和继续。' },
      { title: '彻底负责，慷慨认可', body: '问题先从自己手里接住，功劳要及时、具体地给到别人。' }
    ],
    installed_apps: 'Apps',

    // Admin
    admin_panel: 'Keli Apps 管理界面',
    ops_panel: '管理界面',
    user_label: '用户',
    admin_console_lead: '拖拽应用行可调整首页和列表展示顺序。',
    app: '应用',
    sort: '排序',
    save_order: '保存排序',
    type: '类型',
    status: '运行状态',
    tenant: '租户',
    action: '操作',
    detail: '详情',
    open: '打开',
    logs: '日志',
    access_logs: '访问',
    metrics: '指标',
    deployments: '发布',
    config: '配置',
    disable: '停用',
    enable: '启用',
    start: '启动',
    stop: '停止',
    delete: '删除',
    confirm_delete_app: (name) => `确认删除应用 ${name}？此操作会从管理列表移除该应用。`,
    action_completed: '操作已完成',
    order_saved: '排序已保存',
    request_failed: '请求失败',
    no_permission_admin: '无权访问管理台',
    admin_login_required: '请使用管理员账号登录，或使用具备 platform:admin 权限的 API Token 调用管理 API。',

    // App detail
    app_detail_title: '应用详情',
    basic_info: '基础信息',
    health_and_metrics: '健康与指标',
    config_editor: '配置编辑器',
    save_config_and_restart: '保存配置并重启',
    deployment_history: '发布历史与回滚',
    rollback: '回滚',
    no_deployments: '暂无发布记录',
    log_viewer: '日志查看器',
    no_permission_app: '无权访问应用管理',
    no_permission_app_detail: '当前账号没有管理权限。',

    // Install wizard
    install_wizard_title: '应用安装向导',
    step_overview: '1. 了解配置',
    step_fields: '2. 字段说明',
    step_packaging: '3. 打包要求',
    step_prompts: '4. AI 提示词',
    what_is_yaml: 'apps.yaml 是什么？',
    yaml_desc: '每个应用必须包含一个 apps.yaml 清单文件，用于描述应用类型、路由、入口、后端命令、环境变量与权限等元信息。平台根据该文件完成安装、路由挂载、后端启动和权限控制。',
    app_type_overview: '应用类型总览',
    install_method: '安装方式',
    cli_install_desc: 'CLI 安装：使用 apps install <dir> 命令行直接安装。',
    common_fields: '通用字段（所有类型）',
    field: '字段',
    required: '必填',
    description: '说明',
    frontend_fields: 'frontend 专属字段',
    full_example: '完整示例',
    fullstack_fields: 'fullstack 专属字段',
    backend_fields: 'backend 专属字段',
    plugin_fields: 'plugin 专属字段',
    packaging_requirements: '打包要求',
    packaging_desc: '上传的 .zip 包需满足以下目录结构与约束，否则安装会失败。',
    directory_structure: '目录结构',
    key_constraints: '关键约束',
    entry_backend_table: 'entry 与 backend.command 对照',
    ai_prompts: 'AI 提示词（复制即用）',
    ai_prompts_desc: '将下方提示词粘贴到 AI 开发工具，即可自动生成符合规范的 apps.yaml 与目录结构。',
    copy: '复制',
    copied: '已复制',
    copy_failed: '复制失败',
    no_permission_install: '无权访问应用安装向导',

    yes: '是',
    no: '否',
    type_frontend: '纯静态前端应用，必须提供 entry 目录。',
    type_fullstack: '前端静态资源 + 后端服务，既提供 entry 也提供 backend 配置。',
    type_backend: '仅提供后端 HTTP API，通过 /x/<name>/api 代理访问。',
    type_plugin: '平台插件，可作为页面、API、Webhook 或定时任务扩展平台能力。',
    desc_name: '应用唯一名称，只能使用小写字母、数字和短横线。',
    desc_title: '应用默认展示名称；如需跟随主站语言切换，可补充 title_i18n.zh / title_i18n.en。',
    desc_type: '应用类型：frontend、fullstack、backend 或 plugin。',
    desc_version: '应用版本号。',
    desc_route: '访问路由，必须保持 /x/<name> 格式。',
    desc_description: '应用默认说明，显示在应用卡片中；如需跟随主站语言切换，可补充 description_i18n.zh / description_i18n.en。',
    desc_logo: '应用卡片自定义 Logo，填写 zip 包内相对路径，例如 assets/logo.png；也可不配置，平台会自动尝试 assets/、public/、static/、icons/ 目录下的 logo.svg/png/jpg/webp/gif。',
    desc_author: '作者或维护者信息。',
    desc_permissions: '访问该应用需要的权限列表。',
    desc_groups: '允许访问的用户组列表。',
    desc_tenants: '允许访问的租户列表。',
    desc_categories: '应用分类标签。',
    desc_versionNotes: '版本说明。',
    desc_entry: '静态资源入口目录，通常为 dist。',
    desc_entry_fs: '前端构建产物目录，通常为 dist。',
    desc_backend_command: '后端启动命令。',
    desc_backend_port: '后端监听端口。',
    desc_healthPath: '健康检查路径，默认可使用 /health。',
    desc_env: '运行时环境变量。',
    desc_backend_command2: '后端 HTTP 服务启动命令。',
    desc_backend_port2: '后端 HTTP 服务监听端口。',
    desc_healthPath2: '后端健康检查路径。',
    desc_env2: '后端运行时环境变量。',
    desc_plugin_kind: '插件类型：page、api、cron 或 webhook。',
    desc_plugin_category: '插件分类。',
    page_required: 'page 必填',
    desc_entry_page: 'page 插件的静态资源目录。',
    api_cron_webhook_required: 'api/cron/webhook 必填',
    desc_backend_command3: 'api、cron 或 webhook 插件的后端命令。',
    api_webhook_required: 'api/webhook 必填',
    desc_backend_port3: 'api 或 webhook 插件的后端端口。',
    cron_required: 'cron 必填',
    desc_plugin_interval: 'cron 插件执行间隔，单位秒。',
    desc_webhookSecret: 'Webhook 签名密钥，可选。',
    desc_env3: '插件运行时环境变量。',
    page_example: 'page 示例',
    api_example: 'api 示例',
    cron_example: 'cron 示例',
    webhook_example: 'webhook 示例',
    ex_team_nav_title: '团队导航页',
    ex_team_nav_desc: '团队常用链接入口。',
    ex_task_board_title: '任务看板',
    ex_task_board_desc: '团队任务管理工具。',
    ex_report_api_title: '报表 API',
    ex_report_api_desc: '提供报表查询接口。',
    ex_status_page_title: '状态页',
    ex_translate_api_title: '翻译 API',
    ex_daily_report_title: '每日报告',
    ex_deploy_hook_title: '部署 Webhook',
    constraint_root: 'zip 根目录必须包含 apps.yaml，或包含一个带 apps.yaml 的应用目录。',
    constraint_yaml: 'apps.yaml 必须符合平台字段规范。',
    constraint_symlink: '不允许包含符号链接。',
    constraint_route: 'route 必须保持 /x/<name>，不要添加反向代理前缀。',
    constraint_command: 'backend.command 必须能在应用目录内直接启动。',
    constraint_env: '敏感配置建议使用环境变量或平台配置中心注入。',
    constraint_logo: 'Logo 只能使用应用包内相对路径；支持 svg/png/jpg/jpeg/webp/gif。manifest 中可写 logo: assets/logo.png 或 icon: assets/logo.svg，不写时会自动扫描常见目录。',
    required_dist: '需要 dist',
    not_needed: '不需要',
    required_start: '需要启动命令',
    required_port: '需要端口',
    required_interval: '需要 interval',
    required_port_secret: '需要端口；可选 webhookSecret',
    structure_logo_comment: '可选：应用卡片 Logo，也可在 manifest.logo 中指定其他相对路径',
    prompt_frontend_text: `请帮我生成一个适用于 Keli Apps 平台的纯前端应用。
要求：
1. 使用 React 或 Vue 构建，输出目录为 dist。
2. 生成 apps.yaml，type 为 frontend，route 为 /x/<应用名>。
3. 包含 name、title、title_i18n、version、description、description_i18n、entry 字段；title_i18n 和 description_i18n 至少提供 zh/en；如需自定义卡片 Logo，在包内放置 assets/logo.png，并在 apps.yaml 写 logo: assets/logo.png。
4. 给出打包为 zip 的目录结构说明。`,
    prompt_fullstack_text: `请帮我生成一个适用于 Keli Apps 平台的全栈应用。
要求：
1. 前端使用 React/Vue，构建产物放在 dist；后端使用 Node/Express 或 Python/FastAPI。
2. 生成 apps.yaml，type 为 fullstack，route 为 /x/<应用名>。
3. 必须包含 title_i18n.zh / title_i18n.en、description_i18n.zh / description_i18n.en、entry、backend.command、backend.port，以及可选的 backend.healthPath 和 env。
4. 如需自定义卡片 Logo，在包内放置 assets/logo.png，并在 apps.yaml 写 logo: assets/logo.png。
5. 后端需监听 127.0.0.1 上的指定端口，平台会通过该端口代理 /api 请求。
6. 给出打包 zip 的目录结构说明。`,
    prompt_backend_text: `请帮我生成一个适用于 Keli Apps 平台的后端服务应用。
要求：
1. 使用 Node/Express、Python/FastAPI 或 Go 编写纯 HTTP API。
2. 生成 apps.yaml，type 为 backend，route 为 /x/<应用名>。
3. 必须包含 title_i18n.zh / title_i18n.en、description_i18n.zh / description_i18n.en、backend.command 和 backend.port，可选 healthPath 与 env。
4. 提供 /health 健康检查端点。
5. 给出打包 zip 的目录结构说明。`,
    prompt_plugin_text: `请帮我生成一个适用于 Keli Apps 平台的插件应用。
要求：
1. 插件子类型从 page / api / cron / webhook 中选择一种。
2. 生成 apps.yaml，type 为 plugin，route 为 /x/<应用名>，提供 title_i18n.zh / title_i18n.en 与 description_i18n.zh / description_i18n.en，并正确设置 plugin.kind 与 plugin.category。
3. page 类型需配置 entry；api / webhook 需配置 backend.command 与 backend.port；cron 需配置 backend.command 与 plugin.interval。
4. webhook 类型可选配置 webhookSecret。
5. 给出打包 zip 的目录结构说明。`,


    // Deploy wizard
    deploy_wizard_title: '应用部署向导',
    sourcePath: 'sourcePath',
    deploy: '部署',
    no_permission_deploy: '无权访问应用部署向导',

    // Security
    security_title: '安全与权限',
    security_subtitle: 'RBAC、用户组、API token、OIDC 入口与审计基线。',
    users: '用户',
    groups: '用户组',
    roles: '角色',
    api_tokens: 'API Tokens',
    quick_create_token: '快速创建 Token',
    name: '名称',
    role: '角色',
    issue: '签发',
    no_permission_security: '无权访问安全管理',
    no_permission_security_detail: '当前账号没有 security:manage 权限。',

    // Login
    login_2fa: '2FA 登录',
    session_2fa: '2FA 会话',
    login_desc: '后台统一使用 2FA 登录，不提供账号密码表单。API 自动化仍可使用已签发的 API Token。',
    current_logged_in: '当前已登录',
    session_label: '会话',
    role_label: '角色',
    none: '无',
    logout_btn: '退出登录',
    code_label: '2FA 动态验证码',
    code_placeholder: '6 位验证码',
    reverify: '重新验证',
    login_2fa_btn: '使用 2FA 登录',
    login_hint: '当前不启用账号密码登录。请输入运维侧配置的 TOTP/2FA 动态验证码。',
    invalid_2fa: '2FA 验证码无效或已过期',
    admin_login_title: '管理员登录',
    admin_login_desc: '此入口仅供管理员使用。登录成功后将跳转至管理台。',
    admin_2fa_login: '管理员 2FA 登录',
    admin_login_hint: '管理员入口：请输入运维侧配置的 TOTP/2FA 动态验证码。',

    // API errors
    unauthorized: '未授权',
    api_not_found: 'API 不存在',
    app_not_found: '应用不存在',
    no_access: '无权访问该应用',
    no_frontend_entry: '该应用没有前端入口',
    webhook_not_found: 'Webhook 不存在',
    webhook_verify_failed: 'Webhook 签名校验失败',
    backend_port_missing: '应用未配置 backend.port',
    backend_proxy_failed: '后端代理失败',
    deploy_needs_sourcePath: 'deploy 需要 sourcePath',
    zip_only: '仅支持上传 .zip 插件包',
    route_must_apps: 'route 必须保持 /x/<name>，不要添加 /yuma 前缀',
    missing_yaml: '插件包缺少 apps.yaml。请确认 zip 内包含应用目录或应用目录内容，且不是只压缩了父级空目录。',
    multiple_yaml: '插件包包含多个 apps.yaml，无法判断安装哪个应用',
    symlink_rejected: '插件包包含符号链接，已拒绝',
    multipart_required: '请求必须是 multipart/form-data',
    missing_zip_file: '缺少插件 zip 文件',
    oidc_disabled: 'OIDC 已停用，请使用 2FA 登录',
    security_api_not_found: 'Security API 不存在',
    api_plugin_not_found: 'API 插件不存在',
    port_in_use: (port) => `端口 ${port} 已被占用。请先停止旧的 apps server，或换一个 APPS_PORT。`,
    data_dir: (dir) => `  当前数据目录：${dir}`,
    server_running: (port) => `Keli Apps running: http://127.0.0.1:${port}`,
    stopped: 'stopped',
  },
  en: {
    // Common / Nav
    home: 'Home',
    admin: 'Admin',
    install_wizard: 'Install',
    deploy_wizard: 'Deploy',
    security: 'Security',
    admin_login: 'Admin Login',
    login: 'Login',
    logout: 'Logout',
    switch_account: 'Switch Account',
    language: 'Language',
    lang_zh: '🇨🇳 中文',
    lang_en: '🇬🇧 English',

    // Brand
    brand_name: 'Keli Apps',
    brand_subtitle: 'Refined App Cloud',

    // Home
    home_title: 'Keli Apps',
    no_accessible_apps: 'No accessible apps',
    install_hint: 'Use apps install to add apps, or contact the admin for permissions.',
    accessible_apps: 'Accessible Apps',
    running_tasks: 'Running Tasks',
    plugin_apps: 'Plugins',
    current_role: 'Current Role',
    enabled_label: 'Enabled',
    disabled_label: 'Disabled',
    plugin_label: 'Plugin',
    open_app: 'Open App',
    app_gallery: 'App Space',
    admin_summary: 'Operational Snapshot',

    home_eyebrow: (count) => `Kinetic Runtime · ${count} apps`,
    home_motion_lead: 'With AI, my ideas are finally becoming real one by one. More is on the way — stay tuned!',
    about_nav: 'About',
    about_page_title: 'About Keli Apps',
    purpose_nav: 'Purpose',
    values_nav: 'Values',
    principles_nav: 'Operating Principles',
    about_title: 'Keli Apps is a public-benefit software organization in formation.',
    about_body: 'I plan to build it as a software organization bounded by public benefit: using software, open protocols, and new AI-era ways of working to help real people turn ideas into reliable, shareable applications that can keep growing.',
    purpose_title: 'Craft software and open protocols',
    purpose_body: 'We believe in craft, and we believe in open. Software shapes how information is understood and increasingly how reality is perceived. That power has to be built with responsibility.',
    purpose_items: [
      { title: 'Strengthen human agency', body: 'AI may be one of the most powerful tools humanity has ever seen, but the person should wield the tool. We use AI to extend judgment, creation, and action, not to surrender judgment.' },
      { title: 'Bridge division and ignorance', body: 'Humanity is a community. We start from what we share, keep moving toward facts, and share truth carefully so understanding can become the basis for collaboration.' },
      { title: 'Cultivate lasting joy and understanding', body: 'Our products should offer more than short-lived stimulation: durable usefulness, clearer expression, and greater mutual understanding between people.' }
    ],
    values_title: 'Our Values',
    values_items: [
      { title: 'Stay empathetic', body: 'Understand real people, real contexts, and real constraints before talking about solutions, efficiency, or scale.' },
      { title: 'Focus on excellence', body: 'Working is not the finish line. We keep raising the bar on detail, reliability, expression, and experience.' },
      { title: 'We over me', body: 'Important work comes from collaboration. Individual brilliance should serve the whole, not drain it.' },
      { title: 'Family first', body: 'Work serves life; it should not consume life. Sustainable creativity has to be protected deliberately.' },
      { title: 'Original curiosity', body: 'Do not settle for copied answers. Ask first-principles questions and respect independent observation and original expression.' },
      { title: 'Transparent vulnerability', body: 'Name the facts, risks, and unknowns clearly so trust can be built on reality.' },
      { title: 'Positive intent and outcomes', body: 'Assume goodwill, then inspect impact. Good motives have to be proven through actual results.' }
    ],
    principles_title: 'Operating Principles',
    principles_items: [
      { title: 'We are actors', body: 'When we see a problem, we step toward it. Less spectating, more shipping.' },
      { title: 'Create beauty', body: 'Beauty is not decoration. It respects the user’s attention, emotion, and dignity.' },
      { title: 'Keep charm', body: 'Products can be serious and still be magnetic. Good tools should be worth opening again.' },
      { title: 'Think deeply and persist', body: 'Clarify the key judgment first, then keep moving without letting short-term difficulty rewrite the direction.' },
      { title: 'Technology is a means, not the end', body: 'Choose technology to serve people, products, and long-term maintenance, not to display complexity.' },
      { title: 'Ambitious goals, credible steps', body: 'The vision can be far away, but every step should be testable, reviewable, and able to continue.' },
      { title: 'Own fully, credit generously', body: 'Take responsibility for problems first, and give specific, timely recognition to others.' }
    ],
    installed_apps: 'Apps',

    // Admin
    admin_panel: 'Keli Apps Console',
    ops_panel: 'Console',
    user_label: 'User',
    admin_console_lead: 'Drag app rows to change the display order on the home page and app lists.',
    app: 'App',
    sort: 'Sort',
    save_order: 'Save Order',
    type: 'Type',
    status: 'Status',
    tenant: 'Tenant',
    action: 'Action',
    detail: 'Detail',
    open: 'Open',
    logs: 'Logs',
    access_logs: 'Access',
    metrics: 'Metrics',
    deployments: 'Deployments',
    config: 'Config',
    disable: 'Disable',
    enable: 'Enable',
    start: 'Start',
    stop: 'Stop',
    delete: 'Delete',
    confirm_delete_app: (name) => `Delete app ${name}? This removes it from the admin list.`,
    action_completed: 'Action completed',
    order_saved: 'Order saved',
    request_failed: 'Request failed',
    no_permission_admin: 'Access Denied',
    admin_login_required: 'Please log in with an admin account, or use an API Token with platform:admin permission.',

    // App detail
    app_detail_title: 'App Detail',
    basic_info: 'Basic Info',
    health_and_metrics: 'Health & Metrics',
    config_editor: 'Config Editor',
    save_config_and_restart: 'Save Config & Restart',
    deployment_history: 'Deployments & Rollback',
    rollback: 'Rollback',
    no_deployments: 'No deployment records',
    log_viewer: 'Log Viewer',
    no_permission_app: 'Access Denied',
    no_permission_app_detail: 'Your account does not have admin permission.',

    // Install wizard
    install_wizard_title: 'App Install Wizard',
    step_overview: '1. Overview',
    step_fields: '2. Fields',
    step_packaging: '3. Packaging',
    step_prompts: '4. AI Prompts',
    what_is_yaml: 'What is apps.yaml?',
    yaml_desc: 'Every app must include an apps.yaml manifest describing type, route, entry, backend command, env vars, and permissions. The platform uses it for installation, routing, process management, and access control.',
    app_type_overview: 'App Types',
    install_method: 'Installation Methods',
    cli_install_desc: 'CLI Install: use apps install <dir> from the command line.',
    common_fields: 'Common Fields (All Types)',
    field: 'Field',
    required: 'Required',
    description: 'Description',
    frontend_fields: 'frontend Fields',
    full_example: 'Full Example',
    fullstack_fields: 'fullstack Fields',
    backend_fields: 'backend Fields',
    plugin_fields: 'plugin Fields',
    packaging_requirements: 'Packaging Requirements',
    packaging_desc: 'The uploaded .zip must follow the directory structure and constraints below, otherwise installation will fail.',
    directory_structure: 'Directory Structure',
    key_constraints: 'Key Constraints',
    entry_backend_table: 'entry vs backend.command',
    ai_prompts: 'AI Prompts (Copy & Use)',
    ai_prompts_desc: 'Paste the prompts below into your AI tool to auto-generate a compliant apps.yaml and directory structure.',
    copy: 'Copy',
    copied: 'Copied',
    copy_failed: 'Copy Failed',
    no_permission_install: 'Access Denied',

    yes: 'Yes',
    no: 'No',
    type_frontend: 'Static frontend app. An entry directory is required.',
    type_fullstack: 'Static frontend plus backend service. Requires both entry and backend configuration.',
    type_backend: 'Backend HTTP API only, proxied through /x/<name>/api.',
    type_plugin: 'Platform plugin that extends pages, APIs, webhooks, or scheduled jobs.',
    desc_name: 'Unique app name. Use lowercase letters, numbers, and hyphens only.',
    desc_title: 'Default display name of the app; add title_i18n.zh / title_i18n.en to follow the site language switcher.',
    desc_type: 'App type: frontend, fullstack, backend, or plugin.',
    desc_version: 'App version.',
    desc_route: 'Access route. Must use the /x/<name> format.',
    desc_description: 'Default app description shown on the app card; add description_i18n.zh / description_i18n.en to follow the site language switcher.',
    desc_logo: 'Custom logo for the app card. Use a relative path inside the zip package, such as assets/logo.png. If omitted, the platform scans common assets/, public/, static/, and icons/ directories for logo.svg/png/jpg/webp/gif.',
    desc_author: 'Author or maintainer information.',
    desc_permissions: 'Permissions required to access the app.',
    desc_groups: 'User groups allowed to access the app.',
    desc_tenants: 'Tenants allowed to access the app.',
    desc_categories: 'App category tags.',
    desc_versionNotes: 'Version notes.',
    desc_entry: 'Static asset entry directory, usually dist.',
    desc_entry_fs: 'Frontend build output directory, usually dist.',
    desc_backend_command: 'Backend start command.',
    desc_backend_port: 'Backend listening port.',
    desc_healthPath: 'Health check path, usually /health.',
    desc_env: 'Runtime environment variables.',
    desc_backend_command2: 'Backend HTTP service start command.',
    desc_backend_port2: 'Backend HTTP service listening port.',
    desc_healthPath2: 'Backend health check path.',
    desc_env2: 'Backend runtime environment variables.',
    desc_plugin_kind: 'Plugin kind: page, api, cron, or webhook.',
    desc_plugin_category: 'Plugin category.',
    page_required: 'Required for page',
    desc_entry_page: 'Static asset directory for page plugins.',
    api_cron_webhook_required: 'Required for api/cron/webhook',
    desc_backend_command3: 'Backend command for api, cron, or webhook plugins.',
    api_webhook_required: 'Required for api/webhook',
    desc_backend_port3: 'Backend port for api or webhook plugins.',
    cron_required: 'Required for cron',
    desc_plugin_interval: 'Execution interval for cron plugins, in seconds.',
    desc_webhookSecret: 'Optional webhook signing secret.',
    desc_env3: 'Plugin runtime environment variables.',
    page_example: 'page Example',
    api_example: 'api Example',
    cron_example: 'cron Example',
    webhook_example: 'webhook Example',
    ex_team_nav_title: 'Team Navigation',
    ex_team_nav_desc: 'Common team links.',
    ex_task_board_title: 'Task Board',
    ex_task_board_desc: 'Team task management tool.',
    ex_report_api_title: 'Report API',
    ex_report_api_desc: 'Provides report query APIs.',
    ex_status_page_title: 'Status Page',
    ex_translate_api_title: 'Translate API',
    ex_daily_report_title: 'Daily Report',
    ex_deploy_hook_title: 'Deploy Webhook',
    constraint_root: 'The zip root must contain apps.yaml, or one app directory that contains apps.yaml.',
    constraint_yaml: 'apps.yaml must follow the platform field specification.',
    constraint_symlink: 'Symbolic links are not allowed.',
    constraint_route: 'route must stay in /x/<name>; do not add reverse-proxy prefixes.',
    constraint_command: 'backend.command must start directly from the app directory.',
    constraint_env: 'Inject sensitive configuration through environment variables or the platform config center.',
    constraint_logo: 'Logo must use a relative path inside the app package. Supported formats: svg/png/jpg/jpeg/webp/gif. Use logo: assets/logo.png or icon: assets/logo.svg in the manifest, or omit it to let the platform scan common directories.',
    required_dist: 'dist required',
    not_needed: 'Not needed',
    required_start: 'Start command required',
    required_port: 'Port required',
    required_interval: 'interval required',
    required_port_secret: 'Port required; webhookSecret optional',
    structure_logo_comment: 'Optional: app card logo. You can also set another relative path in manifest.logo',
    prompt_frontend_text: `Generate a frontend app for the Keli Apps platform.
Requirements:
1. Use React or Vue and output the build to dist.
2. Generate apps.yaml with type frontend and route /x/<app-name>.
3. Include name, title, title_i18n, version, description, description_i18n, and entry. Provide at least zh/en in title_i18n and description_i18n. If a custom card logo is needed, place assets/logo.png in the package and set logo: assets/logo.png in apps.yaml.
4. Provide the zip packaging directory structure.`,
    prompt_fullstack_text: `Generate a fullstack app for the Keli Apps platform.
Requirements:
1. Use React/Vue for the frontend with build output in dist; use Node/Express or Python/FastAPI for the backend.
2. Generate apps.yaml with type fullstack and route /x/<app-name>.
3. Include title_i18n.zh / title_i18n.en, description_i18n.zh / description_i18n.en, entry, backend.command, backend.port, and optional backend.healthPath and env.
4. If a custom card logo is needed, place assets/logo.png in the package and set logo: assets/logo.png in apps.yaml.
5. The backend must listen on the specified port at 127.0.0.1; the platform proxies /api requests to it.
6. Provide the zip packaging directory structure.`,
    prompt_backend_text: `Generate a backend service app for the Keli Apps platform.
Requirements:
1. Build a pure HTTP API with Node/Express, Python/FastAPI, or Go.
2. Generate apps.yaml with type backend and route /x/<app-name>.
3. Include title_i18n.zh / title_i18n.en, description_i18n.zh / description_i18n.en, backend.command and backend.port, with optional healthPath and env.
4. Provide a /health endpoint.
5. Provide the zip packaging directory structure.`,
    prompt_plugin_text: `Generate a plugin app for the Keli Apps platform.
Requirements:
1. Choose one plugin subtype from page / api / cron / webhook.
2. Generate apps.yaml with type plugin and route /x/<app-name>, provide title_i18n.zh / title_i18n.en and description_i18n.zh / description_i18n.en, and set plugin.kind and plugin.category correctly.
3. page requires entry; api / webhook require backend.command and backend.port; cron requires backend.command and plugin.interval.
4. webhook can optionally configure webhookSecret.
5. Provide the zip packaging directory structure.`,


    // Deploy wizard
    deploy_wizard_title: 'App Deploy Wizard',
    sourcePath: 'sourcePath',
    deploy: 'Deploy',
    no_permission_deploy: 'Access Denied',

    // Security
    security_title: 'Security & Permissions',
    security_subtitle: 'RBAC, groups, API tokens, OIDC entry and audit baseline.',
    users: 'Users',
    groups: 'Groups',
    roles: 'Roles',
    api_tokens: 'API Tokens',
    quick_create_token: 'Quick Create Token',
    name: 'Name',
    role: 'Role',
    issue: 'Issue',
    no_permission_security: 'Access Denied',
    no_permission_security_detail: 'Your account does not have security:manage permission.',

    // Login
    login_2fa: '2FA Login',
    session_2fa: '2FA Session',
    login_desc: 'The platform uses 2FA login only; no username/password form is provided. API automation can still use issued API Tokens.',
    current_logged_in: 'Currently Logged In',
    session_label: 'Session',
    role_label: 'Role',
    none: 'None',
    logout_btn: 'Logout',
    code_label: '2FA Code',
    code_placeholder: '6-digit code',
    reverify: 'Re-verify',
    login_2fa_btn: 'Login with 2FA',
    login_hint: 'Username/password login is not enabled. Please enter the TOTP/2FA code configured by ops.',
    invalid_2fa: 'Invalid or expired 2FA code',
    admin_login_title: 'Admin Login',
    admin_login_desc: 'This entry is for admins only. After login you will be redirected to the admin panel.',
    admin_2fa_login: 'Admin 2FA Login',
    admin_login_hint: 'Admin entry: please enter the TOTP/2FA code configured by ops.',

    // API errors
    unauthorized: 'Unauthorized',
    api_not_found: 'API not found',
    app_not_found: 'App not found',
    no_access: 'You do not have access to this app',
    no_frontend_entry: 'This app has no frontend entry',
    webhook_not_found: 'Webhook not found',
    webhook_verify_failed: 'Webhook signature verification failed',
    backend_port_missing: 'App backend.port is not configured',
    backend_proxy_failed: 'Backend proxy failed',
    deploy_needs_sourcePath: 'deploy requires sourcePath',
    zip_only: 'Only .zip plugin packages are supported',
    route_must_apps: 'route must start with /x/<name>, do not add /yuma prefix',
    missing_yaml: 'Plugin package is missing apps.yaml. Please ensure the zip contains the app directory or its contents, not just an empty parent directory.',
    multiple_yaml: 'Plugin package contains multiple apps.yaml files; cannot determine which app to install',
    symlink_rejected: 'Plugin package contains symbolic links, rejected',
    multipart_required: 'Request must be multipart/form-data',
    missing_zip_file: 'Missing plugin zip file',
    oidc_disabled: 'OIDC is disabled, please use 2FA login',
    security_api_not_found: 'Security API not found',
    api_plugin_not_found: 'API plugin not found',
    port_in_use: (port) => `Port ${port} is already in use. Please stop the old apps server first, or change APPS_PORT.`,
    data_dir: (dir) => `  Current data directory: ${dir}`,
    server_running: (port) => `Keli Apps running: http://127.0.0.1:${port}`,
    stopped: 'stopped',
  }
};

export function resolveLang(req) {
  const cookieLang = parseCookies(req.headers.cookie || '').lang;
  if (cookieLang === 'zh' || cookieLang === 'en') return cookieLang;
  const accept = String(req.headers['accept-language'] || '');
  if (/^en/.test(accept)) return 'en';
  return 'zh';
}

export function t(lang, key, ...args) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.zh;
  const val = dict[key];
  if (typeof val === 'function') return val(...args);
  if (val !== undefined) return val;
  const fallback = TRANSLATIONS.zh[key];
  if (typeof fallback === 'function') return fallback(...args);
  return fallback !== undefined ? fallback : key;
}
