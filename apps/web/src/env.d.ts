/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  /** 'vercel' turns on Vercel Web Analytics (cookieless, decision D16). */
  readonly PUBLIC_ANALYTICS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
