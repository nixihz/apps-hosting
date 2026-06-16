import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, stringifyYaml } from '../src/yaml.js';

test('parseYaml parses scalars, nested objects and lists', () => {
  assert.deepEqual(parseYaml(`name: demo\ntype: frontend\nfrontend:\n  entry: web/dist\nenv:\n  - DATABASE_URL\n  - JWT_SECRET\n`), {
    name: 'demo', type: 'frontend', frontend: { entry: 'web/dist' }, env: ['DATABASE_URL', 'JWT_SECRET']
  });
});

test('parseYaml ignores comments and validates colon', () => {
  assert.equal(parseYaml('name: demo # comment').name, 'demo');
  assert.throws(() => parseYaml('bad line'), /缺少冒号/);
});

test('stringifyYaml writes readable yaml', () => {
  assert.match(stringifyYaml({ name: 'demo', frontend: { entry: 'dist' } }), /frontend:\n  entry: dist/);
});
