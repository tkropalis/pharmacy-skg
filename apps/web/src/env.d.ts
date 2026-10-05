/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** public/theme.js: light (the default), dark, or auto (dark after sunset or when the device asks). */
type ThemeChoice = 'light' | 'dark' | 'auto';

interface Window {
  readonly pharmacyTheme?: { set(choice: ThemeChoice): void };
}
