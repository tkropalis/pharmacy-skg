import { APP_NAME } from '../src/config.ts';
import { SITE_URL } from './constants.ts';

/**
 * Before any test: the server on the e2e port must be this app's build (the expected <title>
 * and the build's fixed site URL), not a stale or unrelated server.
 */
export default async function globalSetup(config: {
  projects: { use: { baseURL?: string } }[];
}): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (baseURL === undefined) throw new Error('playwright.config.ts has no baseURL');
  const html = await (await fetch(baseURL)).text();
  const title = APP_NAME.el;
  if (!html.includes(`<title>${title}`) || !html.includes(SITE_URL)) {
    throw new Error(
      `${baseURL} does not serve this app's e2e build (expected a page titled "${title}" built ` +
        `with PUBLIC_SITE_URL=${SITE_URL}). Something else is on that port: set E2E_PORT.`,
    );
  }
}
