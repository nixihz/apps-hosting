export function buildOpenApi(baseUrl = 'http://127.0.0.1:4173') {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Keli Apps API',
      version: '0.4.0',
      description: 'Keli Apps 平台 API'
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/api/platform': { get: { summary: '平台信息', responses: { '200': { description: 'OK' } } } },
      '/api/openapi.json': { get: { summary: 'OpenAPI 文档', responses: { '200': { description: 'OK' } } } },
      '/api/x': { get: { summary: '应用列表', responses: { '200': { description: 'OK' } } } },
      '/api/events': { get: { summary: '事件列表', responses: { '200': { description: 'OK' } } } },
      '/api/platform/webhooks': {
        get: { summary: 'Webhook 列表', responses: { '200': { description: 'OK' } } },
        post: { summary: '注册 Webhook', responses: { '200': { description: 'OK' } } }
      },
      '/api/platform/webhooks/{id}': {
        delete: { summary: '删除 Webhook', responses: { '200': { description: 'OK' } } }
      },
      '/api/platform/policy-report': { get: { summary: '平台治理报告', responses: { '200': { description: 'OK' } } } },
      '/api/platform/backup': { get: { summary: '平台备份导出', responses: { '200': { description: 'OK' } } } },
      '/api/security/users': { get: { summary: '用户列表', responses: { '200': { description: 'OK' } } }, post: { summary: '创建或更新用户', responses: { '200': { description: 'OK' } } } },
      '/api/security/groups': { get: { summary: '用户组列表', responses: { '200': { description: 'OK' } } }, post: { summary: '创建或更新用户组', responses: { '200': { description: 'OK' } } } },
      '/api/security/roles': { get: { summary: '角色列表', responses: { '200': { description: 'OK' } } }, post: { summary: '创建或更新角色', responses: { '200': { description: 'OK' } } } },
      '/api/security/tokens': { get: { summary: 'API token 列表', responses: { '200': { description: 'OK' } } }, post: { summary: '签发 API token', responses: { '200': { description: 'OK' } } } },
      '/api/auth/oidc/login': { get: { summary: 'OIDC/OAuth2 登录跳转', responses: { '302': { description: 'Redirect' }, '200': { description: '未配置说明' } } } }
    }
  };
}
