export class AppsClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || 'http://127.0.0.1:4173').replace(/\/$/, '');
    this.headers = options.headers || {};
  }

  async platform() { return this.request('/api/platform'); }
  async apps() { return this.request('/api/x'); }
  async events(params = {}) { return this.request(`/api/events${toQuery(params)}`); }
  async deployments(name) { return this.request(`/api/x/${name}/deployments`); }
  async metrics(name) { return this.request(`/api/x/${name}/metrics`); }
  async deploy(name, sourcePath) { return this.request(`/api/x/${name}/deploy`, { method: 'POST', body: { sourcePath } }); }
  async rollback(name, releaseId) { return this.request(`/api/x/${name}/rollback`, { method: 'POST', body: { releaseId } }); }

  async request(path, options = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        'content-type': 'application/json',
        ...this.headers,
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!res.ok) throw new Error(`apps request failed: ${res.status}`);
    const type = res.headers.get('content-type') || '';
    return type.includes('application/json') ? await res.json() : await res.text();
  }
}

function toQuery(params) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null));
  const query = search.toString();
  return query ? `?${query}` : '';
}
