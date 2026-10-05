/**
 * `pnpm e2e`: builds the site with a fixed date, then runs the browser tests.
 *
 * The build is told the date (PHARMACY_TODAY) so the published duty lists and the generated
 * pages are the same whenever the tests run, and the site URL so canonical links are known.
 * Set E2E_SKIP_BUILD=1 to reuse an existing dist/. Extra arguments go to `playwright test`.
 */
import { spawnSync } from 'node:child_process';
import { BUILD_TODAY, SITE_URL } from './constants.ts';

function run(command: string, args: string[], env: Record<string, string> = {}): void {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env['E2E_SKIP_BUILD'] !== '1') {
  run('pnpm', ['exec', 'astro', 'build'], {
    PHARMACY_TODAY: BUILD_TODAY,
    PUBLIC_SITE_URL: SITE_URL,
    ASTRO_TELEMETRY_DISABLED: '1',
  });
}
run('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)]);
