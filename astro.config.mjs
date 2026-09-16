// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://utmverify.com',
  redirects: {
    '/utm-checker': '/en/utm-checker',
    '/utm-builder': '/en/utm-builder',
    '/utm-parser': '/en/utm-parser',
    '/utm-naming-generator': '/en/utm-naming-generator',
    '/bulk-utm-builder': '/en/bulk-utm-builder',
    '/guides': '/en/guides',
    '/about': '/en/about',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
