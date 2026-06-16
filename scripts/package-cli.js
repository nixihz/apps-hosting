import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function readPackageInfo() {
  const raw = await readFile('package.json', 'utf8');
  const pkg = JSON.parse(raw);
  if (!pkg.name || !pkg.version) throw new Error('package.json must include name and version');
  return pkg;
}

function tarballStem(packageName) {
  return packageName.replace(/^@/, '').replace('/', '-');
}

async function npmPack(destination) {
  await execFileAsync('npm', ['pack', '--pack-destination', destination], {
    stdio: 'inherit',
  });
}

async function packageCli() {
  const pkg = await readPackageInfo();
  const destination = path.join('dist', 'npm');
  const tarballName = `${tarballStem(pkg.name)}-${pkg.version}.tgz`;
  const tarballPath = path.join(destination, tarballName);
  const latestPath = path.join(destination, 'latest.tgz');

  await mkdir(destination, { recursive: true });
  await npmPack(destination);
  await copyFile(tarballPath, latestPath);

  console.log(`CLI tarball: ${tarballPath}`);
  console.log(`Latest alias: ${latestPath}`);
}

packageCli().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
