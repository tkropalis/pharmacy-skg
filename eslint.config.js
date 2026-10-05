import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import jsxA11yX from 'eslint-plugin-jsx-a11y-x';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', '**/.astro/', 'coverage/']),
  js.configs.recommended,
  tseslint.configs.strict,
  astro.configs.recommended,
  astro.configs['jsx-a11y-recommended'],
  {
    languageOptions: { globals: globals.node },
  },
  {
    // React components and the scripts that run in the page.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/**/*.tsx'],
    ...jsxA11yX.configs.recommended,
  },
  {
    // Plain browser scripts and the service worker, which are not bundled or type-checked.
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/sw/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
  },
);
