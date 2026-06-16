import fs from 'node:fs/promises';
import path from 'node:path';

const distributedSkills = [
  {
    name: 'keli-apps-plugin',
    description: 'Develop, package, publish, or upload Keli Apps plugins with apps.yaml, keli-cli, and the Keli Apps install workflow.',
    files: ['SKILL.md']
  }
];

const wellKnownPrefix = /^\/\.well-known\/(?:agent-skills|skills)(?:\/|$)/;

export function isSkillDistributionPath(pathname) {
  return wellKnownPrefix.test(pathname);
}

export async function skillDistributionResponse(pathname) {
  if (pathname === '/.well-known/agent-skills/index.json' || pathname === '/.well-known/skills/index.json') {
    return jsonResponse({ skills: distributedSkills });
  }

  const match = pathname.match(/^\/\.well-known\/(?:agent-skills|skills)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;

  const [, skillName, filename] = match;
  const skill = distributedSkills.find((item) => item.name === skillName);
  if (!skill || !skill.files.includes(filename)) return null;

  const file = path.resolve('.agents', 'skills', skillName, filename);
  const body = await fs.readFile(file, 'utf8');
  return {
    status: 200,
    body,
    type: filename === 'SKILL.md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
    headers: { 'cache-control': 'public, max-age=60' }
  };
}

function jsonResponse(body) {
  return {
    status: 200,
    body: JSON.stringify(body, null, 2),
    type: 'application/json; charset=utf-8',
    headers: { 'cache-control': 'public, max-age=60' }
  };
}
