import { access, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(websiteRoot, '..');
const mobileTsconfig = path.join(repositoryRoot, 'tsconfig.json');
const parkedMobileTsconfig = path.join(repositoryRoot, 'tsconfig.mobile.json');
const astroCli = path.join(websiteRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');

const exists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const runAstro = (command) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [astroCli, command], {
    cwd: websiteRoot,
    stdio: 'inherit',
  });

  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(
      signal
        ? `astro ${command} was stopped by ${signal}`
        : `astro ${command} exited with code ${code}`,
    ));
  });
});

let mobileConfigParked = false;

const restoreMobileConfig = async () => {
  if (!mobileConfigParked) return;
  await rename(parkedMobileTsconfig, mobileTsconfig);
  mobileConfigParked = false;
};

try {
  const hasMobileConfig = await exists(mobileTsconfig);
  const hasParkedConfig = await exists(parkedMobileTsconfig);

  if (hasParkedConfig) {
    throw new Error(
      'Found tsconfig.mobile.json before the website build. Restore or remove that stale file before retrying.',
    );
  }

  if (hasMobileConfig) {
    await rename(mobileTsconfig, parkedMobileTsconfig);
    mobileConfigParked = true;
  }

  await runAstro('check');
  await runAstro('build');
} finally {
  await restoreMobileConfig();
}
